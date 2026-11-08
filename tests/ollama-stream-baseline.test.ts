import { afterEach, expect, it, vi } from 'vitest'
import type { Bot, ModelProvider } from '../src/types'
import { runProviderModel } from '../electron/model-provider'

vi.mock('../electron/provider-vault.js', () => ({ getProviderKey: vi.fn() }))
afterEach(() => vi.unstubAllGlobals())

// Run this file alone for comparable observations. No timing pass/fail threshold.
it('measures the Ollama adapter with a fixed in-memory streaming workload', async () => {
  const provider: ModelProvider = { id: 'fixture', name: 'Fixture', kind: 'ollama', baseUrl: 'http://localhost', enabled: true }
  const bot: Bot = { id: 'fixture', name: 'Fixture', model: 'fixture', description: '', avatarColor: '', systemPrompt: '', temperature: 0, topP: 1, contextLength: 4096, createdAt: 0, updatedAt: 0 }
  const fragment = 'test🌻'
  const parts = 128
  const wire = new TextEncoder().encode((JSON.stringify({ message: { content: fragment }, done: false }) + '\n').repeat(parts)
    + JSON.stringify({ done: true, prompt_eval_count: 16, eval_count: 128 }) + '\n')
  vi.stubGlobal('fetch', async () => {
    let offset = 0
    return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
      if (offset >= wire.length) { controller.close(); return }
      controller.enqueue(wire.subarray(offset, offset + 127))
      offset += 127
    } }))
  })
  async function sample() {
    let callbacks = 0
    const start = performance.now()
    const result = await runProviderModel(provider, bot, [], 10000, () => { callbacks++ })
    const elapsed = performance.now() - start
    expect(callbacks).toBe(parts)
    expect(result).toEqual({ content: fragment.repeat(parts), tokens: 144 })
    return elapsed
  }
  const first = await sample()
  const before = process.cpuUsage()
  const rssStart = process.memoryUsage.rss()
  let rssMax = rssStart
  const warm: number[] = []
  for (let i = 0; i < 30; i++) {
    warm.push(await sample())
    rssMax = Math.max(rssMax, process.memoryUsage.rss())
  }
  const cpu = process.cpuUsage(before)
  warm.sort((a, b) => a - b)
  const ms = (v: number) => Number(v.toFixed(3))
  console.info('Ollama fixture baseline', JSON.stringify({ node: process.version, platform: process.platform,
    arch: process.arch, payloadBytes: wire.length, warmRuns: warm.length, firstMs: ms(first),
    warmP50Ms: ms(warm[14]), warmP95Ms: ms(warm[28]), warmCpuMs: ms((cpu.user + cpu.system) / 1000),
    rssStartBytes: rssStart, maxSampledRssBytes: rssMax }))
})
