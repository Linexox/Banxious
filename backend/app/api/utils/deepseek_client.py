import requests
from typing import List, Dict, Any
from app.api.utils.llm_interface import LLMClient
from config.settings import settings

class DeepSeekClient(LLMClient):
    def chat_completion(self, messages: List[Dict[str, str]], thinking_enabled: bool = False) -> Dict[str, Any]:
        """
        DeepSeek API client implementation.
        Note: thinking_enabled is implicitly handled by choosing the 'deepseek-reasoner' model in settings.
        """
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}"
        }
        
        # DeepSeek R1 (deepseek-reasoner) might have specific parameter constraints,
        # but generally follows OpenAI format.
        payload = {
            "model": settings.LLM_MODEL,
            "messages": messages,
            "max_tokens": 8000, # Adjust as needed
            "stream": False
        }
        
        # If not reasoning model, we might want temperature. 
        # For reasoner, it's often recommended to leave temperature default or 0.6.
        # We'll set it only if not explicitly R1 or if we want to force it.
        # But let's keep it simple.
        if "reasoner" not in settings.LLM_MODEL:
             payload["temperature"] = 1.0

        try:
            response = requests.post(settings.DEEPSEEK_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # Log error properly in production
            print(f"DeepSeek API Error: {e}")
            if e.response:
                print(f"Response: {e.response.text}")
            return {"error": str(e)}
