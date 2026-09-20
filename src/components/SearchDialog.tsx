import { Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Bot, Conversation } from '../types'

export function SearchDialog({ conversations, bots, onClose, onSelect }: { conversations: Conversation[]; bots: Bot[]; onClose(): void; onSelect(id: string): void }) {
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const normalized = query.toLowerCase()
  const results = conversations.filter(item => item.title.toLowerCase().includes(normalized) || item.messages.some(m => m.content.toLowerCase().includes(normalized))).slice(0, 20)
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="search-dialog" role="dialog" aria-modal="true" aria-label="Search conversations">
      <div className="search-input"><Search size={19} /><input ref={input} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your conversations…" /><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="search-results">
        {results.map(item => <button key={item.id} onClick={() => onSelect(item.id)}>
          <strong>{item.title}</strong><span>{bots.find(bot => bot.id === item.botId)?.name ?? 'Unknown bot'} · {item.messages.length} messages</span>
        </button>)}
        {results.length === 0 && <p>{query ? 'No matching conversations' : 'Type to search titles and messages'}</p>}
      </div>
    </section>
  </div>
}
