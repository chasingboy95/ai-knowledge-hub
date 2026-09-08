from fastapi import APIRouter

from backend.app.api.errors import ERROR_RESPONSES
from backend.app.api.routes import auth, organizations, users, workspaces

api_router = APIRouter(prefix="/api/v1", responses=ERROR_RESPONSES)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(organizations.invitation_router, tags=["invitations"])
api_router.include_router(workspaces.router, prefix="/organizations", tags=["workspaces"])
