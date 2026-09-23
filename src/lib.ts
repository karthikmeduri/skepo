import type { Bot, Conversation, Message } from './types'

export const uid = () => crypto.randomUUID()

export const colors = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777']

export function createBot(model = ''): Bot {
  const now = Date.now()
  return {
    id: uid(), name: 'New bot', description: 'A private local assistant', model,
    systemPrompt: 'You are a helpful, accurate assistant. Be concise and clear.',
    avatarColor: colors[Math.floor(Math.random() * colors.length)], temperature: 0.7,
    topP: 0.9, contextLength: 8192, createdAt: now, updatedAt: now,
  }
}

export function createStarterTeam(model: string): Bot[] {
  const now = Date.now()
  const roles = [
    ['Broker', 'Plans bounded work and coordinates the team.', 'You are the team broker. Decompose goals into dependency-safe tasks, assign the best specialist, minimize duplicated work, and surface risk early.', '#7c3aed', 0.2],
    ['Researcher', 'Finds evidence, constraints, and prior work.', 'You are a careful researcher. Inspect the supplied evidence and Shared Ledger context, distinguish facts from assumptions, and produce concise findings another bot can use.', '#0891b2', 0.25],
    ['Builder', 'Turns approved plans into concrete deliverables.', 'You are a pragmatic builder. Produce implementation-ready output, respect the exact assignment boundary, verify your work, and leave a compact continuation note.', '#059669', 0.2],
    ['Reviewer', 'Reconciles results and catches conflicts.', 'You are the final reviewer. Reconcile worker outputs, identify conflicts or missing evidence, and return one coherent, verified result without inventing completed work.', '#d97706', 0.15],
  ] as const
  return roles.map(([name, description, systemPrompt, avatarColor, temperature]) => ({
    id: uid(), name, description, model, systemPrompt, avatarColor, temperature,
    topP: 0.9, contextLength: 8192, createdAt: now, updatedAt: now,
  }))
}

export function createConversation(botId: string): Conversation {
  const now = Date.now()
  return { id: uid(), botId, title: 'New conversation', messages: [], createdAt: now, updatedAt: now }
}

export function titleFromMessage(message: string) {
  const clean = message.replace(/\s+/g, ' ').trim()
  return clean.length > 48 ? `${clean.slice(0, 48)}…` : clean || 'New conversation'
}

export function toMarkdown(conversation: Conversation, bot?: Bot) {
  const heading = `# ${conversation.title}\n\n_Bot: ${bot?.name ?? 'Unknown'} · Model: ${bot?.model ?? 'Unknown'}_\n\n`
  return heading + conversation.messages.map((message: Message) =>
    `## ${message.role === 'user' ? 'You' : bot?.name ?? 'Assistant'}\n\n${message.content}\n`,
  ).join('\n')
}

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index > 2 ? 1 : 0)} ${units[index]}`
}

export function formatRelative(timestamp: number) {
  const distance = Date.now() - timestamp
  if (distance < 60_000) return 'now'
  if (distance < 3_600_000) return `${Math.floor(distance / 60_000)}m`
  if (distance < 86_400_000) return `${Math.floor(distance / 3_600_000)}h`
  if (distance < 604_800_000) return `${Math.floor(distance / 86_400_000)}d`
  return new Date(timestamp).toLocaleDateString()
}
