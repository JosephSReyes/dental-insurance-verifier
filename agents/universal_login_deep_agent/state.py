"""
State management for Universal Login Deep Agent
"""

from typing import Annotated, Optional, List, Dict, Any
from typing_extensions import TypedDict
from langgraph.graph import add_messages
from langchain_core.messages import BaseMessage

from .schema import LoginRequest, LoginStep, IssueDetected, PortalStructure


class UniversalLoginState(TypedDict):
    """State for the Universal Login Deep Agent"""

    # Input
    request: LoginRequest

    # Messages for LLM communication
    messages: Annotated[List[BaseMessage], add_messages]

    # Current execution state
    current_step: str
    attempt_number: int
    max_attempts: int

    # Browser state
    browser_context_id: Optional[str]
    current_url: Optional[str]
    last_html: Optional[str]
    last_screenshot: Optional[str]

    # Portal analysis
    portal_structure: Optional[PortalStructure]
    form_fields_detected: List[Dict[str, Any]]
    buttons_detected: List[Dict[str, Any]]

    # Execution tracking
    steps_taken: List[LoginStep]
    issues_detected: List[IssueDetected]

    # Planning (for Deep Agent)
    plan: List[str]  # List of planned steps
    current_plan_index: int

    # Results
    login_successful: bool
    error_message: Optional[str]
    final_url: Optional[str]

    # Screenshots and evidence
    screenshots: List[str]

    # Subagent tracking
    subagent_results: List[Dict[str, Any]]

    # HITL
    human_intervention_required: bool
    human_intervention_reason: Optional[str]


class SubagentState(TypedDict):
    """State for subagents handling specific complex steps"""

    # Inherited from parent
    parent_state: Dict[str, Any]

    # Subagent specific
    task_description: str
    messages: Annotated[List[BaseMessage], add_messages]

    # Browser state (shared reference)
    browser_context_id: str
    current_html: Optional[str]

    # Results
    task_completed: bool
    result: Optional[Dict[str, Any]]
    error: Optional[str]
