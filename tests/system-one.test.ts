import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSystemOneChoice, requestSystemOneChoice } from '../electron/system-one'

const servers: ReturnType<typeof createServer>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))) })

describe('Laya System One contract', () => {
  it('sends the Jev-compatible choice contract to a local Laya endpoint', async () => {
    let received: any
    const server = createServer((request, response) => {
      let body = ''
      request.on('data', chunk => { body += chunk })
      request.on('end', () => {
        received = JSON.parse(body)
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ answers: { decision: { choice: 'proceed', confidence: 0.91, probabilities: { proceed: 0.91, review: 0.09 } } } }))
      })
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test port')
    const result = await requestSystemOneChoice({ endpoint: `http://127.0.0.1:${address.port}`, model: 'typed-decisions', state: { risk: 'safe' }, instructions: 'Gate this plan', options: { proceed: 'safe', review: 'uncertain' } })
    expect(result).toEqual({ choice: 'proceed', confidence: 0.91 })
    expect(received.model).toBe('typed-decisions')
    expect(received.questions.decision.type).toBe('choice')
    expect(received.questions.decision.criteria).toEqual({ proceed: 'safe', review: 'uncertain' })
  })

  it('rejects choices outside the application-owned option set', () => {
    expect(() => parseSystemOneChoice({ answers: { decision: { choice: 'delete_everything', confidence: 0.99 } } }, { proceed: 'safe', review: 'uncertain' })).toThrow(/invalid choice/)
  })

  it('uses Laya selected-answer confidence when both confidence fields are present', () => {
    expect(parseSystemOneChoice({ answers: { decision: { choice: 'accept', confidence: 0.16, answer_confidence: 0.61, probabilities: { accept: 0.61, retry: 0.39 } } } }, { accept: 'complete', retry: 'incomplete' }).confidence).toBe(0.61)
  })
})
