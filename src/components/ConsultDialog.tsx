import { Network, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Bot } from '../types'

export function ConsultDialog({ requester, bots, busy, onClose, onConsult }: { requester: Bot; bots: Bot[]; busy: boolean; onClose(): void; onConsult(botId: string, task: string): void }) {
  const available = bots.filter(bot => bot.id !== requester.id && bot.model)
  const [botId, setBotId] = useState(available[0]?.id ?? '')
  const [task, setTask] = useState('Review the current problem and provide a concise second opinion with risks and next actions.')
  useEffect(() => { const listener = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }; addEventListener('keydown', listener); return () => removeEventListener('keydown', listener) }, [busy, onClose])
  return <div className="modal-backdrop"><section className="consult-dialog" role="dialog" aria-modal="true" aria-label="Consult another bot">
    <header><div className="consult-icon"><Network size={21} /></div><div><h2>Ask another bot</h2><p>Create a compact, file-backed handoff instead of a long agent conversation.</p></div><button className="icon-button" onClick={onClose} disabled={busy} aria-label="Close"><X size={18} /></button></header>
    <div className="consult-body"><label>Consultant<select value={botId} onChange={e => setBotId(e.target.value)}>{available.map(bot => <option key={bot.id} value={bot.id}>{bot.name} · {bot.model}</option>)}</select></label><label>What should it help with?<textarea rows={5} value={task} onChange={e => setTask(e.target.value)} /></label><div className="consult-route"><span style={{ background: requester.avatarColor }}>{requester.name[0]}</span><i /><Network size={15} /><i /><span style={{ background: available.find(b => b.id === botId)?.avatarColor }}>{available.find(b => b.id === botId)?.name[0] ?? '?'}</span><p>{requester.name} will receive a synthesized Markdown handoff.</p></div></div>
    <footer><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="primary" disabled={!botId || !task.trim() || busy} onClick={() => onConsult(botId, task.trim())}>{busy ? 'Consulting…' : 'Create handoff'}</button></footer>
  </section></div>
}
