from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api.views import router as api_router
from app.storage.conversation_storage import init_db
from config.settings import settings
import os

app = FastAPI(title=settings.PROJECT_NAME)

# Ensure static directory exists
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": "Welcome to GreenBanana API"}
