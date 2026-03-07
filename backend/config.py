"""
Shared application configuration — OpenAI client, model name, and logger.
Import from here in every route module to avoid circular imports.
"""

import os
import logging
import warnings
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv("api.env")

# ── OpenAI client ─────────────────────────────────────────────────────────────
client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=os.getenv("OPENAI_BASE_URL"),
)
MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-nano")

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("faster_whisper").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
warnings.filterwarnings("ignore", category=RuntimeWarning, module="faster_whisper")
