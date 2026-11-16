from fastapi import APIRouter

from backend.app.api.errors import ERROR_RESPONSES
from backend.app.api.routes import audit, auth, chat, documents, knowledge_bases, organizations, users, workspaces

api_router = APIRouter(prefix="/api/v1", responses=ERROR_RESPONSES)
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])
api_router.include_router(organizations.invitation_router, tags=["invitations"])
api_router.include_router(workspaces.router, prefix="/organizations", tags=["workspaces"])
api_router.include_router(knowledge_bases.router, prefix="/organizations", tags=["knowledge-bases"])
api_router.include_router(documents.router, prefix="/organizations", tags=["documents"])
api_router.include_router(chat.router, prefix="/organizations", tags=["chat"])
api_router.include_router(audit.router, prefix="/organizations", tags=["audit"])
