import type { AppState, Bot, ChatRequest, ConsultationRequest, LedgerNote, OllamaModel, PullProgress, StreamEvent, WorkflowEvent, WorkflowManifest, WorkflowStartRequest, WorkspaceStatus } from './types'

declare global {
  interface Window {
    localbot: {
      loadState(): Promise<AppState>
      saveState(state: AppState): Promise<void>
      listModels(url: string): Promise<OllamaModel[]>
      checkOllama(url: string): Promise<{ ok: boolean; version?: string; error?: string }>
      startChat(request: ChatRequest, url: string): Promise<void>
      stopChat(requestId: string): Promise<void>
      onChatEvent(callback: (event: StreamEvent) => void): () => void
      pullModel(name: string, url: string): Promise<void>
      onPullProgress(callback: (progress: PullProgress) => void): () => void
      deleteModel(name: string, url: string): Promise<void>
      exportConversation(markdown: string, suggestedName: string): Promise<boolean>
      selectWorkspace(): Promise<string | undefined>
      initWorkspace(path: string, bots: Bot[]): Promise<WorkspaceStatus>
      syncWorkspaceBots(path: string, bots: Bot[]): Promise<void>
      workspaceStatus(path: string): Promise<WorkspaceStatus>
      findLedgerNotes(path: string, query: string, botId: string, limit: number): Promise<LedgerNote[]>
      recordLedgerWork(path: string, bot: Bot, conversationId: string, title: string, request: string, outcome: string): Promise<LedgerNote>
      consultBot(request: ConsultationRequest): Promise<string>
      recordHandoff(path: string, requester: Bot, consultant: Bot, conversationId: string, task: string, response: string): Promise<LedgerNote>
      openWorkspace(path: string): Promise<void>
      listWorkflows(path: string): Promise<WorkflowManifest[]>
      startWorkflow(request: WorkflowStartRequest): Promise<WorkflowManifest>
      approveWorkflow(request: WorkflowStartRequest, sessionId: string): Promise<WorkflowManifest>
      pauseWorkflow(path: string, sessionId: string, paused: boolean): Promise<WorkflowManifest>
      cancelWorkflow(path: string, sessionId: string): Promise<WorkflowManifest>
      retryWorkflowTask(request: WorkflowStartRequest, sessionId: string, taskId: string): Promise<WorkflowManifest>
      onWorkflowEvent(callback: (event: WorkflowEvent) => void): () => void
      windowMinimize(): void
      windowMaximize(): void
      windowClose(): void
    }
  }
}

export {}
