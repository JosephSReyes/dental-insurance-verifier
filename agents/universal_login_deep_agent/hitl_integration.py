"""
Human-in-the-Loop (HITL) Integration for Universal Login Deep Agent

This module provides integration with HITL review systems for cases where
the agent needs human assistance (CAPTCHA, MFA, unknown layouts, etc.)
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from pathlib import Path
import json

from .schema import LoginRequest, IssueDetected, LoginStep

logger = logging.getLogger(__name__)


class HITLReviewRequest:
    """Represents a request for human review"""

    def __init__(
        self,
        request_id: str,
        payer_name: str,
        portal_url: str,
        issue_type: str,
        issue_description: str,
        screenshot_path: Optional[str] = None,
        steps_taken: Optional[List[LoginStep]] = None,
        context: Optional[Dict[str, Any]] = None
    ):
        self.request_id = request_id
        self.payer_name = payer_name
        self.portal_url = portal_url
        self.issue_type = issue_type
        self.issue_description = issue_description
        self.screenshot_path = screenshot_path
        self.steps_taken = steps_taken or []
        self.context = context or {}
        self.created_at = datetime.now()
        self.status = "pending"
        self.resolution = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage/transmission"""
        return {
            "request_id": self.request_id,
            "payer_name": self.payer_name,
            "portal_url": self.portal_url,
            "issue_type": self.issue_type,
            "issue_description": self.issue_description,
            "screenshot_path": self.screenshot_path,
            "steps_taken": [step.dict() if hasattr(step, 'dict') else step for step in self.steps_taken],
            "context": self.context,
            "created_at": self.created_at.isoformat(),
            "status": self.status,
            "resolution": self.resolution
        }


class HITLQueue:
    """
    HITL Queue for managing human review requests

    In production, this should integrate with your actual HITL system
    (e.g., database, message queue, review dashboard)
    """

    def __init__(self, storage_dir: Optional[Path] = None):
        """
        Initialize HITL queue

        Args:
            storage_dir: Directory to store HITL requests (for file-based queue)
        """
        self.storage_dir = storage_dir or Path("hitl_queue")
        self.storage_dir.mkdir(exist_ok=True)

    async def submit_review_request(
        self,
        login_request: LoginRequest,
        issue: IssueDetected,
        steps_taken: List[LoginStep],
        screenshot_path: Optional[str] = None,
        additional_context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Submit a request for human review

        Args:
            login_request: Original login request
            issue: Issue that requires human intervention
            steps_taken: Steps taken before requiring human help
            screenshot_path: Path to screenshot showing the issue
            additional_context: Any additional context

        Returns:
            Request ID for tracking
        """
        import uuid

        request_id = f"hitl_{uuid.uuid4().hex[:12]}"

        review_request = HITLReviewRequest(
            request_id=request_id,
            payer_name=login_request.payer_name,
            portal_url=login_request.portal_url,
            issue_type=issue.type,
            issue_description=issue.description,
            screenshot_path=screenshot_path,
            steps_taken=steps_taken,
            context=additional_context or {}
        )

        # Store the request
        await self._store_request(review_request)

        logger.info(f"HITL review request submitted: {request_id}")
        logger.info(f"  Payer: {login_request.payer_name}")
        logger.info(f"  Issue: {issue.type} - {issue.description}")

        return request_id

    async def _store_request(self, review_request: HITLReviewRequest):
        """Store review request (file-based implementation)"""
        file_path = self.storage_dir / f"{review_request.request_id}.json"

        with open(file_path, 'w') as f:
            json.dump(review_request.to_dict(), f, indent=2)

        logger.debug(f"Stored HITL request: {file_path}")

    async def get_request(self, request_id: str) -> Optional[HITLReviewRequest]:
        """Retrieve a review request by ID"""
        file_path = self.storage_dir / f"{request_id}.json"

        if not file_path.exists():
            return None

        with open(file_path, 'r') as f:
            data = json.load(f)

        # Reconstruct the request (simplified)
        return data

    async def get_pending_requests(self) -> List[Dict[str, Any]]:
        """Get all pending review requests"""
        pending = []

        for file_path in self.storage_dir.glob("hitl_*.json"):
            with open(file_path, 'r') as f:
                data = json.load(f)
                if data.get("status") == "pending":
                    pending.append(data)

        return pending

    async def resolve_request(
        self,
        request_id: str,
        resolution: Dict[str, Any]
    ):
        """
        Mark a request as resolved with resolution details

        Args:
            request_id: ID of the request to resolve
            resolution: Resolution details (e.g., human-provided credentials, manual steps)
        """
        file_path = self.storage_dir / f"{request_id}.json"

        if not file_path.exists():
            logger.warning(f"Request not found: {request_id}")
            return

        with open(file_path, 'r') as f:
            data = json.load(f)

        data["status"] = "resolved"
        data["resolution"] = resolution
        data["resolved_at"] = datetime.now().isoformat()

        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"HITL request resolved: {request_id}")


class HITLIntegration:
    """
    HITL Integration for the Universal Login Agent

    Provides methods to:
    1. Detect when HITL is needed
    2. Submit HITL requests
    3. Wait for/retrieve HITL resolutions
    4. Resume agent execution after HITL
    """

    def __init__(self, queue: Optional[HITLQueue] = None):
        """
        Initialize HITL integration

        Args:
            queue: HITL queue to use (creates default if not provided)
        """
        self.queue = queue or HITLQueue()

    async def check_hitl_needed(
        self,
        issues: List[IssueDetected],
        attempt_number: int,
        max_attempts: int
    ) -> tuple[bool, Optional[str]]:
        """
        Check if HITL is needed based on current state

        Args:
            issues: List of issues detected
            attempt_number: Current attempt number
            max_attempts: Maximum attempts allowed

        Returns:
            Tuple of (is_hitl_needed, reason)
        """
        # CAPTCHA always requires HITL
        for issue in issues:
            if issue.type == "captcha":
                return True, "CAPTCHA detected - requires human solving"

        # MFA requires HITL
        for issue in issues:
            if issue.type == "mfa":
                return True, "Multi-factor authentication required"

        # Site down
        for issue in issues:
            if issue.type == "site_down":
                return True, "Portal appears to be down or unavailable"

        # Max attempts reached
        if attempt_number >= max_attempts:
            return True, f"Maximum attempts ({max_attempts}) reached without success"

        return False, None

    async def submit_for_review(
        self,
        login_request: LoginRequest,
        issues: List[IssueDetected],
        steps_taken: List[LoginStep],
        screenshot_path: Optional[str] = None,
        portal_structure: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Submit login attempt for human review

        Args:
            login_request: Original login request
            issues: Issues encountered
            steps_taken: Steps taken by agent
            screenshot_path: Screenshot of current state
            portal_structure: Discovered portal structure

        Returns:
            HITL request ID
        """
        # Get primary issue
        primary_issue = issues[0] if issues else IssueDetected(
            type="unknown",
            description="Unknown issue requiring human review"
        )

        # Add context
        context = {
            "all_issues": [issue.dict() if hasattr(issue, 'dict') else issue for issue in issues],
            "portal_structure": portal_structure,
            "total_steps": len(steps_taken)
        }

        # Submit to queue
        request_id = await self.queue.submit_review_request(
            login_request=login_request,
            issue=primary_issue,
            steps_taken=steps_taken,
            screenshot_path=screenshot_path,
            additional_context=context
        )

        return request_id

    async def get_resolution(self, request_id: str) -> Optional[Dict[str, Any]]:
        """
        Get resolution for a HITL request if available

        Args:
            request_id: HITL request ID

        Returns:
            Resolution details if resolved, None otherwise
        """
        request = await self.queue.get_request(request_id)

        if not request:
            return None

        if request.get("status") == "resolved":
            return request.get("resolution")

        return None

    def generate_review_ui_data(
        self,
        login_request: LoginRequest,
        issues: List[IssueDetected],
        steps_taken: List[LoginStep],
        screenshot_path: Optional[str] = None,
        portal_structure: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate data for displaying in a review UI

        Args:
            login_request: Original login request
            issues: Issues encountered
            steps_taken: Steps taken
            screenshot_path: Screenshot path
            portal_structure: Portal structure

        Returns:
            Dict formatted for UI display
        """
        return {
            "portal_name": login_request.payer_name,
            "portal_url": login_request.portal_url,
            "attempted_username": login_request.username,
            "issues": [
                {
                    "type": issue.type,
                    "description": issue.description,
                    "severity": self._determine_severity(issue.type)
                }
                for issue in issues
            ],
            "steps_attempted": [
                {
                    "number": step.step_number,
                    "action": step.action,
                    "description": step.description,
                    "success": step.success,
                    "error": step.error
                }
                for step in steps_taken
            ],
            "screenshot": screenshot_path,
            "portal_info": portal_structure,
            "suggested_actions": self._suggest_human_actions(issues),
            "timestamp": datetime.now().isoformat()
        }

    def _determine_severity(self, issue_type: str) -> str:
        """Determine severity level for an issue type"""
        severity_map = {
            "captcha": "high",
            "mfa": "high",
            "site_down": "critical",
            "invalid_credentials": "medium",
            "unknown_layout": "medium",
            "error_message": "low"
        }
        return severity_map.get(issue_type, "medium")

    def _suggest_human_actions(self, issues: List[IssueDetected]) -> List[str]:
        """Suggest actions for human reviewer"""
        suggestions = []

        for issue in issues:
            if issue.type == "captcha":
                suggestions.append("Solve CAPTCHA and provide solution")
            elif issue.type == "mfa":
                suggestions.append("Complete MFA verification")
            elif issue.type == "site_down":
                suggestions.append("Verify if site is accessible; retry later if down")
            elif issue.type == "invalid_credentials":
                suggestions.append("Verify credentials are correct")
            elif issue.type == "unknown_layout":
                suggestions.append("Manually identify login form elements and provide selectors")

        if not suggestions:
            suggestions.append("Review screenshot and provide guidance")

        return suggestions


# Global HITL integration instance
_hitl_integration: Optional[HITLIntegration] = None


def get_hitl_integration() -> HITLIntegration:
    """Get global HITL integration instance"""
    global _hitl_integration

    if _hitl_integration is None:
        _hitl_integration = HITLIntegration()

    return _hitl_integration
