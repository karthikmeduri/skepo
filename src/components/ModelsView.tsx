import { CheckCircle2, Download, HardDrive, LoaderCircle, RefreshCw, ServerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { OllamaModel, PullProgress } from '../types'
import { formatBytes } from '../lib'

interface Props {
  models: OllamaModel[]
  connected: boolean
  version?: string
  loading: boolean
  error?: string
  pullProgress?: PullProgress
  onRefresh(): void
  onPull(name: string): Promise<void>
  onDelete(name: string): Promise<void>
}

export function ModelsView(props: Props) {
  const [modelName, setModelName] = useState('')
  const pulling = !!props.pullProgress
  const percent = props.pullProgress?.total ? Math.round(((props.pullProgress.completed ?? 0) / props.pullProgress.total) * 100) : undefined
  async function pull() { if (!modelName.trim() || pulling) return; await props.onPull(modelName.trim()); setModelName('') }
  return <main className="page-view">
    <div className="page-heading"><div><span className="eyebrow">Ollama library</span><h1>Models</h1><p>Download and manage the models available to your bots.</p></div><button className="secondary" onClick={props.onRefresh} disabled={props.loading}><RefreshCw size={16} className={props.loading ? 'spinning' : ''} />Refresh</button></div>
    <section className={`connection-card ${props.connected ? 'online' : 'offline'}`}>
      <div className="connection-icon">{props.connected ? <CheckCircle2 size={21} /> : <ServerOff size={21} />}</div><div><strong>{props.connected ? 'Ollama is connected' : 'Ollama is offline'}</strong><span>{props.connected ? `Local service${props.version ? ` · v${props.version}` : ''}` : props.error ?? 'Start Ollama to manage models'}</span></div>
    </section>
    <section className="pull-card"><div><h2>Download a model</h2><p>Enter any model tag from the Ollama library, such as <code>llama3.2:3b</code>.</p></div><div className="pull-form"><input value={modelName} onChange={e => setModelName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void pull() }} placeholder="Model name or tag" disabled={!props.connected || pulling} /><button className="primary" disabled={!modelName.trim() || !props.connected || pulling} onClick={() => void pull()}>{pulling ? <LoaderCircle size={17} className="spinning" /> : <Download size={17} />}{pulling ? 'Downloading' : 'Download'}</button></div>
      {props.pullProgress && <div className="progress-area"><div><span>{props.pullProgress.status}</span>{percent !== undefined && <strong>{percent}%</strong>}</div><div className="progress-track"><span style={{ width: `${percent ?? 8}%` }} /></div></div>}
    </section>
    <div className="list-heading"><h2>Installed models</h2><span>{props.models.length} model{props.models.length === 1 ? '' : 's'}</span></div>
    {props.models.length === 0 ? <section className="empty-card compact"><div className="empty-icon"><HardDrive size={25} /></div><h2>No models installed</h2><p>Download a model above, or run <code>ollama pull llama3.2</code> in a terminal.</p></section> : <div className="model-list">{props.models.map(model => <article key={model.name}>
      <div className="model-symbol"><HardDrive size={20} /></div><div className="model-info"><h3>{model.name}</h3><div><span>{formatBytes(model.size)}</span>{model.details?.parameter_size && <span>{model.details.parameter_size} parameters</span>}{model.details?.quantization_level && <span>{model.details.quantization_level}</span>}</div></div><time>{new Date(model.modified_at).toLocaleDateString()}</time><button className="icon-button danger" onClick={() => { if (confirm(`Delete ${model.name} from Ollama?`)) void props.onDelete(model.name) }} aria-label={`Delete ${model.name}`}><Trash2 size={17} /></button>
    </article>)}</div>}
  </main>
}
