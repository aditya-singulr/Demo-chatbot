#!/usr/bin/env python3
"""
POC: Generic E2E Chat Test with Auto-Field Detection

Usage:
    python poc_chat_test.py \
        --url https://chat-demo-external.singulr.ai \
        --fields '{"identifier": "test1.user@singulr.ai", "password": "your-password"}' \
        --prompts prompts.txt \
        --output completions.txt

The script auto-detects input fields by name, id, placeholder, or label and fills them.

Requirements:
    pip install playwright httpx
    playwright install chromium
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

import httpx
from playwright.async_api import async_playwright, Page


class GenericAuthenticator:
    """Handles authentication via headless browser with auto-field detection."""

    def __init__(self, app_url: str, fields: dict[str, str]):
        self.app_url = app_url.rstrip("/")
        self.fields = fields  # {"field_name": "value", ...}
        self.access_token: str | None = None

    async def find_and_fill_field(self, page: Page, field_name: str, value: str) -> bool:
        """
        Find an input field by name, id, placeholder, or associated label and fill it.
        Returns True if field was found and filled.
        """
        # Try multiple selectors to find the field
        selectors = [
            f'input[name="{field_name}"]',
            f'input[name*="{field_name}" i]',  # case-insensitive partial match
            f'input[id="{field_name}"]',
            f'input[id*="{field_name}" i]',
            f'input[placeholder*="{field_name}" i]',
            f'input[aria-label*="{field_name}" i]',
            f'input[autocomplete="{field_name}"]',
        ]

        # Special handling for common field types
        if field_name.lower() in ["password", "passwd", "pwd"]:
            selectors.insert(0, 'input[type="password"]')
        if field_name.lower() in ["email", "username", "user", "identifier", "login"]:
            selectors.insert(0, 'input[type="email"]')
            selectors.insert(1, 'input[type="text"]:not([type="password"])')

        for selector in selectors:
            try:
                element = page.locator(selector).first
                if await element.is_visible(timeout=1000):
                    await element.fill(value)
                    print(f"  [FILL] '{field_name}' -> filled via: {selector}")
                    return True
            except Exception:
                continue

        # Try finding by label text
        try:
            label = page.locator(f'label:has-text("{field_name}")')
            if await label.count() > 0:
                for_attr = await label.first.get_attribute("for")
                if for_attr:
                    input_el = page.locator(f'#{for_attr}')
                    if await input_el.is_visible(timeout=1000):
                        await input_el.fill(value)
                        print(f"  [FILL] '{field_name}' -> filled via label")
                        return True
        except Exception:
            pass

        return False

    async def click_submit(self, page: Page) -> bool:
        """Click the most likely submit button on the page."""
        submit_selectors = [
            'input[type="submit"]',
            'button[type="submit"]',
            'button:has-text("Sign in")',
            'button:has-text("Log in")',
            'button:has-text("Submit")',
            'button:has-text("Next")',
            'button:has-text("Continue")',
            'button:has-text("Verify")',
            'input[value="Sign in"]',
            'input[value="Log in"]',
            'input[value="Submit"]',
            'input[value="Next"]',
            'input[value="Verify"]',
        ]

        for selector in submit_selectors:
            try:
                element = page.locator(selector).first
                if await element.is_visible(timeout=500):
                    await element.click()
                    print(f"  [CLICK] Submit via: {selector}")
                    return True
            except Exception:
                continue

        return False

    async def authenticate(self) -> str:
        """
        Authenticate via headless browser by auto-detecting and filling fields.
        Returns the access token.
        """
        print(f"[AUTH] Starting authentication...")
        print(f"[AUTH] Fields to fill: {list(self.fields.keys())}")

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            try:
                # Navigate to auth page
                auth_url = f"{self.app_url}/auth"
                print(f"[AUTH] Navigating to {auth_url}")
                await page.goto(auth_url, wait_until="domcontentloaded")
                await asyncio.sleep(1)

                # Click "Sign in with Okta" or similar button if present
                sign_in_buttons = [
                    'button:has-text("Sign in")',
                    'button:has-text("Log in")',
                    'a:has-text("Sign in")',
                    'a:has-text("Log in")',
                ]
                for btn_selector in sign_in_buttons:
                    try:
                        btn = page.locator(btn_selector).first
                        if await btn.is_visible(timeout=2000):
                            await btn.click()
                            print(f"[AUTH] Clicked: {btn_selector}")
                            await asyncio.sleep(2)
                            break
                    except Exception:
                        continue

                # Fill fields one by one, with submit between steps if needed
                # Group fields: non-password first, then password
                non_password_fields = {k: v for k, v in self.fields.items()
                                       if k.lower() not in ["password", "passwd", "pwd"]}
                password_fields = {k: v for k, v in self.fields.items()
                                   if k.lower() in ["password", "passwd", "pwd"]}

                # Fill non-password fields
                print("[AUTH] Filling non-password fields...")
                for field_name, value in non_password_fields.items():
                    for attempt in range(3):
                        await asyncio.sleep(0.5)
                        if await self.find_and_fill_field(page, field_name, value):
                            break
                    else:
                        print(f"  [WARN] Could not find field: {field_name}")

                # Click submit/next after non-password fields
                if non_password_fields:
                    await asyncio.sleep(0.5)
                    await self.click_submit(page)
                    await asyncio.sleep(2)

                # Fill password fields
                if password_fields:
                    print("[AUTH] Filling password fields...")
                    for field_name, value in password_fields.items():
                        for attempt in range(5):  # More attempts for password (may need to wait)
                            await asyncio.sleep(0.5)
                            if await self.find_and_fill_field(page, field_name, value):
                                break
                        else:
                            print(f"  [WARN] Could not find field: {field_name}")

                    # Click submit after password
                    await asyncio.sleep(0.5)
                    await self.click_submit(page)

                # Wait for redirect to app
                print("[AUTH] Waiting for redirect to app...")
                app_domain = self.app_url.split("://")[-1].split("/")[0]  # e.g., chat-demo-external.singulr.ai

                # Poll for successful redirect or tokens
                tokens_json = None
                for attempt in range(60):  # 30 seconds
                    await asyncio.sleep(0.5)

                    try:
                        current_url = page.url
                        # Parse hostname to avoid matching substrings in URL params
                        current_host = current_url.split("://")[-1].split("/")[0].split("?")[0]
                    except Exception:
                        continue  # Page might be navigating

                    # Check if we're back on our app (hostname must match exactly)
                    if current_host == app_domain:
                        print(f"[AUTH] On app domain: {current_url[:80]}...")

                        # Try to get tokens from localStorage
                        try:
                            tokens_json = await page.evaluate("() => localStorage.getItem('okta_tokens')")
                            if tokens_json:
                                print("[AUTH] Tokens found!")
                                break
                        except Exception:
                            continue  # Page might be navigating

                    # Check for errors on current page (every 5 seconds)
                    if attempt % 10 == 9:
                        try:
                            page_text = await page.evaluate("() => document.body.innerText")
                            if "error" in page_text.lower() or "unable" in page_text.lower() or "invalid" in page_text.lower():
                                lines = [l.strip() for l in page_text.split('\n') if l.strip()]
                                error_lines = [l for l in lines if any(w in l.lower() for w in ["error", "unable", "invalid", "incorrect"])]
                                if error_lines:
                                    print(f"[AUTH] Possible error: {error_lines[0][:100]}")
                        except Exception:
                            pass

                if not tokens_json:
                    # Final debug info
                    try:
                        page_text = await page.evaluate("() => document.body.innerText")
                        print(f"[AUTH] Final URL: {page.url}")
                        print(f"[AUTH] Page content preview: {page_text[:300]}")
                    except Exception:
                        print(f"[AUTH] Final URL: {page.url}")
                    raise RuntimeError("No tokens found - authentication may have failed")

                tokens = json.loads(tokens_json)
                self.access_token = tokens.get("access_token")

                if not self.access_token:
                    raise RuntimeError("No access_token in tokens")

                print("[AUTH] Authentication successful!")
                return self.access_token

            except Exception as e:
                screenshot_path = Path("auth_error.png")
                await page.screenshot(path=str(screenshot_path))
                print(f"[AUTH] Error screenshot saved to {screenshot_path}")
                raise RuntimeError(f"Authentication failed: {e}") from e

            finally:
                await browser.close()


class ChatClient:
    """Sends prompts to the chat API."""

    def __init__(self, app_url: str, access_token: str, provider: str = "bedrock_converse"):
        self.app_url = app_url.rstrip("/")
        self.access_token = access_token
        self.provider = provider
        self.conversation: list[dict] = []

    async def send_prompt(self, prompt: str) -> dict:
        """Send a prompt and return the response."""
        self.conversation.append({"role": "user", "content": prompt})

        timestamp = datetime.utcnow().isoformat()
        start_time = asyncio.get_event_loop().time()

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(
                    f"{self.app_url}/api/auth/ui",
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.access_token}",
                    },
                    json={
                        "messages": self.conversation,
                        "provider": self.provider,
                    },
                )

                latency_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)

                if response.status_code == 401:
                    return {
                        "prompt": prompt,
                        "response": "[ERROR: Authentication expired]",
                        "latency_ms": latency_ms,
                        "timestamp": timestamp,
                        "status": "auth_error",
                    }

                if response.status_code != 200:
                    return {
                        "prompt": prompt,
                        "response": f"[ERROR: HTTP {response.status_code}] {response.text[:200]}",
                        "latency_ms": latency_ms,
                        "timestamp": timestamp,
                        "status": "error",
                    }

                data = response.json()
                assistant_message = data.get("message", "")
                self.conversation.append({"role": "assistant", "content": assistant_message})

                return {
                    "prompt": prompt,
                    "response": assistant_message,
                    "latency_ms": latency_ms,
                    "timestamp": timestamp,
                    "status": "success",
                    "provider": data.get("provider", self.provider),
                }

            except httpx.TimeoutException:
                return {
                    "prompt": prompt,
                    "response": "[ERROR: Request timeout]",
                    "latency_ms": 60000,
                    "timestamp": timestamp,
                    "status": "timeout",
                }
            except Exception as e:
                return {
                    "prompt": prompt,
                    "response": f"[ERROR: {e}]",
                    "latency_ms": 0,
                    "timestamp": timestamp,
                    "status": "error",
                }

    def reset_conversation(self):
        """Clear conversation history."""
        self.conversation = []


def read_prompts(file_path: str) -> list[str]:
    """Read prompts from file, one per line."""
    prompts = []
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                prompts.append(line)
    return prompts


def write_results(file_path: str, results: list[dict]):
    """Write results to file."""
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(f"# Chat Test Results - {datetime.utcnow().isoformat()}\n")
        f.write(f"# Total prompts: {len(results)}\n")
        f.write("=" * 80 + "\n\n")

        for i, result in enumerate(results, 1):
            f.write(f"[{i}] PROMPT:\n{result['prompt']}\n\n")
            f.write(f"RESPONSE ({result['status']}, {result['latency_ms']}ms):\n")
            f.write(f"{result['response']}\n\n")
            f.write("-" * 80 + "\n\n")

    json_path = file_path.rsplit(".", 1)[0] + ".json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"[OUTPUT] Results written to {file_path}")
    print(f"[OUTPUT] JSON written to {json_path}")


async def main():
    parser = argparse.ArgumentParser(
        description="Generic E2E Chat Test with Auto-Field Detection",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python poc_chat_test.py \\
    --url https://chat-demo-external.singulr.ai \\
    --fields '{"identifier": "user@example.com", "password": "secret"}' \\
    --prompts prompts.txt

  # With custom provider
  python poc_chat_test.py \\
    --url https://myapp.com \\
    --fields '{"username": "admin", "password": "pass123"}' \\
    --prompts prompts.txt \\
    --provider anthropic_sdk
        """
    )
    parser.add_argument("--url", required=True, help="App URL")
    parser.add_argument("--fields", required=True,
                        help='JSON object with field names and values, e.g., \'{"identifier": "user@example.com", "password": "secret"}\'')
    parser.add_argument("--prompts", required=True, help="Input file with prompts (one per line)")
    parser.add_argument("--output", default="completions.txt", help="Output file for responses")
    parser.add_argument("--provider", default="bedrock_converse", help="Chat provider to use")
    parser.add_argument("--reset-each", action="store_true", help="Reset conversation after each prompt")

    args = parser.parse_args()

    # Parse fields JSON
    try:
        fields = json.loads(args.fields)
        if not isinstance(fields, dict):
            raise ValueError("Fields must be a JSON object")
    except json.JSONDecodeError as e:
        print(f"[ERROR] Invalid JSON in --fields: {e}")
        sys.exit(1)

    # Validate prompts file
    if not Path(args.prompts).exists():
        print(f"[ERROR] Prompts file not found: {args.prompts}")
        sys.exit(1)

    prompts = read_prompts(args.prompts)
    if not prompts:
        print("[ERROR] No prompts found in file")
        sys.exit(1)

    print(f"[INFO] Loaded {len(prompts)} prompts from {args.prompts}")

    # Authenticate
    auth = GenericAuthenticator(args.url, fields)
    try:
        access_token = await auth.authenticate()
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        sys.exit(1)

    # Create chat client and process prompts
    client = ChatClient(args.url, access_token, args.provider)

    results = []
    for i, prompt in enumerate(prompts, 1):
        print(f"[{i}/{len(prompts)}] Sending: {prompt[:50]}...")

        result = await client.send_prompt(prompt)
        results.append(result)

        status_icon = "✓" if result["status"] == "success" else "✗"
        print(f"  {status_icon} {result['status']} ({result['latency_ms']}ms)")

        if args.reset_each:
            client.reset_conversation()

    write_results(args.output, results)

    success_count = sum(1 for r in results if r["status"] == "success")
    print(f"\n[DONE] {success_count}/{len(results)} prompts completed successfully")


if __name__ == "__main__":
    asyncio.run(main())
