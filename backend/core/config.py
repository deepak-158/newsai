import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "ET IntelliSphere"
    SQLITE_DB_PATH: str = os.getenv("SQLITE_DB_PATH", "./data/intellisphere.db")
    REDIS_URI: str = os.getenv("REDIS_URI", "redis://localhost:6379")
    NEWSDATA_API_KEY: str = os.getenv("NEWSDATA_API_KEY", "pub_4fc11220aea743f09beccf2e6584c403")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "AIzaSyBKtM7pdaZC13EgGKwLkayQDWv_gf2DLPc")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3:8b")
    FAISS_INDEX_PATH: str = os.getenv("FAISS_INDEX_PATH", "./data/faiss_index")

    class Config:
        env_file = ".env"

settings = Settings()
