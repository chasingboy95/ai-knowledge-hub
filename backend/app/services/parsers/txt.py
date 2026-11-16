import re
from backend.app.services.parsers.base import BaseParser, DocumentPage, ParsedDocument


class PlainTextParser(BaseParser):
    async def parse(self, content: bytes, filename: str) -> ParsedDocument:
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = content.decode("latin-1", errors="replace")

        # Normalize line breaks and remove null characters
        text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
        # Normalize excessive blank lines (> 2) to 2
        text = re.sub(r"\n{3,}", "\n\n", text).strip()

        pages = [DocumentPage(page_number=1, content=text)] if text else []
        return ParsedDocument(filename=filename, pages=pages)
