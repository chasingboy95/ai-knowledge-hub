from backend.app.core.config import Settings
from backend.app.services.embeddings import get_embedding_provider
from backend.app.services.llm import get_llm_provider
from backend.app.services.rag.prompt_builder import PromptBuilder
from backend.app.services.rag.rag_service import RAGService
from backend.app.services.rag.retriever import SecureRAGRetriever


def get_rag_service(settings: Settings) -> RAGService:
    embedding_provider = get_embedding_provider(settings)
    retriever = SecureRAGRetriever(embedding_provider=embedding_provider)
    llm_provider = get_llm_provider(settings)
    return RAGService(retriever=retriever, llm_provider=llm_provider)


__all__ = ["PromptBuilder", "RAGService", "SecureRAGRetriever", "get_rag_service"]
