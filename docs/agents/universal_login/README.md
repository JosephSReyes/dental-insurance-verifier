# Universal Insurance Portal Login Deep Agent

## Overview

The Universal Login Deep Agent is a LangGraph-based AI agent capable of logging into **any** insurance provider portal without relying on hardcoded navigation paths or selectors. It uses deep learning, autonomous exploration, and adaptive planning to handle unknown portal layouts, multi-step logins, and various obstacles.

## Key Features

### 🧠 Autonomous Exploration
- Analyzes any insurance portal's structure in real-time
- Identifies login forms, fields, and buttons using semantic understanding
- Adapts to different naming conventions and layout patterns

### 🔄 Adaptive Planning
- Creates step-by-step plans based on discovered page structure
- Adjusts strategy when initial attempts fail
- Handles multi-step logins and complex workflows

### 🛡️ Robust Error Handling
- Detects and responds to CAPTCHA challenges
- Identifies MFA requirements
- Recognizes site downtime and invalid credentials
- Automatic retry with different strategies

### 👥 Human-in-the-Loop (HITL)
- Flags cases requiring human intervention
- Provides rich context and screenshots for review
- Integrates with review queues and dashboards

### 🎯 Zero Hardcoding
- No portal-specific code required
- Works with portals never seen before
- Learns from page structure dynamically

## Architecture

### Components

```
agents/universal_login_deep_agent/
├── __init__.py              # Module exports
├── agent.py                 # Core Deep Agent implementation
├── state.py                 # State management
├── schema.py                # Data schemas (LoginRequest, LoginResult, etc.)
├── tools.py                 # LangChain tools for browser automation
├── playwright_actions.py    # Browser automation layer
├── prompts.py               # Agent prompts and instructions
├── hitl_integration.py      # Human-in-the-Loop integration
├── example_workflow.py      # Usage examples
└── test_agent.py            # Unit tests
```

### State Machine Flow

```
┌─────────────┐
│ Initialize  │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────┐
│   Explore   │────►│   HITL   │
│    Page     │     │(CAPTCHA) │
└──────┬──────┘     └──────────┘
       │
       ▼
┌─────────────┐
│    Plan     │
│   Login     │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌──────────┐
│   Execute   │────►│   HITL   │
│   Login     │     │  (MFA)   │
└──────┬──────┘     └──────────┘
       │
       ▼
┌─────────────┐
│   Verify    │
│   Success   │
└──────┬──────┘
       │
   ┌───┴────┐
   │        │
Success   Retry
   │        │
   ▼        ▼
┌─────┐ ┌────────┐
│ End │ │ Error  │
└─────┘ │Handler │
        └────┬───┘
             │
          Retry or
          Give Up
```

## Installation

### 1. Install Dependencies

```bash
# Install Python dependencies
pip install -r agents/requirements.txt

# Install Playwright browsers
playwright install chromium
```

### 2. Set Environment Variables

```bash
# OpenAI API Key (for GPT-4)
export OPENAI_API_KEY="your-openai-api-key"

# Or for Anthropic Claude
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## Quick Start

### Basic Usage

```python
import asyncio
from agents.universal_login_deep_agent import (
    create_universal_login_agent,
    LoginRequest
)

async def main():
    # Create the agent
    agent = await create_universal_login_agent(
        model_name="gpt-4o",  # or "claude-3-5-sonnet-20241022"
        max_attempts=3
    )

    # Create login request
    request = LoginRequest(
        payer_name="Delta Dental",
        portal_url="https://www.deltadentalins.com/",
        username="your_username",
        password="your_password",
        office_id="12345"  # Optional
    )

    # Execute login
    result = await agent.login(request)

    # Check result
    if result.success:
        print(f"✓ Login successful!")
        print(f"  Final URL: {result.final_url}")
    else:
        print(f"✗ Login failed: {result.reason}")
        print(f"  Status: {result.status}")

        # Check if HITL is needed
        if result.status in ["captcha_required", "mfa_required"]:
            print(f"  Human intervention required")

asyncio.run(main())
```

### Handling HITL (Human-in-the-Loop)

```python
from agents.universal_login_deep_agent import (
    create_universal_login_agent,
    LoginRequest,
    LoginStatus
)
from agents.universal_login_deep_agent.hitl_integration import (
    get_hitl_integration
)

async def login_with_hitl():
    agent = await create_universal_login_agent()

    request = LoginRequest(
        payer_name="BCBS",
        portal_url="https://www.bcbs.com/",
        username="demo_user",
        password="demo_password"
    )

    result = await agent.login(request)

    # Check if HITL is needed
    if result.status == LoginStatus.CAPTCHA_REQUIRED:
        print("CAPTCHA detected - submitting for human review")

        # Get HITL integration
        hitl = get_hitl_integration()

        # Submit for review
        request_id = await hitl.submit_for_review(
            login_request=request,
            issues=result.issues,
            steps_taken=result.steps,
            screenshot_path=result.screenshots[-1] if result.screenshots else None,
            portal_structure=result.portal_structure.dict() if result.portal_structure else None
        )

        print(f"HITL request ID: {request_id}")

        # In production, you would:
        # 1. Display this in a review dashboard
        # 2. Wait for human to solve CAPTCHA
        # 3. Get resolution and retry
        # resolution = await hitl.get_resolution(request_id)
```

## API Reference

### LoginRequest

```python
from agents.universal_login_deep_agent import LoginRequest

request = LoginRequest(
    payer_name="Insurance Company Name",
    portal_url="https://portal.example.com/login",
    username="user123",
    password="pass123",
    office_id="OFFICE001",  # Optional
    additional_fields={"practice_id": "P123"}  # Optional
)
```

**Fields:**
- `payer_name` (str): Name of the insurance payer
- `portal_url` (str): URL of the portal login page
- `username` (str): Username/User ID
- `password` (str): Password
- `office_id` (str, optional): Office ID if required
- `additional_fields` (dict, optional): Any additional fields

### LoginResult

```python
class LoginResult:
    success: bool                      # Whether login succeeded
    status: LoginStatus                # Status enum
    reason: str                        # Human-readable reason
    steps: List[LoginStep]             # Steps taken
    portal_structure: PortalStructure  # Portal info discovered
    issues: List[IssueDetected]        # Issues encountered
    final_url: str                     # Final URL
    screenshots: List[str]             # Screenshot paths
    metadata: Dict[str, Any]           # Additional metadata
```

### LoginStatus Enum

```python
class LoginStatus(Enum):
    SUCCESS = "success"
    FAILED = "failed"
    CAPTCHA_REQUIRED = "captcha_required"
    MFA_REQUIRED = "mfa_required"
    SITE_DOWN = "site_down"
    INVALID_CREDENTIALS = "invalid_credentials"
    UNKNOWN_LAYOUT = "unknown_layout"
    HUMAN_REQUIRED = "human_required"
```

## Advanced Usage

### Custom Model Configuration

```python
# Use Anthropic Claude
agent = await create_universal_login_agent(
    model_name="claude-3-5-sonnet-20241022",
    temperature=0.1,
    max_attempts=5
)

# Use OpenAI GPT-4
agent = await create_universal_login_agent(
    model_name="gpt-4o",
    temperature=0.0,  # More deterministic
    max_attempts=3
)
```

### Concurrent Portal Logins

```python
import asyncio

async def login_multiple_portals():
    agent = await create_universal_login_agent()

    requests = [
        LoginRequest(payer_name="Portal 1", portal_url="...", ...),
        LoginRequest(payer_name="Portal 2", portal_url="...", ...),
        LoginRequest(payer_name="Portal 3", portal_url="...", ...),
    ]

    # Execute all concurrently
    tasks = [agent.login(req) for req in requests]
    results = await asyncio.gather(*tasks)

    for req, result in zip(requests, results):
        print(f"{req.payer_name}: {result.status}")
```

### Accessing Portal Structure

```python
result = await agent.login(request)

if result.portal_structure:
    print(f"Login Type: {result.portal_structure.login_type}")
    print(f"Form Fields: {result.portal_structure.form_fields}")
    print(f"Buttons: {result.portal_structure.buttons}")
    print(f"Has CAPTCHA: {result.portal_structure.has_captcha}")
    print(f"Has MFA: {result.portal_structure.has_mfa}")
```

## How It Works

### Phase 1: Exploration

The agent opens the portal and analyzes the page structure:

1. **Load Portal**: Opens the URL using Playwright
2. **Analyze DOM**: Extracts forms, inputs, buttons using BeautifulSoup
3. **Detect Obstacles**: Checks for CAPTCHA, error messages, downtime
4. **Capture Evidence**: Takes screenshots for debugging/HITL

### Phase 2: Planning

The agent creates a step-by-step login plan:

1. **Form Analysis**: Identifies which form is the login form
2. **Field Mapping**: Maps credentials to form fields using semantic understanding
3. **Strategy Selection**: Decides approach (single-page, multi-step, etc.)
4. **Plan Creation**: Generates numbered list of actions

### Phase 3: Execution

The agent executes the plan using a ReAct agent:

1. **Tool Invocation**: Uses browser automation tools
2. **Field Filling**: Fills username, password, and other fields
3. **Form Submission**: Clicks submit button
4. **Navigation Handling**: Waits for page transitions

### Phase 4: Verification

The agent verifies login success:

1. **Success Indicators**: Looks for dashboard elements, "logout" buttons, etc.
2. **Failure Indicators**: Checks if login form still present, error messages
3. **URL Analysis**: Checks if URL changed from login page
4. **Evidence Collection**: Captures final screenshot

### Phase 5: Recovery (if needed)

If login fails, the agent attempts recovery:

1. **Error Analysis**: Uses LLM to analyze what went wrong
2. **Re-planning**: Creates new strategy if retries remain
3. **HITL Escalation**: Flags for human help if stuck
4. **Clean Failure**: Reports detailed failure reason

## Testing

### Run Unit Tests

```bash
# Run all tests
pytest agents/universal_login_deep_agent/test_agent.py -v

# Run specific test
pytest agents/universal_login_deep_agent/test_agent.py::TestLoginRequest -v

# Run with coverage
pytest agents/universal_login_deep_agent/test_agent.py --cov
```

### Run Examples

```bash
# Run example workflow (demonstrates all features)
python -m agents.universal_login_deep_agent.example_workflow
```

## Troubleshooting

### Common Issues

**Issue: "Browser tools not initialized"**
```python
# Solution: Always use create_universal_login_agent()
agent = await create_universal_login_agent()  # ✓ Correct
# Not: agent = UniversalLoginAgent()  # ✗ Wrong
```

**Issue: "Playwright not found"**
```bash
# Solution: Install Playwright browsers
playwright install chromium
```

**Issue: "Login fails repeatedly"**
```python
# Check the result details
print(f"Steps taken: {result.steps}")
print(f"Issues: {result.issues}")
print(f"Screenshots: {result.screenshots}")

# View screenshots to see what the agent saw
from PIL import Image
img = Image.open(result.screenshots[-1])
img.show()
```

## Future Enhancements

- [ ] **Persistent Memory**: Remember successful login patterns per portal
- [ ] **Model Fine-tuning**: Train on portal-specific login data
- [ ] **Auto-detection of Changes**: Detect when portals change structure
- [ ] **Session Persistence**: Maintain login sessions across requests
- [ ] **SSO Support**: Handle Single Sign-On workflows
- [ ] **Enhanced CAPTCHA**: Integrate with CAPTCHA-solving services
- [ ] **MFA Automation**: Support automated MFA where possible

## Contributing

When adding features to the Universal Login Deep Agent:

1. **Maintain Zero Hardcoding**: Never add portal-specific selectors
2. **Update Tests**: Add tests for new functionality
3. **Document Changes**: Update this README
4. **Follow Patterns**: Use existing state/schema patterns
5. **HITL First**: When in doubt, escalate to human

## License

[Your License Here]

## Support

For issues or questions:
- File an issue on GitHub
- Contact: [Your Contact]
- Documentation: [Your Docs]
