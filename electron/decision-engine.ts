import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DecisionEngineStatus, DecisionMode, DecisionRecord } from '../src/types'

export interface DecisionRequest {
  kind: DecisionRecord['kind']
  mode: DecisionMode
  state: unknown
  instructions: string
  options: Record<string, string>
  taskId?: string
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

export async function decisionEngineStatus(): Promise<DecisionEngineStatus> {
  return { configured: !!await readKey(), encryptionAvailable: safeStorage.isEncryptionAvailable(), model }
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

export async function runDecision(request: DecisionRequest): Promise<DecisionRecord> {
  if (request.mode === 'local') return localDecision(request)
  const key = await readKey()
  if (!key) return localDecision(request, request.mode === 'jev' ? 'local-fallback' : 'local', request.mode === 'jev' ? 'Jev is not configured; used the zero-token local gate.' : undefined)
  try { return await jevDecision(request, key) }
  catch (error) {
    const note = `Jev unavailable; local gate used (${error instanceof Error ? error.message : String(error)}).`
    return localDecision(request, 'local-fallback', note)
  }
}
