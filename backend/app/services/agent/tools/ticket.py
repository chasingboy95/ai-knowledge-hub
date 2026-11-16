from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from backend.app.services.agent.tools.base import BaseTool, ToolContext, ToolResult


class TicketCreateArgs(BaseModel):
    title: str = Field(..., min_length=2, max_length=100, description="工单简明标题")
    description: str = Field(..., min_length=5, description="工单具体问题与诉求描述")
    priority: str = Field(default="normal", description="紧急程度: low | normal | high | urgent")
    category: str = Field(default="it_support", description="工单分类: it_support | hr | finance | general")


class TicketCreateTool(BaseTool):
    name = "create_ticket"
    description = "为用户创建企业支持或业务流转工单（如 IT 故障、权限申请、业务流程协助）。"
    parameters_schema = TicketCreateArgs

    async def execute(self, context: ToolContext, **kwargs: Any) -> ToolResult:
        try:
            args = self.parameters_schema(**kwargs)
            ticket_id = f"TICK-{uuid4().hex[:8].upper()}"

            data = {
                "ticket_id": ticket_id,
                "workspace_id": str(context.workspace_id),
                "created_by": str(context.user_id) if context.user_id else None,
                "title": args.title,
                "description": args.description,
                "priority": args.priority,
                "category": args.category,
                "status": "OPEN",
            }

            output = (
                f"工单创建成功！工单编号: {ticket_id}\n"
                f"标题: {args.title}\n"
                f"分类: {args.category} | 优先级: {args.priority}\n"
                f"状态: OPEN (已分配至对应业务组)"
            )

            return ToolResult(
                success=True,
                output=output,
                data=data,
            )
        except Exception as exc:
            return ToolResult(
                success=False,
                output=f"工单创建失败: {exc}",
                error=str(exc),
            )
