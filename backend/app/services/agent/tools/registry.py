from backend.app.core.config import Settings
from backend.app.services.agent.tools.base import BaseTool
from backend.app.services.agent.tools.knowledge_search import KnowledgeSearchTool
from backend.app.services.agent.tools.ticket import TicketCreateTool


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> BaseTool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[BaseTool]:
        return list(self._tools.values())

    def to_openai_tools(self) -> list[dict]:
        return [tool.to_openai_tool() for tool in self._tools.values()]


def get_default_tool_registry(settings: Settings | None = None) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(KnowledgeSearchTool(settings=settings))
    registry.register(TicketCreateTool())
    return registry


__all__ = [
    "BaseTool",
    "KnowledgeSearchTool",
    "TicketCreateTool",
    "ToolRegistry",
    "get_default_tool_registry",
]
