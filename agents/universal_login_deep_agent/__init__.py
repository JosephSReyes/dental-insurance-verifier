"""
Universal Insurance Portal Login Deep Agent

This module implements a LangGraph Deep Agent capable of logging into
any insurance provider portal without hardcoded navigation logic.
"""

from .agent import create_universal_login_agent
from .schema import LoginRequest, LoginResult, LoginStatus

__all__ = [
    "create_universal_login_agent",
    "LoginRequest",
    "LoginResult",
    "LoginStatus",
]
