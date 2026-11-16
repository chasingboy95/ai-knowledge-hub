from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str
    jwt_secret_key: str
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    storage_dir: str = "./data/storage"
    embedding_provider: str = "mock"
    openai_api_key: str | None = None
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> "Settings":
        if self.environment.lower() != "development" and len(self.jwt_secret_key.encode()) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 bytes outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
