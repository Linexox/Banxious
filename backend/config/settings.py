import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "GreenBanana"
    
    # LLM Configuration
    ZHIPU_API_KEY: str = os.getenv("ZHIPU_API_KEY", "eceb5107c89148938cf8ae35b4d1a0ba.MOBrNxXFHSjxnEV6")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "zhipu") # zhipu, deepseek, etc.
    LLM_MODEL: str = os.getenv("LLM_MODEL", "glm-4.7")
    
    # API URLs
    ZHIPU_API_URL: str = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

settings = Settings()
