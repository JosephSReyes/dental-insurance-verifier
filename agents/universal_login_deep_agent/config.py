"""
Configuration for Universal Login Deep Agent
"""

import os
from typing import Optional
from pathlib import Path


class AgentConfig:
    """Configuration for the Universal Login Agent"""

    # LLM Configuration
    DEFAULT_MODEL = "gpt-4o"
    ANTHROPIC_MODEL = "claude-3-5-sonnet-20241022"
    DEFAULT_TEMPERATURE = 0.1
    DEFAULT_MAX_ATTEMPTS = 3

    # Browser Configuration
    HEADLESS = os.getenv("BROWSER_HEADLESS", "false").lower() == "true"
    BROWSER_TIMEOUT = int(os.getenv("BROWSER_TIMEOUT", "30000"))  # 30 seconds
    VIEWPORT_WIDTH = 1920
    VIEWPORT_HEIGHT = 1080

    # Screenshot Configuration
    SCREENSHOT_DIR = Path(os.getenv("SCREENSHOT_DIR", "screenshots"))
    SCREENSHOT_ON_ERROR = True
    SCREENSHOT_ON_SUCCESS = True

    # HITL Configuration
    HITL_QUEUE_DIR = Path(os.getenv("HITL_QUEUE_DIR", "hitl_queue"))
    HITL_AUTO_SUBMIT = True  # Automatically submit HITL requests

    # Retry Configuration
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
    RETRY_DELAY = int(os.getenv("RETRY_DELAY", "2"))  # seconds

    # Logging Configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # API Keys (loaded from environment)
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

    @classmethod
    def get_model_name(cls, provider: Optional[str] = None) -> str:
        """
        Get model name based on provider

        Args:
            provider: "openai" or "anthropic" (auto-detects if None)

        Returns:
            Model name to use
        """
        if provider == "anthropic" or (provider is None and cls.ANTHROPIC_API_KEY):
            return cls.ANTHROPIC_MODEL
        return cls.DEFAULT_MODEL

    @classmethod
    def validate(cls) -> bool:
        """
        Validate configuration

        Returns:
            True if configuration is valid
        """
        # Check for at least one API key
        if not cls.OPENAI_API_KEY and not cls.ANTHROPIC_API_KEY:
            raise ValueError(
                "No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable"
            )

        # Create directories
        cls.SCREENSHOT_DIR.mkdir(exist_ok=True)
        cls.HITL_QUEUE_DIR.mkdir(exist_ok=True)

        return True
