from typing import AsyncGenerator
import json
import asyncio
import traceback
import re
from app.storage.conversation_storage import save_message, get_history
from app.api.utils.psychology_knowledge import psychology_knowledge
from app.templates.prompt_templates import PromptTemplates
from app.api.utils.factory import get_llm_client
from app.services.card_service import generate_and_cache_card_task
from config.settings import settings

class ChatService:
    @staticmethod
    async def chat_stream_generator(user_id: str, content: str, mode: str, thinking_enabled: bool, current_msg_id: str = None) -> AsyncGenerator[bytes, None]:
        try:
            # 1. Retrieve Knowledge
            knowledge = psychology_knowledge.search(content)
            
            # 2. Build Messages
            if mode == "professional":
                system_prompt = PromptTemplates.PROFESSIONAL_SYSTEM_PROMPT
            else:
                system_prompt = PromptTemplates.STANDARD_SYSTEM_PROMPT
                
            if knowledge:
                system_prompt += f"\n\n相关心理学知识库：\n{knowledge}"
                
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add History
            history = get_history(user_id, limit=20) 
            for msg in reversed(history):
                if current_msg_id and msg.id == current_msg_id:
                    continue # Exclude current message if found in history (though usually history doesn't include it if saved *just* now depending on impl, but best to be safe)
                messages.append({"role": msg.role, "content": msg.content})
            
            # Add Current User Message explicitly at the end
            messages.append({"role": "user", "content": content})
            
            print(f"[DEBUG] Sending messages to LLM: {json.dumps(messages, ensure_ascii=False)}")

            # 3. Call LLM (Stream)
            client = get_llm_client()
            full_content = ""
            
            print(f"[DEBUG] Starting stream with {settings.LLM_PROVIDER}")
            for chunk in client.chat_completion_stream(messages, thinking_enabled=thinking_enabled):
                if chunk.startswith("[ERROR]"):
                     yield chunk.encode('utf-8')
                     return
                
                full_content += chunk
                yield chunk.encode('utf-8')
            
            # 4. Save AI Message
            if full_content:
                save_message(user_id, "assistant", full_content)
                # Trigger background card generation
                asyncio.create_task(generate_and_cache_card_task(user_id))
                
        except Exception as e:
            traceback.print_exc()
            yield f"[ERROR] {str(e)}".encode('utf-8')
