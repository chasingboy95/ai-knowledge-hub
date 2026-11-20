from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class ToolContext:
    workspace_id: UUID
    user_id: UUID | None
    db: AsyncSession
    knowledge_base_ids: list[UUID] | None = None


@dataclass
class ToolResult:
    success: bool
    output: str
    data: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class BaseTool(ABC):
    name: str
    description: str
    parameters_schema: type[BaseModel]

    @abstractmethod
    async def execute(self, context: ToolContext, **kwargs: Any) -> ToolResult:
        """Execute the tool within the tenant-bound context."""
        pass

    def to_openai_tool(self) -> dict[str, Any]:
        """Convert tool schema to OpenAI-compatible function calling format."""
        schema = self.parameters_schema.model_json_schema()
        # Clean title & descriptions if needed
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": schema.get("properties", {}),
                    "required": schema.get("required", []),
                },
            },
        }
