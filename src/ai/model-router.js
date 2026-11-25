export class ModelRouter {
  constructor({ providers, defaultProvider, fallbackProvider = null }) {
    this.providers = new Map(Object.entries(providers || {}));
    if (!this.providers.has(defaultProvider)) {
      throw new Error(`Unknown default provider: ${defaultProvider}`);
    }
    if (fallbackProvider && !this.providers.has(fallbackProvider)) {
      throw new Error(`Unknown fallback provider: ${fallbackProvider}`);
    }
    this.defaultProvider = defaultProvider;
    this.fallbackProvider = fallbackProvider;
  }

  async chat(input, { provider } = {}) {
    const selected = provider || this.defaultProvider;
    const primary = this.providers.get(selected);
    if (!primary) throw new Error(`Provider is not configured: ${selected}`);

    try {
      return await primary.chat(input);
    } catch (primaryError) {
      // Fallback is reserved for explicitly retryable provider failures
      // (network/timeout, rate limit, or upstream server errors).
      if (
        !this.fallbackProvider ||
        selected === this.fallbackProvider ||
        primaryError?.retryable !== true
      ) {
        throw primaryError;
      }
      const fallback = this.providers.get(this.fallbackProvider);
      const result = await fallback.chat(input);
      return { ...result, fallback: true, primaryProvider: selected };
    }
  }
}
