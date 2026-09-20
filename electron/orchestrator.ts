import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Bot, LedgerNote, WorkflowManifest, WorkflowStartRequest, WorkflowTask } from '../src/types'

export type ModelResult = { content: string; tokens: number }
export type ModelRunner = (bot: Bot, messages: { role: string; content: string }[], ollamaUrl: string, timeoutMs?: number) => Promise<ModelResult>
export type WorkflowEmitter = (manifest: WorkflowManifest) => void
export type NoteFinder = (workspace: string, query: string, botId: string, limit: number) => Promise<LedgerNote[]>

const active = new Map<string, { cancelled: boolean; paused: boolean; wake?: () => void }>()
const writeQueues = new Map<string, Promise<void>>()
const riskyActionPattern = /\b(delete|remove|erase|overwrite|publish|post|send|email|message|purchase|pay|buy|deploy|install|uninstall|credential|password|account|permission|share|upload|cancel subscription)\b/i

function root(workspace: string) {
  const resolved = path.resolve(workspace)
  const current = path.join(resolved, '.skepo-ledger')
  const legacy = path.join(resolved, '.localbot-ledger')
  return existsSync(current) || !existsSync(legacy) ? current : legacy
}
function sessionFolder(workspace: string, sessionId: string) { return path.join(root(workspace), 'sessions', sessionId) }
function manifestPath(workspace: string, sessionId: string) { return path.join(sessionFolder(workspace, sessionId), 'manifest.json') }

async function atomicWrite(file: string, content: string) {
  const previous = writeQueues.get(file) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(async () => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const temp = `${file}.${randomUUID()}.tmp`
    await fs.writeFile(temp, content, 'utf8')
    await fs.rename(temp, file)
  })
  writeQueues.set(file, operation)
  try { await operation } finally { if (writeQueues.get(file) === operation) writeQueues.delete(file) }
}

async function saveManifest(workspace: string, manifest: WorkflowManifest, emit: WorkflowEmitter) {
  manifest.revision += 1
  manifest.updatedAt = Date.now()
  await atomicWrite(manifestPath(workspace, manifest.sessionId), JSON.stringify(manifest, null, 2))
  await atomicWrite(path.join(sessionFolder(workspace, manifest.sessionId), 'STATE.md'), stateMarkdown(manifest))
  emit(structuredClone(manifest))
}

function stateMarkdown(manifest: WorkflowManifest) {
  return `# ${manifest.goal}\n\n## System state\n\n- Session: \`${manifest.sessionId}\`\n- Status: **${manifest.status}**\n- Revision: ${manifest.revision}\n- Tokens: ${manifest.tokensUsed} / ${manifest.budget.maxTotalTokens}\n- Updated: ${new Date(manifest.updatedAt).toISOString()}\n\n## Execution board\n\n| Task | Bot | Dependencies | Status | Attempts | Tokens |\n|---|---|---|---|---:|---:|\n${manifest.tasks.map(t => `| ${t.id}: ${t.title.replace(/\|/g, '\\|')} | ${t.assignedBotId} | ${t.dependencies.join(', ') || '—'} | ${t.status} | ${t.attempts} | ${t.tokenCount} |`).join('\n')}\n\n${manifest.finalOutput ? `## Final output\n\n${manifest.finalOutput}\n` : ''}`
}

function taskMarkdown(task: WorkflowTask) {
  return `---\nid: ${task.id}\nstatus: ${task.status}\nrevision: ${task.revision}\nassigned_bot: ${task.assignedBotId}\ndependencies: [${task.dependencies.join(', ')}]\nrisk: ${task.risk}\nattempts: ${task.attempts}\ntokens: ${task.tokenCount}\n---\n\n# ${task.title}\n\n## Assignment\n\n${task.description}\n\n${task.result ? `## Result\n\n${task.result}\n` : ''}${task.error ? `## Error\n\n${task.error}\n` : ''}`
}

async function saveTask(workspace: string, sessionId: string, task: WorkflowTask) {
  task.revision += 1
  await atomicWrite(path.join(sessionFolder(workspace, sessionId), 'tasks', `${task.id}.md`), taskMarkdown(task))
}

function extractObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]
  const source = fenced ?? text
  const start = source.indexOf('{'), end = source.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('The broker did not return a valid JSON plan.')
  return JSON.parse(source.slice(start, end + 1)) as { tasks?: unknown[] }
}

function normalizePlan(raw: { tasks?: unknown[] }, request: WorkflowStartRequest): WorkflowTask[] {
  const input = Array.isArray(raw.tasks) ? raw.tasks.slice(0, request.budget.maxTasks) : []
  if (!input.length) throw new Error('The broker returned an empty task plan.')
  const oldToNew = new Map<string, string>()
  input.forEach((entry, index) => oldToNew.set(String((entry as Record<string, unknown>).id ?? index + 1), `task-${String(index + 1).padStart(3, '0')}`))
  return input.map((entry, index) => {
    const item = entry as Record<string, unknown>
    const id = `task-${String(index + 1).padStart(3, '0')}`
    const worker = request.workerBotIds.includes(String(item.assignedBotId)) ? String(item.assignedBotId) : request.workerBotIds[index % request.workerBotIds.length]
    const dependencies = (Array.isArray(item.dependencies) ? item.dependencies : []).map(value => oldToNew.get(String(value))).filter((value): value is string => !!value).filter(value => Number(value.slice(-3)) < index + 1)
    const description = String(item.description ?? item.action ?? '').slice(0, 1800)
    const title = String(item.title ?? `Task ${index + 1}`).slice(0, 100)
    const risk = item.risk === 'review' || riskyActionPattern.test(`${title} ${description}`) ? 'review' : 'safe'
    return { id, title, description, assignedBotId: worker, dependencies: [...new Set(dependencies)], status: risk === 'review' ? 'awaiting_approval' : 'pending', risk, requiresApproval: risk === 'review', attempts: 0, revision: 0, tokenCount: 0 }
  })
}

function botById(request: WorkflowStartRequest, id: string) {
  const bot = request.bots.find(item => item.id === id)
  if (!bot) throw new Error(`Bot ${id} is not available.`)
  return bot
}

function contextFrom(notes: LedgerNote[]) {
  return notes.length ? `\n\nRelevant Shared Ledger cards:\n${notes.map(note => `- ${note.botName} / ${note.title}: ${note.outcome}`).join('\n')}` : ''
}

async function waitWhilePaused(sessionId: string) {
  const control = active.get(sessionId)
  if (!control?.paused) return
  await new Promise<void>(resolve => { if (control) control.wake = resolve })
}

function enforceLimits(manifest: WorkflowManifest) {
  if (manifest.tokensUsed >= manifest.budget.maxTotalTokens) throw new Error('Workflow token budget reached.')
  if (Date.now() - manifest.startedAt >= manifest.budget.timeoutMinutes * 60_000) throw new Error('Workflow time budget reached.')
  if (active.get(manifest.sessionId)?.cancelled) throw new Error('Workflow cancelled.')
}

export async function startWorkflow(request: WorkflowStartRequest, runModel: ModelRunner, findNotes: NoteFinder, emit: WorkflowEmitter) {
  if (!request.workspacePath) throw new Error('Choose a Shared Ledger workspace first.')
  if (!request.goal.trim()) throw new Error('Enter a workflow goal.')
  if (!request.workerBotIds.length) throw new Error('Select at least one worker bot.')
  const sessionId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`
  const now = Date.now()
  const manifest: WorkflowManifest = { version: 1, revision: 0, sessionId, goal: request.goal.trim(), status: 'planning', orchestratorBotId: request.orchestratorBotId, reviewerBotId: request.reviewerBotId, workerBotIds: request.workerBotIds, tasks: [], budget: request.budget, tokensUsed: 0, startedAt: now, updatedAt: now }
  active.set(sessionId, { cancelled: false, paused: false })
  await fs.mkdir(path.join(sessionFolder(request.workspacePath, sessionId), 'tasks'), { recursive: true })
  await atomicWrite(path.join(sessionFolder(request.workspacePath, sessionId), 'decisions.md'), `# Decisions — ${request.goal}\n\n`)
  await saveManifest(request.workspacePath, manifest, emit)
  try {
    const broker = botById(request, request.orchestratorBotId)
    const workers = request.workerBotIds.map(id => botById(request, id)).map(bot => ({ id: bot.id, name: bot.name, description: bot.description }))
    const planning = await runModel(broker, [
      { role: 'system', content: `${broker.systemPrompt}\n\nYou are the workflow broker. Return JSON only. Decompose the goal into a small dependency graph. Assign each task to an available bot ID. Mark risk as "review" if a task could change external state, delete/overwrite data, publish, spend money, or needs a human decision; otherwise "safe".` },
      { role: 'user', content: `Goal: ${request.goal}\nAvailable workers: ${JSON.stringify(workers)}\nReturn {"tasks":[{"id":"1","title":"...","description":"specific deliverable","assignedBotId":"...","dependencies":[],"risk":"safe|review"}]}. Maximum ${request.budget.maxTasks} tasks. Dependencies may reference only earlier task IDs.` },
    ], request.ollamaUrl, 180_000)
    manifest.tokensUsed += planning.tokens
    manifest.tasks = normalizePlan(extractObject(planning.content), request)
    for (const task of manifest.tasks) await saveTask(request.workspacePath, sessionId, task)
    manifest.status = request.budget.approvePlan || manifest.tasks.some(task => task.requiresApproval) ? 'awaiting_approval' : 'running'
    await saveManifest(request.workspacePath, manifest, emit)
    if (manifest.status === 'running') void runWorkflow(request, manifest, runModel, findNotes, emit)
    else active.delete(sessionId)
    return manifest
  } catch (error) {
    manifest.status = 'failed'; manifest.error = error instanceof Error ? error.message : String(error)
    await saveManifest(request.workspacePath, manifest, emit); active.delete(sessionId); return manifest
  }
}

async function executeTask(request: WorkflowStartRequest, manifest: WorkflowManifest, task: WorkflowTask, runModel: ModelRunner, findNotes: NoteFinder, emit: WorkflowEmitter) {
  const control = active.get(manifest.sessionId)
  if (!control || control.cancelled) return
  const worker = botById(request, task.assignedBotId)
  task.status = 'running'; task.attempts += 1; task.startedAt = Date.now(); task.error = undefined
  task.lease = { id: randomUUID(), acquiredAt: Date.now(), expiresAt: Date.now() + 10 * 60_000 }
  await saveTask(request.workspacePath, manifest.sessionId, task); await saveManifest(request.workspacePath, manifest, emit)
  try {
    const dependencyResults = task.dependencies.map(id => manifest.tasks.find(item => item.id === id)).filter((item): item is WorkflowTask => !!item).map(item => `${item.title}: ${item.result}`).join('\n\n')
    const notes = await findNotes(request.workspacePath, `${manifest.goal} ${task.title} ${task.description}`, worker.id, 3)
    const result = await runModel(worker, [
      { role: 'system', content: `${worker.systemPrompt}\n\nYou are a worker in a bounded local workflow. Complete only your assigned task. Return a concise deliverable with assumptions, evidence, decisions, and next-step information. Do not claim to modify files or external systems.` },
      { role: 'user', content: `Global goal: ${manifest.goal}\n\nAssigned task: ${task.title}\n${task.description}${dependencyResults ? `\n\nCompleted dependencies:\n${dependencyResults}` : ''}${contextFrom(notes)}` },
    ], request.ollamaUrl, Math.max(60_000, request.budget.timeoutMinutes * 60_000))
    task.result = result.content; task.tokenCount += result.tokens; manifest.tokensUsed += result.tokens; task.status = 'completed'; task.completedAt = Date.now(); task.lease = undefined
  } catch (error) {
    task.error = error instanceof Error ? error.message : String(error); task.lease = undefined
    task.status = task.attempts <= manifest.budget.maxRetries ? 'pending' : 'failed'
  }
  if (control.cancelled) { task.status = 'cancelled'; task.lease = undefined; manifest.status = 'cancelled' }
  else if (control.paused) manifest.status = 'paused'
  await saveTask(request.workspacePath, manifest.sessionId, task); await saveManifest(request.workspacePath, manifest, emit)
}

export async function runWorkflow(request: WorkflowStartRequest, manifest: WorkflowManifest, runModel: ModelRunner, findNotes: NoteFinder, emit: WorkflowEmitter) {
  const control = active.get(manifest.sessionId) ?? { cancelled: false, paused: false }
  active.set(manifest.sessionId, control)
  manifest.status = 'running'; await saveManifest(request.workspacePath, manifest, emit)
  try {
    while (manifest.tasks.some(task => !['completed','cancelled'].includes(task.status))) {
      enforceLimits(manifest)
      const wasPaused = active.get(manifest.sessionId)?.paused === true
      await waitWhilePaused(manifest.sessionId); enforceLimits(manifest)
      if (wasPaused) { manifest.status = 'running'; await saveManifest(request.workspacePath, manifest, emit) }
      const failedIds = new Set(manifest.tasks.filter(task => task.status === 'failed' || task.status === 'blocked').map(task => task.id))
      for (const task of manifest.tasks) if (task.status === 'pending' && task.dependencies.some(id => failedIds.has(id))) { task.status = 'blocked'; task.error = 'A dependency failed.'; await saveTask(request.workspacePath, manifest.sessionId, task) }
      const awaiting = manifest.tasks.some(task => task.status === 'awaiting_approval')
      if (awaiting) { manifest.status = 'awaiting_approval'; await saveManifest(request.workspacePath, manifest, emit); return }
      const ready = manifest.tasks.filter(task => task.status === 'pending' && task.dependencies.every(id => manifest.tasks.find(item => item.id === id)?.status === 'completed'))
      if (!ready.length) {
        if (manifest.tasks.some(task => task.status === 'failed' || task.status === 'blocked')) throw new Error('Workflow stopped because one or more tasks failed or became blocked.')
        throw new Error('Workflow has no executable tasks. Check its dependency graph.')
      }
      await Promise.all(ready.slice(0, manifest.budget.maxParallel).map(task => executeTask(request, manifest, task, runModel, findNotes, emit)))
    }
    enforceLimits(manifest); manifest.status = 'reviewing'; await saveManifest(request.workspacePath, manifest, emit)
    const reviewer = botById(request, request.reviewerBotId)
    const outputs = manifest.tasks.map(task => `## ${task.title}\n${task.result ?? 'No result'}`).join('\n\n')
    const review = await runModel(reviewer, [
      { role: 'system', content: `${reviewer.systemPrompt}\n\nYou are the final reviewer. Reconcile the worker outputs, call out conflicts or uncertainty, and produce one coherent result for the user's goal. Do not invent work that was not completed.` },
      { role: 'user', content: `Goal: ${manifest.goal}\n\nWorker outputs:\n${outputs}` },
    ], request.ollamaUrl, 180_000)
    manifest.tokensUsed += review.tokens; manifest.finalOutput = review.content; manifest.status = 'completed'; manifest.completedAt = Date.now()
    await fs.appendFile(path.join(sessionFolder(request.workspacePath, manifest.sessionId), 'decisions.md'), `## Final review — ${new Date().toISOString()}\n\n${review.content}\n\n`, 'utf8')
    await saveManifest(request.workspacePath, manifest, emit)
  } catch (error) {
    const cancelled = active.get(manifest.sessionId)?.cancelled
    manifest.status = cancelled ? 'cancelled' : 'failed'; manifest.error = error instanceof Error ? error.message : String(error); manifest.completedAt = Date.now()
    if (cancelled) for (const task of manifest.tasks) if (['pending','running','awaiting_approval'].includes(task.status)) task.status = 'cancelled'
    await saveManifest(request.workspacePath, manifest, emit)
  } finally { active.delete(manifest.sessionId) }
}

export async function listWorkflows(workspace: string) {
  try {
    const entries = await fs.readdir(path.join(root(workspace), 'sessions'), { withFileTypes: true })
    const manifests = await Promise.all(entries.filter(e => e.isDirectory()).map(async e => {
      try { return JSON.parse(await fs.readFile(manifestPath(workspace, e.name), 'utf8')) as WorkflowManifest } catch { return undefined }
    }))
    return manifests.filter((item): item is WorkflowManifest => !!item).map(item => {
      if (['planning','running','reviewing'].includes(item.status) && !active.has(item.sessionId)) return { ...item, status: 'paused' as const, error: 'Run was interrupted. Resume to reclaim expired task leases.' }
      return item
    }).sort((a,b) => b.startedAt - a.startedAt)
  } catch { return [] }
}

export async function loadWorkflow(workspace: string, sessionId: string) {
  return JSON.parse(await fs.readFile(manifestPath(workspace, sessionId), 'utf8')) as WorkflowManifest
}

export function pauseWorkflow(sessionId: string) { const control = active.get(sessionId); if (control) control.paused = true }
export function resumeWorkflow(sessionId: string) { const control = active.get(sessionId); if (control) { control.paused = false; control.wake?.(); control.wake = undefined } }
export function cancelWorkflow(sessionId: string) { const control = active.get(sessionId); if (control) { control.cancelled = true; control.paused = false; control.wake?.() } }

export async function approveWorkflow(request: WorkflowStartRequest, sessionId: string, runModel: ModelRunner, findNotes: NoteFinder, emit: WorkflowEmitter) {
  const manifest = await loadWorkflow(request.workspacePath, sessionId)
  const wasActive = active.has(sessionId)
  for (const task of manifest.tasks) if (task.status === 'awaiting_approval') { task.status = 'pending'; await saveTask(request.workspacePath, sessionId, task) }
  if (!wasActive) for (const task of manifest.tasks) if (task.status === 'running') { task.status = 'pending'; task.lease = undefined; task.error = 'Recovered after an interrupted run.'; await saveTask(request.workspacePath, sessionId, task) }
  manifest.status = 'running'
  if (wasActive) resumeWorkflow(sessionId); else active.set(sessionId, { cancelled: false, paused: false })
  await saveManifest(request.workspacePath, manifest, emit)
  if (!wasActive) void runWorkflow(request, manifest, runModel, findNotes, emit)
  return manifest
}

export async function setManifestPaused(workspace: string, sessionId: string, paused: boolean, emit: WorkflowEmitter) {
  const manifest = await loadWorkflow(workspace, sessionId)
  manifest.status = paused ? 'paused' : 'running'; paused ? pauseWorkflow(sessionId) : resumeWorkflow(sessionId)
  await saveManifest(workspace, manifest, emit); return manifest
}

export async function setManifestCancelled(workspace: string, sessionId: string, emit: WorkflowEmitter) {
  cancelWorkflow(sessionId)
  const manifest = await loadWorkflow(workspace, sessionId)
  manifest.status = 'cancelled'; manifest.completedAt = Date.now()
  for (const task of manifest.tasks) if (['pending','running','awaiting_approval'].includes(task.status)) task.status = 'cancelled'
  await saveManifest(workspace, manifest, emit); return manifest
}

export async function retryWorkflowTask(request: WorkflowStartRequest, sessionId: string, taskId: string, runModel: ModelRunner, findNotes: NoteFinder, emit: WorkflowEmitter) {
  const manifest = await loadWorkflow(request.workspacePath, sessionId)
  const task = manifest.tasks.find(item => item.id === taskId)
  if (!task) throw new Error('Task not found.')
  task.status = 'pending'; task.error = undefined; task.attempts = 0
  for (const dependent of manifest.tasks) if (dependent.status === 'blocked' && dependent.dependencies.includes(taskId)) { dependent.status = 'pending'; dependent.error = undefined }
  active.set(sessionId, { cancelled: false, paused: false }); await saveTask(request.workspacePath, sessionId, task); void runWorkflow(request, manifest, runModel, findNotes, emit); return manifest
}
