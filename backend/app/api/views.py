from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
from typing import List, Dict, Any
from pydantic import BaseModel
from app.api.utils.factory import get_llm_client
from app.api.utils.psychology_knowledge import psychology_knowledge
from app.storage.conversation_storage import save_message, get_history, save_card_cache, get_card_cache
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

async def generate_and_cache_card_task(user_id: str):
    try:
        print(f"\n[BACKGROUND] >>> Starting Card Generation for {user_id}")
        
        # 1. Get recent history
        history = get_history(user_id, limit=50)
        if not history:
             print("[BACKGROUND] No history found, skipping.")
             return
             
        conversation_text = "\n".join([f"{msg.role}: {msg.content}" for msg in reversed(history)])
        
        # 2. Build Prompt
        prompt = PromptTemplates.CONCISE_SYSTEM_PROMPT.format(conversation_content=conversation_text)
        messages = [{"role": "user", "content": prompt}]
        
        # 3. Call LLM
        client = get_llm_client()
        # Disable thinking for JSON generation to ensure strict format
        response = client.chat_completion(messages, thinking_enabled=False)
        
        if "error" in response:
             print(f"[BACKGROUND] LLM Error: {response['error']}")
             return
             
        ai_content = ""
        if "choices" in response and len(response["choices"]) > 0:
            ai_content = response["choices"][0]["message"]["content"]
            
        if not ai_content:
             print("[BACKGROUND] Empty response from LLM")
             return

        # 4. Parse and Validate JSON
        try:
            # Clean up potential markdown code blocks
            clean_content = ai_content.replace("```json", "").replace("```", "").strip()
            # Verify it's valid JSON
            json.loads(clean_content) 
            
            # 5. Save to Cache
            save_card_cache(user_id, clean_content)
            print(f"[BACKGROUND] Card cached successfully for {user_id}")
            
        except json.JSONDecodeError:
             print(f"[BACKGROUND] JSON Parse Error: {ai_content}")
             
    except Exception as e:
        print(f"[BACKGROUND] Unexpected Error: {e}")
        traceback.print_exc()

@router.post("/chat")
async def chat(
    background_tasks: BackgroundTasks,
    user_id: str = Body(..., embed=True),
    content: str = Body(..., embed=True),
    thinking_enabled: bool = Body(False, embed=True)
):
    """
    Main chat endpoint for GreenBanana.
    """
    try:
        # 1. Save User Message
        current_msg = save_message(user_id, "user", content)
        
        # 2. Retrieve Knowledge
        knowledge = psychology_knowledge.search(content)
        
        # 3. Build Messages
        # Start with System Prompt
        system_prompt = PromptTemplates.STANDARD_SYSTEM_PROMPT
        if knowledge:
            system_prompt += f"\n\n相关心理学知识库：\n{knowledge}"
            
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add History
        history = get_history(user_id, limit=20) 
        for msg in reversed(history):
            if msg.id != current_msg.id: # Exclude current message to avoid duplication
                 messages.append({"role": msg.role, "content": msg.content})
        
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
            # Trigger background card generation
            background_tasks.add_task(generate_and_cache_card_task, user_id)
            
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
        
        # 1. Try cache first
        cached_json = get_card_cache(user_id)
        if cached_json:
            print(f"[DEBUG] Cache hit for {user_id}")
            try:
                return json.loads(cached_json)
            except json.JSONDecodeError:
                print(f"[DEBUG] Cached JSON invalid, regenerating...")
        
        print(f"[DEBUG] Cache miss for {user_id}, generating now...")
        
        # 2. Fallback to immediate generation
        await generate_and_cache_card_task(user_id)
        
        # 3. Check cache again
        cached_json = get_card_cache(user_id)
        if cached_json:
            return json.loads(cached_json)
            
        raise HTTPException(status_code=500, detail="Failed to generate card")
             
    except Exception as e:
        traceback.print_exc() # Print full traceback to console
        raise HTTPException(status_code=500, detail=str(e))
