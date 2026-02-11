import os
from dotenv import load_dotenv

load_dotenv()

MODEL_NAME = 'deepseek'
# MODEL_NAME = 'zhipu'

class ZhiPuSettings: # 'zhipu'
    PROJECT_NAME: str = "GreenBanana"
    
    # LLM Configuration
    ZHIPU_API_KEY: str = os.getenv("ZHIPU_API_KEY", "00000000000000000000000000000000")
    LLM_PROVIDER: str = "zhipu"
    LLM_MODEL: str = os.getenv("ZHIPU_MODEL", "glm-4.7")
    
    # API URLs
    ZHIPU_API_URL: str = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

class DeepseekR1Settings: # 'deepseek'
    PROJECT_NAME: str = "GreenBanana"
    
    # LLM Configuration
    DEEPSEEK_API_KEY: str = os.getenv("DEEPSEEK_API_KEY", "sk-00000000000000000000000000000000")
    LLM_PROVIDER: str = "deepseek"
    LLM_MODEL: str = os.getenv("DEEPSEEK_MODEL", "deepseek-reasoner")
    
    # API URLs
    DEEPSEEK_API_URL: str = "https://api.deepseek.com/chat/completions"

MODEL_SETTINGS = {
    'zhipu': ZhiPuSettings,
    'deepseek': DeepseekR1Settings,
}

settings = MODEL_SETTINGS[MODEL_NAME]()
