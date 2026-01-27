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

    def chat_completion_stream(self, messages: List[Dict[str, str]], thinking_enabled: bool = False):
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.ZHIPU_API_KEY}"
        }
        
        payload = {
            "model": settings.LLM_MODEL,
            "messages": messages,
            "max_tokens": 65536,
            "temperature": 1.0,
            "stream": True
        }
        
        if thinking_enabled:
            payload["thinking"] = {
                "type": "enabled"
            }
            
        try:
            with requests.post(settings.ZHIPU_API_URL, json=payload, headers=headers, stream=True, timeout=60) as response:
                    response.raise_for_status()
                    import json
                    for line in response.iter_lines():
                        if line:
                            line_str = line.decode('utf-8')
                            # print(f"[Zhipu RAW] {line_str[:100]}") # Debug log
                            if line_str.startswith('data: '):
                                json_str = line_str[6:]
                                if json_str.strip() == '[DONE]':
                                    break
                                try:
                                    data = json.loads(json_str)
                                    if "choices" in data and len(data["choices"]) > 0:
                                        delta = data["choices"][0].get("delta", {})
                                        content = delta.get("content", "")
                                        if content:
                                            yield content
                                except json.JSONDecodeError:
                                    print(f"[Zhipu JSON Error] {json_str}")
                                    pass
                            else:
                                # Handle non-SSE response
                                try:
                                    data = json.loads(line_str)
                                    if "error" in data:
                                        yield f"[ERROR] {data['error']}"
                                except:
                                    pass
        except requests.exceptions.RequestException as e:
            print(f"Zhipu Stream Error: {e}")
            yield f"[ERROR] {str(e)}"
