import { ArrowDown, Bot as BotIcon, BookOpen, ChevronDown, Copy, Download, MoreHorizontal, Network, RefreshCw, Send, Square, Trash2 } from 'lucide-react'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Bot, Conversation } from '../types'

interface Props {
  bot?: Bot
  conversation?: Conversation
  bots: Bot[]
  streaming: boolean
  sendOnEnter: boolean
  onSelectBot(botId: string): void
  onSend(content: string): void
  onStop(): void
  onRegenerate(): void
  onDelete(): void
  onExport(): void
  onOpenBots(): void
  onConsult(): void
  ledgerEnabled: boolean
}

export function ChatView(props: Props) {
  const [text, setText] = useState('')
  const [showBots, setShowBots] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState<string>()
  const [atBottom, setAtBottom] = useState(true)
  const scroller = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  const messages = props.conversation?.messages ?? []
  useEffect(() => {
    if (atBottom) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: props.streaming ? 'auto' : 'smooth' })
  }, [messages, props.streaming, atBottom])
  useEffect(() => setText(''), [props.conversation?.id])

  function submit() {
    const value = text.trim()
    if (!value || props.streaming || !props.bot?.model) return
    setText('')
    if (textarea.current) textarea.current.style.height = 'auto'
    props.onSend(value)
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const shouldSend = props.sendOnEnter ? event.key === 'Enter' && !event.shiftKey : event.key === 'Enter' && (event.ctrlKey || event.metaKey)
    if (shouldSend) { event.preventDefault(); submit() }
  }
  async function copy(id: string, content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(id); window.setTimeout(() => setCopied(undefined), 1500)
  }
  const suggestions = ['Help me brainstorm an idea', 'Explain a complex topic simply', 'Write and improve some code', 'Analyze text or a document']

  return <main className="chat-view">
    <div className="chat-header">
      <div className="bot-picker-wrap">
        <button className="bot-picker" onClick={() => setShowBots(!showBots)} disabled={props.bots.length === 0}>
          {props.bot ? <><span className="avatar small" style={{ background: props.bot.avatarColor }}>{props.bot.name.slice(0, 1).toUpperCase()}</span><span><strong>{props.bot.name}</strong><small>{props.bot.model || 'No model selected'}</small></span><ChevronDown size={16} /></> : <><BotIcon size={18} /><span><strong>No bot yet</strong><small>Create your first bot</small></span></>}
        </button>
        {showBots && <div className="popover bot-menu">{props.bots.map(bot => <button key={bot.id} onClick={() => { props.onSelectBot(bot.id); setShowBots(false) }}><span className="avatar small" style={{ background: bot.avatarColor }}>{bot.name[0]}</span><span><strong>{bot.name}</strong><small>{bot.model}</small></span></button>)}</div>}
      </div>
      <div className="chat-header-actions">{props.ledgerEnabled && <span className="ledger-on" title="Relevant Shared Ledger cards are added automatically"><BookOpen size={13} />Ledger on</span>}{props.conversation && props.bots.length > 1 && <button className="consult-button" onClick={props.onConsult} title="Ask another bot for a file-backed handoff"><Network size={16} />Consult</button>}{props.conversation && <div className="header-menu-wrap"><button className="icon-button" aria-label="Conversation menu" onClick={() => setShowMenu(!showMenu)}><MoreHorizontal size={20} /></button>{showMenu && <div className="popover action-menu"><button onClick={() => { props.onExport(); setShowMenu(false) }}><Download size={16} />Export Markdown</button><button className="danger" onClick={() => { props.onDelete(); setShowMenu(false) }}><Trash2 size={16} />Delete conversation</button></div>}</div>}</div>
    </div>
    <div className="messages" ref={scroller} onScroll={e => { const node = e.currentTarget; setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 120) }}>
      {messages.length === 0 ? <div className="welcome">
        <div className="welcome-mark"><span className="orb" /><SparkShape /></div>
        <h1>{props.bot ? `Chat with ${props.bot.name}` : 'Your private AI workspace'}</h1>
        <p>{props.bot ? props.bot.description : 'Create a bot, choose a model, and start a conversation that never leaves your computer.'}</p>
        {props.bots.length === 0 ? <button className="primary" onClick={props.onOpenBots}>Create your first bot</button> : props.bot?.model ? <div className="suggestions">{suggestions.map(item => <button key={item} onClick={() => props.onSend(item)}>{item}<Send size={14} /></button>)}</div> : <button className="primary" onClick={props.onOpenBots}>Choose a model</button>}
      </div> : <div className="message-column">
        {messages.map((message, index) => <article key={message.id} className={`message ${message.role}`}>
          <div className="message-avatar">{message.role === 'user' ? 'Y' : <span style={{ background: props.bot?.avatarColor }}>{props.bot?.name[0] ?? 'A'}</span>}</div>
          <div className="message-body"><div className="message-name">{message.role === 'user' ? 'You' : props.bot?.name ?? 'Assistant'}</div>
            <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (props.streaming && index === messages.length - 1 ? '▍' : '')}</ReactMarkdown></div>
            {message.content && <div className="message-actions"><button onClick={() => copy(message.id, message.content)}>{copied === message.id ? 'Copied' : <><Copy size={14} />Copy</>}</button>{message.role === 'assistant' && index === messages.length - 1 && !props.streaming && <button onClick={props.onRegenerate}><RefreshCw size={14} />Regenerate</button>}{message.tokensPerSecond && <span>{message.tokensPerSecond.toFixed(1)} tok/s</span>}</div>}
          </div>
        </article>)}
      </div>}
    </div>
    {!atBottom && <button className="scroll-bottom" aria-label="Scroll to latest" onClick={() => { setAtBottom(true); scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }}><ArrowDown size={18} /></button>}
    <div className="composer-area">
      <div className={`composer ${props.streaming ? 'busy' : ''}`}>
        <textarea ref={textarea} rows={1} value={text} disabled={!props.bot || !props.bot.model} placeholder={!props.bot ? 'Create a bot to begin' : !props.bot.model ? 'Choose a model for this bot' : `Message ${props.bot.name}…`} onChange={e => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 180)}px` }} onKeyDown={onKeyDown} />
        {props.streaming ? <button className="send-button stop" onClick={props.onStop} aria-label="Stop generating"><Square size={15} fill="currentColor" /></button> : <button className="send-button" onClick={submit} disabled={!text.trim() || !props.bot?.model} aria-label="Send message"><Send size={17} /></button>}
      </div>
      <p>{props.bot?.model ? `${props.bot.model} runs through Ollama on your device${props.ledgerEnabled ? ' · relevant ledger cards are shared locally' : ''}` : 'Connect Ollama and assign a model to begin'} · AI can make mistakes</p>
    </div>
  </main>
}

function SparkShape() { return <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1c1.2 8.6 6.4 13.8 15 15-8.6 1.2-13.8 6.4-15 15C14.8 22.4 9.6 17.2 1 16 9.6 14.8 14.8 9.6 16 1Z" /></svg> }
