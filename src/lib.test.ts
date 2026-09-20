import { describe, expect, it } from 'vitest'
import { createBot, createConversation, formatBytes, titleFromMessage, toMarkdown } from './lib'

describe('local data helpers', () => {
  it('creates a bot with safe generation defaults', () => {
    const bot = createBot('llama3.2:3b')
    expect(bot.model).toBe('llama3.2:3b')
    expect(bot.temperature).toBeGreaterThanOrEqual(0)
    expect(bot.contextLength).toBe(8192)
  })

  it('creates and truncates a conversation title', () => {
    expect(titleFromMessage('  Hello   local world  ')).toBe('Hello local world')
    expect(titleFromMessage('a'.repeat(60))).toBe(`${'a'.repeat(48)}…`)
  })

  it('exports a readable markdown transcript', () => {
    const bot = createBot('qwen2.5')
    bot.name = 'Coder'
    const conversation = createConversation(bot.id)
    conversation.title = 'Test chat'
    conversation.messages.push({ id: '1', role: 'user', content: 'Hello', createdAt: 1 })
    expect(toMarkdown(conversation, bot)).toContain('# Test chat')
    expect(toMarkdown(conversation, bot)).toContain('## You\n\nHello')
  })

  it('formats model file sizes', () => {
    expect(formatBytes(1024 ** 3 * 4)).toBe('4.0 GB')
  })
})
