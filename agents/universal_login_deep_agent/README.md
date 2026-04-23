# Universal Login Deep Agent

A LangGraph Deep Agent that can log into ANY insurance portal without hardcoded navigation.

## Quick Links

- **[Full Documentation](../../docs/agents/universal_login/README.md)** - Complete guide
- **[Quick Start](../../docs/agents/universal_login/QUICKSTART.md)** - Get started in 5 minutes
- **[Examples](example_workflow.py)** - Example workflows
- **[Tests](test_agent.py)** - Unit tests

## Features

✅ **Zero Hardcoding** - Works with portals never seen before
✅ **Autonomous Exploration** - Discovers page structure dynamically
✅ **Adaptive Planning** - Creates strategies based on layout
✅ **Error Recovery** - Retries with different approaches
✅ **HITL Integration** - Escalates to humans when needed
✅ **Multi-Portal** - Handles concurrent logins

## Quick Start

```bash
# Install
pip install -r ../requirements.txt
playwright install chromium

# Set API key
export OPENAI_API_KEY="your-key"

# Run
python -m agents.universal_login_deep_agent.cli login \
    --payer "Portal Name" \
    --url "https://portal.com/login" \
    --username "user" \
    --password "pass"
```

## Usage

```python
from agents.universal_login_deep_agent import (
    create_universal_login_agent,
    LoginRequest
)

# Create agent
agent = await create_universal_login_agent()

# Login
request = LoginRequest(
    payer_name="Delta Dental",
    portal_url="https://deltadentalins.com/",
    username="user",
    password="pass"
)

result = await agent.login(request)
print(f"Success: {result.success}")
```

## Module Structure

```
universal_login_deep_agent/
├── __init__.py              # Exports
├── agent.py                 # Main Deep Agent
├── state.py                 # State management
├── schema.py                # Data models
├── tools.py                 # LangChain tools
├── playwright_actions.py    # Browser automation
├── prompts.py               # Agent prompts
├── hitl_integration.py      # Human-in-the-loop
├── config.py                # Configuration
├── cli.py                   # Command-line interface
├── example_workflow.py      # Examples
└── test_agent.py            # Tests
```

## Documentation

See [Full Documentation](../../docs/agents/universal_login/README.md) for:
- Complete API reference
- Advanced usage patterns
- Architecture details
- Troubleshooting guide

## License

[Your License]
