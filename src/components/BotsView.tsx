import { Bot as BotIcon, BrainCircuit, Check, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Bot, ModelProvider, OllamaModel, ProviderConnectionStatus } from '../types'
import { colors, createBot, personas } from '../lib'
import { providerLabel } from '../providers'
import { BotPersona } from './BotPersona'

export function BotsView({ bots, models, providers, providerStatuses, onSave, onDelete, onChat }: { bots: Bot[]; models: OllamaModel[]; providers: ModelProvider[]; providerStatuses: ProviderConnectionStatus[]; onSave(bot: Bot): void; onDelete(id: string): void; onChat(id: string): void }) {
  const [editing, setEditing] = useState<Bot>()
  return <main className="page-view">
    <div className="page-heading"><div><span className="eyebrow">Agent identities</span><h1>Your bots</h1><p>Build recognizable teammates powered by local or cloud models.</p></div><button className="primary" onClick={() => setEditing(createBot(models[0]?.name))}><Plus size={17} />Create bot</button></div>
    {bots.length === 0 ? <section className="empty-card"><div className="empty-icon"><BotIcon size={27} /></div><h2>Build your first bot</h2><p>Give a model a visual persona, role, instructions, and provider.</p><button className="primary" onClick={() => setEditing(createBot(models[0]?.name))}><Plus size={17} />Create bot</button></section> : <div className="bot-grid">{bots.map(bot => <article className="bot-card persona-card" key={bot.id}>
      <div className="bot-card-head"><BotPersona persona={bot.persona} color={bot.avatarColor} label={bot.name} size="large" /><div className="card-actions"><button className="icon-button" onClick={() => setEditing({ ...bot })} aria-label={`Edit ${bot.name}`}><Pencil size={16} /></button><button className="icon-button danger" onClick={() => { if (confirm(`Delete ${bot.name}? Its conversations will remain in history.`)) onDelete(bot.id) }} aria-label={`Delete ${bot.name}`}><Trash2 size={16} /></button></div></div>
      <h2>{bot.name}</h2><p>{bot.description}</p><div className="bot-chip-row"><div className="model-chip"><span />{providerLabel(bot.providerId, providers)} · {bot.model || 'No model'}</div><div className="decision-chip"><BrainCircuit size={12} />{decisionLabel(bot.decisionMode)}</div></div><button className="card-link" onClick={() => onChat(bot.id)}>Start chatting<ChevronRight size={16} /></button>
    </article>)}</div>}
    {editing && <BotEditor bot={editing} models={models} providers={providers} providerStatuses={providerStatuses} onClose={() => setEditing(undefined)} onSave={bot => { onSave(bot); setEditing(undefined) }} />}
  </main>
}

function BotEditor({ bot, models, providers, providerStatuses, onClose, onSave }: { bot: Bot; models: OllamaModel[]; providers: ModelProvider[]; providerStatuses: ProviderConnectionStatus[]; onClose(): void; onSave(bot: Bot): void }) {
  const [draft, setDraft] = useState(bot)
  const [advanced, setAdvanced] = useState(false)
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', close); return () => removeEventListener('keydown', close) }, [onClose])
  const valid = draft.name.trim() && draft.model
  const selectedProvider = providers.find(provider => provider.id === (draft.providerId || 'ollama')) ?? providers[0]
  const selectedStatus = providerStatuses.find(status => status.id === selectedProvider?.id)
  return <div className="modal-backdrop"><section className="editor-dialog" role="dialog" aria-modal="true" aria-label="Bot editor">
    <header><div><h2>{botsEqualNew(bot) ? 'Create a bot' : 'Edit bot'}</h2><p>Configure how this bot thinks and responds.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
    <div className="editor-body">
      <div className="identity-preview persona-preview"><BotPersona persona={draft.persona} color={draft.avatarColor} label={draft.name || 'Bot'} size="xl" active /><div><span>Visual persona</span><div className="persona-row">{personas.map(persona => <button key={persona} className={draft.persona === persona ? 'selected' : ''} onClick={() => setDraft({ ...draft, persona })} aria-label={`Use ${persona} persona`}><BotPersona persona={persona} color={draft.avatarColor} label={persona} size="small" /></button>)}</div><div className="color-row">{colors.map(color => <button key={color} className={draft.avatarColor === color ? 'selected' : ''} style={{ background: color }} onClick={() => setDraft({ ...draft, avatarColor: color })} aria-label={`Use ${color} persona color`}>{draft.avatarColor === color && <Check size={12} />}</button>)}</div></div></div>
      <div className="form-grid two"><label>Name<input value={draft.name} maxLength={40} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label>Model provider<select value={draft.providerId || 'ollama'} onChange={e => setDraft({ ...draft, providerId: e.target.value, model: e.target.value === 'ollama' ? models[0]?.name ?? '' : '' })}>{providers.filter(provider => provider.enabled).map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label></div>
      <label>Model{selectedProvider?.kind === 'ollama' ? <select value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })}><option value="">Select an installed model</option>{models.map(model => <option key={model.name} value={model.name}>{model.name}</option>)}</select> : <><input value={draft.model} placeholder="Enter the exact model ID from your provider" onChange={e => setDraft({ ...draft, model: e.target.value })} /><span className="field-help">{providerLabel(selectedProvider?.id, providers)} uses your configured API. {selectedStatus?.configured ? 'The credential is ready.' : 'Add its API key in Settings before chatting.'}</span></>}</label>
      <label>Description<input value={draft.description} maxLength={120} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>System prompt<textarea rows={7} value={draft.systemPrompt} onChange={e => setDraft({ ...draft, systemPrompt: e.target.value })} /><span className="field-help">These instructions are added privately at the start of every conversation.</span></label>
      <div className="decision-picker"><div><BrainCircuit size={18} /><span><strong>Decision intelligence</strong><small>Choose the fast System 1 engine used when this bot gates plans or validates work.</small></span></div><label>Provider<select value={draft.decisionMode ?? 'workspace'} onChange={e => setDraft({ ...draft, decisionMode: e.target.value as Bot['decisionMode'] })}><option value="workspace">Use workspace default</option><option value="auto">Automatic · Laya → Jev → rules</option><option value="laya">Laya Local · private and open-weight</option><option value="jev">Jev Cloud · hosted typed decisions</option><option value="local">Rules Only · deterministic fallback</option></select></label></div>
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
function decisionLabel(mode: Bot['decisionMode']) { return mode === 'laya' ? 'Laya' : mode === 'jev' ? 'Jev' : mode === 'local' ? 'Rules' : mode === 'auto' ? 'Auto' : 'Workspace' }
