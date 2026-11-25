import unittest

from app.security import bearer_token_matches


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


if __name__ == "__main__":
    unittest.main()
