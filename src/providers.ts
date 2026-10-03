import type { ModelProvider } from './types'

export const builtInProviders: ModelProvider[] = [
  { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true },
  { id: 'openai', kind: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', enabled: true },
  { id: 'anthropic', kind: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', enabled: true },
  { id: 'deepseek', kind: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', enabled: true },
  { id: 'glm', kind: 'glm', name: 'GLM · Z.AI', baseUrl: 'https://api.z.ai/api/paas/v4', enabled: true },
  { id: 'kimi', kind: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.ai/v1', enabled: true },
  { id: 'gemini', kind: 'openai-compatible', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', enabled: true },
  { id: 'openrouter', kind: 'openai-compatible', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', enabled: true },
  { id: 'xai', kind: 'openai-compatible', name: 'xAI', baseUrl: 'https://api.x.ai/v1', enabled: true },
  { id: 'groq', kind: 'openai-compatible', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', enabled: true },
  { id: 'mistral', kind: 'openai-compatible', name: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', enabled: true },
  { id: 'together', kind: 'openai-compatible', name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', enabled: true },
  { id: 'perplexity', kind: 'openai-compatible', name: 'Perplexity', baseUrl: 'https://api.perplexity.ai', enabled: true },
]

export function normalizeProviders(value: unknown, ollamaUrl = builtInProviders[0].baseUrl): ModelProvider[] {
  const saved = Array.isArray(value) ? value as ModelProvider[] : []
  const merged = builtInProviders.map(provider => {
    const match = saved.find(item => item?.id === provider.id)
    return { ...provider, ...match, baseUrl: provider.id === 'ollama' ? ollamaUrl : (match?.baseUrl || provider.baseUrl) }
  })
  const custom = saved.filter(provider => provider && !merged.some(item => item.id === provider.id) && provider.kind === 'openai-compatible')
  return [...merged, ...custom]
}

export function providerLabel(providerId: string | undefined, providers: ModelProvider[]) {
  return providers.find(provider => provider.id === (providerId || 'ollama'))?.name ?? 'Unknown provider'
}
