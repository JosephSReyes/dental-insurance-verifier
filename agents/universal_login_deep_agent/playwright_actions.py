"""
Playwright browser automation actions for Universal Login Deep Agent
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


class BrowserManager:
    """Manages Playwright browser instances"""

    def __init__(self):
        self.playwright = None
        self.browser: Optional[Browser] = None
        self.contexts: Dict[str, BrowserContext] = {}
        self.pages: Dict[str, Page] = {}

    async def initialize(self):
        """Initialize Playwright browser"""
        if not self.playwright:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=False,  # Set to True in production
                args=['--disable-blink-features=AutomationControlled']
            )
            logger.info("Browser initialized")

    async def create_context(self, context_id: str) -> BrowserContext:
        """Create a new browser context"""
        if not self.browser:
            await self.initialize()

        context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        )
        self.contexts[context_id] = context

        # Create a new page
        page = await context.new_page()
        self.pages[context_id] = page

        logger.info(f"Created browser context: {context_id}")
        return context

    async def get_page(self, context_id: str) -> Optional[Page]:
        """Get page for a context"""
        return self.pages.get(context_id)

    async def close_context(self, context_id: str):
        """Close a browser context"""
        if context_id in self.contexts:
            await self.contexts[context_id].close()
            del self.contexts[context_id]
            if context_id in self.pages:
                del self.pages[context_id]
            logger.info(f"Closed browser context: {context_id}")

    async def cleanup(self):
        """Cleanup all browser resources"""
        for context_id in list(self.contexts.keys()):
            await self.close_context(context_id)

        if self.browser:
            await self.browser.close()
            self.browser = None

        if self.playwright:
            await self.playwright.stop()
            self.playwright = None


class PlaywrightActions:
    """High-level Playwright actions for browser automation"""

    def __init__(self, browser_manager: BrowserManager):
        self.browser_manager = browser_manager
        self.screenshot_dir = Path("screenshots")
        self.screenshot_dir.mkdir(exist_ok=True)

    async def open_page(self, context_id: str, url: str) -> Dict[str, Any]:
        """
        Open a page in the browser

        Args:
            context_id: Browser context identifier
            url: URL to open

        Returns:
            Dict with success status and current URL
        """
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found for context"}

            await page.goto(url, wait_until='networkidle', timeout=30000)
            logger.info(f"Opened page: {url}")

            return {
                "success": True,
                "current_url": page.url,
                "title": await page.title()
            }
        except Exception as e:
            logger.error(f"Error opening page {url}: {e}")
            return {"success": False, "error": str(e)}

    async def read_dom(self, context_id: str) -> Dict[str, Any]:
        """
        Read the current DOM/HTML

        Returns:
            Dict with HTML content and parsed structure
        """
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            html = await page.content()
            soup = BeautifulSoup(html, 'lxml')

            # Extract useful information
            forms = []
            for form in soup.find_all('form'):
                form_info = {
                    'action': form.get('action', ''),
                    'method': form.get('method', 'GET'),
                    'inputs': []
                }
                for input_field in form.find_all(['input', 'select', 'textarea']):
                    form_info['inputs'].append({
                        'type': input_field.get('type', 'text'),
                        'name': input_field.get('name', ''),
                        'id': input_field.get('id', ''),
                        'placeholder': input_field.get('placeholder', ''),
                        'label': self._get_label_for_input(soup, input_field)
                    })
                forms.append(form_info)

            buttons = []
            for button in soup.find_all(['button', 'input']):
                if button.name == 'input' and button.get('type') not in ['submit', 'button']:
                    continue
                buttons.append({
                    'text': button.get_text(strip=True) or button.get('value', ''),
                    'type': button.get('type', ''),
                    'id': button.get('id', ''),
                    'class': button.get('class', [])
                })

            return {
                "success": True,
                "html": html,
                "title": soup.title.string if soup.title else "",
                "forms": forms,
                "buttons": buttons,
                "has_captcha": self._detect_captcha(soup),
                "error_messages": self._extract_error_messages(soup)
            }
        except Exception as e:
            logger.error(f"Error reading DOM: {e}")
            return {"success": False, "error": str(e)}

    def _get_label_for_input(self, soup, input_field) -> str:
        """Try to find label for an input field"""
        input_id = input_field.get('id')
        if input_id:
            label = soup.find('label', {'for': input_id})
            if label:
                return label.get_text(strip=True)

        # Try to find parent label
        parent_label = input_field.find_parent('label')
        if parent_label:
            return parent_label.get_text(strip=True)

        return ""

    def _detect_captcha(self, soup) -> bool:
        """Detect if page contains CAPTCHA"""
        captcha_indicators = [
            'g-recaptcha',
            'recaptcha',
            'captcha',
            'hcaptcha',
            'h-captcha'
        ]

        html_str = str(soup).lower()
        return any(indicator in html_str for indicator in captcha_indicators)

    def _extract_error_messages(self, soup) -> List[str]:
        """Extract potential error messages from page"""
        error_messages = []

        # Common error message selectors
        error_selectors = [
            {'class': 'error'},
            {'class': 'alert-danger'},
            {'class': 'error-message'},
            {'role': 'alert'},
        ]

        for selector in error_selectors:
            elements = soup.find_all(attrs=selector)
            for elem in elements:
                text = elem.get_text(strip=True)
                if text and len(text) > 5:  # Ignore very short texts
                    error_messages.append(text)

        return error_messages

    async def find_element_semantic(
        self,
        context_id: str,
        description: str
    ) -> Dict[str, Any]:
        """
        Find element using semantic description
        This would use LLM to interpret the description and find matching element

        Args:
            context_id: Browser context
            description: Semantic description like "username input field"

        Returns:
            Dict with selector or error
        """
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            dom_info = await self.read_dom(context_id)
            if not dom_info["success"]:
                return dom_info

            # For now, use heuristics. In full implementation, use LLM
            selector = self._heuristic_element_finder(description, dom_info)

            if selector:
                return {"success": True, "selector": selector}
            else:
                return {"success": False, "error": f"Could not find element: {description}"}

        except Exception as e:
            logger.error(f"Error finding element '{description}': {e}")
            return {"success": False, "error": str(e)}

    def _heuristic_element_finder(self, description: str, dom_info: Dict) -> Optional[str]:
        """
        Heuristic-based element finder
        TODO: Replace with LLM-based semantic matching
        """
        desc_lower = description.lower()

        # Check forms for matching inputs
        for form in dom_info.get("forms", []):
            for input_field in form.get("inputs", []):
                # Check by name, id, placeholder, or label
                if any([
                    desc_lower in input_field.get("name", "").lower(),
                    desc_lower in input_field.get("id", "").lower(),
                    desc_lower in input_field.get("placeholder", "").lower(),
                    desc_lower in input_field.get("label", "").lower()
                ]):
                    if input_field.get("id"):
                        return f"#{input_field['id']}"
                    elif input_field.get("name"):
                        return f"[name='{input_field['name']}']"

        # Check buttons
        for button in dom_info.get("buttons", []):
            if desc_lower in button.get("text", "").lower():
                if button.get("id"):
                    return f"#{button['id']}"

        return None

    async def fill_field(
        self,
        context_id: str,
        selector: str,
        value: str
    ) -> Dict[str, Any]:
        """Fill an input field"""
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            await page.fill(selector, value)
            logger.info(f"Filled field {selector}")

            return {"success": True}
        except Exception as e:
            logger.error(f"Error filling field {selector}: {e}")
            return {"success": False, "error": str(e)}

    async def click_element(
        self,
        context_id: str,
        selector: str
    ) -> Dict[str, Any]:
        """Click an element"""
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            await page.click(selector)
            await page.wait_for_load_state('networkidle', timeout=10000)
            logger.info(f"Clicked element {selector}")

            return {"success": True, "current_url": page.url}
        except Exception as e:
            logger.error(f"Error clicking {selector}: {e}")
            return {"success": False, "error": str(e)}

    async def wait_for_element(
        self,
        context_id: str,
        selector: str,
        timeout: int = 5000
    ) -> Dict[str, Any]:
        """Wait for element to appear"""
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            await page.wait_for_selector(selector, timeout=timeout)
            logger.info(f"Element appeared: {selector}")

            return {"success": True}
        except Exception as e:
            logger.error(f"Timeout waiting for {selector}: {e}")
            return {"success": False, "error": str(e)}

    async def get_screenshot(
        self,
        context_id: str,
        name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Take a screenshot"""
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            if not name:
                from datetime import datetime
                name = f"screenshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.png"

            screenshot_path = self.screenshot_dir / name
            await page.screenshot(path=str(screenshot_path), full_page=True)
            logger.info(f"Screenshot saved: {screenshot_path}")

            return {"success": True, "path": str(screenshot_path)}
        except Exception as e:
            logger.error(f"Error taking screenshot: {e}")
            return {"success": False, "error": str(e)}

    async def evaluate_js(
        self,
        context_id: str,
        script: str
    ) -> Dict[str, Any]:
        """Execute JavaScript on the page"""
        try:
            page = await self.browser_manager.get_page(context_id)
            if not page:
                return {"success": False, "error": "No page found"}

            result = await page.evaluate(script)
            logger.info(f"Executed JavaScript")

            return {"success": True, "result": result}
        except Exception as e:
            logger.error(f"Error executing JavaScript: {e}")
            return {"success": False, "error": str(e)}
