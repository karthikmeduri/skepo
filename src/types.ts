export type Role = 'user' | 'assistant' | 'system'

export interface Bot {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  avatarColor: string
  temperature: number
  topP: number
  contextLength: number
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  role: Role
  content: string
  createdAt: number
  model?: string
  tokensPerSecond?: number
  totalDuration?: number
}

export interface Conversation {
  id: string
  botId: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  ollamaUrl: string
  theme: 'dark' | 'light' | 'system'
  sendOnEnter: boolean
  compactMode: boolean
  workspacePath: string
  sharedMemoryEnabled: boolean
  maxSharedNotes: number
  decisionMode: DecisionMode
}

export interface OllamaModel {
  name: string
  model: string
  size: number
  digest: string
  modified_at: string
  details?: { parameter_size?: string; quantization_level?: string; family?: string }
}

export interface AppState {
  bots: Bot[]
  conversations: Conversation[]
  settings: AppSettings
}

export type StreamEvent =
  | { type: 'chunk'; requestId: string; content: string }
  | { type: 'done'; requestId: string; stats?: { tokensPerSecond?: number; totalDuration?: number } }
  | { type: 'error'; requestId: string; error: string }

export interface ChatRequest {
  requestId: string
  bot: Bot
  messages: Pick<Message, 'role' | 'content'>[]
}

export interface PullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export interface LedgerNote {
  id: string
  botId: string
  botName: string
  conversationId: string
  title: string
  request: string
  outcome: string
  keywords: string[]
  createdAt: number
  relativePath: string
  kind: 'work' | 'handoff'
  fromBotName?: string
  toBotName?: string
}

export interface WorkspaceStatus {
  initialized: boolean
  path: string
  noteCount: number
  botCount: number
  recentNotes: LedgerNote[]
  error?: string
}

export interface ConsultationRequest {
  consultant: Bot
  requester: Bot
  task: string
  context: LedgerNote[]
  ollamaUrl: string
}

export type WorkflowStatus = 'planning' | 'awaiting_approval' | 'running' | 'paused' | 'reviewing' | 'completed' | 'failed' | 'cancelled'
export type WorkflowTaskStatus = 'pending' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled'

export interface WorkflowBudget {
  maxTasks: number
  maxParallel: number
  maxRetries: number
  maxTotalTokens: number
  timeoutMinutes: number
  approvePlan: boolean
  decisionMode: DecisionMode
}

export type DecisionMode = 'auto' | 'local' | 'jev'
export type DecisionProvider = 'jev' | 'local' | 'local-fallback'

export interface DecisionRecord {
  id: string
  kind: 'plan-gate' | 'result-check'
  provider: DecisionProvider
  choice: string
  confidence: number
  taskId?: string
  createdAt: number
  note?: string
}

export interface DecisionEngineStatus {
  configured: boolean
  encryptionAvailable: boolean
  model: string
}

export interface WorkflowTask {
  id: string
  title: string
  description: string
  assignedBotId: string
  dependencies: string[]
  status: WorkflowTaskStatus
  risk: 'safe' | 'review'
  requiresApproval: boolean
  attempts: number
  revision: number
  lease?: { id: string; acquiredAt: number; expiresAt: number }
  result?: string
  error?: string
  tokenCount: number
  startedAt?: number
  completedAt?: number
}

export interface WorkflowManifest {
  version: 1
  revision: number
  sessionId: string
  goal: string
  status: WorkflowStatus
  orchestratorBotId: string
  reviewerBotId: string
  workerBotIds: string[]
  tasks: WorkflowTask[]
  budget: WorkflowBudget
  tokensUsed: number
  decisions: DecisionRecord[]
  startedAt: number
  updatedAt: number
  completedAt?: number
  finalOutput?: string
  error?: string
}

export interface WorkflowStartRequest {
  workspacePath: string
  ollamaUrl: string
  goal: string
  orchestratorBotId: string
  reviewerBotId: string
  workerBotIds: string[]
  bots: Bot[]
  budget: WorkflowBudget
}

export type WorkflowEvent =
  | { type: 'updated'; manifest: WorkflowManifest }
  | { type: 'workspace-changed'; path: string }
  | { type: 'error'; sessionId?: string; error: string }
