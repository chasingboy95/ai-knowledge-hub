import logging
from typing import Literal

from chonkie import RecursiveChunker, SentenceChunker, TokenChunker

from backend.app.services.chunking.base import BaseChunker, TextChunk
from backend.app.services.parsers.base import ParsedDocument

logger = logging.getLogger(__name__)

DEFAULT_DELIMITERS = ["\n\n", "\n", "。", "！", "？", "；", ". ", "! ", "? ", "; "]


class ChonkieChunker(BaseChunker):
    def __init__(
        self,
        strategy: Literal["sentence", "recursive", "token"] = "sentence",
        chunk_size: int = 512,
        chunk_overlap: int = 64,
        tokenizer: str = "character",
    ):
        if chunk_overlap >= chunk_size:
            raise ValueError("chunk_overlap must be strictly less than chunk_size")

        self.strategy = strategy.lower()
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.tokenizer = tokenizer

        if self.strategy == "sentence":
            self._chunker = SentenceChunker(
                tokenizer=self.tokenizer,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                min_sentences_per_chunk=1,
                min_characters_per_sentence=2,
                delim=DEFAULT_DELIMITERS,
            )
        elif self.strategy == "token":
            self._chunker = TokenChunker(
                tokenizer=self.tokenizer,
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
            )
        else:
            self._chunker = RecursiveChunker(
                tokenizer=self.tokenizer,
                chunk_size=self.chunk_size,
                min_characters_per_chunk=2,
            )

    def chunk_document(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        chunks: list[TextChunk] = []
        global_index = 0

        for page in parsed_doc.pages:
            text = page.content.strip()
            if not text:
                continue

            try:
                chonkie_chunks = self._chunker(text)
            except Exception as exc:
                logger.warning(
                    "Chonkie chunking failed for page %s of %s: %s, falling back to simple split",
                    page.page_number,
                    parsed_doc.filename,
                    exc,
                )
                # Fallback to simple slice
                step = max(1, self.chunk_size - self.chunk_overlap)
                raw_pieces = [
                    text[i : i + self.chunk_size] for i in range(0, len(text), step)
                ]
                for piece in raw_pieces:
                    meta = {
                        "filename": parsed_doc.filename,
                        "page_number": page.page_number,
                        **page.metadata,
                    }
                    chunks.append(
                        TextChunk(
                            chunk_index=global_index,
                            content=piece,
                            token_count=max(1, len(piece) // 3),
                            metadata=meta,
                        )
                    )
                    global_index += 1
                continue

            for c in chonkie_chunks:
                chunk_text = getattr(c, "text", str(c)).strip()
                if not chunk_text:
                    continue

                token_cnt = getattr(c, "token_count", None)
                if token_cnt is None:
                    token_cnt = max(1, len(chunk_text) // 3)

                meta = {
                    "filename": parsed_doc.filename,
                    "page_number": page.page_number,
                    **page.metadata,
                }
                if hasattr(c, "start_index"):
                    meta["start_index"] = c.start_index
                if hasattr(c, "end_index"):
                    meta["end_index"] = c.end_index

                chunks.append(
                    TextChunk(
                        chunk_index=global_index,
                        content=chunk_text,
                        token_count=token_cnt,
                        metadata=meta,
                    )
                )
                global_index += 1

        return chunks
