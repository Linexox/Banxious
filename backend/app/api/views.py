from fastapi import APIRouter, HTTPException, Body
from typing import List, Dict, Any
from pydantic import BaseModel
from app.api.utils.factory import get_llm_client
from app.api.utils.psychology_knowledge import psychology_knowledge
from app.storage.conversation_storage import save_message, get_history
from app.templates.prompt_templates import PromptTemplates
import json

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
    user_id: str = Body(..., embed=True),
    content: str = Body(..., embed=True),
    thinking_enabled: bool = Body(False, embed=True)
):
    """
    Main chat endpoint for GreenBanana.
    """
    try:
        # 1. Save User Message
        save_message(user_id, "user", content)
        
        # 2. Retrieve Knowledge
        knowledge = psychology_knowledge.search(content)
        
        # 3. Build Messages
        # Start with System Prompt
        system_prompt = PromptTemplates.STANDARD_SYSTEM_PROMPT.format(user_input=content)
        if knowledge:
            system_prompt += f"\n\n相关心理学知识库：\n{knowledge}"
            
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add History (Optional: limit history length to avoid token overflow)
        # history = get_history(user_id, limit=5) 
        # for msg in reversed(history):
        #     if msg.content != content: # Avoid duplicating current message if already saved
        #          messages.append({"role": msg.role, "content": msg.content})
        
        # Add Current User Message
        messages.append({"role": "user", "content": content})
        
        # 4. Call LLM
        client = get_llm_client()
        response = client.chat_completion(messages, thinking_enabled=thinking_enabled)
        
        if "error" in response:
             raise HTTPException(status_code=500, detail=response["error"])
        
        # Extract AI content (this depends on the specific LLM response structure, 
        # Zhipu usually follows OpenAI format)
        ai_content = ""
        if "choices" in response and len(response["choices"]) > 0:
            ai_content = response["choices"][0]["message"]["content"]
            
        # 5. Save AI Message
        if ai_content:
            save_message(user_id, "assistant", ai_content)
            
        return response
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
        
        # 1. Get recent history
        history = get_history(user_id, limit=10)
        if not history:
             raise HTTPException(status_code=400, detail="No conversation history found")
             
        conversation_text = "\n".join([f"{msg.role}: {msg.content}" for msg in reversed(history)])
        
        # 2. Build Prompt
        prompt = PromptTemplates.CONCISE_SYSTEM_PROMPT.format(conversation_content=conversation_text)
        messages = [{"role": "user", "content": prompt}]
        
        # 3. Call LLM
        client = get_llm_client()
        # Disable thinking for JSON generation to ensure strict format
        response = client.chat_completion(messages, thinking_enabled=False)
        
        if "error" in response:
             raise HTTPException(status_code=500, detail=response["error"])
             
        ai_content = response["choices"][0]["message"]["content"]
        
        # 4. Parse JSON (Simple attempt, robust parsing might be needed)
        try:
            print(f"[DEBUG] Raw LLM Response for Card: {ai_content}")
            # Clean up potential markdown code blocks
            clean_content = ai_content.replace("```json", "").replace("```", "").strip()
            card_data = json.loads(clean_content)
            return card_data
        except json.JSONDecodeError:
             return {"error": "Failed to parse card data", "raw_content": ai_content}
             
    except Exception as e:
        traceback.print_exc() # Print full traceback to console
        raise HTTPException(status_code=500, detail=str(e))
