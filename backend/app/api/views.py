from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any
from pydantic import BaseModel
from app.storage.conversation_storage import save_message
from app.services.card_service import get_or_create_card
from app.services.chat_service import ChatService
import json
import asyncio

import traceback

router = APIRouter()

class LogRequest(BaseModel):
    level: str
    message: str
    context: Dict[str, Any] = {}

@router.post("/log")
async def log_frontend_error(log: LogRequest):
    print(f"\n[FRONTEND-{log.level.upper()}] {log.message}")
    if log.context:
        print(f"Context: {json.dumps(log.context, indent=2, ensure_ascii=False)}")
    return {"status": "ok"}

@router.post("/chat")
async def chat(
    background_tasks: BackgroundTasks,
    user_id: str = Body(..., embed=True),
    content: str = Body(..., embed=True),
    mode: str = Body("concise", embed=True),
    thinking_enabled: bool = Body(False, embed=True)
):
    """
    Main chat endpoint for GreenBanana (Streaming).
    """
    try:
        # 1. Save User Message
        current_msg = save_message(user_id, "user", content)
        
        # 2. Delegate to ChatService
        return StreamingResponse(
            ChatService.chat_stream_generator(
                user_id=user_id,
                content=content,
                mode=mode,
                thinking_enabled=thinking_enabled,
                current_msg_id=current_msg.id
            ),
            media_type="text/plain"
        )

    except Exception as e:
        traceback.print_exc() # Print full traceback to console
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate_card")
async def generate_card(
    user_id: str = Body(..., embed=True)
):
    """
    Generate an anti-anxiety card based on recent conversation.
    """
    try:
        print(f"\n[DEBUG] >>> Received Generate Card Request")
        print(f"[DEBUG] User ID: {user_id}")
        
        result = await get_or_create_card(user_id)
        
        if result and "error" not in result:
             return result
        
        # If result has error, raise it
        error_detail = result.get("error", "Unknown generation error") if result else "Failed to generate card"
        raise HTTPException(status_code=500, detail=error_detail)
             
    except Exception as e:
        traceback.print_exc() # Print full traceback to console
        raise HTTPException(status_code=500, detail=str(e))
