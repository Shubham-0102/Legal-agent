import re, uuid
import httpx
from openai import AsyncOpenAI
from qdrant_client import AsyncQdrantClient, models as qm
from .core import settings

COL = "legal_chunks_" + re.sub(r"[^a-zA-Z0-9_-]", "_", f"{settings.ai_provider}_{settings.embed_model}_{settings.embedding_dim}")
qd = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
_oa = None
def provider_credentials() -> tuple[str, str]:
    provider = settings.ai_provider.strip().lower()
    if provider == "gemini":
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured. Add your key to .env and restart the backend.")
        return provider, settings.gemini_api_key
    if provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        return provider, settings.openai_api_key
    raise RuntimeError("AI_PROVIDER must be either 'gemini' or 'openai'.")

def ai_client() -> AsyncOpenAI:
    global _oa
    provider, key = provider_credentials()
    base_url = f"{settings.gemini_api_base_url.rstrip('/')}/openai/" if provider == "gemini" else None
    _oa = _oa or AsyncOpenAI(api_key=key, base_url=base_url)
    return _oa

HEAD = re.compile(r"^\s*((?:Section|Article|Clause|Chapter|दफा|धारा)\s*\d+[\w.()-]*|\d+\.\s+[A-Z])", re.M)

def chunk_page(text: str, page: int, max_chars=1800):
    """Split on legal headings first, then by size; keeps page + section label."""
    idx = [m.start() for m in HEAD.finditer(text)] or [0]
    if idx[0] != 0: idx.insert(0, 0)
    for a, b in zip(idx, idx[1:] + [len(text)]):
        part = text[a:b].strip()
        m = HEAD.match(part)
        for i in range(0, len(part), max_chars):
            if part[i:i+max_chars].strip():
                yield {"text": part[i:i+max_chars], "page": page, "section": m.group(1).strip() if m else None}

async def embed(texts: list[str], task_type="RETRIEVAL_DOCUMENT") -> list[list[float]]:
    provider, key = provider_credentials()
    if provider == "gemini":
        requests = [{
            "model": f"models/{settings.embed_model}",
            "content": {"parts": [{"text": text}]},
            "taskType": task_type,
            "outputDimensionality": settings.embedding_dim,
        } for text in texts]
        url = f"{settings.gemini_api_base_url.rstrip('/')}/models/{settings.embed_model}:batchEmbedContents"
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers={"x-goog-api-key": key}, json={"requests": requests})
            if response.status_code == 401:
                raise RuntimeError("Gemini rejected GEMINI_API_KEY. Add one valid Google AI Studio key with no spaces or quotes, ensure the Generative Language API is enabled for its project, and restart the backend.")
            if response.status_code == 403:
                raise RuntimeError("Gemini denied the embedding request. Check that the Generative Language API is enabled and available to the project for this key.")
            response.raise_for_status()
        vectors = [item["values"] for item in response.json()["embeddings"]]
    else:
        response = await ai_client().embeddings.create(model=settings.embed_model, input=texts)
        vectors = [item.embedding for item in response.data]
    if any(len(vector) != settings.embedding_dim for vector in vectors):
        raise RuntimeError(f"Embedding model returned a vector size different from EMBEDDING_DIM={settings.embedding_dim}.")
    return vectors

async def ensure_collection(dim: int | None = None):
    if not await qd.collection_exists(COL):
        dim = dim or settings.embedding_dim
        await qd.create_collection(COL, vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE))
        for f in ("user_id", "case_id", "document_id"):
            await qd.create_payload_index(COL, f, qm.PayloadSchemaType.INTEGER)

async def ingest(user_id, doc_id, case_id, title, pages: list[str]) -> int:
    chunks = [c for n, t in enumerate(pages, 1) for c in chunk_page(t, n)]
    if not chunks: raise ValueError("No extractable text (scanned file? OCR is not implemented yet)")
    for i in range(0, len(chunks), 64):
        batch = chunks[i:i+64]
        vecs = await embed([c["text"] for c in batch])
        await ensure_collection(len(vecs[0]))
        await qd.upsert(COL, [qm.PointStruct(id=str(uuid.uuid4()), vector=v, payload={
            **c, "user_id": user_id, "case_id": case_id, "document_id": doc_id, "title": title,
            "source_type": "uploaded_case_document"}) for c, v in zip(batch, vecs)])
    return len(chunks)

async def retrieve(user_id: int, query: str, case_id: int | None, k=6):
    """user_id filter is ALWAYS applied -> per-user isolation. case_id narrows further."""
    if not await qd.collection_exists(COL): return []
    must = [qm.FieldCondition(key="user_id", match=qm.MatchValue(value=user_id))]
    if case_id: must.append(qm.FieldCondition(key="case_id", match=qm.MatchValue(value=case_id)))
    v = (await embed([query], task_type="RETRIEVAL_QUERY"))[0]
    res = await qd.query_points(COL, query=v, query_filter=qm.Filter(must=must), limit=k, score_threshold=0.25)
    return [{"n": i, "score": p.score, **p.payload} for i, p in enumerate(res.points, 1)]

SYSTEM = """You are Legal Agent, a legal research assistant for lawyers, not a lawyer or a substitute
for professional judgment. Help lawyers analyze legal questions and identify issues to verify.

Default to a concise answer. Give the direct answer first, usually in one short paragraph or 3–5
brief bullets, and aim for about 80–150 words unless the question genuinely needs more. Avoid long
introductions, repeating the question, and adding background the user did not ask for. Expand into a
detailed explanation, step-by-step analysis, or broader research only when the user asks to explain,
elaborate, analyze in depth, or otherwise requests detail. If a short answer would hide a material
legal qualification or uncertainty, include that point briefly rather than omitting it.

When numbered document evidence is supplied, ground factual claims about those documents in it and
cite that evidence as [n]. Do not claim the documents establish facts they do not contain.

When no document evidence is supplied, answer from general legal knowledge as preliminary research.
Identify the relevant jurisdiction and governing date. If the jurisdiction is missing and materially
changes the answer, ask a concise clarifying question before giving jurisdiction-specific conclusions.
Briefly state the applicable principle and the most material issue or uncertainty. Recommend checking
current primary authority when relevant. Never invent statutes, cases, quotations, citations, or claim
to have checked current law. If unsure of an authority, say so rather than cite it.

Mention that law changes and the answer is not a final legal opinion, using a brief note when relevant.
Reply in the user's language (English or Nepali)."""

async def stream_answer(question: str, hits: list[dict], history: list[dict]):
    ctx = "\n\n".join(f"[{h['n']}] {h['title']} — {h.get('section') or ''} p.{h['page']}\n{h['text']}" for h in hits)
    evidence = f"Numbered document evidence:\n{ctx}" if hits else "No uploaded-document evidence was found for this question. Answer in general-knowledge mode."
    msgs = [{"role": "system", "content": SYSTEM}, *history[-8:],
            {"role": "user", "content": f"{evidence}\n\nQuestion: {question}"}]
    s = await ai_client().chat.completions.create(model=settings.chat_model, messages=msgs, stream=True, temperature=0.1)
    async for ev in s:
        if ev.choices and ev.choices[0].delta.content: yield ev.choices[0].delta.content
