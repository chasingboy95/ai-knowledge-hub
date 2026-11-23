from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from backend.app.services.parsers.base import ParsedDocument


@dataclass
class TextChunk:
    chunk_index: int
    content: str
    token_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseChunker(ABC):
    @abstractmethod
    def chunk_document(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        """Split a ParsedDocument into a list of TextChunk objects."""
