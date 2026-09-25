import { AlertTriangle, CheckCircle2, CircleStop, ExternalLink, Gauge, Globe2, LoaderCircle, LockKeyhole, PanelsTopLeft, Play, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Bot as BotType, BrowserMode, BrowserRun } from '../types'

interface Props { bots: BotType[]; workspacePath: string; ollamaUrl: string; connected: boolean; onSetupWorkspace(): void; onError(message: string): void }

export function WebHarnessView(props: Props) {
  const [goal, setGoal] = useState('')
  const [url, setUrl] = useState('https://www.google.com/')
  const [mode, setMode] = useState<BrowserMode>('managed')
  const [cdpUrl, setCdpUrl] = useState('http://127.0.0.1:9222')
  const [botId, setBotId] = useState(props.bots[0]?.id ?? '')
  const [maxSteps, setMaxSteps] = useState(12)
  const [run, setRun] = useState<BrowserRun>()
  const [starting, setStarting] = useState(false)
  useEffect(() => { if (!botId && props.bots[0]) setBotId(props.bots[0].id) }, [props.bots, botId])
  useEffect(() => window.localbot.onBrowserEvent(event => { if (event.type === 'updated') setRun(event.run); else props.onError(event.error) }), [props.onError])
  const bot = props.bots.find(item => item.id === botId)
  const active = run && ['connecting','running','awaiting_approval','awaiting_human'].includes(run.status)

  async function start() {
    if (!bot || !goal.trim() || !url.trim() || !props.workspacePath) return
    setStarting(true)
    try { setRun(await window.localbot.startBrowserRun({ workspacePath: props.workspacePath, ollamaUrl: props.ollamaUrl, goal: goal.trim(), startUrl: url.trim(), mode, cdpUrl: mode === 'cdp' ? cdpUrl.trim() : undefined, bot, maxSteps })) }
    catch (error) { props.onError(error instanceof Error ? error.message : String(error)) }
    finally { setStarting(false) }
  }

  return <main className="page-view web-harness-page">
    <div className="page-heading"><div><span className="eyebrow">Local browser agent</span><h1>Web Harness</h1><p>Navigate with compact page maps, persistent sessions, and human approval at consequential actions.</p></div><div className="harness-badges"><span><ShieldCheck size={14} />Human-gated</span><span><Gauge size={14} />Low-token</span></div></div>
    {!props.workspacePath ? <section className="empty-card"><div className="empty-icon"><Globe2 size={26} /></div><h2>Choose where browser memory lives</h2><p>Skepo keeps readable per-site navigation notes inside your local workspace. No cloud browser history is required.</p><button className="primary" onClick={props.onSetupWorkspace}>Choose workspace</button></section> : <div className="harness-layout">
      <section className="harness-compose">
        <div className="harness-section-title"><div className="web-orb"><PanelsTopLeft size={20} /></div><div><h2>Start a browser task</h2><p>One browser, one bounded agent loop, reusable local site memory.</p></div></div>
        <label>What should Skepo do?<textarea rows={4} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Find the latest release notes and summarize the breaking changes" disabled={!!active} /></label>
        <label>Starting page<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" disabled={!!active} /></label>
        <div className="form-grid two"><label>Browser mode<select value={mode} onChange={e => setMode(e.target.value as BrowserMode)} disabled={!!active}><option value="managed">Skepo browser (recommended)</option><option value="cdp">Existing Chrome / Edge</option></select></label><label>Browser bot<select value={botId} onChange={e => setBotId(e.target.value)} disabled={!!active}>{props.bots.map(item => <option key={item.id} value={item.id}>{item.name} · {item.model}</option>)}</select></label></div>
        {mode === 'cdp' && <div className="cdp-panel"><label>Local debugging endpoint<input value={cdpUrl} onChange={e => setCdpUrl(e.target.value)} disabled={!!active} /></label><p><LockKeyhole size={14} />Only tabs from a browser you explicitly start with remote debugging can be controlled. Skepo never silently attaches to a normal browser session.</p></div>}
        <label>Safety step limit <span className="range-value">{maxSteps}</span><input type="range" min="3" max="30" value={maxSteps} onChange={e => setMaxSteps(Number(e.target.value))} disabled={!!active} /></label>
        <div className="harness-actions"><button className="primary" onClick={() => void start()} disabled={starting || !!active || !props.connected || !bot || !goal.trim()}>{starting ? <LoaderCircle className="spinning" size={17} /> : <Play size={17} />}{starting ? 'Connecting' : 'Run task'}</button>{active && run && <button className="secondary danger" onClick={() => void window.localbot.cancelBrowserRun(run.id)}><CircleStop size={16} />Stop</button>}</div>
        {!props.connected && <p className="harness-warning"><AlertTriangle size={15} />Start Ollama before running a browser task.</p>}
      </section>
      <section className="harness-monitor" aria-live="polite">
        {!run ? <div className="harness-idle"><Sparkles size={28} /><h2>Efficient by default</h2><p>Skepo sends the model numbered controls and changed page content—not screenshots or the full DOM on every step.</p><div><span><CheckCircle2 size={14} />Persistent signed-in profile</span><span><CheckCircle2 size={14} />Site memory in Markdown</span><span><CheckCircle2 size={14} />Challenge detection and handoff</span></div></div> : <>
          <header className="monitor-head"><div><span className={`status-dot ${run.status}`} /><span>{run.status.replaceAll('_', ' ')}</span><h2>{run.goal}</h2><p>{run.currentUrl ?? run.startUrl}</p></div><button className="icon-button" onClick={() => void window.localbot.showBrowserRun(run.id)} aria-label="Show browser"><ExternalLink size={17} /></button></header>
          <div className="harness-metrics"><article><span>Steps</span><strong>{run.steps.length}<small> / {run.maxSteps}</small></strong></article><article><span>Tokens sent</span><strong>{run.estimatedTokens.toLocaleString()}</strong></article><article><span>Tokens avoided</span><strong className="saved">{run.savedTokens.toLocaleString()}</strong></article></div>
          {run.status === 'awaiting_approval' && <div className="harness-interrupt approval"><AlertTriangle size={19} /><div><strong>Approval required</strong><span>{run.pendingAction?.reason}</span><div><button className="primary" onClick={() => void window.localbot.approveBrowserRun(run.id, true)}>Allow once</button><button className="secondary" onClick={() => void window.localbot.approveBrowserRun(run.id, false)}>Decline</button></div></div></div>}
          {run.status === 'awaiting_human' && <div className="harness-interrupt human"><LockKeyhole size={19} /><div><strong>Human verification needed</strong><span>{run.error}</span><div><button className="primary" onClick={() => void window.localbot.resumeBrowserRun(run.id)}><RefreshCw size={15} />I completed it—resume</button><button className="secondary" onClick={() => void window.localbot.showBrowserRun(run.id)}>Show browser</button></div></div></div>}
          {(run.result || run.error && !['awaiting_human'].includes(run.status)) && <div className={`harness-result ${run.status}`}><strong>{run.status === 'completed' ? 'Result' : 'Run note'}</strong><p>{run.result ?? run.error}</p></div>}
          <div className="browser-timeline">{run.steps.length === 0 ? <div className="thinking"><LoaderCircle className="spinning" size={17} />Reading the first compact page map…</div> : [...run.steps].reverse().map(step => <article key={step.id}><span className={`step-mark ${step.status}`}>{step.index}</span><div><strong>{step.action.action}{step.action.ref ? ` · control ${step.action.ref}` : ''}</strong><p>{step.action.reason}</p><small>{step.snapshot?.title || step.snapshot?.url}</small></div><span className="step-state">{step.status}</span></article>)}</div>
        </>}
      </section>
    </div>}
  </main>
}
