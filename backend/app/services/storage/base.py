from abc import ABC, abstractmethod


class StorageService(ABC):
    @abstractmethod
    async def save_file(self, content: bytes, destination_rel_path: str) -> str:
        """Save file bytes to destination_rel_path and return the relative storage path."""

    @abstractmethod
    async def read_file(self, storage_path: str) -> bytes:
        """Read and return file bytes from storage_path."""

    @abstractmethod
    async def delete_file(self, storage_path: str) -> bool:
        """Delete file at storage_path. Return True if deleted, False if file did not exist."""

    @abstractmethod
    async def file_exists(self, storage_path: str) -> bool:
        """Return True if file exists at storage_path, False otherwise."""
