import { Bot as BotIcon, Check, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Bot, OllamaModel } from '../types'
import { colors, createBot } from '../lib'

export function BotsView({ bots, models, onSave, onDelete, onChat }: { bots: Bot[]; models: OllamaModel[]; onSave(bot: Bot): void; onDelete(id: string): void; onChat(id: string): void }) {
  const [editing, setEditing] = useState<Bot>()
  return <main className="page-view">
    <div className="page-heading"><div><span className="eyebrow">Personalities</span><h1>Your bots</h1><p>Give each local model a purpose, personality, and set of instructions.</p></div><button className="primary" onClick={() => setEditing(createBot(models[0]?.name))}><Plus size={17} />Create bot</button></div>
    {bots.length === 0 ? <section className="empty-card"><div className="empty-icon"><BotIcon size={27} /></div><h2>Build your first bot</h2><p>A bot combines an Ollama model with your own system prompt and generation settings.</p><button className="primary" onClick={() => setEditing(createBot(models[0]?.name))}><Plus size={17} />Create bot</button></section> : <div className="bot-grid">{bots.map(bot => <article className="bot-card" key={bot.id}>
      <div className="bot-card-head"><span className="avatar large" style={{ background: bot.avatarColor }}>{bot.name[0].toUpperCase()}</span><div className="card-actions"><button className="icon-button" onClick={() => setEditing({ ...bot })} aria-label={`Edit ${bot.name}`}><Pencil size={16} /></button><button className="icon-button danger" onClick={() => { if (confirm(`Delete ${bot.name}? Its conversations will remain in history.`)) onDelete(bot.id) }} aria-label={`Delete ${bot.name}`}><Trash2 size={16} /></button></div></div>
      <h2>{bot.name}</h2><p>{bot.description}</p><div className="model-chip"><span />{bot.model || 'No model'}</div><button className="card-link" onClick={() => onChat(bot.id)}>Start chatting<ChevronRight size={16} /></button>
    </article>)}</div>}
    {editing && <BotEditor bot={editing} models={models} onClose={() => setEditing(undefined)} onSave={bot => { onSave(bot); setEditing(undefined) }} />}
  </main>
}

function BotEditor({ bot, models, onClose, onSave }: { bot: Bot; models: OllamaModel[]; onClose(): void; onSave(bot: Bot): void }) {
  const [draft, setDraft] = useState(bot)
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', close); return () => removeEventListener('keydown', close) }, [onClose])
  const valid = draft.name.trim() && draft.model
  return <div className="modal-backdrop"><section className="editor-dialog" role="dialog" aria-modal="true" aria-label="Bot editor">
    <header><div><h2>{botsEqualNew(bot) ? 'Create a bot' : 'Edit bot'}</h2><p>Configure how this bot thinks and responds.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
    <div className="editor-body">
      <div className="identity-preview"><span className="avatar xl" style={{ background: draft.avatarColor }}>{draft.name[0]?.toUpperCase() || 'B'}</span><div className="color-row">{colors.map(color => <button key={color} className={draft.avatarColor === color ? 'selected' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, avatarColor: color })} aria-label={`Use ${color} avatar color`}>{draft.avatarColor === color && <Check size={12} />}</button>)}</div></div>
      <div className="form-grid two"><label>Name<input value={draft.name} maxLength={40} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Ollama model<select value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })}><option value="">Select a model</option>{models.map(model => <option key={model.name} value={model.name}>{model.name}</option>)}</select></label></div>
      <label>Description<input value={draft.description} maxLength={120} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>System prompt<textarea rows={7} value={draft.systemPrompt} onChange={e => setDraft({ ...draft, systemPrompt: e.target.value })} /><span className="field-help">These instructions are added privately at the start of every conversation.</span></label>
      <button className="advanced-toggle" onClick={() => setAdvanced(!advanced)}>Advanced generation settings<ChevronRight className={advanced ? 'rotated' : ''} size={17} /></button>
      {advanced && <div className="advanced-panel"><RangeField label="Temperature" value={draft.temperature} min={0} max={2} step={0.1} onChange={temperature => setDraft({ ...draft, temperature })} /><RangeField label="Top P" value={draft.topP} min={0.1} max={1} step={0.05} onChange={topP => setDraft({ ...draft, topP })} /><label>Context window<select value={draft.contextLength} onChange={e => setDraft({ ...draft, contextLength: Number(e.target.value) })}>{[2048,4096,8192,16384,32768,65536,131072].map(size => <option key={size} value={size}>{size.toLocaleString()} tokens</option>)}</select></label></div>}
    </div>
    <footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!valid} onClick={() => onSave({ ...draft, name: draft.name.trim(), updatedAt: Date.now() })}>Save bot</button></footer>
  </section></div>
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange(value: number): void }) {
  return <label className="range-field"><span>{label}<output>{value}</output></span><input type="range" value={value} min={min} max={max} step={step} onChange={e => onChange(Number(e.target.value))} /></label>
}
function botsEqualNew(bot: Bot) { return bot.name === 'New bot' && Date.now() - bot.createdAt < 60_000 }
