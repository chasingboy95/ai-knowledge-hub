from pydantic import BaseModel, Field

class Credentials(BaseModel):
    email: str
    password: str = Field(min_length=8)


class RegisterRequest(Credentials):
    full_name: str | None = Field(default=None, max_length=255)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
