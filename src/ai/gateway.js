import { createOllamaProvider } from "./providers/ollama.js";
import { ModelRouter } from "./model-router.js";

export function createModelGateway({ providers, defaultProvider, fallbackProvider } = {}) {
  const configured = providers || {
    ollama: createOllamaProvider(),
  };
  return new ModelRouter({
    providers: configured,
    defaultProvider: defaultProvider || process.env.VOOM_DEFAULT_PROVIDER || "ollama",
    fallbackProvider: fallbackProvider || process.env.VOOM_FALLBACK_PROVIDER || null,
  });
}
