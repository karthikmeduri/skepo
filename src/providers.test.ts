import { describe, expect, it } from 'vitest'
import { builtInProviders, normalizeProviders, providerLabel } from './providers'

describe('model providers', () => {
  it('ships the requested local and cloud adapters', () => {
    expect(builtInProviders.map(provider => provider.id)).toEqual(expect.arrayContaining(['ollama', 'openai', 'anthropic', 'deepseek', 'glm', 'kimi', 'gemini', 'openrouter', 'xai', 'groq', 'mistral', 'together', 'perplexity']))
  })

  it('migrates old workspaces and preserves custom compatible endpoints', () => {
    const providers = normalizeProviders([
      { ...builtInProviders[1], baseUrl: 'https://gateway.example/v1' },
      { id: 'private', kind: 'openai-compatible', name: 'Private gateway', baseUrl: 'https://models.example/v1', enabled: true },
    ], 'http://localhost:11434')
    expect(providers.find(provider => provider.id === 'ollama')?.baseUrl).toBe('http://localhost:11434')
    expect(providers.find(provider => provider.id === 'openai')?.baseUrl).toBe('https://gateway.example/v1')
    expect(providerLabel('private', providers)).toBe('Private gateway')
  })
})
