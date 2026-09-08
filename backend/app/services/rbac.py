from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.rbac import Permission, Role, RolePermission


PERMISSION_CODES = (
    "knowledge:create",
    "knowledge:read",
    "knowledge:update",
    "knowledge:delete",
    "document:upload",
    "document:delete",
    "member:invite",
    "member:remove",
    "audit:read",
    "organization:read",
    "organization:update",
    "workspace:create",
    "workspace:read",
    "workspace:update",
    "workspace:delete",
)

ROLE_PERMISSIONS = {
    "OWNER": PERMISSION_CODES,
    "ADMIN": PERMISSION_CODES,
    "EDITOR": (
        "knowledge:create",
        "knowledge:read",
        "knowledge:update",
        "knowledge:delete",
        "document:upload",
        "document:delete",
        "organization:read",
        "workspace:read",
    ),
    "VIEWER": ("knowledge:read", "organization:read", "workspace:read"),
}


async def _ensure_permission(db: AsyncSession, code: str) -> Permission:
    permission = await db.scalar(select(Permission).where(Permission.code == code))
    if permission is not None:
        return permission
    try:
        async with db.begin_nested():
            permission = Permission(code=code, name=code)
            db.add(permission)
            await db.flush()
    except IntegrityError:
        permission = await db.scalar(select(Permission).where(Permission.code == code))
        if permission is None:
            raise
    return permission


async def _ensure_role(db: AsyncSession, code: str) -> Role:
    role = await db.scalar(select(Role).where(Role.code == code))
    if role is not None:
        return role
    try:
        async with db.begin_nested():
            role = Role(code=code, name=code)
            db.add(role)
            await db.flush()
    except IntegrityError:
        role = await db.scalar(select(Role).where(Role.code == code))
        if role is None:
            raise
    return role


async def _ensure_role_permission(
    db: AsyncSession, role: Role, permission: Permission
) -> RolePermission:
    try:
        async with db.begin_nested():
            await db.execute(
                insert(RolePermission).values(
                    role_id=role.id,
                    permission_id=permission.id,
                )
            )
        link = await db.scalar(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission.id,
            )
        )
    except IntegrityError:
        link = await db.scalar(
            select(RolePermission).where(
                RolePermission.role_id == role.id,
                RolePermission.permission_id == permission.id,
            )
        )
        if link is None:
            raise
    return link


async def seed_rbac(db: AsyncSession) -> None:
    permissions = {
        code: await _ensure_permission(db, code) for code in PERMISSION_CODES
    }
    roles = {
        code: await _ensure_role(db, code) for code in ROLE_PERMISSIONS
    }
    for role_code, permission_codes in ROLE_PERMISSIONS.items():
        for permission_code in permission_codes:
            await _ensure_role_permission(
                db, roles[role_code], permissions[permission_code]
            )
