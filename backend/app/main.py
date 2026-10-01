import io, json, logging, pathlib
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from pypdf import PdfReader
from . import rag, news
from .core import settings, hash_pw, check_pw, make_token, current_user
from .db import Base, engine, Session, User, UserProfile, Case, Document, Conversation, Message

log = logging.getLogger("legal")
app = FastAPI(title="Legal Agent")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","),
                   allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
async def init():
    async with engine.begin() as c: await c.run_sync(Base.metadata.create_all)  # swap for Alembic

class Creds(BaseModel): email: str; password: str
@app.post("/api/auth/register")
async def register(c: Creds):
    if len(c.password) < 10: raise HTTPException(422, "Password must be at least 10 characters")
    async with Session() as s:
        s.add(User(email=c.email.lower(), password_hash=hash_pw(c.password)))
        try: await s.commit()
        except IntegrityError: raise HTTPException(409, "Email already registered")
    return {"ok": True}

@app.post("/api/auth/login")
async def login(f: OAuth2PasswordRequestForm = Depends()):
    async with Session() as s:
        u = await s.scalar(select(User).where(User.email == f.username.lower()))
    if not u or not check_pw(f.password, u.password_hash): raise HTTPException(401, "Bad credentials")
    return {"access_token": make_token(u.id), "token_type": "bearer"}

@app.get("/api/news")
async def legal_news(region: str = "all", u: User = Depends(current_user)):
    try:
        return await news.get_news(region)
    except ValueError as e:
        raise HTTPException(422, str(e))

class ProfileIn(BaseModel): display_name: str | None = None

@app.get("/api/profile")
async def get_profile(u: User = Depends(current_user)):
    async with Session() as s:
        profile = await s.get(UserProfile, u.id)
        return {"email": u.email, "display_name": profile.display_name if profile else ""}

@app.put("/api/profile")
async def update_profile(b: ProfileIn, u: User = Depends(current_user)):
    display_name = (b.display_name or "").strip()
    if len(display_name) > 120:
        raise HTTPException(422, "Display name must be 120 characters or fewer")
    async with Session() as s:
        profile = await s.get(UserProfile, u.id)
        if not profile:
            profile = UserProfile(user_id=u.id)
            s.add(profile)
        profile.display_name = display_name or None
        await s.commit()
        return {"email": u.email, "display_name": profile.display_name or ""}

class CaseIn(BaseModel): name: str; case_number: str | None = None; description: str | None = None
@app.post("/api/cases")
async def new_case(b: CaseIn, u: User = Depends(current_user)):
    async with Session() as s:
        c = Case(user_id=u.id, **b.model_dump()); s.add(c); await s.commit(); return {"id": c.id, **b.model_dump()}
@app.get("/api/cases")
async def cases(u: User = Depends(current_user)):
    async with Session() as s:
        return [{"id": c.id, "name": c.name, "case_number": c.case_number}
                for c in await s.scalars(select(Case).where(Case.user_id == u.id))]

async def owned_case(s, u, case_id):
    if case_id and not await s.scalar(select(Case).where(Case.id == case_id, Case.user_id == u.id)):
        raise HTTPException(404, "Case not found")

@app.get("/api/documents")
async def documents(case_id: int | None = None, u: User = Depends(current_user)):
    async with Session() as s:
        await owned_case(s, u, case_id)
        query = select(Document).where(Document.user_id == u.id)
        if case_id is not None:
            query = query.where(Document.case_id == case_id)
        docs = await s.scalars(query.order_by(Document.created.desc()))
        return [{"id": d.id, "filename": d.filename, "pages": d.pages, "status": d.status,
                 "created": d.created.isoformat(), "case_id": d.case_id} for d in docs]

@app.get("/api/documents/{document_id}/download")
async def download_document(document_id: int, u: User = Depends(current_user)):
    async with Session() as s:
        d = await s.scalar(select(Document).where(Document.id == document_id, Document.user_id == u.id))
        if not d or d.status != "ready":
            raise HTTPException(404, "Document not found")
        ext = pathlib.Path(d.filename).suffix.lower()
        path = pathlib.Path(settings.upload_dir) / f"{u.id}_{d.id}{ext}"
        if not path.is_file():
            raise HTTPException(404, "Stored document file not found")
        media_type = "application/pdf" if ext == ".pdf" else "text/plain"
        return FileResponse(path, media_type=media_type, filename=d.filename)

@app.post("/api/documents/upload")
async def upload(file: UploadFile = File(...), case_id: int | None = Form(None), u: User = Depends(current_user)):
    name = pathlib.Path(file.filename or "file").name
    ext = name.rsplit(".", 1)[-1].lower()
    if ext not in ("pdf", "txt"): raise HTTPException(415, "Only PDF and TXT are supported so far")
    data = await file.read()
    if len(data) > settings.max_upload_mb * 2**20: raise HTTPException(413, "File too large")
    try:
        pages = [p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages] if ext == "pdf" \
            else [data.decode("utf-8", "ignore")]
    except Exception:
        raise HTTPException(422, "Could not read this file; it may be corrupt or encrypted")
    async with Session() as s:
        await owned_case(s, u, case_id)
        d = Document(user_id=u.id, case_id=case_id, filename=name, pages=len(pages)); s.add(d); await s.commit()
        try:
            n = await rag.ingest(u.id, d.id, case_id, name, pages); d.status = "ready"
        except Exception as e:
            log.exception("ingest failed"); d.status = "failed"; await s.commit()
            raise HTTPException(422, f"Processing failed: {e}")
        await s.commit()
        pathlib.Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
        (pathlib.Path(settings.upload_dir) / f"{u.id}_{d.id}.{ext}").write_bytes(data)
        return {"id": d.id, "filename": name, "pages": len(pages), "chunks": n}

class ChatIn(BaseModel): message: str; conversation_id: int | None = None; case_id: int | None = None
@app.post("/api/chat/stream")
async def chat(b: ChatIn, u: User = Depends(current_user)):
    async with Session() as s:
        await owned_case(s, u, b.case_id)
        if b.conversation_id:
            conv = await s.scalar(select(Conversation).where(Conversation.id == b.conversation_id, Conversation.user_id == u.id))
            if not conv: raise HTTPException(404, "Conversation not found")
        else:
            conv = Conversation(user_id=u.id, case_id=b.case_id, title=b.message[:60]); s.add(conv); await s.commit()
        past = list(await s.scalars(select(Message).where(Message.conversation_id == conv.id).order_by(Message.id)))
        s.add(Message(conversation_id=conv.id, role="user", content=b.message)); await s.commit()
    hist = [{"role": m.role, "content": m.content} for m in past]

    async def gen():
        live_lookup = rag.should_search_current_question(b.message)
        status = "Searching current web sources" if live_lookup else f"Searching {'case documents' if b.case_id else 'your documents'}"
        yield f"event: status\ndata: {status}\n\n"
        try:
            # Current-fact requests bypass document retrieval so private passages cannot enter the search call.
            hits = [] if live_lookup else await rag.retrieve(u.id, b.message, conv.case_id)
        except Exception as e:
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"; return
        srcs = [{k: h[k] for k in ("n", "title", "section", "page", "source_type", "score")} for h in hits]
        web_sources = []
        yield f"event: sources\ndata: {json.dumps(srcs)}\n\nevent: status\ndata: {'Verifying live sources' if live_lookup else 'Generating response'}\n\n"
        out = []
        try:
            async for t in rag.stream_answer(b.message, hits, hist, web_sources=web_sources):
                out.append(t); yield f"event: token\ndata: {json.dumps(t)}\n\n"
            if web_sources:
                srcs = web_sources
                yield f"event: sources\ndata: {json.dumps(srcs)}\n\n"
        except Exception as e:
            log.exception("llm"); yield f"event: error\ndata: {json.dumps('LLM request failed: ' + str(e))}\n\n"
        async with Session() as s:
            s.add(Message(conversation_id=conv.id, role="assistant", content="".join(out), sources=srcs)); await s.commit()
        yield f"event: done\ndata: {conv.id}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")

@app.get("/api/conversations")
async def convs(u: User = Depends(current_user)):
    async with Session() as s:
        return [{"id": c.id, "title": c.title, "created": c.created} for c in
                await s.scalars(select(Conversation).where(Conversation.user_id == u.id).order_by(Conversation.id.desc()))]

@app.get("/api/conversations/{cid}")
async def conv_messages(cid: int, u: User = Depends(current_user)):
    async with Session() as s:
        c = await s.scalar(select(Conversation).where(Conversation.id == cid, Conversation.user_id == u.id))
        if not c: raise HTTPException(404, "Conversation not found")
        ms = await s.scalars(select(Message).where(Message.conversation_id == cid).order_by(Message.id))
        return {"id": c.id, "case_id": c.case_id, "title": c.title,
                "messages": [{"role": m.role, "content": m.content, "sources": m.sources} for m in ms]}
