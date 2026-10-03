import type { Bot, ModelProvider } from '../src/types'
import { getProviderKey } from './provider-vault.js'

export interface ModelResult { content: string; tokens: number }

function cleanBaseUrl(raw: string, provider: ModelProvider) {
  const value = raw.trim().replace(/\/+$/, '')
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`${provider.name} URL is invalid.`) }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error(`${provider.name} must use HTTPS unless it runs on this computer.`)
  return value
}

async function providerHeaders(provider: ModelProvider): Promise<Record<string, string>> {
  if (provider.kind === 'ollama') return { 'Content-Type': 'application/json' }
  const key = await getProviderKey(provider.id)
  if (!key) throw new Error(`${provider.name} needs an API key. Add it in Settings → Model providers.`)
  if (provider.kind === 'anthropic') return { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
}

async function fetchProvider(provider: ModelProvider, path: string, init: RequestInit) {
  try { return await fetch(`${cleanBaseUrl(provider.baseUrl, provider)}${path}`, init) }
  catch (error) { throw new Error(`Cannot reach ${provider.name}. ${error instanceof Error ? error.message : String(error)}`) }
}

function allMessages(bot: Bot, messages: { role: string; content: string }[]) {
  return bot.systemPrompt.trim() ? [{ role: 'system', content: bot.systemPrompt.trim() }, ...messages] : messages
}

export async function runProviderModel(provider: ModelProvider, bot: Bot, messages: { role: string; content: string }[], timeoutMs = 180_000, onChunk?: (content: string) => void, signal?: AbortSignal): Promise<ModelResult> {
  if (!provider.enabled) throw new Error(`${provider.name} is disabled.`)
  const headers = await providerHeaders(provider)
  const requestSignal = signal ?? AbortSignal.timeout(timeoutMs)
  if (provider.kind === 'ollama') return runOllama(provider, bot, messages, headers, requestSignal, onChunk)
  if (provider.kind === 'anthropic') return runAnthropic(provider, bot, messages, headers, requestSignal, onChunk)
  return runOpenAICompatible(provider, bot, messages, headers, requestSignal, onChunk)
}

async function runOllama(provider: ModelProvider, bot: Bot, messages: { role: string; content: string }[], headers: Record<string,string>, signal: AbortSignal, onChunk?: (content: string) => void): Promise<ModelResult> {
  const response = await fetchProvider(provider, '/api/chat', { method: 'POST', headers, signal, body: JSON.stringify({ model: bot.model, stream: !!onChunk, messages: allMessages(bot, messages), options: { temperature: bot.temperature, top_p: bot.topP, num_ctx: bot.contextLength } }) })
  if (!response.ok) throw new Error(await response.text() || `${provider.name} returned HTTP ${response.status}`)
  if (!onChunk) {
    const data = await response.json() as { message?: { content?: string }; error?: string; prompt_eval_count?: number; eval_count?: number }
    if (data.error) throw new Error(data.error)
    return { content: data.message?.content?.trim() ?? '', tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0) }
  }
  let content = ''; let tokens = 0
  await readLines(response, line => {
    const packet = JSON.parse(line) as { message?: { content?: string }; error?: string; prompt_eval_count?: number; eval_count?: number }
    if (packet.error) throw new Error(packet.error)
    const chunk = packet.message?.content ?? ''; if (chunk) { content += chunk; onChunk(chunk) }
    tokens = (packet.prompt_eval_count ?? 0) + (packet.eval_count ?? tokens)
  })
  return { content: content.trim(), tokens }
}

async function runOpenAICompatible(provider: ModelProvider, bot: Bot, messages: { role: string; content: string }[], headers: Record<string,string>, signal: AbortSignal, onChunk?: (content: string) => void): Promise<ModelResult> {
  const response = await fetchProvider(provider, '/chat/completions', { method: 'POST', headers, signal, body: JSON.stringify({ model: bot.model, messages: allMessages(bot, messages), temperature: bot.temperature, top_p: bot.topP, stream: !!onChunk }) })
  if (!response.ok) throw new Error(await response.text() || `${provider.name} returned HTTP ${response.status}`)
  if (!onChunk) {
    const data = await response.json() as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } }
    return { content: data.choices?.[0]?.message?.content?.trim() ?? '', tokens: data.usage?.total_tokens ?? 0 }
  }
  let content = ''; let tokens = 0
  await readSse(response, data => {
    if (data === '[DONE]') return
    const packet = JSON.parse(data) as { choices?: { delta?: { content?: string } }[]; usage?: { total_tokens?: number } }
    const chunk = packet.choices?.[0]?.delta?.content ?? ''; if (chunk) { content += chunk; onChunk(chunk) }
    tokens = packet.usage?.total_tokens ?? tokens
  })
  return { content: content.trim(), tokens }
}

async function runAnthropic(provider: ModelProvider, bot: Bot, messages: { role: string; content: string }[], headers: Record<string,string>, signal: AbortSignal, onChunk?: (content: string) => void): Promise<ModelResult> {
  const body = { model: bot.model, system: bot.systemPrompt.trim() || undefined, messages: messages.filter(message => message.role !== 'system'), max_tokens: Math.min(8192, Math.max(1024, Math.floor(bot.contextLength / 2))), temperature: bot.temperature, top_p: bot.topP, stream: !!onChunk }
  const response = await fetchProvider(provider, '/messages', { method: 'POST', headers, signal, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(await response.text() || `${provider.name} returned HTTP ${response.status}`)
  if (!onChunk) {
    const data = await response.json() as { content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } }
    return { content: data.content?.filter(item => item.type === 'text').map(item => item.text ?? '').join('').trim() ?? '', tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) }
  }
  let content = ''; let tokens = 0
  await readSse(response, data => {
    const packet = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string }; message?: { usage?: { input_tokens?: number } }; usage?: { output_tokens?: number } }
    const chunk = packet.type === 'content_block_delta' ? packet.delta?.text ?? '' : ''; if (chunk) { content += chunk; onChunk(chunk) }
    tokens = (packet.message?.usage?.input_tokens ?? 0) + (packet.usage?.output_tokens ?? Math.max(0, tokens))
  })
  return { content: content.trim(), tokens }
}

async function readLines(response: Response, consume: (line: string) => void) {
  if (!response.body) throw new Error('Provider returned an empty stream.')
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() ?? ''; for (const line of lines) if (line.trim()) consume(line) }
  if (buffer.trim()) consume(buffer)
}

async function readSse(response: Response, consume: (data: string) => void) {
  await readLines(response, line => { const trimmed = line.trim(); if (trimmed.startsWith('data:')) consume(trimmed.slice(5).trim()) })
}

export async function testProvider(provider: ModelProvider) {
  const headers = await providerHeaders(provider)
  const path = provider.kind === 'ollama' ? '/api/version' : '/models'
  const response = await fetchProvider(provider, path, { headers, signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(await response.text() || `${provider.name} returned HTTP ${response.status}`)
  const data = await response.json() as { version?: string; data?: { id?: string }[]; models?: { name?: string }[] }
  const models = provider.kind === 'ollama' ? [] : (data.data ?? []).map(item => item.id ?? '').filter(Boolean).slice(0, 40)
  return { ok: true, detail: data.version ? `Ollama ${data.version}` : `${models.length || 'API'} models available`, models }
}
