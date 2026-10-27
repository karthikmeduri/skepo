import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Bot, ModelProvider } from '../src/types'

vi.mock('../electron/provider-vault.js', () => ({ getProviderKey: vi.fn(async () => 'fixture-key') }))
import { runProviderModel } from '../electron/model-provider'

const provider: ModelProvider = { id: 'ollama', kind: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434', enabled: true }
const bot: Bot = { id: 'test', name: 'Test', description: '', model: 'fixture', systemPrompt: '', avatarColor: '', temperature: 0, topP: 1, contextLength: 4096, createdAt: 0, updatedAt: 0 }

afterEach(() => vi.unstubAllGlobals())

describe('Ollama stream completion', () => {
  it.each(['', '{"message":{"content":"partial"}}\n', '{"done":false}\n', '{"done":"true"}\n'])('rejects EOF without a boolean completion marker (%s)', async text => {
    const response = new Response(text)
    vi.stubGlobal('fetch', vi.fn(async () => response))
    await expect(runProviderModel(provider, bot, [], 10000, vi.fn())).rejects.toThrow('stream ended before completion')
    expect(response.body?.locked).toBe(false)
  })

  it('retains partial callbacks but does not return a successful partial result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":{"content":"partial"},"done":false}\n')))
    const chunk = vi.fn()
    await expect(runProviderModel(provider, bot, [], 10000, chunk)).rejects.toThrow('output may be incomplete')
    expect(chunk).toHaveBeenCalledTimes(1)
    expect(chunk).toHaveBeenCalledWith('partial')
  })

  it('accepts a terminal packet without text and keeps final usage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":{"content":"hello"},"done":false}\n{"done":true,"prompt_eval_count":3,"eval_count":2}\n')))
    expect(await runProviderModel(provider, bot, [], 10000, vi.fn())).toEqual({ content: 'hello', tokens: 5 })
  })

  it('allows a completed empty response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"done":true}\n')))
    expect(await runProviderModel(provider, bot, [], 10000, vi.fn())).toEqual({ content: '', tokens: 0 })
  })
})

describe('Claude provider error envelopes', () => {
  const claude: ModelProvider = { ...provider, kind: 'anthropic', name: 'Claude' }

  it.each([true, false])('rejects error envelopes even on HTTP 200 (stream=%s)', async streaming => {
    const packet = { type: 'error', error: { type: 'overloaded_error', message: 'private prompt echoed by upstream' } }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(streaming ? `data: ${JSON.stringify(packet)}\n\n` : JSON.stringify(packet))))
    let error: unknown
    try { await runProviderModel(claude, bot, [], 10000, streaming ? vi.fn() : undefined) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('generation did not complete')
    expect((error as Error).message).not.toContain('private prompt')
  })

  it('rejects partial output and cancels the stream after an error event', async () => {
    const cancel = vi.fn()
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new TextEncoder().encode([
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial' } },
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Should not arrive' } },
      ].map(packet => `data: ${JSON.stringify(packet)}\n\n`).join('')))
    }, cancel })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    const chunk = vi.fn()
    await expect(runProviderModel(claude, bot, [], 10000, chunk)).rejects.toThrow('stream error')
    expect(chunk).toHaveBeenCalledTimes(1)
    expect(chunk).toHaveBeenCalledWith('Partial')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })

  it('rejects an error event even if its details are missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('data: {"type":"error"}\n\n')))
    await expect(runProviderModel(claude, bot, [], 10000, vi.fn())).rejects.toThrow('stream error')
  })
})

describe('provider stream cleanup', () => {
  function fixture(text: string, close = false, failCancel = false) {
    const cancel = vi.fn(() => { if (failCancel) throw new Error('cleanup failed') })
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(text)); if (close) controller.close() },
      cancel,
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    return { body, cancel }
  }

  it('cancels and unlocks the stream on malformed packets', async () => {
    const { body, cancel } = fixture('not json\n')
    await expect(runProviderModel(provider, bot, [], 10000, vi.fn())).rejects.toBeInstanceOf(SyntaxError)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })

  it('preserves consumer errors even if cancellation fails', async () => {
    const { body, cancel } = fixture('{"message":{"content":"hello"}}\n', false, true)
    await expect(runProviderModel(provider, bot, [], 10000, () => { throw new Error('consumer failed') })).rejects.toThrow('consumer failed')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })

  it('unlocks completed streams and reads a final packet without a newline', async () => {
    const { body, cancel } = fixture('{"message":{"content":"hello"},"eval_count":2,"done":true}', true)
    expect(await runProviderModel(provider, bot, [], 10000, vi.fn())).toEqual({ content: 'hello', tokens: 2 })
    expect(cancel).not.toHaveBeenCalled()
    expect(body.locked).toBe(false)
  })

  it('decodes multibyte text split across transport chunks', async () => {
    const bytes = new TextEncoder().encode('{"message":{"content":"🌻"},"done":true}\n')
    const split = bytes.indexOf(0xf0) + 2
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(bytes.slice(0, split)); controller.enqueue(bytes.slice(split)); controller.close()
    } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    expect((await runProviderModel(provider, bot, [], 10000, vi.fn())).content).toBe('🌻')
    expect(body.locked).toBe(false)
  })

  it('releases the reader when the transport itself fails', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('connection lost')) } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body)))
    await expect(runProviderModel(provider, bot, [], 10000, vi.fn())).rejects.toThrow('connection lost')
    expect(body.locked).toBe(false)
  })

  it('also cancels malformed SSE streams used by Claude', async () => {
    const { body, cancel } = fixture('data: not json\n\n')
    await expect(runProviderModel({ ...provider, kind: 'anthropic' }, bot, [], 10000, vi.fn())).rejects.toBeInstanceOf(SyntaxError)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
  })
})

it('adds the bot persona once alongside task instructions for Ollama', async () => {
  let body: any
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    body = JSON.parse(init.body as string)
    return new Response('{"message":{"content":"ok"}}')
  }))
  const messages = [{ role: 'system', content: 'Complete only the assigned task.' }, { role: 'user', content: 'Summarize' }]
  await runProviderModel(provider, { ...bot, systemPrompt: 'You are a researcher.' }, messages)
  expect(body.messages).toEqual([{ role: 'system', content: 'You are a researcher.' }, ...messages])
  expect(messages).toHaveLength(2)
})

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
