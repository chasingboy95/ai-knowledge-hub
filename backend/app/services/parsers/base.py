from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class DocumentPage:
    page_number: int
    content: str
    metadata: dict = field(default_factory=dict)


@dataclass
class ParsedDocument:
    filename: str
    pages: list[DocumentPage]
    metadata: dict = field(default_factory=dict)

    @property
    def full_text(self) -> str:
        return "\n\n".join(p.content for p in self.pages if p.content)


class BaseParser(ABC):
    @abstractmethod
    async def parse(self, content: bytes, filename: str) -> ParsedDocument:
        """Parse raw file bytes and return a structured ParsedDocument."""
        pass
