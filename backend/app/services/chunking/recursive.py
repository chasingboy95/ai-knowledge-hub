
from backend.app.services.chunking.base import BaseChunker, TextChunk
from backend.app.services.parsers.base import ParsedDocument


class RecursiveCharacterChunker(BaseChunker):
    def __init__(
        self,
        chunk_size: int = 800,
        chunk_overlap: int = 100,
        separators: list[str] | None = None,
    ):
        if chunk_overlap >= chunk_size:
            raise ValueError("chunk_overlap must be strictly less than chunk_size")
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.separators = separators or ["\n\n", "\n", "。", ". ", " ", ""]

    def _estimate_tokens(self, text: str) -> int:
        # Approximate 1 token ~= 3-4 characters for English and 1-2 chars for CJK
        return max(1, len(text) // 3)

    def _split_text(self, text: str, separators: list[str]) -> list[str]:
        if len(text) <= self.chunk_size:
            return [text] if text.strip() else []

        if not separators:
            # Hard split
            return [
                text[i : i + self.chunk_size]
                for i in range(0, len(text), self.chunk_size - self.chunk_overlap)
            ]

        separator = separators[0]
        remaining_separators = separators[1:]

        if separator == "":
            splits = list(text)
        else:
            splits = text.split(separator)

        good_splits = []
        for s in splits:
            if not s:
                continue
            if len(s) > self.chunk_size:
                good_splits.extend(self._split_text(s, remaining_separators))
            else:
                good_splits.append(s)

        # Merge splits into chunks of size <= self.chunk_size with overlap
        chunks: list[str] = []
        current_chunk: list[str] = []
        current_len = 0

        sep = separator if separator != "" else ""

        for s in good_splits:
            candidate_len = current_len + (len(sep) if current_chunk else 0) + len(s)
            if candidate_len <= self.chunk_size:
                current_chunk.append(s)
                current_len = candidate_len
            else:
                if current_chunk:
                    merged = sep.join(current_chunk).strip()
                    if merged:
                        chunks.append(merged)
                    # Keep overlap from the end of current_chunk
                    overlap_chunk: list[str] = []
                    overlap_len = 0
                    for item in reversed(current_chunk):
                        if overlap_len + len(item) <= self.chunk_overlap:
                            overlap_chunk.insert(0, item)
                            overlap_len += len(item)
                        else:
                            break
                    current_chunk = overlap_chunk
                    current_len = sum(len(x) for x in current_chunk) + max(
                        0, len(current_chunk) - 1
                    ) * len(sep)

                current_chunk.append(s)
                current_len += (len(sep) if len(current_chunk) > 1 else 0) + len(s)

        if current_chunk:
            merged = sep.join(current_chunk).strip()
            if merged:
                chunks.append(merged)

        return chunks

    def chunk_document(self, parsed_doc: ParsedDocument) -> list[TextChunk]:
        chunks: list[TextChunk] = []
        global_index = 0

        for page in parsed_doc.pages:
            if not page.content.strip():
                continue
            text_pieces = self._split_text(page.content, self.separators)
            for piece in text_pieces:
                if not piece.strip():
                    continue
                meta = {
                    "filename": parsed_doc.filename,
                    "page_number": page.page_number,
                    **page.metadata,
                }
                chunks.append(
                    TextChunk(
                        chunk_index=global_index,
                        content=piece,
                        token_count=self._estimate_tokens(piece),
                        metadata=meta,
                    )
                )
                global_index += 1

        return chunks
