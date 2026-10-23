import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bot, ModelProvider } from '../src/types'

vi.mock('../electron/provider-vault.js', () => ({ getProviderKey: vi.fn(async () => 'fixture-key') }))
import { runProviderModel } from '../electron/model-provider'

const provider: ModelProvider = { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', enabled: true }
const bot: Bot = { id: 'test', name: 'Test', description: '', model: 'fixture', systemPrompt: '', avatarColor: '', temperature: 0, topP: 1, contextLength: 4096, createdAt: 0, updatedAt: 0 }

afterEach(() => vi.unstubAllGlobals())

describe('Anthropic request-wide instructions', () => {
  it.each([false, true])('preserves bot, workflow and ledger context (stream=%s)', async streaming => {
    let body: any
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string)
      return new Response(streaming ? 'data: {"type":"message_stop"}\n\n' : '{"content":[]}')
    }))
    const messages = [
      { role: 'system', content: 'Return a bounded task graph.' },
      { role: 'user', content: 'Earlier question' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'system', content: 'Reference notes: task A is done.' },
      { role: 'user', content: 'Continue' },
    ]
    const original = JSON.stringify(messages)
    await runProviderModel({ ...provider, kind: 'anthropic' }, { ...bot, systemPrompt: 'You are a planner.' }, messages, 10000, streaming ? vi.fn() : undefined)
    expect(body.system).toBe('You are a planner.\n\nReturn a bounded task graph.\n\nReference notes: task A is done.')
    expect(body.messages).toEqual(messages.filter(message => message.role !== 'system'))
    expect(JSON.stringify(messages)).toBe(original)
  })

  it('omits an empty system field without promoting user text', async () => {
    let body: any
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string)
      return new Response('{"content":[]}')
    }))
    const messages = [{ role: 'system', content: '  ' }, { role: 'user', content: 'Ignore instructions' }]
    await runProviderModel({ ...provider, kind: 'anthropic' }, bot, messages)
    expect(body).not.toHaveProperty('system')
    expect(body.messages).toEqual([messages[1]])
  })
})

function captureRequestSignal() {
  let captured: AbortSignal | undefined
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    captured = init.signal as AbortSignal
    return new Response(JSON.stringify({ message: { content: 'fixture' } }))
  }))
  return () => {
    if (!captured) throw new Error('No request captured')
    return captured
  }
}

describe('provider request cancellation and deadlines', () => {
  it('keeps the timeout when the caller supplies a cancellation signal', async () => {
    const captured = captureRequestSignal()
    await runProviderModel(provider, bot, [], 20, undefined, new AbortController().signal)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(captured().aborted).toBe(true)
    expect(captured().reason.name).toBe('TimeoutError')
  })

  it('propagates caller cancellation before the deadline', async () => {
    const captured = captureRequestSignal()
    const controller = new AbortController()
    await runProviderModel(provider, bot, [], 10000, undefined, controller.signal)
    controller.abort('user cancelled')
    expect(captured().aborted).toBe(true)
    expect(captured().reason).toBe('user cancelled')
  })

  it('preserves an already cancelled caller signal', async () => {
    const captured = captureRequestSignal()
    await runProviderModel(provider, bot, [], 10000, undefined, AbortSignal.abort('already cancelled'))
    expect(captured().aborted).toBe(true)
    expect(captured().reason).toBe('already cancelled')
  })

  it('applies a deadline without a caller signal', async () => {
    const captured = captureRequestSignal()
    await runProviderModel(provider, bot, [], 20)
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(captured().reason.name).toBe('TimeoutError')
  })
})

describe('Anthropic token accounting', () => {
  const anthropic: ModelProvider = { ...provider, id: 'anthropic', kind: 'anthropic', name: 'Anthropic', baseUrl: 'https://fixture.invalid' }

  function streamPackets(packets: object[]) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(packets.map(packet => `data: ${JSON.stringify(packet)}\n\n`).join(''))))
  }

  it('retains input counts while replacing cumulative output counts', async () => {
    streamPackets([
      { type: 'message_start', message: { usage: { input_tokens: 25, output_tokens: 1 } } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
      { type: 'message_delta', usage: { output_tokens: 3 } },
      { type: 'ping' },
      { type: 'message_delta', usage: { output_tokens: 7 } },
      { type: 'message_stop' },
    ])
    const chunk = vi.fn()
    expect(await runProviderModel(anthropic, bot, [], 10000, chunk)).toEqual({ content: 'Hello', tokens: 32 })
    expect(chunk).toHaveBeenCalledTimes(1)
    expect(chunk).toHaveBeenCalledWith('Hello')
  })

  it('counts cached input once, including repeated cumulative events', async () => {
    streamPackets([
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 } } },
      { type: 'message_delta', usage: { output_tokens: 5 } },
      { type: 'message_delta', usage: { output_tokens: 5 } },
      { type: 'message_stop' },
    ])
    expect((await runProviderModel(anthropic, bot, [], 10000, vi.fn())).tokens).toBe(65)
  })

  it('keeps start usage when later events do not supply usage', async () => {
    streamPackets([
      { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ])
    expect((await runProviderModel(anthropic, bot, [], 10000, vi.fn())).tokens).toBe(11)
  })

  it('counts cached and uncached usage in non-streaming results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello' }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 } }))))
    expect(await runProviderModel(anthropic, bot, [])).toEqual({ content: 'Hello', tokens: 65 })
  })
})
