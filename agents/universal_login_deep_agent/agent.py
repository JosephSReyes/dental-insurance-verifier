"""
Universal Login Deep Agent - PROPER DeepAgents Implementation

This implements a REAL Deep Agent using the deepagents library with ALL capabilities:
- Planning with write_todos
- File system for context management
- Subagent spawning for complex tasks
- Long-term memory across threads
- Automatic large tool result eviction
"""

import logging
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime

# PROPER DeepAgents imports
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore
from langgraph.checkpoint.memory import MemorySaver

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

from .schema import (
    LoginRequest,
    LoginResult,
    LoginStatus,
    LoginStep,
    IssueDetected,
    PortalStructure
)
from .tools import get_all_tools, initialize_browser_tools, get_browser_tools
from .prompts import (
    PRIMARY_AGENT_PROMPT,
    FORM_ANALYZER_SUBAGENT_PROMPT,
    CAPTCHA_DETECTOR_SUBAGENT_PROMPT,
    CREDENTIAL_FILLER_SUBAGENT_PROMPT
)

logger = logging.getLogger(__name__)


def create_backend(runtime):
    """
    Create a CompositeBackend with hybrid storage:
    - Default: StateBackend (ephemeral workspace for current thread)
    - /memories/: StoreBackend (persistent across threads for learned patterns)
    """
    return CompositeBackend(
        default=StateBackend(runtime),
        routes={
            "/memories/": StoreBackend(runtime),
        }
    )


class UniversalLoginAgent:
    """
    Universal Insurance Portal Login Deep Agent

    Uses the REAL DeepAgents library with:
    - TodoListMiddleware for planning (write_todos)
    - FilesystemMiddleware for context management
    - SubAgentMiddleware for task delegation
    - CompositeBackend for hybrid storage
    """

    def __init__(
        self,
        model_name: str = "gpt-4o",
        temperature: float = 0.1,
        max_attempts: int = 3,
        provider: str = "openai",
        enable_long_term_memory: bool = True
    ):
        """
        Initialize the Universal Login Agent with DeepAgents

        Args:
            model_name: LLM model to use
            temperature: Temperature for LLM
            max_attempts: Maximum login attempts (passed to agent context)
            provider: "openai" or "anthropic"
            enable_long_term_memory: Enable persistent memory across threads
        """
        self.model_name = model_name
        self.temperature = temperature
        self.max_attempts = max_attempts
        self.provider = provider
        self.enable_long_term_memory = enable_long_term_memory
        self.llm = None
        self.deep_agent = None
        self.store = None
        self.checkpointer = None

    async def initialize(self):
        """Initialize the Deep Agent with all DeepAgents capabilities"""

        # Initialize browser tools
        await initialize_browser_tools()

        # Initialize LLM
        if self.provider == "anthropic":
            self.llm = ChatAnthropic(
                model=self.model_name,
                temperature=self.temperature
            )
        else:
            self.llm = ChatOpenAI(
                model=self.model_name,
                temperature=self.temperature
            )

        # Initialize Store for long-term memory
        # In production, use PostgresStore or other persistent store
        self.store = InMemoryStore()

        # Initialize Checkpointer for state persistence
        self.checkpointer = MemorySaver()

        # Get browser automation tools
        browser_tools = get_all_tools()

        # Define specialized subagents
        subagents = self._create_subagents(browser_tools)

        # Create Deep Agent with ALL DeepAgents capabilities
        self.deep_agent = create_deep_agent(
            model=self.llm,
            tools=browser_tools,
            system_prompt=PRIMARY_AGENT_PROMPT,

            # Backend configuration (hybrid storage)
            backend=create_backend if self.enable_long_term_memory else None,

            # Store for persistent memory
            store=self.store if self.enable_long_term_memory else None,

            # Checkpointer for state persistence
            checkpointer=self.checkpointer,

            # Specialized subagents
            subagents=subagents,
        )

        logger.info(f"✓ Universal Login Deep Agent initialized with {self.provider}/{self.model_name}")
        logger.info(f"  - Planning: write_todos (TodoListMiddleware)")
        logger.info(f"  - File system: ls, read_file, write_file, edit_file (FilesystemMiddleware)")
        logger.info(f"  - Subagents: {len(subagents)} specialized + 1 general-purpose")
        logger.info(f"  - Long-term memory: {'Enabled' if self.enable_long_term_memory else 'Disabled'}")

    def _create_subagents(self, browser_tools: List) -> List[Dict[str, Any]]:
        """
        Create specialized subagents for different aspects of login

        Subagents provide context isolation - they handle complex subtasks
        and return only summaries to the main agent, keeping context clean.
        """
        return [
            {
                "name": "form-analyzer",
                "description": "Analyzes complex login forms with multiple steps or unusual layouts. Use when the login page structure is unclear or has multiple forms.",
                "system_prompt": FORM_ANALYZER_SUBAGENT_PROMPT,
                "tools": [
                    tool for tool in browser_tools
                    if tool.name in [
                        "analyze_page_structure",
                        "find_login_element",
                        "capture_screenshot"
                    ]
                ],
            },
            {
                "name": "captcha-detector",
                "description": "Detects and reports CAPTCHA, MFA, or other authentication obstacles. Use when you suspect the page has security challenges.",
                "system_prompt": CAPTCHA_DETECTOR_SUBAGENT_PROMPT,
                "tools": [
                    tool for tool in browser_tools
                    if tool.name in [
                        "analyze_page_structure",
                        "capture_screenshot",
                        "flag_for_human_intervention"
                    ]
                ],
            },
            {
                "name": "credential-filler",
                "description": "Fills login credentials into identified form fields. Use after form analysis to execute the actual login.",
                "system_prompt": CREDENTIAL_FILLER_SUBAGENT_PROMPT,
                "tools": [
                    tool for tool in browser_tools
                    if tool.name in [
                        "find_login_element",
                        "fill_login_field",
                        "click_login_button",
                        "wait_for_login_element",
                        "capture_screenshot"
                    ]
                ],
            },
        ]

    async def login(self, request: LoginRequest) -> LoginResult:
        """
        Execute login using Deep Agent with full planning and delegation

        The Deep Agent will:
        1. Use write_todos to create a plan
        2. Save large HTML pages to files for context management
        3. Delegate complex tasks to specialized subagents
        4. Save successful patterns to /memories/ for future use

        Args:
            request: Login request with portal details and credentials

        Returns:
            LoginResult with outcome and details
        """
        if not self.deep_agent:
            await self.initialize()

        logger.info(f"Starting Deep Agent login for {request.payer_name}")

        # Create browser context
        browser_manager, _ = get_browser_tools()
        context_id = f"login_{uuid.uuid4().hex[:8]}"
        await browser_manager.create_context(context_id)

        # Create thread-specific config
        thread_id = str(uuid.uuid4())
        config = {"configurable": {"thread_id": thread_id}}

        try:
            # Construct the task with DeepAgents-aware instructions
            task_description = self._build_task_description(request, context_id)

            # Invoke the Deep Agent
            # The agent will autonomously:
            # - Use write_todos for planning
            # - Use file system for large results
            # - Spawn subagents for complex subtasks
            logger.info("Invoking Deep Agent with full planning and delegation capabilities...")

            result = await self.deep_agent.ainvoke(
                {"messages": [HumanMessage(content=task_description)]},
                config=config
            )

            # Extract and analyze results
            messages = result.get("messages", [])

            # Check filesystem for results
            todos = result.get("todos", [])
            files = result.get("files", {})

            # Analyze final state
            login_successful = await self._check_login_success(context_id)

            # Build portal structure from saved analysis
            portal_structure = await self._build_portal_structure(context_id, files)

            # Detect issues
            issues = await self._detect_issues(messages, context_id, files)

            # Extract steps from execution
            steps = self._extract_steps_from_execution(messages, todos)

            # Get screenshots
            screenshots = self._extract_screenshots(files)

            # Get final URL
            final_url = await self._get_current_url(context_id)

            # Build result
            return LoginResult(
                success=login_successful,
                status=self._determine_status(login_successful, issues),
                reason=self._build_reason(login_successful, issues, request.payer_name),
                steps=steps,
                portal_structure=portal_structure,
                issues=issues,
                final_url=final_url,
                screenshots=screenshots,
                metadata={
                    "thread_id": thread_id,
                    "context_id": context_id,
                    "todos_created": len(todos),
                    "files_created": len(files),
                    "messages_count": len(messages),
                    "subagents_used": self._count_subagent_usage(messages)
                }
            )

        except Exception as e:
            logger.error(f"Error during Deep Agent execution: {e}", exc_info=True)

            # Capture error state
            screenshot_path = await self._capture_error_screenshot(context_id)

            return LoginResult(
                success=False,
                status=LoginStatus.FAILED,
                reason=f"Deep Agent error: {str(e)}",
                steps=[],
                issues=[IssueDetected(type="exception", description=str(e))],
                screenshots=[screenshot_path] if screenshot_path else [],
                final_url=None,
                metadata={"error": str(e), "context_id": context_id}
            )

    def _build_task_description(self, request: LoginRequest, context_id: str) -> str:
        """
        Build task description that instructs the agent to use ALL DeepAgents capabilities
        """
        return f"""You are tasked with logging into the {request.payer_name} insurance portal.

## Portal Information
- Payer: {request.payer_name}
- URL: {request.portal_url}
- Username: {request.username}
- Password: {request.password}
- Office ID: {request.office_id or 'Not provided'}
- Browser Context ID: {context_id}

## Your DeepAgents Capabilities

You have powerful built-in capabilities. USE THEM:

### 1. Planning (write_todos)
**START by using the write_todos tool** to break down this login task into specific steps.

Example plan:
1. Open portal and analyze structure
2. Identify login form fields
3. Fill credentials
4. Submit form
5. Verify success

Update your todos as you learn more about the portal.

### 2. File System (for context management)
The portal HTML will be large. Use filesystem tools to manage it:

- **Open portal**: Use open_portal_page, then analyze_page_structure
- **Save HTML**: Write large HTML to `/workspace/portal_page.html` using write_file
- **Save structure**: Write form analysis to `/workspace/structure.json`
- **Read selectively**: Use read_file with offset/limit to read portions

This keeps your context clean!

### 3. Subagent Delegation (task tool)
For complex subtasks, delegate to specialized subagents using the task() tool:

**Available subagents:**
- `form-analyzer`: Use for complex/multi-step forms
- `captcha-detector`: Use to check for CAPTCHA/MFA obstacles
- `credential-filler`: Use to execute the actual login after analysis

Example: `task(name="form-analyzer", task="Analyze the login form at {request.portal_url} and identify all required fields")`

Subagents work independently and return summaries, keeping your context clean.

### 4. Long-term Memory
If you successfully log in, save the portal pattern to `/memories/{request.payer_name}/`:

- `/memories/{request.payer_name}/login_pattern.json` - Form structure
- `/memories/{request.payer_name}/notes.txt` - Any quirks or special requirements

Next time this portal is encountered, you can read these memories!

## Execution Strategy

1. **Plan first**: Use write_todos to create your plan
2. **Open and save**: Open portal, save HTML to file
3. **Analyze**: Either analyze yourself or delegate to form-analyzer subagent
4. **Fill credentials**: Delegate to credential-filler or do it yourself
5. **Check obstacles**: Delegate to captcha-detector if unsure
6. **Verify**: Use detect_login_success
7. **Save pattern**: Write successful pattern to /memories/

## Success Criteria
- URL changed from login page
- Dashboard/account elements visible
- No error messages
- Login form no longer present

## Important Notes
- Use file system liberally - it prevents context overflow
- Delegate complex tasks to subagents - they return clean summaries
- Update your todos as you progress
- Save successful patterns for future use

Begin by using write_todos to plan your approach!
"""

    async def _check_login_success(self, context_id: str) -> bool:
        """Check if login was successful"""
        try:
            from .tools import detect_login_success
            result = await detect_login_success.ainvoke({"context_id": context_id})
            return result.get("login_successful", False)
        except Exception as e:
            logger.error(f"Error checking login success: {e}")
            return False

    async def _build_portal_structure(
        self,
        context_id: str,
        files: Dict[str, Any]
    ) -> Optional[PortalStructure]:
        """Build portal structure from saved files or current analysis"""
        try:
            # Check if agent saved structure to file
            if "/workspace/structure.json" in files:
                import json
                structure_data = json.loads(files["/workspace/structure.json"])
                return PortalStructure(**structure_data)

            # Otherwise analyze current page
            from .tools import analyze_page_structure
            result = await analyze_page_structure.ainvoke({"context_id": context_id})

            if not result.get("success"):
                return None

            forms = result.get("forms", [])
            buttons = result.get("buttons", [])

            return PortalStructure(
                login_type="single_page" if len(forms) == 1 else "multi_step",
                form_fields=[
                    field.get("name", field.get("id", "unknown"))
                    for form in forms
                    for field in form.get("inputs", [])
                ],
                buttons=[btn.get("text", "unknown") for btn in buttons],
                has_captcha=result.get("has_captcha", False),
                has_mfa=False,
                notes=f"Discovered via DeepAgents: {len(forms)} forms, {len(buttons)} buttons"
            )
        except Exception as e:
            logger.error(f"Error building portal structure: {e}")
            return None

    async def _detect_issues(
        self,
        messages: List,
        context_id: str,
        files: Dict[str, Any]
    ) -> List[IssueDetected]:
        """Detect issues from messages, files, and page state"""
        issues = []

        # Check current page for CAPTCHA
        try:
            from .tools import analyze_page_structure
            result = await analyze_page_structure.ainvoke({"context_id": context_id})
            if result.get("has_captcha"):
                issues.append(IssueDetected(
                    type="captcha",
                    description="CAPTCHA detected on page"
                ))
        except:
            pass

        # Check messages for issue indicators
        for msg in messages:
            content = str(msg.content).lower() if hasattr(msg, 'content') else str(msg).lower()

            if "captcha" in content and not any(i.type == "captcha" for i in issues):
                issues.append(IssueDetected(
                    type="captcha",
                    description="CAPTCHA mentioned during execution"
                ))

            if ("mfa" in content or "multi-factor" in content) and not any(i.type == "mfa" for i in issues):
                issues.append(IssueDetected(
                    type="mfa",
                    description="Multi-factor authentication detected"
                ))

            if "invalid" in content and "credential" in content:
                issues.append(IssueDetected(
                    type="invalid_credentials",
                    description="Invalid credentials detected"
                ))

        return issues

    def _extract_steps_from_execution(
        self,
        messages: List,
        todos: List[Dict[str, Any]]
    ) -> List[LoginStep]:
        """Extract steps from todos and message execution"""
        steps = []

        # Add steps from todos
        for i, todo in enumerate(todos, 1):
            steps.append(LoginStep(
                step_number=i,
                action=todo.get("status", "pending"),
                description=todo.get("content", "Unknown step"),
                success=todo.get("status") == "completed"
            ))

        # If no todos, extract from messages
        if not steps:
            step_number = 1
            for msg in messages:
                if not hasattr(msg, 'content'):
                    continue

                content = str(msg.content)

                # Look for tool calls
                if "open_portal_page" in content:
                    steps.append(LoginStep(
                        step_number=step_number,
                        action="open_page",
                        description="Opened portal page",
                        success=True
                    ))
                    step_number += 1
                elif "analyze_page_structure" in content:
                    steps.append(LoginStep(
                        step_number=step_number,
                        action="analyze",
                        description="Analyzed page structure",
                        success=True
                    ))
                    step_number += 1
                elif "task" in content and "form-analyzer" in content:
                    steps.append(LoginStep(
                        step_number=step_number,
                        action="subagent",
                        description="Delegated form analysis to subagent",
                        success=True
                    ))
                    step_number += 1
                elif "fill_login_field" in content:
                    steps.append(LoginStep(
                        step_number=step_number,
                        action="fill_field",
                        description="Filled login credentials",
                        success=True
                    ))
                    step_number += 1

        # If still no steps, add generic one
        if not steps:
            steps.append(LoginStep(
                step_number=1,
                action="execute",
                description="Executed login via Deep Agent",
                success=True
            ))

        return steps

    def _extract_screenshots(self, files: Dict[str, Any]) -> List[str]:
        """Extract screenshot paths from files"""
        from pathlib import Path
        screenshot_dir = Path("screenshots")

        if not screenshot_dir.exists():
            return []

        # Get recent screenshots
        screenshots = sorted(
            screenshot_dir.glob("*.png"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        return [str(s) for s in screenshots[:10]]

    async def _get_current_url(self, context_id: str) -> Optional[str]:
        """Get current URL from browser"""
        try:
            browser_manager, _ = get_browser_tools()
            page = await browser_manager.get_page(context_id)
            if page:
                return page.url
        except Exception as e:
            logger.error(f"Error getting current URL: {e}")
        return None

    def _count_subagent_usage(self, messages: List) -> Dict[str, int]:
        """Count how many times each subagent was used"""
        usage = {"form-analyzer": 0, "captcha-detector": 0, "credential-filler": 0, "general-purpose": 0}

        for msg in messages:
            content = str(msg.content).lower() if hasattr(msg, 'content') else str(msg).lower()

            if "task" in content:
                for subagent in usage.keys():
                    if subagent in content:
                        usage[subagent] += 1

        return usage

    async def _capture_error_screenshot(self, context_id: str) -> Optional[str]:
        """Capture screenshot on error"""
        try:
            from .tools import capture_screenshot
            result = await capture_screenshot.ainvoke({
                "context_id": context_id,
                "name": f"error_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"
            })
            if result.get("success"):
                return result["path"]
        except:
            pass
        return None

    def _determine_status(
        self,
        login_successful: bool,
        issues: List[IssueDetected]
    ) -> LoginStatus:
        """Determine final login status"""
        if login_successful:
            return LoginStatus.SUCCESS

        for issue in issues:
            if issue.type == "captcha":
                return LoginStatus.CAPTCHA_REQUIRED
            if issue.type == "mfa":
                return LoginStatus.MFA_REQUIRED
            if issue.type == "site_down":
                return LoginStatus.SITE_DOWN
            if issue.type == "invalid_credentials":
                return LoginStatus.INVALID_CREDENTIALS

        return LoginStatus.FAILED

    def _build_reason(
        self,
        login_successful: bool,
        issues: List[IssueDetected],
        payer_name: str
    ) -> str:
        """Build human-readable reason"""
        if login_successful:
            return f"Successfully logged into {payer_name} using DeepAgents with planning and delegation"

        if issues:
            return f"Login failed: {issues[0].description}"

        return "Login failed for unknown reason"


async def create_universal_login_agent(**kwargs) -> UniversalLoginAgent:
    """
    Create and initialize a Universal Login Agent using REAL DeepAgents

    This agent uses ALL DeepAgents capabilities:
    - Planning with write_todos (TodoListMiddleware)
    - File system for context management (FilesystemMiddleware)
    - Subagent spawning for delegation (SubAgentMiddleware)
    - Long-term memory across threads (Store + CompositeBackend)
    - Automatic large result eviction

    Args:
        **kwargs: Arguments to pass to UniversalLoginAgent constructor
            - model_name: LLM model name (default: "gpt-4o")
            - temperature: Temperature for LLM (default: 0.1)
            - max_attempts: Max login attempts (default: 3)
            - provider: "openai" or "anthropic" (default: "openai")
            - enable_long_term_memory: Enable Store backend (default: True)

    Returns:
        Initialized UniversalLoginAgent with full DeepAgents capabilities

    Example:
        agent = await create_universal_login_agent(
            model_name="gpt-4o",
            provider="openai",
            enable_long_term_memory=True
        )
        result = await agent.login(login_request)
    """
    agent = UniversalLoginAgent(**kwargs)
    await agent.initialize()
    return agent
