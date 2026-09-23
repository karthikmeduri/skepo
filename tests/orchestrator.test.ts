import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startWorkflow } from '../electron/orchestrator'
import type { Bot, WorkflowManifest, WorkflowStartRequest } from '../src/types'

const tempFolders: string[] = []
const makeBot = (id: string, name: string): Bot => ({ id, name, description: `${name} role`, model: 'test-model', systemPrompt: `You are ${name}.`, avatarColor: '#7c3aed', temperature: 0.2, topP: 0.9, contextLength: 4096, createdAt: 1, updatedAt: 1 })

afterEach(async () => { await Promise.all(tempFolders.splice(0).map(folder => fs.rm(folder, { recursive: true, force: true }))) })

describe('workflow orchestrator', () => {
  it('creates a bounded, dependency-safe, durable plan', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'skepo-workflow-'))
    tempFolders.push(workspace)
    const bots = [makeBot('broker', 'Broker'), makeBot('worker-a', 'Researcher'), makeBot('worker-b', 'Builder')]
    const request: WorkflowStartRequest = {
      workspacePath: workspace, ollamaUrl: 'http://test', goal: 'Produce a tested design', orchestratorBotId: 'broker', reviewerBotId: 'broker', workerBotIds: ['worker-a','worker-b'], bots,
      budget: { maxTasks: 2, maxParallel: 2, maxRetries: 1, maxTotalTokens: 5000, timeoutMinutes: 10, approvePlan: true, decisionMode: 'local' },
    }
    const updates: WorkflowManifest[] = []
    const manifest = await startWorkflow(request, async () => ({ content: JSON.stringify({ tasks: [
      { id: 'research', title: 'Publish research', description: 'Find constraints and publish the report', assignedBotId: 'worker-a', dependencies: [], risk: 'safe' },
      { id: 'build', title: 'Build', description: 'Create result', assignedBotId: 'worker-b', dependencies: ['research','future'], risk: 'safe' },
      { id: 'ignored', title: 'Over budget', description: 'Must be capped', dependencies: [] },
    ] }), tokens: 120 }), async () => [], update => updates.push(update))

    expect(manifest.status).toBe('awaiting_approval')
    expect(manifest.tasks).toHaveLength(2)
    expect(manifest.tasks[0].risk).toBe('review')
    expect(manifest.tasks[0].status).toBe('awaiting_approval')
    expect(manifest.tasks[1].dependencies).toEqual(['task-001'])
    expect(manifest.tokensUsed).toBe(120)
    const session = path.join(workspace, '.skepo-ledger', 'sessions', manifest.sessionId)
    await expect(fs.stat(path.join(session, 'manifest.json'))).resolves.toBeDefined()
    await expect(fs.readFile(path.join(session, 'STATE.md'), 'utf8')).resolves.toContain('Execution board')
    await expect(fs.readFile(path.join(session, 'tasks', 'task-002.md'), 'utf8')).resolves.toContain('dependencies: [task-001]')
    expect(updates.length).toBeGreaterThanOrEqual(2)
  })

  it('executes dependencies and produces a reviewed final result', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'skepo-run-'))
    tempFolders.push(workspace)
    const bots = [makeBot('broker', 'Broker'), makeBot('worker', 'Worker'), makeBot('reviewer', 'Reviewer')]
    const request: WorkflowStartRequest = {
      workspacePath: workspace, ollamaUrl: 'http://test', goal: 'Research then synthesize', orchestratorBotId: 'broker', reviewerBotId: 'reviewer', workerBotIds: ['worker'], bots,
      budget: { maxTasks: 4, maxParallel: 2, maxRetries: 0, maxTotalTokens: 5000, timeoutMinutes: 10, approvePlan: false, decisionMode: 'local' },
    }
    let calls = 0
    let finish!: (manifest: WorkflowManifest) => void
    const completed = new Promise<WorkflowManifest>(resolve => { finish = resolve })
    await startWorkflow(request, async bot => {
      calls += 1
      if (bot.id === 'broker') return { content: JSON.stringify({ tasks: [
        { id: 'a', title: 'Research', description: 'Collect facts', assignedBotId: 'worker', dependencies: [], risk: 'safe' },
        { id: 'b', title: 'Synthesize', description: 'Use the facts', assignedBotId: 'worker', dependencies: ['a'], risk: 'safe' },
      ] }), tokens: 10 }
      if (bot.id === 'reviewer') return { content: 'Final reviewed answer', tokens: 7 }
      return { content: `Worker result ${calls}`, tokens: 5 }
    }, async () => [], manifest => { if (manifest.status === 'completed') finish(manifest) }, async decision => ({ id: `${decision.kind}-${decision.taskId ?? 'plan'}`, kind: decision.kind, provider: 'local', choice: decision.kind === 'plan-gate' ? 'proceed' : 'accept', confidence: 0.9, taskId: decision.taskId, createdAt: Date.now() }))
    const result = await Promise.race([completed, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('workflow timeout')), 3000))])
    expect(result.tasks.every(task => task.status === 'completed')).toBe(true)
    expect(result.finalOutput).toBe('Final reviewed answer')
    expect(result.tokensUsed).toBe(27)
    expect(result.decisions).toHaveLength(3)
    await expect(fs.readFile(path.join(workspace, '.skepo-ledger', 'sessions', result.sessionId, 'decisions.md'), 'utf8')).resolves.toContain('result-check')
  })
})
