import io
import pypdf
from backend.app.services.parsers.base import BaseParser, DocumentPage, ParsedDocument


class PDFParser(BaseParser):
    async def parse(self, content: bytes, filename: str) -> ParsedDocument:
        reader = pypdf.PdfReader(io.BytesIO(content))
        pages = []
        for idx, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
            pages.append(DocumentPage(page_number=idx + 1, content=text))

        metadata = {
            "page_count": len(reader.pages),
        }
        return ParsedDocument(filename=filename, pages=pages, metadata=metadata)
