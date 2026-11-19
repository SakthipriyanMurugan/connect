from pydantic_settings import BaseSettings
from typing import List
import os
from pathlib import Path

# Load .env file explicitly if present
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=env_path)

class Settings(BaseSettings):
    PROJECT_NAME: str = "VERTEX CONNECT API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "vertex-connect-super-secret-key-for-jwt-signing-2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    # 0-cost default: Async SQLite
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./vertex_connect.db")
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "*"
    ]
    
    # SMTP Gmail Configuration
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "sakthihinata1205@gmail.com")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "dudxopepkvpszqky")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "sakthihinata1205@gmail.com")
    FROM_NAME: str = os.getenv("FROM_NAME", "VERTEX CONNECT")

    # Groq / Gemini API keys (Optional)
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    class Config:
        case_sensitive = True

settings = Settings()
