import datetime as dt
from sqlalchemy import ForeignKey, String, Text, JSON, DateTime
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from .core import settings

engine = create_async_engine(settings.database_url)
Session = async_sessionmaker(engine, expire_on_commit=False)
now = lambda: dt.datetime.now(dt.timezone.utc)

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str]
class UserProfile(Base):
    __tablename__ = "user_profiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

class Case(Base):
    __tablename__ = "cases"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str]; case_number: Mapped[str | None]; description: Mapped[str | None]
class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))
    filename: Mapped[str]; pages: Mapped[int]; status: Mapped[str] = mapped_column(default="processing")
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    case_id: Mapped[int | None] = mapped_column(ForeignKey("cases.id"))
    title: Mapped[str] = mapped_column(default="New chat")
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str]; content: Mapped[str] = mapped_column(Text)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
