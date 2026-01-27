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
    async def process_chat_stream(user_id: str, content: str, mode: str, thinking_enabled: bool) -> AsyncGenerator[bytes, None]:
        """
        Process chat message and yield streaming response.
        """
        try:
            # 1. Retrieve Knowledge
            knowledge = psychology_knowledge.search(content)
            
            # 2. Build Messages
            # Start with System Prompt based on mode
            if mode == "professional":
                system_prompt = PromptTemplates.PROFESSIONAL_SYSTEM_PROMPT
            else:
                system_prompt = PromptTemplates.STANDARD_SYSTEM_PROMPT
                
            if knowledge:
                system_prompt += f"\n\n相关心理学知识库：\n{knowledge}"
                
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add History
            # We need to exclude the current message if it was already saved in the view
            # But typically, the service should handle saving too?
            # In the original code, the view saves the user message FIRST.
            # Let's assume the view handles saving the user message to DB before calling this,
            # OR we pass the message ID to exclude.
            # Actually, the original code saves the message in the view: current_msg = save_message(...)
            # Then it excludes it: if msg.id != current_msg.id
            
            # To keep it simple and encapsulated, let's pass the current_msg_id if possible,
            # or just handle the saving inside the service if we move that logic here.
            # However, the view needs to return quickly, but this is a generator.
            
            # Let's reproduce the logic: get history, exclude the just-saved message if it's there.
            # But wait, if we save it in the view, it might be in the history fetch if we are not careful with timing?
            # Actually, `get_history` fetches from DB.
            
            # Better approach: The service takes the *content* and handles the "context building".
            # The view already saved the message. So we just need to fetch history and be careful.
            
            history = get_history(user_id, limit=20) 
            # We can just filter out the very last message if it matches the current content and role 'user'
            # Or simpler: The view passes the current_msg object or ID.
            
            # Let's just assume the caller (View) has already saved the message.
            # We will fetch history. If the history includes the latest message, we might duplicate it if we append it again.
            # In the original code:
            # current_msg = save_message(...)
            # history = get_history(...)
            # for msg in reversed(history):
            #    if msg.id != current_msg.id: messages.append(...)
            # messages.append({"role": "user", "content": content})
            
            # So the logic constructs the prompt explicitly with history + current message.
            
            # To make this service clean, let's accept `current_msg_id` as an optional arg.
            pass
        except Exception as e:
            traceback.print_exc()
            yield f"[ERROR] {str(e)}".encode('utf-8')

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
