#!/usr/bin/env python3
"""
Command-line interface for Universal Login Deep Agent

Usage:
    python -m agents.universal_login_deep_agent.cli login \
        --payer "Delta Dental" \
        --url "https://www.deltadentalins.com/" \
        --username "demo_user" \
        --password "demo_password"
"""

import asyncio
import argparse
import logging
import json
from pathlib import Path

from .agent import create_universal_login_agent
from .schema import LoginRequest, LoginStatus
from .config import AgentConfig
from .hitl_integration import get_hitl_integration


def setup_logging(verbose: bool = False):
    """Setup logging configuration"""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format=AgentConfig.LOG_FORMAT
    )


async def login_command(args):
    """Execute login command"""
    print(f"🤖 Universal Login Deep Agent")
    print(f"{'=' * 80}")

    # Create agent
    print(f"Initializing agent with {args.model}...")
    agent = await create_universal_login_agent(
        model_name=args.model,
        max_attempts=args.max_attempts
    )

    # Create request
    request = LoginRequest(
        payer_name=args.payer,
        portal_url=args.url,
        username=args.username,
        password=args.password,
        office_id=args.office_id
    )

    print(f"\n📋 Login Details:")
    print(f"  Payer: {request.payer_name}")
    print(f"  URL: {request.portal_url}")
    print(f"  Username: {request.username}")
    print(f"  Office ID: {request.office_id or 'N/A'}")
    print(f"\n🚀 Starting login process...\n")

    # Execute login
    result = await agent.login(request)

    # Display result
    print(f"\n{'=' * 80}")
    print(f"📊 Login Result")
    print(f"{'=' * 80}")

    status_emoji = "✓" if result.success else "✗"
    print(f"{status_emoji} Status: {result.status.value}")
    print(f"  Reason: {result.reason}")
    print(f"  Steps Taken: {len(result.steps)}")
    print(f"  Issues: {len(result.issues)}")

    if result.final_url:
        print(f"  Final URL: {result.final_url}")

    # Show steps
    if args.verbose:
        print(f"\n📝 Steps Taken:")
        for step in result.steps:
            icon = "✓" if step.success else "✗"
            print(f"  {icon} Step {step.step_number}: {step.description}")
            if step.error:
                print(f"      Error: {step.error}")

    # Show issues
    if result.issues:
        print(f"\n⚠️  Issues Encountered:")
        for issue in result.issues:
            print(f"  - [{issue.type}] {issue.description}")

    # Screenshots
    if result.screenshots:
        print(f"\n📸 Screenshots:")
        for screenshot in result.screenshots:
            print(f"  - {screenshot}")

    # Portal structure
    if args.verbose and result.portal_structure:
        print(f"\n🏗️  Portal Structure:")
        print(f"  Login Type: {result.portal_structure.login_type}")
        print(f"  Form Fields: {', '.join(result.portal_structure.form_fields)}")
        print(f"  Buttons: {', '.join(result.portal_structure.buttons)}")
        print(f"  Has CAPTCHA: {result.portal_structure.has_captcha}")
        print(f"  Has MFA: {result.portal_structure.has_mfa}")

    # HITL
    if result.status in [LoginStatus.CAPTCHA_REQUIRED, LoginStatus.MFA_REQUIRED, LoginStatus.HUMAN_REQUIRED]:
        print(f"\n👥 Human Intervention Required")
        print(f"  Submitting for review...")

        hitl = get_hitl_integration()
        request_id = await hitl.submit_for_review(
            login_request=request,
            issues=result.issues,
            steps_taken=result.steps,
            screenshot_path=result.screenshots[-1] if result.screenshots else None,
            portal_structure=result.portal_structure.dict() if result.portal_structure else None
        )

        print(f"  ✓ HITL Request ID: {request_id}")
        print(f"  Check the HITL queue for review")

    # Save result to file if requested
    if args.output:
        output_path = Path(args.output)
        with open(output_path, 'w') as f:
            json.dump(result.dict(), f, indent=2, default=str)
        print(f"\n💾 Result saved to: {output_path}")

    print(f"\n{'=' * 80}\n")

    return 0 if result.success else 1


async def list_hitl_command(args):
    """List HITL requests"""
    hitl = get_hitl_integration()
    pending = await hitl.queue.get_pending_requests()

    print(f"👥 Pending HITL Requests: {len(pending)}\n")

    for req in pending:
        print(f"📋 {req['request_id']}")
        print(f"  Payer: {req['payer_name']}")
        print(f"  Issue: {req['issue_type']} - {req['issue_description']}")
        print(f"  Created: {req['created_at']}")
        if req.get('screenshot_path'):
            print(f"  Screenshot: {req['screenshot_path']}")
        print()


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Universal Login Deep Agent - CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Login to a portal
  %(prog)s login --payer "Delta Dental" --url "https://deltadentalins.com/" --username "user" --password "pass"

  # Login with verbose output
  %(prog)s login --payer "BCBS" --url "https://bcbs.com/" --username "user" --password "pass" --verbose

  # List pending HITL requests
  %(prog)s list-hitl
        """
    )

    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Enable verbose output'
    )

    subparsers = parser.add_subparsers(dest='command', help='Command to execute')

    # Login command
    login_parser = subparsers.add_parser('login', help='Login to an insurance portal')
    login_parser.add_argument('--payer', required=True, help='Insurance payer name')
    login_parser.add_argument('--url', required=True, help='Portal login URL')
    login_parser.add_argument('--username', required=True, help='Username')
    login_parser.add_argument('--password', required=True, help='Password')
    login_parser.add_argument('--office-id', help='Office ID (if required)')
    login_parser.add_argument(
        '--model',
        default=AgentConfig.DEFAULT_MODEL,
        help=f'LLM model to use (default: {AgentConfig.DEFAULT_MODEL})'
    )
    login_parser.add_argument(
        '--max-attempts',
        type=int,
        default=AgentConfig.MAX_RETRIES,
        help=f'Maximum login attempts (default: {AgentConfig.MAX_RETRIES})'
    )
    login_parser.add_argument(
        '--output', '-o',
        help='Save result to JSON file'
    )

    # HITL commands
    hitl_parser = subparsers.add_parser('list-hitl', help='List pending HITL requests')

    args = parser.parse_args()

    # Setup logging
    setup_logging(args.verbose)

    # Validate config
    try:
        AgentConfig.validate()
    except ValueError as e:
        print(f"❌ Configuration Error: {e}")
        return 1

    # Execute command
    if args.command == 'login':
        return asyncio.run(login_command(args))
    elif args.command == 'list-hitl':
        return asyncio.run(list_hitl_command(args))
    else:
        parser.print_help()
        return 1


if __name__ == '__main__':
    exit(main())
