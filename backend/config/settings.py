import os
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = 'zhipu'

class ZhiPuSettings: # 'zhipu'
    PROJECT_NAME: str = "GreenBanana"
    
    # LLM Configuration
    ZHIPU_API_KEY: str = os.getenv("ZHIPU_API_KEY", "eceb5107c89148938cf8ae35b4d1a0ba.MOBrNxXFHSjxnEV6")
    LLM_PROVIDER: str = "zhipu"
    LLM_MODEL: str = os.getenv("ZHIPU_MODEL", "glm-4.7")
    
    # API URLs
    ZHIPU_API_URL: str = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

class DeepseekR1Settings: # 'deepseek'
    PROJECT_NAME: str = "GreenBanana"
    
    # LLM Configuration
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "sk-a7a902cebc234988b0b3746c837435c9")
    LLM_PROVIDER: str = "deepseek"
    LLM_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-reasoner")
    
    # API URLs
    DEEPSEEK_API_URL: str = "https://api.deepseek.com/chat/completions"

MODEL_SETTINGS = {
    'zhipu': ZhiPuSettings,
    'deepseek': DeepseekR1Settings,
}

settings = MODEL_SETTINGS[MODEL_NAME]()
