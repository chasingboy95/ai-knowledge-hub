from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


ERRORS = {
    400: ("BAD_REQUEST", "Bad request"),
    401: ("UNAUTHORIZED", "Authentication is required"),
    403: ("FORBIDDEN", "You do not have permission to access this resource"),
    404: ("NOT_FOUND", "Resource not found"),
    405: ("METHOD_NOT_ALLOWED", "Method not allowed"),
    409: ("CONFLICT", "Resource conflicts with existing state"),
    422: ("VALIDATION_ERROR", "Request validation failed"),
    500: ("INTERNAL_SERVER_ERROR", "Internal server error"),
}

ERROR_RESPONSES = {
    status_code: {"model": ErrorResponse, "description": message}
    for status_code, (_, message) in ERRORS.items()
}


def error_response(status_code: int, headers: dict[str, str] | None = None) -> JSONResponse:
    code, message = ERRORS.get(status_code, ("HTTP_ERROR", "Request failed"))
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=ErrorDetail(code=code, message=message)).model_dump(),
        headers=headers,
    )
