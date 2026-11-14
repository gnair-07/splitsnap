"""Tiny in-memory rate limiter for the (paid) vision endpoint. Run gunicorn with ONE worker + threads
so the counters are shared (see Dockerfile)."""
import os
import threading
import time
from typing import Dict, List, Optional

PER_IP_PER_HOUR = int(os.getenv("SCAN_LIMIT_PER_HOUR", "15"))
GLOBAL_PER_DAY = int(os.getenv("SCAN_DAILY_CAP", "300"))

_lock = threading.Lock()
_by_ip: Dict[str, List[float]] = {}
_global: List[float] = []


def check_and_record(ip: str, now: Optional[float] = None) -> Optional[str]:
    """Return None if the scan is allowed (and record it), otherwise a user-facing reason."""
    now = time.time() if now is None else now
    with _lock:
        _global[:] = [t for t in _global if now - t < 86400]
        hits = [t for t in _by_ip.get(ip, []) if now - t < 3600]
        if len(_global) >= GLOBAL_PER_DAY:
            return "The free scanning quota for today is used up. Please use a demo preset or add items manually, then try scanning again tomorrow."
        if len(hits) >= PER_IP_PER_HOUR:
            return f"Scan limit reached ({PER_IP_PER_HOUR} per hour). Please try again later or enter items manually."
        hits.append(now)
        _by_ip[ip] = hits
        _global.append(now)
        # keep memory bounded
        if len(_by_ip) > 5000:
            for k in [k for k, v in _by_ip.items() if not v or now - v[-1] > 3600]:
                _by_ip.pop(k, None)
        return None
