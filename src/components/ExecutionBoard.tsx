import { AlertTriangle, Bot as BotIcon, BrainCircuit, Check, CheckCircle2, ChevronRight, Circle, Clock3, Network, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Square, XCircle, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Bot, DecisionMode, WorkflowBudget, WorkflowManifest, WorkflowStartRequest, WorkflowTask } from '../types'

interface Props {
  bots: Bot[]
  workflows: WorkflowManifest[]
  workspacePath: string
  ollamaUrl: string
  connected: boolean
  decisionMode: DecisionMode
  busy: boolean
  onStart(request: WorkflowStartRequest): Promise<void>
  onApprove(workflow: WorkflowManifest): Promise<void>
  onPause(workflow: WorkflowManifest, paused: boolean): Promise<void>
  onCancel(workflow: WorkflowManifest): Promise<void>
  onRetry(workflow: WorkflowManifest, taskId: string): Promise<void>
  onRefresh(): void
  onSetupWorkspace(): void
}

const defaultBudget: WorkflowBudget = { maxTasks: 8, maxParallel: 2, maxRetries: 1, maxTotalTokens: 24_000, timeoutMinutes: 30, approvePlan: true, decisionMode: 'auto' }

export function ExecutionBoard(props: Props) {
  const [selectedId, setSelectedId] = useState<string>()
  const [composerOpen, setComposerOpen] = useState(false)
  const selected = props.workflows.find(item => item.sessionId === selectedId) ?? props.workflows[0]

  if (!props.workspacePath) return <main className="page-view runs-page"><section className="empty-card runs-empty"><div className="empty-icon"><Network size={26} /></div><h2>Set up the Shared Ledger first</h2><p>Autonomous runs need a durable workspace for manifests, task leases, decisions, and results.</p><button className="primary" onClick={props.onSetupWorkspace}>Choose workspace</button></section></main>

  return <main className="page-view runs-page">
    <div className="page-heading"><div><span className="eyebrow">Bounded autonomy</span><h1>Execution Board</h1><p>Plan, approve, and observe multi-bot workflows running through Ollama.</p></div><div className="heading-actions"><button className="secondary" onClick={props.onRefresh}><RefreshCw size={16} />Refresh</button><button className="primary" onClick={() => setComposerOpen(true)} disabled={!props.connected || props.bots.length === 0}><Zap size={16} />New run</button></div></div>
    <div className="execution-layout">
      <aside className="run-list"><div className="run-list-label">Sessions <span>{props.workflows.length}</span></div>{props.workflows.length === 0 ? <div className="no-runs"><Network size={22} /><span>No workflows yet</span><small>Start with a goal and let the broker build a plan.</small></div> : props.workflows.map(run => <button key={run.sessionId} className={selected?.sessionId === run.sessionId ? 'active' : ''} onClick={() => setSelectedId(run.sessionId)}><div><StatusDot status={run.status} /><strong>{run.goal}</strong></div><span>{run.tasks.filter(t => t.status === 'completed').length}/{run.tasks.length} tasks · {run.status.replace('_',' ')}</span></button>)}</aside>
      <section className="run-detail">{selected ? <RunDetail workflow={selected} bots={props.bots} busy={props.busy} onApprove={() => props.onApprove(selected)} onPause={paused => props.onPause(selected, paused)} onCancel={() => props.onCancel(selected)} onRetry={taskId => props.onRetry(selected, taskId)} /> : <div className="run-welcome"><div className="run-network"><BotIcon size={23} /><i /><BotIcon size={20} /><i /><ShieldCheck size={23} /></div><h2>From goal to reviewed result</h2><p>The broker creates a dependency graph, workers execute ready tasks, and a reviewer reconciles the final output. Every transition is written to disk.</p><button className="primary" onClick={() => setComposerOpen(true)} disabled={!props.connected}><Zap size={16} />Create your first run</button></div>}</section>
    </div>
    {composerOpen && <RunComposer bots={props.bots} workspacePath={props.workspacePath} ollamaUrl={props.ollamaUrl} decisionMode={props.decisionMode} busy={props.busy} onClose={() => setComposerOpen(false)} onStart={async request => { await props.onStart(request); setComposerOpen(false) }} />}
  </main>
}

function RunComposer({ bots, workspacePath, ollamaUrl, decisionMode, busy, onClose, onStart }: { bots: Bot[]; workspacePath: string; ollamaUrl: string; decisionMode: DecisionMode; busy: boolean; onClose(): void; onStart(request: WorkflowStartRequest): Promise<void> }) {
  const usable = bots.filter(bot => bot.model)
  const [goal, setGoal] = useState('')
  const [orchestratorBotId, setOrchestrator] = useState(usable[0]?.id ?? '')
  const [reviewerBotId, setReviewer] = useState(usable[1]?.id ?? usable[0]?.id ?? '')
  const [workerBotIds, setWorkers] = useState<string[]>(usable.map(bot => bot.id))
  const [budget, setBudget] = useState({ ...defaultBudget, decisionMode })
  const valid = goal.trim() && orchestratorBotId && reviewerBotId && workerBotIds.length
  function toggleWorker(id: string) { setWorkers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  return <div className="modal-backdrop"><section className="run-composer" role="dialog" aria-modal="true" aria-label="Create autonomous workflow"><header><div><span className="eyebrow">New autonomous run</span><h2>What should the team accomplish?</h2></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><XCircle size={19} /></button></header><div className="run-composer-body">
    <label>Goal<textarea rows={4} autoFocus value={goal} onChange={e => setGoal(e.target.value)} placeholder="Describe a concrete outcome. The broker will create a bounded task graph…" /></label>
    <div className="form-grid two"><label>Broker bot<select value={orchestratorBotId} onChange={e => setOrchestrator(e.target.value)}>{usable.map(bot => <option key={bot.id} value={bot.id}>{bot.name} · {bot.model}</option>)}</select></label><label>Reviewer bot<select value={reviewerBotId} onChange={e => setReviewer(e.target.value)}>{usable.map(bot => <option key={bot.id} value={bot.id}>{bot.name} · {bot.model}</option>)}</select></label></div>
    <fieldset><legend>Workers</legend><div className="worker-picker">{usable.map(bot => <button type="button" key={bot.id} className={workerBotIds.includes(bot.id) ? 'selected' : ''} onClick={() => toggleWorker(bot.id)}><span className="avatar small" style={{ background: bot.avatarColor }}>{bot.name[0]}</span><span><strong>{bot.name}</strong><small>{bot.model}</small></span>{workerBotIds.includes(bot.id) && <Check size={15} />}</button>)}</div></fieldset>
    <details><summary>Budgets and safety</summary><div className="budget-grid"><NumberField label="Maximum tasks" value={budget.maxTasks} min={1} max={20} onChange={maxTasks => setBudget({ ...budget, maxTasks })} /><NumberField label="Parallel workers" value={budget.maxParallel} min={1} max={4} onChange={maxParallel => setBudget({ ...budget, maxParallel })} /><NumberField label="Retries per task" value={budget.maxRetries} min={0} max={3} onChange={maxRetries => setBudget({ ...budget, maxRetries })} /><NumberField label="Token budget" value={budget.maxTotalTokens} min={2000} max={200000} step={1000} onChange={maxTotalTokens => setBudget({ ...budget, maxTotalTokens })} /><NumberField label="Time limit (minutes)" value={budget.timeoutMinutes} min={5} max={240} step={5} onChange={timeoutMinutes => setBudget({ ...budget, timeoutMinutes })} /><label>Decision engine<select value={budget.decisionMode} onChange={e => setBudget({ ...budget, decisionMode: e.target.value as WorkflowBudget['decisionMode'] })}><option value="auto">Auto</option><option value="local">Local only</option><option value="jev">Prefer Jev</option></select></label><label className="approval-check"><input type="checkbox" checked={budget.approvePlan} onChange={e => setBudget({ ...budget, approvePlan: e.target.checked })} /><span><strong>Review plan before execution</strong><small>Recommended for every autonomous run.</small></span></label></div></details>
  </div><footer><div><ShieldCheck size={15} />Risky tasks always require approval.</div><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={!valid || busy} onClick={() => onStart({ workspacePath, ollamaUrl, goal: goal.trim(), orchestratorBotId, reviewerBotId, workerBotIds, bots, budget })}>{busy ? 'Broker is planning…' : 'Build execution plan'}</button></footer></section></div>
}

function RunDetail({ workflow, bots, busy, onApprove, onPause, onCancel, onRetry }: { workflow: WorkflowManifest; bots: Bot[]; busy: boolean; onApprove(): void; onPause(paused: boolean): void; onCancel(): void; onRetry(taskId: string): void }) {
  const completed = workflow.tasks.filter(task => task.status === 'completed').length
  const percent = workflow.tasks.length ? Math.round(completed / workflow.tasks.length * 100) : 0
  const active = ['planning','running','reviewing','paused','awaiting_approval'].includes(workflow.status)
  return <div className="run-detail-inner"><header className="run-title"><div><StatusDot status={workflow.status} /><span>{workflow.status.replace('_',' ')}</span><h2>{workflow.goal}</h2><p>Session {workflow.sessionId}</p></div><div className="run-controls">{workflow.status === 'awaiting_approval' && <button className="primary" onClick={onApprove} disabled={busy}><ShieldCheck size={16} />Approve plan</button>}{workflow.status === 'running' && <button className="secondary" onClick={() => onPause(true)}><Pause size={15} />Pause</button>}{workflow.status === 'paused' && <button className="primary" onClick={() => onPause(false)}><Play size={15} />Resume</button>}{active && workflow.status !== 'cancelled' && <button className="secondary danger" onClick={onCancel}><Square size={14} />Cancel</button>}</div></header>
    <div className="run-progress"><div><span>{completed} of {workflow.tasks.length} tasks completed</span><strong>{percent}%</strong></div><div><i style={{ width: `${percent}%` }} /></div></div>
    <div className="budget-strip"><span><Zap size={13} />{workflow.tokensUsed.toLocaleString()} / {workflow.budget.maxTotalTokens.toLocaleString()} tokens</span><span><Clock3 size={13} />{workflow.budget.timeoutMinutes} min limit</span><span><Network size={13} />{workflow.budget.maxParallel} parallel</span><span><BrainCircuit size={13} />{workflow.budget.decisionMode ?? 'auto'} decisions</span></div>
    {workflow.decisions?.length > 0 && <div className="decision-trail"><strong><BrainCircuit size={15} />Decision trail</strong>{workflow.decisions.slice(-6).map(decision => <span key={decision.id} className={`decision-pill ${decision.provider}`}><b>{decision.provider === 'jev' ? 'Jev' : 'Local'}</b>{decision.taskId ? `${decision.taskId} · ` : ''}{decision.choice} · {Math.round(decision.confidence * 100)}%</span>)}</div>}
    {workflow.status === 'awaiting_approval' && <div className="approval-banner"><AlertTriangle size={20} /><div><strong>Human approval required</strong><span>Review the task graph and any amber risk labels before letting the team continue.</span></div></div>}
    <div className="task-stack">{workflow.tasks.map(task => <TaskCard key={task.id} task={task} bot={bots.find(bot => bot.id === task.assignedBotId)} onRetry={() => onRetry(task.id)} />)}</div>
    {workflow.finalOutput && <section className="final-output"><div className="final-heading"><CheckCircle2 size={19} /><div><strong>Reviewed final output</strong><span>Synthesized after all worker tasks completed</span></div></div><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{workflow.finalOutput}</ReactMarkdown></div></section>}
    {workflow.error && <div className="run-error"><XCircle size={17} /><span>{workflow.error}</span></div>}
  </div>
}

function TaskCard({ task, bot, onRetry }: { task: WorkflowTask; bot?: Bot; onRetry(): void }) {
  const [expanded, setExpanded] = useState(false)
  const icon = task.status === 'completed' ? <CheckCircle2 size={16} /> : task.status === 'running' ? <RefreshCw size={16} className="spinning" /> : task.status === 'failed' || task.status === 'blocked' ? <XCircle size={16} /> : task.status === 'awaiting_approval' ? <ShieldCheck size={16} /> : <Circle size={16} />
  return <article className={`task-card ${task.status}`}><button className="task-summary" onClick={() => setExpanded(value => !value)}><span className="task-status-icon">{icon}</span><span className="task-main"><span><code>{task.id}</code>{task.risk === 'review' && <b>Review</b>}</span><strong>{task.title}</strong><small>{bot?.name ?? 'Unknown bot'}{task.dependencies.length ? ` · waits for ${task.dependencies.join(', ')}` : ' · ready independently'}</small></span><span className="task-metrics">{task.tokenCount ? `${task.tokenCount.toLocaleString()} tokens` : task.status.replace('_',' ')}<ChevronRight className={expanded ? 'rotated' : ''} size={17} /></span></button>{expanded && <div className="task-expanded"><p>{task.description}</p>{task.result && <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown></div>}{task.error && <div className="task-error">{task.error}</div>}{(task.status === 'failed' || task.status === 'blocked') && <button className="secondary" onClick={onRetry}><RotateCcw size={14} />Retry task</button>}</div>}</article>
}

function StatusDot({ status }: { status: WorkflowManifest['status'] }) { return <i className={`status-dot ${status}`} /> }
function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange(value: number): void }) { return <label>{label}<input type="number" value={value} min={min} max={max} step={step} onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))} /></label> }
