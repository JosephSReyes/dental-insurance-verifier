"""
Schema definitions for Universal Login Deep Agent
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class LoginStatus(str, Enum):
    """Status of login attempt"""
    SUCCESS = "success"
    FAILED = "failed"
    CAPTCHA_REQUIRED = "captcha_required"
    MFA_REQUIRED = "mfa_required"
    SITE_DOWN = "site_down"
    INVALID_CREDENTIALS = "invalid_credentials"
    UNKNOWN_LAYOUT = "unknown_layout"
    HUMAN_REQUIRED = "human_required"


class LoginRequest(BaseModel):
    """Request to login to an insurance portal"""
    payer_name: str = Field(description="Name of the insurance payer")
    portal_url: str = Field(description="URL of the insurance portal")
    username: str = Field(description="Username/User ID for login")
    password: str = Field(description="Password for login")
    office_id: Optional[str] = Field(default=None, description="Office ID if required")
    additional_fields: Optional[Dict[str, str]] = Field(
        default=None,
        description="Any additional fields required for login"
    )


class IssueDetected(BaseModel):
    """Issue encountered during login"""
    type: str = Field(description="Type of issue (e.g., 'captcha', 'mfa', 'error_message')")
    description: str = Field(description="Description of the issue")
    screenshot_path: Optional[str] = Field(default=None, description="Path to screenshot")
    element_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Information about the problematic element"
    )


class LoginStep(BaseModel):
    """A single step in the login process"""
    step_number: int = Field(description="Sequential step number")
    action: str = Field(description="Action taken (e.g., 'fill_field', 'click_button')")
    description: str = Field(description="Human-readable description")
    success: bool = Field(description="Whether the step succeeded")
    error: Optional[str] = Field(default=None, description="Error message if failed")


class PortalStructure(BaseModel):
    """Information about portal structure discovered"""
    login_type: str = Field(description="Type of login (e.g., 'single_page', 'multi_step', 'sso')")
    form_fields: List[str] = Field(description="List of form fields identified")
    buttons: List[str] = Field(description="List of buttons identified")
    has_captcha: bool = Field(description="Whether CAPTCHA was detected")
    has_mfa: bool = Field(description="Whether MFA was detected")
    notes: Optional[str] = Field(default=None, description="Additional observations")


class LoginResult(BaseModel):
    """Result of a login attempt"""
    success: bool = Field(description="Whether login was successful")
    status: LoginStatus = Field(description="Status of the login attempt")
    reason: str = Field(description="Explanation of the result")
    steps: List[LoginStep] = Field(description="Steps taken during login")
    portal_structure: Optional[PortalStructure] = Field(
        default=None,
        description="Information about portal structure"
    )
    issues: List[IssueDetected] = Field(
        default_factory=list,
        description="Issues encountered"
    )
    final_url: Optional[str] = Field(default=None, description="Final URL after login attempt")
    screenshots: List[str] = Field(
        default_factory=list,
        description="Paths to screenshots taken"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional metadata"
    )
