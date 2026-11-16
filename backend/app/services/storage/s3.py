import asyncio
import io
from typing import Any

from backend.app.services.storage.base import StorageService


class S3StorageService(StorageService):
    """S3-compatible Object Storage Service (AWS S3, MinIO, Cloudflare R2, Aliyun OSS)."""

    def __init__(
        self,
        bucket: str = "ai-knowledge-hub",
        endpoint_url: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        region: str = "us-east-1",
        client: Any = None,
    ):
        self.bucket = bucket
        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region
        self._client = client
        # Memory buffer for mock/testing when no external boto3 client is supplied
        self._memory_store: dict[str, bytes] = {}

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import boto3

            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region,
            )
            return self._client
        except ImportError:
            return None

    async def save_file(self, content: bytes, destination_rel_path: str) -> str:
        clean_key = destination_rel_path.lstrip("/")
        client = self._get_client()
        if client is not None:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: client.put_object(
                    Bucket=self.bucket,
                    Key=clean_key,
                    Body=io.BytesIO(content),
                ),
            )
        else:
            self._memory_store[clean_key] = content
        return clean_key

    async def read_file(self, storage_path: str) -> bytes:
        clean_key = storage_path.lstrip("/")
        client = self._get_client()
        if client is not None:
            loop = asyncio.get_running_loop()
            try:
                resp = await loop.run_in_executor(
                    None,
                    lambda: client.get_object(Bucket=self.bucket, Key=clean_key),
                )
                return resp["Body"].read()
            except Exception as e:
                raise FileNotFoundError(f"S3 object not found: {storage_path}") from e
        else:
            if clean_key not in self._memory_store:
                raise FileNotFoundError(f"S3 object not found: {storage_path}")
            return self._memory_store[clean_key]

    async def delete_file(self, storage_path: str) -> bool:
        clean_key = storage_path.lstrip("/")
        client = self._get_client()
        if client is not None:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None,
                lambda: client.delete_object(Bucket=self.bucket, Key=clean_key),
            )
            return True
        else:
            if clean_key in self._memory_store:
                del self._memory_store[clean_key]
                return True
            return False

    async def file_exists(self, storage_path: str) -> bool:
        clean_key = storage_path.lstrip("/")
        client = self._get_client()
        if client is not None:
            loop = asyncio.get_running_loop()
            try:
                await loop.run_in_executor(
                    None,
                    lambda: client.head_object(Bucket=self.bucket, Key=clean_key),
                )
                return True
            except Exception:
                return False
        else:
            return clean_key in self._memory_store
