from app.storage.conversation_storage import get_history, save_card_cache
from app.templates.prompt_templates import PromptTemplates
from app.api.utils.factory import get_llm_client
import json
import traceback

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
        # Use replace instead of format to avoid issues with braces in conversation_text
        prompt = PromptTemplates.CONCISE_SYSTEM_PROMPT.replace("{conversation_content}", conversation_text)
        messages = [{"role": "user", "content": prompt}]
        
        # 3. Call LLM
        client = get_llm_client()
        # Disable thinking for JSON generation to ensure strict format
        response = client.chat_completion(messages, thinking_enabled=False)
        
        if "error" in response:
             error_msg = f"LLM Error: {response['error']}"
             print(f"[BACKGROUND] {error_msg}")
             return {"error": error_msg}
             
        ai_content = ""
        if "choices" in response and len(response["choices"]) > 0:
            ai_content = response["choices"][0]["message"]["content"]
            
        if not ai_content:
             error_msg = "Empty response from LLM"
             print(f"[BACKGROUND] {error_msg}")
             return {"error": error_msg}

        # 4. Parse and Validate JSON
        try:
            # Clean up potential markdown code blocks
            clean_content = ai_content.replace("```json", "").replace("```", "").strip()
            # Verify it's valid JSON
            card_data = json.loads(clean_content) 
            
            # 5. Save to Cache
            save_card_cache(user_id, clean_content)
            print(f"[BACKGROUND] Card cached successfully for {user_id}")
            return card_data
            
        except json.JSONDecodeError:
             error_msg = f"JSON Parse Error: {ai_content}"
             print(f"[BACKGROUND] {error_msg}")
             return {"error": error_msg}
             
    except Exception as e:
        error_msg = f"Unexpected Error: {e}"
        print(f"[BACKGROUND] {error_msg}")
        traceback.print_exc()
        return {"error": error_msg}
