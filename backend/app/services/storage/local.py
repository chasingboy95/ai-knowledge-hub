import hashlib
from pathlib import Path

from backend.app.services.storage.base import StorageService


def compute_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class LocalStorageService(StorageService):
    def __init__(self, base_dir: str | Path = "./data/storage"):
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, rel_path: str) -> Path:
        clean_rel = Path(rel_path)
        resolved = (self.base_dir / clean_rel).resolve()
        try:
            resolved.relative_to(self.base_dir)
        except ValueError:
            raise ValueError(f"Path traversal detected: {rel_path}")
        return resolved

    async def save_file(self, content: bytes, destination_rel_path: str) -> str:
        target_path = self._resolve_path(destination_rel_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_bytes(content)
        # return normalized relative path string
        return str(target_path.relative_to(self.base_dir))

    async def read_file(self, storage_path: str) -> bytes:
        target_path = self._resolve_path(storage_path)
        if not target_path.is_file():
            raise FileNotFoundError(f"File not found: {storage_path}")
        return target_path.read_bytes()

    async def delete_file(self, storage_path: str) -> bool:
        target_path = self._resolve_path(storage_path)
        if target_path.is_file():
            target_path.unlink()
            return True
        return False

    async def file_exists(self, storage_path: str) -> bool:
        target_path = self._resolve_path(storage_path)
        return target_path.is_file()
