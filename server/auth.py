"""Stateless "Sign in with Google" (no database needed, so it works on Render's free tier).

How it works: the browser gets a Google ID token, we verify it server-side, then store the user in a signed,
HttpOnly session cookie. If GOOGLE_CLIENT_ID is not set, auth is OFF and the whole app stays open.
"""
import os
from typing import Optional

from flask import session

CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
ALLOWED_EMAILS = {e.strip().lower() for e in os.getenv("ALLOWED_EMAILS", "").split(",") if e.strip()}


def auth_enabled() -> bool:
    return bool(CLIENT_ID)


def current_user() -> Optional[dict]:
    user = session.get("user")
    return user if isinstance(user, dict) else None


def email_allowed(email: str) -> bool:
    """Optional allow-list: ALLOWED_EMAILS=a@gmail.com,b@gmail.com. Empty means anyone with a Google account."""
    return not ALLOWED_EMAILS or (email or "").lower() in ALLOWED_EMAILS


def verify_google_credential(credential: str) -> dict:
    """Verify a Google ID token (signature, audience, expiry). Raises on any problem."""
    from google.auth.transport import requests as g_requests
    from google.oauth2 import id_token

    info = id_token.verify_oauth2_token(credential, g_requests.Request(), CLIENT_ID)
    if not info.get("email_verified", False):
        raise ValueError("Google account email is not verified")
    email = info.get("email", "")
    return {
        "sub": info["sub"],
        "email": email,
        "name": info.get("name") or email,
        "picture": info.get("picture", ""),
    }
