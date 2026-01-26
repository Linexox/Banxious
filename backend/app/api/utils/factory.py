from app.api.utils.llm_interface import LLMClient
from app.api.utils.zhipu_client import ZhipuClient
from app.api.utils.deepseek_client import DeepSeekClient
from config.settings import settings

def get_llm_client() -> LLMClient:
    """
    Factory function to get the configured LLM client.
    """
    if settings.LLM_PROVIDER == "zhipu":
        return ZhipuClient()
    elif settings.LLM_PROVIDER == "deepseek":
        return DeepSeekClient()
    else:
        # Default fallback or error
        raise ValueError(f"Unsupported LLM provider: {settings.LLM_PROVIDER}")
