import datetime as dt, bcrypt, jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import select

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str
    jwt_secret: str
    ai_provider: str = "openai"
    openai_api_key: str = ""
    gemini_api_key: str = ""
    gemini_api_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    chat_model: str = "gpt-4o"
    embed_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536
    qdrant_url: str = "http://qdrant:6333"
    qdrant_api_key: str | None = None
    cors_origins: str = "http://localhost:5173"
    max_upload_mb: int = 25
    upload_dir: str = "/data/uploads"

settings = Settings()
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_pw(p: str) -> str: return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def check_pw(p: str, h: str) -> bool: return bcrypt.checkpw(p.encode(), h.encode())
def make_token(uid: int) -> str:
    exp = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=12)
    return jwt.encode({"sub": str(uid), "exp": exp}, settings.jwt_secret, "HS256")

async def current_user(token: str = Depends(oauth2)):
    from .db import Session, User
    try: uid = int(jwt.decode(token, settings.jwt_secret, ["HS256"])["sub"])
    except Exception: raise HTTPException(401, "Invalid token")
    async with Session() as s:
        u = await s.scalar(select(User).where(User.id == uid))
    if not u: raise HTTPException(401, "Unknown user")
    return u
