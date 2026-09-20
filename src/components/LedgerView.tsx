import { ArrowRight, BookOpen, Bot, ExternalLink, FileText, FolderOpen, Network, RefreshCw } from 'lucide-react'
import type { WorkspaceStatus } from '../types'
import { formatRelative } from '../lib'

interface Props {
  status: WorkspaceStatus
  loading: boolean
  onChoose(): void
  onRefresh(): void
  onOpen(): void
  onSettings(): void
}

export function LedgerView({ status, loading, onChoose, onRefresh, onOpen, onSettings }: Props) {
  if (!status.initialized) return <main className="page-view ledger-page">
    <div className="ledger-hero empty-ledger">
      <div className="ledger-orbit"><BookOpen size={28} /><span /><span /></div>
      <span className="eyebrow">Shared intelligence, plain files</span>
      <h1>Give your bots a common memory.</h1>
      <p>Choose any local drive or folder. Skepo creates an inspectable Markdown ledger where agents leave concise work cards for one another—without a vector database or constant agent chatter.</p>
      <div className="hero-actions"><button className="primary" onClick={onChoose}><FolderOpen size={17} />Choose workspace</button><button className="secondary" onClick={onSettings}>Configure later</button></div>
      <div className="ledger-flow"><FlowItem icon={<Bot size={18} />} title="Bot works" text="A model completes a useful exchange." /><ArrowRight size={18} /><FlowItem icon={<FileText size={18} />} title="Work card" text="Outcome is captured as readable Markdown." /><ArrowRight size={18} /><FlowItem icon={<Network size={18} />} title="Bots continue" text="Only relevant cards enter future context." /></div>
    </div>
  </main>

  return <main className="page-view ledger-page">
    <div className="page-heading"><div><span className="eyebrow">File-native coordination</span><h1>Shared Ledger</h1><p>Your bots' common working memory—readable by people, models, and Git.</p></div><div className="heading-actions"><button className="secondary" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spinning' : ''} />Refresh</button><button className="primary" onClick={onOpen}><FolderOpen size={16} />Open folder</button></div></div>
    <section className="ledger-path-card"><div className="path-icon"><BookOpen size={21} /></div><div><span>Workspace location</span><strong title={status.path}>{status.path}</strong></div><button className="secondary" onClick={onChoose}>Change</button></section>
    <div className="ledger-stats"><article><span>Work cards</span><strong>{status.noteCount}</strong><small>Compact Markdown records</small></article><article><span>Contributing bots</span><strong>{status.botCount}</strong><small>With recorded activity</small></article><article><span>Storage model</span><strong>Files</strong><small>No vector database</small></article></div>
    <div className="ledger-section-heading"><div><h2>Activity stream</h2><p>Recent knowledge written by your bots.</p></div><span className="live-indicator"><i />Live ledger</span></div>
    {status.recentNotes.length === 0 ? <section className="empty-card compact"><div className="empty-icon"><FileText size={24} /></div><h2>The ledger is ready</h2><p>Complete a chat exchange and the first work card will appear here automatically.</p></section> : <div className="ledger-timeline">{status.recentNotes.map(note => <article key={note.id}>
      <div className={`timeline-mark ${note.kind}`}><span>{note.botName[0]?.toUpperCase()}</span></div><div className="timeline-card"><div className="timeline-top"><div><strong>{note.title}</strong><span>{note.kind === 'handoff' ? `${note.fromBotName} → ${note.toBotName}` : note.botName} · {formatRelative(note.createdAt)}</span></div><FileText size={16} /></div><p>{note.outcome}</p><div className="keyword-row">{note.keywords.slice(0, 6).map(word => <span key={word}>{word}</span>)}</div></div>
    </article>)}</div>}
    <button className="ledger-settings-link" onClick={onSettings}>Memory and context settings <ExternalLink size={14} /></button>
  </main>
}

function FlowItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div>{icon}<strong>{title}</strong><span>{text}</span></div>
}
