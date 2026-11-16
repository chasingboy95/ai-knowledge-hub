from backend.app.core.config import Settings
from backend.app.services.agent.runner import AgentRunner
from backend.app.services.agent.tools.registry import ToolRegistry, get_default_tool_registry
from backend.app.services.llm import get_llm_provider


def get_agent_runner(settings: Settings) -> AgentRunner:
    llm_provider = get_llm_provider(settings)
    tool_registry = get_default_tool_registry(settings)
    return AgentRunner(llm_provider=llm_provider, tool_registry=tool_registry)


__all__ = ["AgentRunner", "ToolRegistry", "get_agent_runner", "get_default_tool_registry"]
