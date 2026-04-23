"""
LangChain tools for Universal Login Deep Agent
"""

import logging
from typing import Optional, Dict, Any
from langchain_core.tools import tool

from .playwright_actions import BrowserManager, PlaywrightActions

logger = logging.getLogger(__name__)

# Global browser manager instance
_browser_manager: Optional[BrowserManager] = None
_playwright_actions: Optional[PlaywrightActions] = None


async def initialize_browser_tools():
    """Initialize browser tools"""
    global _browser_manager, _playwright_actions

    if not _browser_manager:
        _browser_manager = BrowserManager()
        await _browser_manager.initialize()
        _playwright_actions = PlaywrightActions(_browser_manager)

    return _browser_manager, _playwright_actions


def get_browser_tools():
    """Get initialized browser tools"""
    if not _browser_manager or not _playwright_actions:
        raise RuntimeError("Browser tools not initialized. Call initialize_browser_tools() first.")
    return _browser_manager, _playwright_actions


@tool
async def open_portal_page(context_id: str, url: str) -> Dict[str, Any]:
    """
    Open an insurance portal page in the browser.

    Args:
        context_id: Browser context identifier
        url: URL of the portal to open

    Returns:
        Dict with success status, current URL, and page title
    """
    _, actions = get_browser_tools()
    return await actions.open_page(context_id, url)


@tool
async def analyze_page_structure(context_id: str) -> Dict[str, Any]:
    """
    Analyze the current page structure to understand forms, buttons, and potential issues.

    Args:
        context_id: Browser context identifier

    Returns:
        Dict containing:
        - forms: List of forms with their fields
        - buttons: List of buttons on the page
        - has_captcha: Whether CAPTCHA is detected
        - error_messages: Any error messages found
    """
    _, actions = get_browser_tools()
    return await actions.read_dom(context_id)


@tool
async def find_login_element(context_id: str, description: str) -> Dict[str, Any]:
    """
    Find a login form element using semantic description.

    Args:
        context_id: Browser context identifier
        description: Semantic description of the element (e.g., "username field", "password input", "login button")

    Returns:
        Dict with success status and CSS selector for the element
    """
    _, actions = get_browser_tools()
    return await actions.find_element_semantic(context_id, description)


@tool
async def fill_login_field(context_id: str, selector: str, value: str) -> Dict[str, Any]:
    """
    Fill a login form field with a value.

    Args:
        context_id: Browser context identifier
        selector: CSS selector for the field
        value: Value to fill in the field

    Returns:
        Dict with success status
    """
    _, actions = get_browser_tools()
    return await actions.fill_field(context_id, selector, value)


@tool
async def click_login_button(context_id: str, selector: str) -> Dict[str, Any]:
    """
    Click the login button or submit button.

    Args:
        context_id: Browser context identifier
        selector: CSS selector for the button

    Returns:
        Dict with success status and new current URL
    """
    _, actions = get_browser_tools()
    return await actions.click_element(context_id, selector)


@tool
async def wait_for_login_element(
    context_id: str,
    selector: str,
    timeout: int = 5000
) -> Dict[str, Any]:
    """
    Wait for a specific element to appear after login attempt.

    Args:
        context_id: Browser context identifier
        selector: CSS selector to wait for
        timeout: Maximum time to wait in milliseconds (default: 5000)

    Returns:
        Dict with success status
    """
    _, actions = get_browser_tools()
    return await actions.wait_for_element(context_id, selector, timeout)


@tool
async def capture_screenshot(context_id: str, name: Optional[str] = None) -> Dict[str, Any]:
    """
    Capture a screenshot of the current page state.

    Args:
        context_id: Browser context identifier
        name: Optional name for the screenshot file

    Returns:
        Dict with success status and path to screenshot
    """
    _, actions = get_browser_tools()
    return await actions.get_screenshot(context_id, name)


@tool
async def execute_page_script(context_id: str, script: str) -> Dict[str, Any]:
    """
    Execute JavaScript on the current page.

    Args:
        context_id: Browser context identifier
        script: JavaScript code to execute

    Returns:
        Dict with success status and script result
    """
    _, actions = get_browser_tools()
    return await actions.evaluate_js(context_id, script)


@tool
def flag_for_human_intervention(
    reason: str,
    screenshot_path: Optional[str] = None,
    additional_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Flag the current state for human intervention.

    Args:
        reason: Reason why human intervention is needed
        screenshot_path: Optional path to screenshot showing the issue
        additional_context: Any additional context information

    Returns:
        Dict indicating HITL flag was raised
    """
    logger.warning(f"HITL flag raised: {reason}")

    return {
        "hitl_required": True,
        "reason": reason,
        "screenshot": screenshot_path,
        "context": additional_context or {}
    }


@tool
async def detect_login_success(context_id: str) -> Dict[str, Any]:
    """
    Detect if login was successful by analyzing the current page.

    Args:
        context_id: Browser context identifier

    Returns:
        Dict with:
        - success: Whether login appears successful
        - indicators: List of indicators found
        - current_url: Current page URL
    """
    _, actions = get_browser_tools()

    # Get current page info
    page = await _browser_manager.get_page(context_id)
    if not page:
        return {"success": False, "error": "No page found"}

    current_url = page.url
    dom_info = await actions.read_dom(context_id)

    if not dom_info["success"]:
        return dom_info

    # Look for success indicators
    success_indicators = []
    failure_indicators = []

    # Check for common dashboard/success indicators
    dashboard_keywords = [
        "dashboard", "welcome", "home", "account", "portal",
        "logout", "sign out", "my account"
    ]

    html_lower = dom_info.get("html", "").lower()
    for keyword in dashboard_keywords:
        if keyword in html_lower:
            success_indicators.append(f"Found '{keyword}' in page")

    # Check for login form still present (indicates failure)
    forms = dom_info.get("forms", [])
    for form in forms:
        has_password = any(
            inp.get("type") == "password"
            for inp in form.get("inputs", [])
        )
        if has_password:
            failure_indicators.append("Login form still present")

    # Check for error messages
    error_messages = dom_info.get("error_messages", [])
    if error_messages:
        failure_indicators.extend(error_messages)

    # Check URL changed from login page
    if "login" not in current_url.lower() and "signin" not in current_url.lower():
        success_indicators.append("URL changed from login page")

    # Determine overall success
    likely_success = len(success_indicators) > 0 and len(failure_indicators) == 0

    return {
        "success": True,  # Tool execution success
        "login_successful": likely_success,
        "success_indicators": success_indicators,
        "failure_indicators": failure_indicators,
        "current_url": current_url,
        "has_captcha": dom_info.get("has_captcha", False)
    }


def get_all_tools():
    """Get all tools for the Universal Login Deep Agent"""
    return [
        open_portal_page,
        analyze_page_structure,
        find_login_element,
        fill_login_field,
        click_login_button,
        wait_for_login_element,
        capture_screenshot,
        execute_page_script,
        flag_for_human_intervention,
        detect_login_success,
    ]
