from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from backend.app.core.config import Settings
from backend.app.services.agent.tools.base import BaseTool, ToolContext, ToolResult
from backend.app.services.embeddings import get_embedding_provider
from backend.app.services.rag.retriever import SecureRAGRetriever


class KnowledgeSearchArgs(BaseModel):
    query: str = Field(..., description="需要在知识库中检索的关键问题或语义短语")
    top_k: int = Field(default=3, ge=1, le=10, description="最大返回片段数量")
    knowledge_base_ids: list[str] | None = Field(default=None, description="指定知识库 ID 列表（可选）")


class KnowledgeSearchTool(BaseTool):
    name = "knowledge_search"
    description = "在企业知识库中安全检索权威参考文档，获取精准事实依据与上下文片段。"
    parameters_schema = KnowledgeSearchArgs

    def __init__(
        self,
        retriever: SecureRAGRetriever | None = None,
        settings: Settings | None = None,
    ):
        self.retriever = retriever or SecureRAGRetriever(
            embedding_provider=get_embedding_provider(settings)
        )

    async def execute(self, context: ToolContext, **kwargs: Any) -> ToolResult:
        try:
            args = self.parameters_schema(**kwargs)
            kb_uuids: list[UUID] | None = None
            if args.knowledge_base_ids:
                kb_uuids = [UUID(str(kid)) for kid in args.knowledge_base_ids]

            chunks = await self.retriever.retrieve(
                session=context.db,
                workspace_id=context.workspace_id,
                query=args.query,
                knowledge_base_ids=kb_uuids,
                top_k=args.top_k,
                min_similarity=0.0,
            )

            if not chunks:
                return ToolResult(
                    success=True,
                    output="知识库中未检索到相关内容。",
                    data={"count": 0, "results": []},
                )

            formatted_snippets = []
            results_data = []
            for i, c in enumerate(chunks):
                snippet = f"[{i+1}] 文档: {c.document_title}\n内容: {c.content.strip()}"
                formatted_snippets.append(snippet)
                results_data.append({
                    "document_id": str(c.document_id),
                    "document_title": c.document_title,
                    "chunk_index": c.chunk_index,
                    "page_number": c.page_number,
                    "similarity": c.similarity,
                    "content": c.content,
                })

            output_text = "\n\n".join(formatted_snippets)
            return ToolResult(
                success=True,
                output=output_text,
                data={"count": len(chunks), "results": results_data},
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                output=f"检索执行失败: {exc}",
                error=str(exc),
            )
