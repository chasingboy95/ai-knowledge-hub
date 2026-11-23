from backend.app.core.config import Settings, get_settings
from backend.app.services.chunking.base import BaseChunker, TextChunk
from backend.app.services.chunking.chonkie_chunker import ChonkieChunker
from backend.app.services.chunking.recursive import RecursiveCharacterChunker


def get_chunker(settings: Settings | None = None) -> BaseChunker:
    cfg = settings or get_settings()

    if cfg.chunking_provider.lower() == "chonkie":
        return ChonkieChunker(
            strategy=cfg.chunking_strategy,  # type: ignore[arg-type]
            chunk_size=cfg.chunk_size,
            chunk_overlap=cfg.chunk_overlap,
        )

    return RecursiveCharacterChunker(
        chunk_size=cfg.chunk_size,
        chunk_overlap=cfg.chunk_overlap,
    )


__all__ = [
    "BaseChunker",
    "ChonkieChunker",
    "RecursiveCharacterChunker",
    "TextChunk",
    "get_chunker",
]
