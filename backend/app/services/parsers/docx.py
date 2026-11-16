import io
import docx
from backend.app.services.parsers.base import BaseParser, DocumentPage, ParsedDocument


class DocxParser(BaseParser):
    async def parse(self, content: bytes, filename: str) -> ParsedDocument:
        doc = docx.Document(io.BytesIO(content))
        lines = []

        for paragraph in doc.paragraphs:
            text = paragraph.text.strip()
            if text:
                lines.append(text)

        for table in doc.tables:
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_cells:
                    lines.append(" | ".join(row_cells))

        full_text = "\n\n".join(lines).strip()
        pages = [DocumentPage(page_number=1, content=full_text)] if full_text else []
        return ParsedDocument(filename=filename, pages=pages)
