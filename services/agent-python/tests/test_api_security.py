import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient

from app import main
from app.security import RateLimiter, bearer_token_matches, validate_provider_url


class BearerTokenTests(unittest.TestCase):
    def test_accepts_matching_bearer_token(self):
        self.assertTrue(bearer_token_matches("secret-token", "Bearer secret-token"))

    def test_bearer_scheme_is_case_insensitive(self):
        self.assertTrue(bearer_token_matches("secret-token", "bEaReR secret-token"))

    def test_rejects_missing_configuration(self):
        self.assertFalse(bearer_token_matches("", "Bearer secret-token"))

    def test_rejects_missing_or_malformed_header(self):
        self.assertFalse(bearer_token_matches("secret-token", None))
        self.assertFalse(bearer_token_matches("secret-token", "secret-token"))
        self.assertFalse(bearer_token_matches("secret-token", "Basic secret-token"))

    def test_rejects_wrong_token(self):
        self.assertFalse(bearer_token_matches("secret-token", "Bearer wrong-token"))


class ProviderUrlTests(unittest.TestCase):
    def test_allows_loopback_http(self):
        validate_provider_url("http://127.0.0.1:11434/v1")
        validate_provider_url("http://localhost:11434/v1")

    def test_rejects_public_http_and_unlisted_hosts(self):
        with self.assertRaises(ValueError):
            validate_provider_url("http://example.com/v1")
        with self.assertRaises(ValueError):
            validate_provider_url("https://example.com/v1")

    def test_allows_explicit_https_allowlist(self):
        validate_provider_url("https://ollama.internal/v1", "ollama.internal")

    def test_rejects_url_credentials_and_query(self):
        with self.assertRaises(ValueError):
            validate_provider_url("http://user:pass@127.0.0.1:11434/v1")
        with self.assertRaises(ValueError):
            validate_provider_url("http://127.0.0.1:11434/v1?target=elsewhere")


class RateLimiterTests(unittest.TestCase):
    def test_enforces_limit_and_resets_next_window(self):
        limiter = RateLimiter(limit=2, window_seconds=10)
        self.assertTrue(limiter.allow("client-a", now=1))
        self.assertTrue(limiter.allow("client-a", now=2))
        self.assertFalse(limiter.allow("client-a", now=3))
        self.assertTrue(limiter.allow("client-a", now=10))


class AgentApiTests(unittest.TestCase):
    def setUp(self):
        self.token = "ci-test-token-ci-test-token-ci-test-token-123456"
        self.token_patch = patch.object(main, "AGENT_API_TOKEN", self.token)
        self.token_patch.start()
        self.limiter_patch = patch.object(main, "rate_limiter", RateLimiter(limit=20, window_seconds=60))
        self.limiter_patch.start()
        self.client = TestClient(main.app)

    def tearDown(self):
        self.client.close()
        self.limiter_patch.stop()
        self.token_patch.stop()

    def test_missing_token_is_rejected(self):
        response = self.client.post("/v1/agent/run", json={"input": "hello"})
        self.assertEqual(response.status_code, 401)
        self.assertTrue(response.headers.get("X-Request-ID"))

    def test_invalid_token_is_rejected(self):
        response = self.client.post(
            "/v1/agent/run",
            headers={"Authorization": "Bearer wrong-token"},
            json={"input": "hello"},
        )
        self.assertEqual(response.status_code, 401)

    def test_valid_token_runs_agent_and_returns_request_id(self):
        with patch.object(main.Runner, "run", new=AsyncMock(return_value=SimpleNamespace(final_output="ok"))):
            response = self.client.post(
                "/v1/agent/run",
                headers={"Authorization": f"Bearer {self.token}"},
                json={"input": "hello"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["output"], "ok")
        self.assertTrue(response.headers.get("X-Request-ID"))

    def test_request_body_size_limit(self):
        response = self.client.post(
            "/v1/agent/run",
            headers={"Authorization": f"Bearer {self.token}", "Content-Length": str(main.MAX_BODY_BYTES + 1)},
            json={"input": "hello"},
        )
        self.assertEqual(response.status_code, 413)

    def test_rate_limit_is_enforced(self):
        self.limiter_patch.stop()
        self.limiter_patch = patch.object(main, "rate_limiter", RateLimiter(limit=1, window_seconds=60))
        self.limiter_patch.start()
        with patch.object(main.Runner, "run", new=AsyncMock(return_value=SimpleNamespace(final_output="ok"))):
            first = self.client.post(
                "/v1/agent/run",
                headers={"Authorization": f"Bearer {self.token}"},
                json={"input": "hello"},
            )
            second = self.client.post(
                "/v1/agent/run",
                headers={"Authorization": f"Bearer {self.token}"},
                json={"input": "hello"},
            )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)


if __name__ == "__main__":
    unittest.main()
