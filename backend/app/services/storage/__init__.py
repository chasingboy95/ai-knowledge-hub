from backend.app.core.config import Settings
from backend.app.services.storage.base import StorageService
from backend.app.services.storage.local import LocalStorageService
from backend.app.services.storage.s3 import S3StorageService


def get_storage_service(settings: Settings) -> StorageService:
    if settings.storage_provider.lower() == "s3":
        return S3StorageService(
            bucket=settings.s3_bucket,
            endpoint_url=settings.s3_endpoint_url,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            region=settings.s3_region,
        )
    return LocalStorageService(base_dir=settings.storage_dir)


__all__ = ["LocalStorageService", "S3StorageService", "StorageService", "get_storage_service"]
