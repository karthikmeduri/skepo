import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DecisionEngineStatus, DecisionMode, DecisionRecord } from '../src/types'
import { checkLaya, ensureLaya, touchLaya } from './laya-runtime.js'
import { requestSystemOneChoice } from './system-one.js'

export interface DecisionRequest {
  kind: DecisionRecord['kind']
  mode: DecisionMode
  state: unknown
  instructions: string
  options: Record<string, string>
  taskId?: string
  layaEndpoint?: string
}

const model = 'jev-latest'

function secretPath() { return path.join(app.getPath('userData'), 'skepo-secrets.json') }

async function readKey() {
  try {
    const value = JSON.parse(await fs.readFile(secretPath(), 'utf8')) as { jevApiKey?: string }
    if (!value.jevApiKey || !safeStorage.isEncryptionAvailable()) return undefined
    return safeStorage.decryptString(Buffer.from(value.jevApiKey, 'base64'))
  } catch { return undefined }
}

export async function setJevApiKey(apiKey: string) {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Enter a TypeSafe API key.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable.')
  const destination = secretPath()
  const temp = `${destination}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(temp, JSON.stringify({ jevApiKey: safeStorage.encryptString(trimmed).toString('base64') }), 'utf8')
  await fs.rename(temp, destination)
  return decisionEngineStatus()
}

export async function clearJevApiKey() {
  await fs.rm(secretPath(), { force: true })
  return decisionEngineStatus()
}

export async function decisionEngineStatus(layaEndpoint = 'http://127.0.0.1:8000'): Promise<DecisionEngineStatus> {
  return { configured: !!await readKey(), encryptionAvailable: safeStorage.isEncryptionAvailable(), model, laya: await checkLaya(layaEndpoint) }
}

function localDecision(request: DecisionRequest, provider: DecisionRecord['provider'] = 'local', note?: string): DecisionRecord {
  const serialized = JSON.stringify(request.state).toLowerCase()
  let choice = Object.keys(request.options)[0] ?? 'review'
  let confidence = 0.76
  if (request.kind === 'plan-gate') {
    const risky = /\b(delete|remove|overwrite|publish|post|send|email|purchase|deploy|install|credential|password|permission|share|upload)\b/.test(serialized)
    choice = risky && 'review' in request.options ? 'review' : ('proceed' in request.options ? 'proceed' : choice)
    confidence = risky ? 0.92 : 0.82
  } else {
    const result = typeof request.state === 'object' && request.state && 'result' in request.state ? String((request.state as { result: unknown }).result).toLowerCase() : serialized
    const weak = result.trim().length < 80 || /\b(unable|cannot|could not|failed|missing|unknown)\b/.test(result)
    choice = weak && 'retry' in request.options ? 'retry' : ('accept' in request.options ? 'accept' : choice)
    confidence = weak ? 0.78 : 0.84
  }
  return { id: randomUUID(), kind: request.kind, provider, choice, confidence, taskId: request.taskId, createdAt: Date.now(), note }
}

async function jevDecision(request: DecisionRequest, apiKey: string): Promise<DecisionRecord> {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model,
      state: request.state,
      questions: { decision: { type: 'choice', instructions: request.instructions, criteria: request.options } },
    }),
  })
  if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}`)
  const value = await response.json() as { answers?: { decision?: { choice?: string; probabilities?: Record<string, number>; confidence?: number } } }
  const answer = value.answers?.decision
  if (!answer?.choice || !(answer.choice in request.options)) throw new Error('Jev returned an invalid decision.')
  const probability = answer.probabilities?.[answer.choice]
  return { id: randomUUID(), kind: request.kind, provider: 'jev', choice: answer.choice, confidence: answer.confidence ?? probability ?? 0, taskId: request.taskId, createdAt: Date.now() }
}

async function layaDecision(request: DecisionRequest): Promise<DecisionRecord> {
  const endpoint = request.layaEndpoint?.trim() || 'http://127.0.0.1:8000'
  await ensureLaya(endpoint)
  const answer = await requestSystemOneChoice({ endpoint, model: 'typed-decisions', state: request.state, instructions: request.instructions, options: request.options })
  const confidence = answer.confidence
  if (confidence < 0.55) throw new Error(`Laya confidence was below the Skepo threshold (${confidence.toFixed(2)}).`)
  touchLaya()
  return { id: randomUUID(), kind: request.kind, provider: 'laya', choice: answer.choice, confidence, taskId: request.taskId, createdAt: Date.now() }
}

export async function runDecision(request: DecisionRequest): Promise<DecisionRecord> {
  if (request.mode === 'local') return localDecision(request)
  const key = await readKey()
  const order: ('laya' | 'jev')[] = request.mode === 'jev' ? ['jev', 'laya'] : ['laya', 'jev']
  const failures: string[] = []
  for (const provider of order) {
    if (provider === 'jev' && !key) { failures.push('Jev is not configured'); continue }
    try {
      const decision = provider === 'laya' ? await layaDecision(request) : await jevDecision(request, key!)
      if (failures.length) decision.note = `Fallback selected after ${failures.join('; ')}.`
      return decision
    } catch (error) { failures.push(`${provider === 'laya' ? 'Laya' : 'Jev'} unavailable (${error instanceof Error ? error.message : String(error)})`) }
  }
  return localDecision(request, 'local-fallback', `${failures.join('; ')}; used the zero-token local gate.`)
}
