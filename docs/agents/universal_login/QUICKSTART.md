# Universal Login Deep Agent - Quick Start Guide

## 5-Minute Quick Start

### 1. Install Dependencies

```bash
# Navigate to project root
cd /path/to/agent-chat-demo

# Install Python dependencies
pip install -r agents/requirements.txt

# Install Playwright browsers
playwright install chromium
```

### 2. Set API Key

```bash
# For OpenAI (GPT-4)
export OPENAI_API_KEY="sk-..."

# OR for Anthropic (Claude)
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Run Your First Login

```python
# save as test_login.py
import asyncio
from agents.universal_login_deep_agent import (
    create_universal_login_agent,
    LoginRequest
)

async def main():
    # Create agent
    agent = await create_universal_login_agent()

    # Create login request
    request = LoginRequest(
        payer_name="Test Portal",
        portal_url="https://your-portal.com/login",
        username="your_username",
        password="your_password"
    )

    # Execute
    result = await agent.login(request)

    # Check result
    print(f"Success: {result.success}")
    print(f"Status: {result.status}")
    print(f"Reason: {result.reason}")

asyncio.run(main())
```

```bash
python test_login.py
```

## CLI Usage

### Basic Login

```bash
python -m agents.universal_login_deep_agent.cli login \
    --payer "Delta Dental" \
    --url "https://www.deltadentalins.com/" \
    --username "demo_user" \
    --password "demo_password"
```

### With Office ID

```bash
python -m agents.universal_login_deep_agent.cli login \
    --payer "BCBS" \
    --url "https://www.bcbs.com/" \
    --username "user123" \
    --password "pass123" \
    --office-id "OFFICE001"
```

### Verbose Output

```bash
python -m agents.universal_login_deep_agent.cli login \
    --payer "Cigna" \
    --url "https://www.cigna.com/" \
    --username "user" \
    --password "pass" \
    --verbose
```

### Save Result to File

```bash
python -m agents.universal_login_deep_agent.cli login \
    --payer "Aetna" \
    --url "https://www.aetna.com/" \
    --username "user" \
    --password "pass" \
    --output result.json
```

## Common Scenarios

### Scenario 1: Portal with CAPTCHA

```python
result = await agent.login(request)

if result.status == LoginStatus.CAPTCHA_REQUIRED:
    print("CAPTCHA detected!")
    print(f"Screenshot: {result.screenshots[-1]}")
    # Handle CAPTCHA through HITL
```

### Scenario 2: Multi-Step Login

The agent automatically detects and handles multi-step logins:

```python
# No special code needed!
result = await agent.login(request)
```

### Scenario 3: Unknown Portal

```python
# Works with portals never seen before
request = LoginRequest(
    payer_name="NewPortal",
    portal_url="https://new-portal.com/login",
    username="user",
    password="pass"
)

result = await agent.login(request)

# Check what it discovered
print(f"Portal Type: {result.portal_structure.login_type}")
print(f"Fields Found: {result.portal_structure.form_fields}")
```

## Understanding Results

### Success

```python
if result.success:
    print(f"✓ Logged in successfully")
    print(f"Final URL: {result.final_url}")
    print(f"Steps: {len(result.steps)}")
```

### Failure

```python
if not result.success:
    print(f"✗ Login failed: {result.reason}")
    print(f"Status: {result.status}")

    # View steps to debug
    for step in result.steps:
        print(f"  - {step.description}: {'✓' if step.success else '✗'}")

    # View screenshot
    from PIL import Image
    if result.screenshots:
        img = Image.open(result.screenshots[-1])
        img.show()
```

## Next Steps

1. **Read Full Documentation**: [README.md](README.md)
2. **Try Examples**: Run `python -m agents.universal_login_deep_agent.example_workflow`
3. **Run Tests**: `pytest agents/universal_login_deep_agent/test_agent.py`
4. **Integrate HITL**: See documentation on HITL integration

## Troubleshooting

**Problem: "No API key found"**
```bash
# Solution: Set environment variable
export OPENAI_API_KEY="your-key"
```

**Problem: "Playwright not installed"**
```bash
# Solution: Install Playwright browsers
playwright install chromium
```

**Problem: "Agent takes too long"**
```python
# Solution: Reduce max attempts
agent = await create_universal_login_agent(max_attempts=1)
```

**Problem: "Want to see what agent sees"**
```bash
# Solution: Use verbose mode
python -m agents.universal_login_deep_agent.cli login ... --verbose

# Screenshots are saved automatically
ls screenshots/
```

## Getting Help

- **Full Documentation**: [README.md](README.md)
- **Examples**: `agents/universal_login_deep_agent/example_workflow.py`
- **Tests**: `agents/universal_login_deep_agent/test_agent.py`
