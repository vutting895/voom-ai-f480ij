const DEFAULT_TIMEOUT_MS = 30_000;

export class ProviderError extends Error {
  constructor(message, { provider, status, cause } = {}) {
    super(message, { cause });
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export function createOpenAICompatibleProvider({
  name,
  baseUrl,
  apiKey,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  if (!name || !baseUrl || !model) {
    throw new Error("Provider name, baseUrl and model are required");
  }

  const endpoint = new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");

  return {
    name,
    model,
    async chat({ messages, temperature = 0.2, maxTokens = 1024 }) {
      if (!Array.isArray(messages) || messages.length === 0) {
        throw new TypeError("messages must be a non-empty array");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new ProviderError(`${name} returned HTTP ${response.status}`, {
            provider: name,
            status: response.status,
          });
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content !== "string") {
          throw new ProviderError(`${name} returned an invalid chat completion`, {
            provider: name,
          });
        }

        return {
          provider: name,
          model: payload.model || model,
          content,
          usage: payload.usage ?? null,
        };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(`${name} request failed`, {
          provider: name,
          cause: error,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
