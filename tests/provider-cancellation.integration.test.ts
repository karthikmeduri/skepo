import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import type { Bot, ModelProvider } from '../src/types'

vi.mock('../electron/provider-vault.js', () => ({ getProviderKey: vi.fn(async () => 'fixture-key') }))
import { runProviderModel } from '../electron/model-provider'

const bot: Bot = { id: 'fixture', name: 'Fixture', description: '', model: 'fixture', systemPrompt: '', avatarColor: '', temperature: 0, topP: 1, contextLength: 4096, createdAt: 0, updatedAt: 0 }

describe('real HTTP response-body cancellation', () => {
  for (const kind of ['ollama', 'anthropic', 'openai-compatible'] as const) {
    it.each(['caller', 'deadline'] as const)(`${kind}: interrupts an open stream on %s cancellation`, async mode => {
      let notifyClosed!: () => void
      const closed = new Promise<void>(resolve => { notifyClosed = resolve })
      const server = createServer((request, response) => {
        request.resume()
        response.on('close', notifyClosed)
        response.writeHead(200, { 'Content-Type': kind === 'ollama' ? 'application/x-ndjson' : 'text/event-stream' })
        const packet = kind === 'ollama' ? { message: { content: 'partial' }, done: false }
          : kind === 'anthropic' ? { type: 'content_block_delta', delta: { text: 'partial' } }
            : { choices: [{ delta: { content: 'partial' } }] }
        response.write(kind === 'ollama' ? `${JSON.stringify(packet)}\n` : `data: ${JSON.stringify(packet)}\n\n`)
        // Deliberately remain open without a terminal marker or more bytes.
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      let closeTimer: ReturnType<typeof setTimeout> | undefined
      try {
        const provider: ModelProvider = { id: 'fixture', kind, name: 'Fixture', enabled: true, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
        const controller = new AbortController()
        const chunk = vi.fn(() => { if (mode === 'caller') controller.abort() })
        await expect(runProviderModel(provider, bot, [], mode === 'deadline' ? 500 : 3000, chunk, controller.signal)).rejects.toMatchObject({ name: mode === 'deadline' ? 'TimeoutError' : 'AbortError' })
        expect(chunk).toHaveBeenCalledTimes(1)
        expect(chunk).toHaveBeenCalledWith('partial')
        await Promise.race([closed, new Promise<never>((_, reject) => {
          closeTimer = setTimeout(() => reject(new Error('Client did not disconnect from fixture stream')), 1000)
        })])
      } finally {
        clearTimeout(closeTimer)
        server.closeAllConnections()
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      }
    })
  }
})
