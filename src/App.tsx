import { useEffect, useMemo, useRef, useState } from 'react'
import { BotsView } from './components/BotsView'
import { ChatView } from './components/ChatView'
import { ConsultDialog } from './components/ConsultDialog'
import { ExecutionBoard } from './components/ExecutionBoard'
import { LedgerView } from './components/LedgerView'
import { ModelsView } from './components/ModelsView'
import { SearchDialog } from './components/SearchDialog'
import { SettingsView } from './components/SettingsView'
import { Sidebar, type View } from './components/Sidebar'
import { Titlebar } from './components/Titlebar'
import { Toasts, type ToastData } from './components/Toast'
import { WebHarnessView } from './components/WebHarnessView'
import { createConversation, createStarterTeam, titleFromMessage, toMarkdown, uid } from './lib'
import type { AppSettings, AppState, Bot, Conversation, DecisionEngineStatus, LedgerNote, Message, OllamaModel, PullProgress, StreamEvent, WorkflowEvent, WorkflowManifest, WorkflowStartRequest, WorkspaceStatus } from './types'

const skepoIcon = new URL('../assets/brand/skepo-icon.png', import.meta.url).href

const emptyState: AppState = {
  bots: [], conversations: [],
  settings: { ollamaUrl: 'http://127.0.0.1:11434', theme: 'dark', sendOnEnter: true, compactMode: false, workspacePath: '', sharedMemoryEnabled: true, maxSharedNotes: 4, decisionMode: 'auto' },
}

export default function App() {
  const [state, setState] = useState<AppState>(emptyState)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeConversationId, setActiveConversationId] = useState<string>()
  const [preferredBotId, setPreferredBotId] = useState<string>()
  const [models, setModels] = useState<OllamaModel[]>([])
  const [connection, setConnection] = useState<{ connected: boolean; version?: string; error?: string; checking: boolean }>({ connected: false, checking: true })
  const [modelsLoading, setModelsLoading] = useState(false)
  const [pullProgress, setPullProgress] = useState<PullProgress>()
  const [searchOpen, setSearchOpen] = useState(false)
  const [consultOpen, setConsultOpen] = useState(false)
  const [consultBusy, setConsultBusy] = useState(false)
  const [ledgerStatus, setLedgerStatus] = useState<WorkspaceStatus>({ initialized: false, path: '', noteCount: 0, botCount: 0, recentNotes: [] })
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [workflows, setWorkflows] = useState<WorkflowManifest[]>([])
  const [workflowBusy, setWorkflowBusy] = useState(false)
  const [decisionStatus, setDecisionStatus] = useState<DecisionEngineStatus>({ configured: false, encryptionAvailable: true, model: 'jev-latest' })
  const [toasts, setToasts] = useState<ToastData[]>([])
  const activeRequest = useRef<{ requestId: string; conversationId: string; assistantId: string; bot: Bot; request: string; answer: string; title: string }>()
  const stateRef = useRef(state)
  stateRef.current = state

  const conversation = state.conversations.find(item => item.id === activeConversationId)
  const botId = conversation?.botId ?? preferredBotId ?? state.bots[0]?.id
  const bot = state.bots.find(item => item.id === botId)

  function toast(kind: ToastData['kind'], message: string) {
    const id = uid(); setToasts(items => [...items, { id, kind, message }]); window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4500)
  }

  async function refreshLedger(workspace = stateRef.current.settings.workspacePath) {
    if (!workspace) { setLedgerStatus({ initialized: false, path: '', noteCount: 0, botCount: 0, recentNotes: [] }); return }
    setLedgerLoading(true)
    try { setLedgerStatus(await window.localbot.workspaceStatus(workspace)) }
    catch (error) { toast('error', error instanceof Error ? error.message : String(error)) }
    finally { setLedgerLoading(false) }
  }

  async function refreshWorkflows(workspace = stateRef.current.settings.workspacePath) {
    if (!workspace) { setWorkflows([]); return }
    try { setWorkflows(await window.localbot.listWorkflows(workspace)) }
    catch (error) { toast('error', error instanceof Error ? error.message : String(error)) }
  }

  async function chooseWorkspace() {
    const selected = await window.localbot.selectWorkspace()
    if (!selected) return undefined
    try {
      const status = await window.localbot.initWorkspace(selected, stateRef.current.bots)
      setLedgerStatus(status)
      setState(current => ({ ...current, settings: { ...current.settings, workspacePath: selected } }))
      toast('success', 'Shared Ledger workspace initialized')
      await refreshWorkflows(selected)
      return selected
    } catch (error) { toast('error', error instanceof Error ? error.message : String(error)); return undefined }
  }

  async function refreshModels(url = stateRef.current.settings.ollamaUrl, quiet = false) {
    setModelsLoading(true)
    const status = await window.localbot.checkOllama(url)
    setConnection({ connected: status.ok, version: status.version, error: status.error, checking: false })
    if (!status.ok) { setModels([]); setModelsLoading(false); if (!quiet) toast('error', status.error ?? 'Ollama is not available'); return }
    try {
      const available = await window.localbot.listModels(url)
      setModels(available)
      if (available.length && stateRef.current.bots.length === 0) {
        const team = createStarterTeam(available[0].name)
        const next = { ...stateRef.current, bots: team }
        stateRef.current = next; setState(next); setPreferredBotId(team[0].id)
        if (next.settings.workspacePath) void window.localbot.syncWorkspaceBots(next.settings.workspacePath, team)
        if (!quiet) toast('success', `Starter team created with ${available[0].name}`)
      }
    }
    catch (error) { if (!quiet) toast('error', error instanceof Error ? error.message : String(error)) }
    finally { setModelsLoading(false) }
  }

  useEffect(() => {
    let alive = true
    window.localbot.loadState().then(saved => {
      if (!alive) return
      setState(saved); stateRef.current = saved; setPreferredBotId(saved.bots[0]?.id)
      const latest = [...saved.conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      setActiveConversationId(latest?.id); if (!saved.settings.workspacePath) setView('ledger'); setLoaded(true); void refreshModels(saved.settings.ollamaUrl, true); void window.localbot.decisionStatus().then(setDecisionStatus); if (saved.settings.workspacePath) { void refreshLedger(saved.settings.workspacePath); void refreshWorkflows(saved.settings.workspacePath) }
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => void window.localbot.saveState(state), 350)
    return () => window.clearTimeout(timer)
  }, [state, loaded])

  useEffect(() => {
    const root = document.documentElement
    const isDark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    root.dataset.theme = isDark ? 'dark' : 'light'
    root.classList.toggle('compact', state.settings.compactMode)
  }, [state.settings.theme, state.settings.compactMode])

  useEffect(() => window.localbot.onChatEvent((event: StreamEvent) => {
    const active = activeRequest.current
    if (!active || active.requestId !== event.requestId) return
    if (event.type === 'chunk') {
      active.answer += event.content
      setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === active.conversationId ? { ...item, updatedAt: Date.now(), messages: item.messages.map(message => message.id === active.assistantId ? { ...message, content: message.content + event.content } : message) } : item) }))
    } else if (event.type === 'done') {
      setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === active.conversationId ? { ...item, updatedAt: Date.now(), messages: item.messages.map(message => message.id === active.assistantId ? { ...message, tokensPerSecond: event.stats?.tokensPerSecond, totalDuration: event.stats?.totalDuration } : message) } : item) }))
      activeRequest.current = undefined
      const workspace = stateRef.current.settings.workspacePath
      if (workspace && active.answer.trim()) void window.localbot.recordLedgerWork(workspace, active.bot, active.conversationId, active.title, active.request, active.answer).then(() => refreshLedger(workspace)).catch(error => toast('error', `Ledger write failed: ${error instanceof Error ? error.message : String(error)}`))
    } else {
      setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === active.conversationId ? { ...item, messages: item.messages.map(message => message.id === active.assistantId ? { ...message, content: message.content || `Unable to respond: ${event.error}` } : message) } : item) }))
      activeRequest.current = undefined; toast('error', event.error)
    }
  }), [])

  useEffect(() => window.localbot.onPullProgress(progress => setPullProgress(progress)), [])

  useEffect(() => window.localbot.onWorkflowEvent((event: WorkflowEvent) => {
    if (event.type === 'updated') setWorkflows(current => [event.manifest, ...current.filter(item => item.sessionId !== event.manifest.sessionId)].sort((a,b) => b.startedAt - a.startedAt))
    else if (event.type === 'workspace-changed' && event.path === stateRef.current.settings.workspacePath) { void refreshLedger(event.path); void refreshWorkflows(event.path) }
    else if (event.type === 'error') toast('error', event.error)
  }), [])

  function openNewChat(botToUse = bot ?? state.bots[0]) {
    if (!botToUse) { setView('bots'); return }
    const next = createConversation(botToUse.id)
    setState(current => ({ ...current, conversations: [...current.conversations, next] }))
    setPreferredBotId(botToUse.id); setActiveConversationId(next.id); setView('chat')
  }

  function selectConversation(id: string) {
    const selected = state.conversations.find(item => item.id === id)
    if (selected) setPreferredBotId(selected.botId)
    setActiveConversationId(id); setView('chat'); setSearchOpen(false)
  }

  function selectBot(id: string) {
    const selected = state.bots.find(item => item.id === id)
    if (selected) openNewChat(selected)
  }

  function runGeneration(target: Conversation, selectedBot: Bot, requestMessages: Pick<Message, 'role' | 'content'>[], requestText: string) {
    if (activeRequest.current) return
    const assistant: Message = { id: uid(), role: 'assistant', content: '', createdAt: Date.now(), model: selectedBot.model }
    const requestId = uid()
    activeRequest.current = { requestId, conversationId: target.id, assistantId: assistant.id, bot: selectedBot, request: requestText, answer: '', title: target.title }
    setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === target.id ? { ...item, messages: [...item.messages, assistant], updatedAt: Date.now() } : item) }))
    void window.localbot.startChat({ requestId, bot: selectedBot, messages: requestMessages }, state.settings.ollamaUrl).catch(error => {
      activeRequest.current = undefined; toast('error', error instanceof Error ? error.message : String(error))
    })
  }

  async function sendMessage(content: string) {
    if (!bot || !bot.model || activeRequest.current) return
    let target = conversation
    if (!target) {
      target = createConversation(bot.id)
      setActiveConversationId(target.id)
    }
    const userMessage: Message = { id: uid(), role: 'user', content, createdAt: Date.now() }
    const prior = target.messages.filter(message => message.content)
    const updated: Conversation = { ...target, title: prior.length === 0 ? titleFromMessage(content) : target.title, messages: [...target.messages, userMessage], updatedAt: Date.now() }
    setState(current => ({ ...current, conversations: current.conversations.some(item => item.id === updated.id) ? current.conversations.map(item => item.id === updated.id ? updated : item) : [...current.conversations, updated] }))
    const requestMessages: Pick<Message, 'role' | 'content'>[] = [...prior, userMessage].map(({ role, content: text }) => ({ role, content: text }))
    const settings = stateRef.current.settings
    if (settings.workspacePath && settings.sharedMemoryEnabled) {
      try {
        const notes = await window.localbot.findLedgerNotes(settings.workspacePath, content, bot.id, settings.maxSharedNotes)
        if (notes.length) requestMessages.splice(Math.max(0, requestMessages.length - 1), 0, { role: 'system', content: ledgerPrompt(notes) })
      } catch (error) { toast('error', `Could not read Shared Ledger: ${error instanceof Error ? error.message : String(error)}`) }
    }
    runGeneration(updated, bot, requestMessages, content)
  }

  function regenerate() {
    if (!conversation || !bot || activeRequest.current) return
    const last = conversation.messages.at(-1)
    if (last?.role !== 'assistant') return
    const withoutAnswer = { ...conversation, messages: conversation.messages.slice(0, -1) }
    setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === conversation.id ? withoutAnswer : item) }))
    const lastUser = [...withoutAnswer.messages].reverse().find(message => message.role === 'user')?.content ?? 'Regenerate the previous response'
    runGeneration(withoutAnswer, bot, withoutAnswer.messages.map(({ role, content }) => ({ role, content })), lastUser)
  }

  async function consultBot(consultantId: string, task: string) {
    if (!bot || !conversation) return
    const consultant = stateRef.current.bots.find(item => item.id === consultantId)
    if (!consultant) return
    setConsultBusy(true)
    try {
      const settings = stateRef.current.settings
      const notes = settings.workspacePath ? await window.localbot.findLedgerNotes(settings.workspacePath, task, consultant.id, settings.maxSharedNotes) : []
      const response = await window.localbot.consultBot({ consultant, requester: bot, task, context: notes, ollamaUrl: settings.ollamaUrl })
      const handoff: Message = { id: uid(), role: 'assistant', content: `> **Handoff from ${consultant.name}**\n\n${response}`, createdAt: Date.now(), model: consultant.model }
      setState(current => ({ ...current, conversations: current.conversations.map(item => item.id === conversation.id ? { ...item, messages: [...item.messages, handoff], updatedAt: Date.now() } : item) }))
      if (settings.workspacePath) await window.localbot.recordHandoff(settings.workspacePath, bot, consultant, conversation.id, task, response)
      setConsultOpen(false); toast('success', `${consultant.name} handed off a second opinion`); void refreshLedger(settings.workspacePath)
    } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) }
    finally { setConsultBusy(false) }
  }

  async function stopGeneration() {
    const active = activeRequest.current
    if (active) await window.localbot.stopChat(active.requestId)
  }

  function saveBot(saved: Bot) {
    setState(current => {
      const bots = current.bots.some(item => item.id === saved.id) ? current.bots.map(item => item.id === saved.id ? saved : item) : [...current.bots, saved]
      if (current.settings.workspacePath) void window.localbot.syncWorkspaceBots(current.settings.workspacePath, bots)
      return { ...current, bots }
    })
    setPreferredBotId(saved.id); toast('success', `${saved.name} saved`)
  }

  function deleteBot(id: string) {
    setState(current => {
      const bots = current.bots.filter(item => item.id !== id)
      if (current.settings.workspacePath) void window.localbot.syncWorkspaceBots(current.settings.workspacePath, bots)
      return { ...current, bots }
    })
  }

  function workflowRequest(workflow: WorkflowManifest): WorkflowStartRequest {
    return { workspacePath: stateRef.current.settings.workspacePath, ollamaUrl: stateRef.current.settings.ollamaUrl, goal: workflow.goal, orchestratorBotId: workflow.orchestratorBotId, reviewerBotId: workflow.reviewerBotId, workerBotIds: workflow.workerBotIds, bots: stateRef.current.bots, budget: workflow.budget }
  }

  async function startRun(request: WorkflowStartRequest) {
    setWorkflowBusy(true)
    try { const manifest = await window.localbot.startWorkflow(request); setWorkflows(current => [manifest, ...current.filter(item => item.sessionId !== manifest.sessionId)]); if (manifest.status === 'failed') toast('error', manifest.error ?? 'The broker could not build a plan'); else toast('success', manifest.status === 'awaiting_approval' ? 'Execution plan is ready for review' : 'Workflow started') }
    catch (error) { toast('error', error instanceof Error ? error.message : String(error)) }
    finally { setWorkflowBusy(false) }
  }

  async function pullModel(name: string) {
    setPullProgress({ status: `Starting ${name}…` })
    try { await window.localbot.pullModel(name, state.settings.ollamaUrl); toast('success', `${name} downloaded`); await refreshModels(state.settings.ollamaUrl, true) }
    catch (error) { toast('error', error instanceof Error ? error.message : String(error)) }
    finally { setPullProgress(undefined) }
  }

  const content = useMemo(() => {
    if (view === 'bots') return <BotsView bots={state.bots} models={models} onSave={saveBot} onDelete={deleteBot} onChat={selectBot} />
    if (view === 'models') return <ModelsView models={models} connected={connection.connected} version={connection.version} error={connection.error} loading={modelsLoading} pullProgress={pullProgress} onRefresh={() => void refreshModels()} onPull={pullModel} onDelete={async name => { try { await window.localbot.deleteModel(name, state.settings.ollamaUrl); toast('success', `${name} deleted`); await refreshModels(state.settings.ollamaUrl, true) } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) } }} />
    if (view === 'ledger') return <LedgerView status={ledgerStatus} loading={ledgerLoading} onChoose={() => void chooseWorkspace()} onRefresh={() => void refreshLedger()} onOpen={() => void window.localbot.openWorkspace(state.settings.workspacePath)} onSettings={() => setView('settings')} />
    if (view === 'runs') return <ExecutionBoard bots={state.bots} workflows={workflows} workspacePath={state.settings.workspacePath} ollamaUrl={state.settings.ollamaUrl} decisionMode={state.settings.decisionMode} connected={connection.connected} busy={workflowBusy} onStart={startRun} onRefresh={() => void refreshWorkflows()} onSetupWorkspace={() => setView('ledger')} onApprove={async workflow => { setWorkflowBusy(true); try { await window.localbot.approveWorkflow(workflowRequest(workflow), workflow.sessionId); toast('success', 'Plan approved; workers are starting') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) } finally { setWorkflowBusy(false) } }} onPause={async (workflow, paused) => { try { if (paused) await window.localbot.pauseWorkflow(state.settings.workspacePath, workflow.sessionId, true); else await window.localbot.approveWorkflow(workflowRequest(workflow), workflow.sessionId); toast('success', paused ? 'Workflow paused' : 'Workflow resumed') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) } }} onCancel={async workflow => { if (!confirm('Cancel this workflow? Pending work will stop.')) return; try { await window.localbot.cancelWorkflow(state.settings.workspacePath, workflow.sessionId); toast('success', 'Workflow cancelled') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) } }} onRetry={async (workflow, taskId) => { try { await window.localbot.retryWorkflowTask(workflowRequest(workflow), workflow.sessionId, taskId); toast('success', 'Task queued for retry') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)) } }} />
    if (view === 'web') return <WebHarnessView bots={state.bots} workspacePath={state.settings.workspacePath} ollamaUrl={state.settings.ollamaUrl} connected={connection.connected} onSetupWorkspace={() => setView('ledger')} onError={message => toast('error', message)} />
    if (view === 'settings') return <SettingsView settings={state.settings} status={connection} decisionStatus={decisionStatus} onSetJevKey={async key => { try { const result = await window.localbot.setJevApiKey(key); setDecisionStatus(result); toast('success', 'Jev API key saved') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)); throw error } }} onClearJevKey={async () => { try { const result = await window.localbot.clearJevApiKey(); setDecisionStatus(result); toast('success', 'Jev key removed; local decisions remain active') } catch (error) { toast('error', error instanceof Error ? error.message : String(error)); throw error } }} onChooseWorkspace={chooseWorkspace} onTest={url => { setConnection(current => ({ ...current, checking: true })); void refreshModels(url) }} onSave={(settings: AppSettings) => { setState(current => ({ ...current, settings })); toast('success', 'Settings saved'); void refreshModels(settings.ollamaUrl, true); if (settings.workspacePath) void window.localbot.initWorkspace(settings.workspacePath, state.bots).then(setLedgerStatus); else setLedgerStatus({ initialized: false, path: '', noteCount: 0, botCount: 0, recentNotes: [] }) }} />
    return <ChatView bot={bot} conversation={conversation} bots={state.bots} streaming={!!activeRequest.current} sendOnEnter={state.settings.sendOnEnter} ledgerEnabled={!!state.settings.workspacePath && state.settings.sharedMemoryEnabled} onConsult={() => setConsultOpen(true)} onSelectBot={selectBot} onSend={content => void sendMessage(content)} onStop={() => void stopGeneration()} onRegenerate={regenerate} onDelete={() => { if (conversation && confirm('Delete this conversation?')) { setState(current => ({ ...current, conversations: current.conversations.filter(item => item.id !== conversation.id) })); setActiveConversationId(undefined) } }} onExport={() => { if (conversation) void window.localbot.exportConversation(toMarkdown(conversation, bot), conversation.title) }} onOpenBots={() => setView('bots')} />
  }, [view, state, models, connection, modelsLoading, pullProgress, activeConversationId, preferredBotId, ledgerStatus, ledgerLoading, workflows, workflowBusy, decisionStatus])

  if (!loaded) return <div className="app-loading"><span className="app-mark large"><img src={skepoIcon} alt="" /></span><p>Opening your workspace…</p></div>
  return <div className="app-shell">
    <Titlebar />
    <div className="app-body">
      <Sidebar collapsed={sidebarCollapsed} view={view} bots={state.bots} conversations={state.conversations} activeConversationId={activeConversationId} onToggle={() => setSidebarCollapsed(value => !value)} onView={setView} onNewChat={() => openNewChat()} onSelectConversation={selectConversation} onSearch={() => setSearchOpen(true)} />
      {content}
    </div>
    {searchOpen && <SearchDialog conversations={state.conversations} bots={state.bots} onClose={() => setSearchOpen(false)} onSelect={selectConversation} />}
    {consultOpen && bot && <ConsultDialog requester={bot} bots={state.bots} busy={consultBusy} onClose={() => setConsultOpen(false)} onConsult={(consultantId, task) => void consultBot(consultantId, task)} />}
    <Toasts items={toasts} onDismiss={id => setToasts(items => items.filter(item => item.id !== id))} />
  </div>
}

function ledgerPrompt(notes: LedgerNote[]) {
  return `Shared Ledger context selected locally for this request. Treat these as concise prior work, verify them against the current task, and do not repeat work that is already complete.\n\n${notes.map((note, index) => `[Card ${index + 1}] ${note.botName} — ${note.title}\nRequest: ${note.request}\nOutcome: ${note.outcome}`).join('\n\n')}`
}
