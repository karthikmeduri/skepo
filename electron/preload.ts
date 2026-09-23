type AppState = import('../src/types').AppState
type Bot = import('../src/types').Bot
type ChatRequest = import('../src/types').ChatRequest
type ConsultationRequest = import('../src/types').ConsultationRequest
type PullProgress = import('../src/types').PullProgress
type StreamEvent = import('../src/types').StreamEvent
type WorkflowEvent = import('../src/types').WorkflowEvent
type WorkflowStartRequest = import('../src/types').WorkflowStartRequest
type DecisionEngineStatus = import('../src/types').DecisionEngineStatus

// Sandboxed Electron preload scripts execute in a CommonJS-like environment.
// Keep the runtime import as require() even though the application package is ESM.
const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron')

contextBridge.exposeInMainWorld('localbot', {
  loadState: () => ipcRenderer.invoke('state:load'),
  saveState: (state: AppState) => ipcRenderer.invoke('state:save', state),
  decisionStatus: (): Promise<DecisionEngineStatus> => ipcRenderer.invoke('decision:status'),
  setJevApiKey: (apiKey: string): Promise<DecisionEngineStatus> => ipcRenderer.invoke('decision:set-key', apiKey),
  clearJevApiKey: (): Promise<DecisionEngineStatus> => ipcRenderer.invoke('decision:clear-key'),
  listModels: (url: string) => ipcRenderer.invoke('ollama:models', url),
  checkOllama: (url: string) => ipcRenderer.invoke('ollama:check', url),
  startChat: (request: ChatRequest, url: string) => ipcRenderer.invoke('ollama:chat', request, url),
  stopChat: (requestId: string) => ipcRenderer.invoke('ollama:stop', requestId),
  onChatEvent: (callback: (event: StreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: StreamEvent) => callback(data)
    ipcRenderer.on('ollama:chat-event', listener)
    return () => ipcRenderer.removeListener('ollama:chat-event', listener)
  },
  pullModel: (name: string, url: string) => ipcRenderer.invoke('ollama:pull', name, url),
  onPullProgress: (callback: (progress: PullProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: PullProgress) => callback(data)
    ipcRenderer.on('ollama:pull-progress', listener)
    return () => ipcRenderer.removeListener('ollama:pull-progress', listener)
  },
  deleteModel: (name: string, url: string) => ipcRenderer.invoke('ollama:delete', name, url),
  exportConversation: (markdown: string, suggestedName: string) => ipcRenderer.invoke('conversation:export', markdown, suggestedName),
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),
  initWorkspace: (path: string, bots: Bot[]) => ipcRenderer.invoke('workspace:init', path, bots),
  syncWorkspaceBots: (path: string, bots: Bot[]) => ipcRenderer.invoke('workspace:sync-bots', path, bots),
  workspaceStatus: (path: string) => ipcRenderer.invoke('workspace:status', path),
  findLedgerNotes: (path: string, query: string, botId: string, limit: number) => ipcRenderer.invoke('workspace:find-notes', path, query, botId, limit),
  recordLedgerWork: (path: string, bot: Bot, conversationId: string, title: string, request: string, outcome: string) => ipcRenderer.invoke('workspace:record-work', path, bot, conversationId, title, request, outcome),
  consultBot: (request: ConsultationRequest) => ipcRenderer.invoke('ollama:consult', request),
  recordHandoff: (path: string, requester: Bot, consultant: Bot, conversationId: string, task: string, response: string) => ipcRenderer.invoke('workspace:record-handoff', path, requester, consultant, conversationId, task, response),
  openWorkspace: (path: string) => ipcRenderer.invoke('workspace:open', path),
  listWorkflows: (path: string) => ipcRenderer.invoke('workflow:list', path),
  startWorkflow: (request: WorkflowStartRequest) => ipcRenderer.invoke('workflow:start', request),
  approveWorkflow: (request: WorkflowStartRequest, sessionId: string) => ipcRenderer.invoke('workflow:approve', request, sessionId),
  pauseWorkflow: (path: string, sessionId: string, paused: boolean) => ipcRenderer.invoke('workflow:pause', path, sessionId, paused),
  cancelWorkflow: (path: string, sessionId: string) => ipcRenderer.invoke('workflow:cancel', path, sessionId),
  retryWorkflowTask: (request: WorkflowStartRequest, sessionId: string, taskId: string) => ipcRenderer.invoke('workflow:retry-task', request, sessionId, taskId),
  onWorkflowEvent: (callback: (event: WorkflowEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkflowEvent) => callback(data)
    ipcRenderer.on('workflow:event', listener)
    return () => ipcRenderer.removeListener('workflow:event', listener)
  },
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),
})
