from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
from config.settings import settings

Base = declarative_base()

class Conversation(Base):
    __tablename__ = 'conversations'

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    role = Column(String) # user or assistant
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class CardCache(Base):
    __tablename__ = 'card_cache'

    user_id = Column(String, primary_key=True, index=True)
    card_json = Column(Text)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

# SQLite database
DATABASE_URL = "sqlite:///./greenbanana.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def save_message(user_id: str, role: str, content: str):
    db = SessionLocal()
    try:
        conversation = Conversation(user_id=user_id, role=role, content=content)
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        return conversation
    finally:
        db.close()

def save_card_cache(user_id: str, card_json: str):
    db = SessionLocal()
    try:
        cache = db.query(CardCache).filter(CardCache.user_id == user_id).first()
        if not cache:
            cache = CardCache(user_id=user_id, card_json=card_json)
            db.add(cache)
        else:
            cache.card_json = card_json
        db.commit()
    finally:
        db.close()

def get_card_cache(user_id: str):
    db = SessionLocal()
    try:
        cache = db.query(CardCache).filter(CardCache.user_id == user_id).first()
        return cache.card_json if cache else None
    finally:
        db.close()

def get_history(user_id: str, limit: int = 10):
    db = SessionLocal()
    try:
        return db.query(Conversation).filter(Conversation.user_id == user_id).order_by(Conversation.created_at.desc()).limit(limit).all()
    finally:
        db.close()
