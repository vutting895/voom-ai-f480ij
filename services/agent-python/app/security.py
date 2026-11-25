import hmac
import time
from threading import Lock
from urllib.parse import urlsplit


LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def bearer_token_matches(expected_token: str, authorization: str | None) -> bool:
    """Validate a Bearer token using constant-time byte comparison."""
    if not expected_token or not authorization:
        return False

    scheme, separator, supplied_token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not supplied_token:
        return False

    expected_bytes = expected_token.encode("utf-8")
    supplied_bytes = supplied_token.strip().encode("utf-8")
    return bool(supplied_bytes) and hmac.compare_digest(expected_bytes, supplied_bytes)


def validate_provider_url(base_url: str, allowed_hosts_csv: str = "") -> None:
    """Allow loopback by default; remote hosts require explicit allowlisting and HTTPS."""
    parsed = urlsplit(base_url)
    host = (parsed.hostname or "").lower()
    allowed_hosts = {item.strip().lower() for item in allowed_hosts_csv.split(",") if item.strip()}

    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("OLLAMA_BASE_URL must not contain credentials, query, or fragment")
    if not host or parsed.scheme not in {"http", "https"}:
        raise ValueError("OLLAMA_BASE_URL must be an absolute HTTP(S) URL")
    if host in LOOPBACK_HOSTS and parsed.scheme == "http":
        return
    if host in allowed_hosts and parsed.scheme == "https":
        return
    raise ValueError("OLLAMA_BASE_URL must target loopback or an explicitly allowlisted HTTPS host")


class RateLimiter:
    """Small in-memory fixed-window limiter for a single Dev/Test process."""

    def __init__(self, limit: int = 30, window_seconds: int = 60):
        if limit < 1 or window_seconds < 1:
            raise ValueError("Rate limit and window must be positive")
        self.limit = limit
        self.window_seconds = window_seconds
        self._windows: dict[str, tuple[int, int]] = {}
        self._lock = Lock()

    def allow(self, key: str, now: float | None = None) -> bool:
        current = int((time.monotonic() if now is None else now) // self.window_seconds)
        with self._lock:
            # Bound memory use by dropping expired windows before adding a new key.
            expired = [item for item, (window, _) in self._windows.items() if window < current]
            for item in expired:
                self._windows.pop(item, None)

            window, count = self._windows.get(key, (current, 0))
            if window != current:
                window, count = current, 0
            if count >= self.limit:
                return False
            self._windows[key] = (window, count + 1)
            return True
