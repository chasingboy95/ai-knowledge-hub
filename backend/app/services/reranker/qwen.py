import asyncio
import logging
from typing import TYPE_CHECKING

import httpx

from backend.app.services.reranker.base import BaseRerankerProvider

if TYPE_CHECKING:
    from backend.app.services.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

QWEN_RERANK_TASK = "Given a web search query, retrieve relevant passages that answer the query"


class QwenRerankerProvider(BaseRerankerProvider):
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "qwen3-reranker-0.6b",
        base_url: str = "http://localhost:1235/v1",
        timeout: float = 30.0,
        concurrency: int = 4,
    ):
        self.api_key = api_key or ""
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.semaphore = asyncio.Semaphore(concurrency)

    def _build_qwen_prompt(self, query: str, document_text: str) -> str:
        doc_snippet = document_text.strip()[:1000]
        return (
            "<|im_start|>system\n"
            "Judge whether the Document meets the requirements based on the Query and the Instruct provided. "
            "Note that the answer can only be \"yes\" or \"no\".<|im_end|>\n"
            f"<|im_start|>user\n<Instruct>: {QWEN_RERANK_TASK}\n\n"
            f"<Query>: {query.strip()}\n\n"
            f"<Document>: {doc_snippet}<|im_end|>\n"
            "<|im_start|>assistant\n<think>\n\n</think>\n\n"
        )

    async def _score_chunk_with_completions(
        self,
        client: httpx.AsyncClient,
        query: str,
        chunk: "RetrievedChunk",
    ) -> float:
        prompt = self._build_qwen_prompt(query, chunk.content)
        url = f"{self.base_url}/completions"
        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "model": self.model,
            "prompt": prompt,
            "max_tokens": 3,
            "temperature": 0.0,
        }

        async with self.semaphore:
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                choice = data.get("choices", [{}])[0]
                text = (choice.get("text") or "").strip().lower()

                # If answer begins with 'yes', mark highly relevant
                # Incorporate vector similarity as fine-grained tie-breaker
                if text.startswith("yes"):
                    return 1.0 + (chunk.similarity * 0.1)
                elif text.startswith("no"):
                    return chunk.similarity * 0.05
                else:
                    return chunk.similarity * 0.5
            except Exception as exc:
                logger.warning(
                    "Qwen reranker prompt score failed for chunk %s: %s, falling back to similarity",
                    chunk.chunk_id,
                    exc,
                )
                return chunk.similarity

    async def _try_standard_rerank_api(
        self,
        client: httpx.AsyncClient,
        query: str,
        chunks: list["RetrievedChunk"],
        top_k: int,
    ) -> list["RetrievedChunk"] | None:
        """Attempt standard /rerank or /v1/rerank endpoint if supported."""
        # Check standard endpoints
        for endpoint in (f"{self.base_url}/rerank", self.base_url.replace("/v1", "/rerank")):
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            payload = {
                "model": self.model,
                "query": query,
                "documents": [c.content for c in chunks],
                "top_n": top_k,
            }

            try:
                resp = await client.post(endpoint, headers=headers, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    results = data.get("results") or data.get("data") or []
                    reranked: list[RetrievedChunk] = []
                    for item in results:
                        idx = item.get("index")
                        score = float(item.get("relevance_score", 0.0))
                        if idx is not None and 0 <= idx < len(chunks):
                            c = chunks[idx]
                            c.rerank_score = score
                            c.similarity = score
                            reranked.append(c)
                    if reranked:
                        return reranked[:top_k]
            except Exception:
                continue

        return None

    async def rerank(
        self,
        query: str,
        chunks: list["RetrievedChunk"],
        top_k: int = 5,
    ) -> list["RetrievedChunk"]:
        if not chunks:
            return []
        if len(chunks) == 1:
            chunks[0].rerank_score = chunks[0].similarity
            return chunks

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # 1. Try standard /v1/rerank endpoint first
            std_result = await self._try_standard_rerank_api(client, query, chunks, top_k)
            if std_result is not None:
                return std_result

            # 2. Native Qwen CrossEncoder prompt scoring via /v1/completions
            tasks = [
                self._score_chunk_with_completions(client, query, c)
                for c in chunks
            ]
            scores = await asyncio.gather(*tasks, return_exceptions=True)

            scored_pairs: list[tuple[RetrievedChunk, float]] = []
            for c, score in zip(chunks, scores):
                if isinstance(score, Exception):
                    final_score = c.similarity
                else:
                    final_score = float(score)
                c.rerank_score = final_score
                c.similarity = final_score
                scored_pairs.append((c, final_score))

            # Sort descending by rerank score
            scored_pairs.sort(key=lambda pair: pair[1], reverse=True)
            return [pair[0] for pair in scored_pairs[:top_k]]
