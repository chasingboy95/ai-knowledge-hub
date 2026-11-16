from pathlib import Path
from backend.app.services.parsers.base import BaseParser, DocumentPage, ParsedDocument
from backend.app.services.parsers.docx import DocxParser
from backend.app.services.parsers.pdf import PDFParser
from backend.app.services.parsers.txt import PlainTextParser

_PARSER_MAP = {
    ".txt": PlainTextParser,
    ".text": PlainTextParser,
    ".md": PlainTextParser,
    ".markdown": PlainTextParser,
    ".json": PlainTextParser,
    ".csv": PlainTextParser,
    ".pdf": PDFParser,
    ".docx": DocxParser,
}


def get_parser_for_filename(filename: str) -> BaseParser:
    ext = Path(filename).suffix.lower()
    parser_cls = _PARSER_MAP.get(ext)
    if not parser_cls:
        raise ValueError(f"Unsupported document format: {ext or 'no extension'}")
    return parser_cls()


__all__ = [
    "BaseParser",
    "DocumentPage",
    "DocxParser",
    "PDFParser",
    "ParsedDocument",
    "PlainTextParser",
    "get_parser_for_filename",
]
