"""Load instance config from a single env file (--env-file or ENV_FILE)."""

from __future__ import annotations

import argparse
import os
import sys

_CHATBOT_DIR = os.path.dirname(os.path.abspath(__file__))


def resolve_env_path(env_file: str) -> str:
    if os.path.isabs(env_file):
        return env_file
    return os.path.join(_CHATBOT_DIR, env_file)


def load_env_file(env_file: str) -> str:
    from dotenv import load_dotenv

    path = resolve_env_path(env_file)
    if not os.path.isfile(path):
        sys.exit(f"Env file not found: {path}")
    load_dotenv(path, override=True)
    return path


def setup(module_name: str, *, default_env_file: str = ".env") -> None:
    """Call at module top before imports that read os.environ."""
    if module_name == "__main__":
        parser = argparse.ArgumentParser()
        parser.add_argument("--env-file", required=True, help="Path to .env file")
        args = parser.parse_args()
        load_env_file(args.env_file)
        return

    load_env_file(os.environ.get("ENV_FILE", default_env_file))


def get_backend_port(env_var: str, *, default: int) -> int:
    raw = os.environ.get(env_var)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        sys.exit(f"Invalid {env_var}: {raw!r}")


def get_bind_host() -> str:
    return os.environ.get("BACKEND_BIND_HOST", "0.0.0.0")
