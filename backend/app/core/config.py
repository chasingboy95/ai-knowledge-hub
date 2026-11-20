import os
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

    # Storage Provider Settings (local | s3)
    storage_provider: str = "local"
    s3_bucket: str = "ai-knowledge-hub"
    s3_endpoint_url: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None
    s3_region: str = "us-east-1"

    # Embedding Settings
    embedding_provider: str = "mock"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1536

    # LLM Settings
    llm_provider: str = "mock"  # "mock" | "openai"
    llm_base_url: str | None = None
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.4
    llm_max_tokens: int = 2048
    llm_frequency_penalty: float = 0.5
    llm_presence_penalty: float = 0.3

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @model_validator(mode="after")
    def validate_jwt_secret(self) -> "Settings":
        if self.environment.lower() != "development" and len(self.jwt_secret_key.encode()) < 32:
            raise ValueError("JWT_SECRET_KEY must be at least 32 bytes outside development")
        return self


@lru_cache
def get_settings() -> Settings:
    if "PYTEST_CURRENT_TEST" in os.environ:
        return Settings(_env_file=None)
    return Settings()
