export interface SystemOneChoiceRequest { endpoint: string; model: string; state: unknown; instructions: string; options: Record<string, string>; authorization?: string; timeoutMs?: number }
export interface SystemOneChoice { choice: string; confidence: number }

export function parseSystemOneChoice(value: unknown, options: Record<string, string>): SystemOneChoice {
  const answer = (value as { answers?: { decision?: { choice?: string; probabilities?: Record<string, number>; confidence?: number; answer_confidence?: number } } })?.answers?.decision
  if (!answer?.choice || !(answer.choice in options)) throw new Error('Decision engine returned an invalid choice.')
  const confidence = answer.answer_confidence ?? answer.probabilities?.[answer.choice] ?? answer.confidence ?? 0
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('Decision engine returned invalid confidence.')
  return { choice: answer.choice, confidence }
}

export async function requestSystemOneChoice(request: SystemOneChoiceRequest): Promise<SystemOneChoice> {
  const endpoint = request.endpoint.trim().replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (request.authorization) headers.Authorization = request.authorization
  const response = await fetch(`${endpoint}/v1/systemone`, {
    method: 'POST', headers, signal: AbortSignal.timeout(request.timeoutMs ?? 45_000),
    body: JSON.stringify({ model: request.model, state: request.state, questions: { decision: { type: 'choice', instructions: request.instructions, criteria: request.options } } }),
  })
  if (!response.ok) throw new Error(`Decision engine returned HTTP ${response.status}`)
  return parseSystemOneChoice(await response.json(), request.options)
}
