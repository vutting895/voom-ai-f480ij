import hmac


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
