import requests
from typing import List, Dict, Any
from app.api.utils.llm_interface import LLMClient
from config.settings import settings

class ZhipuClient(LLMClient):
    def chat_completion(self, messages: List[Dict[str, str]], thinking_enabled: bool = False) -> Dict[str, Any]:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.ZHIPU_API_KEY}"
        }
        
        payload = {
            "model": settings.LLM_MODEL,
            "messages": messages,
            "max_tokens": 65536,
            "temperature": 1.0
        }
        
        if thinking_enabled:
            payload["thinking"] = {
                "type": "enabled"
            }
            
        try:
            response = requests.post(settings.ZHIPU_API_URL, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            # Log error properly in production
            # For now, return a structure that indicates error
            return {"error": str(e)}
