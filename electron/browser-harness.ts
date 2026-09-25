import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Bot, BrowserAction, BrowserEvent, BrowserRun, BrowserRunRequest, BrowserSnapshot, BrowserStep } from '../src/types'

type ModelRunner = (bot: Bot, messages: { role: string; content: string }[], url: string, timeout?: number) => Promise<{ content: string; tokens: number }>
type Emit = (event: BrowserEvent) => void

interface PageTarget {
  navigate(url: string): Promise<void>
  evaluate<T>(script: string): Promise<T>
  show(): void
  close(): void
}

interface RunContext { request: BrowserRunRequest; run: BrowserRun; target: PageTarget; emit: Emit; lastLines: string[]; cancelled: boolean }
const contexts = new Map<string, RunContext>()
let managedWindow: BrowserWindow | undefined

export function validateWebUrl(raw: string) {
  const value = raw.trim()
  const parsed = new URL(value)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http:// and https:// pages are supported.')
  return parsed.toString()
}

export function requiresApproval(action: BrowserAction, snapshot?: BrowserSnapshot) {
  const control = action.ref ? snapshot?.compact.split('\n').find(line => line.startsWith(`[${action.ref}]`)) ?? '' : ''
  const text = `${action.reason} ${control}`.toLowerCase()
  if (action.action === 'type') return /password|credit card|card number|security code|cvv|social security|bank account/.test(text)
  return action.action === 'click' && /\b(buy|pay|checkout|place order|send|post|publish|delete|remove|confirm|submit|upload|share|book|reserve|transfer)\b/.test(text)
}

export function compactDelta(full: string, previous: string[]) {
  const lines = full.split('\n').map(line => line.trim()).filter(Boolean)
  if (!previous.length) return { compact: lines.join('\n'), lines }
  const known = new Set(previous)
  const changed = lines.filter((line, index) => index < 2 || !known.has(line))
  return { compact: changed.length > 2 ? changed.join('\n') : lines.slice(0, 2).concat('[No material page changes]').join('\n'), lines }
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }
function safeHost(value: string) { try { return new URL(value).hostname.replace(/[^a-z0-9.-]/gi, '-').slice(0, 100) || 'unknown' } catch { return 'unknown' } }

class ManagedTarget implements PageTarget {
  constructor() {
    if (!managedWindow || managedWindow.isDestroyed()) {
      managedWindow = new BrowserWindow({
        width: 1280, height: 860, minWidth: 720, minHeight: 520, show: false, title: 'Skepo Web Harness', backgroundColor: '#0b0d12',
        webPreferences: { partition: 'persist:skepo-web', contextIsolation: true, nodeIntegration: false, sandbox: true },
      })
      managedWindow.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) void managedWindow?.loadURL(url); return { action: 'deny' } })
      managedWindow.on('closed', () => { managedWindow = undefined })
    }
  }
  async navigate(url: string) { await managedWindow!.loadURL(validateWebUrl(url)); managedWindow!.show() }
  async evaluate<T>(script: string) { return managedWindow!.webContents.executeJavaScript(script, true) as Promise<T> }
  show() { managedWindow?.show(); managedWindow?.focus() }
  close() { /* Persistent browser is reused to avoid startup and memory churn. */ }
}

class CdpTarget implements PageTarget {
  private socket!: WebSocket
  private nextId = 1
  private pending = new Map<number, { resolve(value: unknown): void; reject(reason: unknown): void }>()
  static async connect(endpoint: string) {
    const base = endpoint.trim().replace(/\/$/, '')
    const response = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`Browser debugging endpoint returned HTTP ${response.status}.`)
    const pages = await response.json() as { type: string; webSocketDebuggerUrl?: string; url?: string }[]
    const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl)
    if (!page?.webSocketDebuggerUrl) throw new Error('No controllable browser tab was found. Start Chrome or Edge with remote debugging enabled.')
    const target = new CdpTarget()
    await target.open(page.webSocketDebuggerUrl)
    return target
  }
  private open(url: string) {
    return new Promise<void>((resolve, reject) => {
      this.socket = new WebSocket(url)
      this.socket.onopen = () => resolve()
      this.socket.onerror = () => reject(new Error('Could not connect to the browser debugging session.'))
      this.socket.onmessage = event => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message?: string } }
        if (!message.id) return
        const pending = this.pending.get(message.id); if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(message.error.message ?? 'Browser command failed.')); else pending.resolve(message.result)
      }
    })
  }
  private send(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`Browser command timed out: ${method}`)) }, 15_000)
    })
  }
  async navigate(url: string) { await this.send('Page.navigate', { url: validateWebUrl(url) }); await new Promise(resolve => setTimeout(resolve, 700)) }
  async evaluate<T>(script: string) {
    const result = await this.send('Runtime.evaluate', { expression: script, returnByValue: true, awaitPromise: true }) as { result?: { value?: T }; exceptionDetails?: unknown }
    if (result.exceptionDetails) throw new Error('The page rejected a browser action.')
    return result.result?.value as T
  }
  show() { /* The connected browser remains user-visible. */ }
  close() { this.socket?.close() }
}

async function snapshot(context: RunContext): Promise<BrowserSnapshot> {
  const raw = await context.target.evaluate<{ url: string; title: string; full: string; count: number; challenge: boolean }>(`(() => {
    const visible = el => { const s=getComputedStyle(el), r=el.getBoundingClientRect(); return s.visibility!=='hidden' && s.display!=='none' && r.width>0 && r.height>0 }
    const clean = value => String(value || '').replace(/\\s+/g,' ').trim().slice(0,180)
    const items = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"]')].filter(visible).slice(0,120)
    const controls = items.map((el,index) => { el.setAttribute('data-skepo-ref', String(index+1)); const tag=el.tagName.toLowerCase(); const role=el.getAttribute('role') || tag; const label=clean(el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('title')); const href=tag==='a' ? clean(el.href) : ''; const type=el.getAttribute('type') || ''; return '['+(index+1)+'] '+role+(type ? ':'+type : '')+' "'+label+'"'+(href ? ' -> '+href : '') }).join('\\n')
    const headings=[...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0,18).map(el => clean(el.innerText)).filter(Boolean)
    const main=clean((document.querySelector('main,[role="main"],article') || document.body).innerText).slice(0,4500)
    const full=['TITLE: '+document.title,'URL: '+location.href,headings.length ? 'HEADINGS: '+headings.join(' | ') : '',controls ? 'CONTROLS:\\n'+controls : '',main ? 'PAGE TEXT: '+main : ''].filter(Boolean).join('\\n')
    const challenge=/captcha|verify you are human|checking your browser|unusual traffic|cloudflare|access denied/i.test((document.title+' '+document.body.innerText).slice(0,12000))
    return { url:location.href,title:document.title,full,count:items.length,challenge }
  })()`)
  const delta = compactDelta(raw.full, context.lastLines); context.lastLines = delta.lines
  const fullTokens = Math.ceil(raw.full.length / 4), compactTokens = Math.ceil(delta.compact.length / 4)
  return { url: raw.url, title: raw.title, compact: delta.compact, interactiveCount: raw.count, estimatedTokens: compactTokens, fullEstimatedTokens: fullTokens, savedTokens: Math.max(0, fullTokens - compactTokens), challengeDetected: raw.challenge }
}

function parseAction(content: string): BrowserAction {
  const match = content.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('The browser bot did not return a valid action.')
  const action = JSON.parse(match[0]) as BrowserAction
  if (!['navigate','click','type','scroll','extract','done'].includes(action.action)) throw new Error('The browser bot returned an unsupported action.')
  action.reason = String(action.reason || 'Continue toward the goal').slice(0, 300)
  return action
}

async function execute(target: PageTarget, action: BrowserAction) {
  if (action.action === 'navigate') return target.navigate(validateWebUrl(action.url ?? ''))
  if (action.action === 'scroll') return target.evaluate(`scrollBy({top:${action.direction === 'up' ? -650 : 650},behavior:'smooth'}); true`)
  if (action.action === 'click') return target.evaluate(`(() => { const el=document.querySelector('[data-skepo-ref="${Number(action.ref)}"]'); if(!el) throw new Error('Control not found'); el.scrollIntoView({block:'center'}); el.click(); return true })()`)
  if (action.action === 'type') return target.evaluate(`(() => { const el=document.querySelector('[data-skepo-ref="${Number(action.ref)}"]'); if(!el) throw new Error('Field not found'); el.focus(); const value=${JSON.stringify(String(action.text ?? ''))}; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set; if(setter) setter.call(el,value); else el.value=value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true })()`)
}

async function readMemory(workspace: string, url: string) {
  try { return (await fs.readFile(path.join(workspace, '.skepo-ledger', 'browser', 'sites', `${safeHost(url)}.md`), 'utf8')).slice(0, 1800) } catch { return '' }
}

async function writeMemory(context: RunContext, snapshotValue: BrowserSnapshot, action: BrowserAction) {
  const folder = path.join(context.request.workspacePath, '.skepo-ledger', 'browser', 'sites')
  await fs.mkdir(folder, { recursive: true })
  const host = safeHost(snapshotValue.url), destination = path.join(folder, `${host}.md`), temp = `${destination}.tmp`
  let prior = ''
  try { prior = await fs.readFile(destination, 'utf8') } catch { prior = `# ${host} — Browser Memory\n\nLocal, inspectable navigation notes generated by Skepo.\n` }
  const entry = `\n## ${new Date().toISOString()}\n\n- URL: ${snapshotValue.url}\n- Action: ${action.action}${action.ref ? ` [${action.ref}]` : ''}\n- Reason: ${action.reason}\n`
  await fs.writeFile(temp, `${prior.slice(-12_000)}${entry}`, 'utf8'); await fs.rename(temp, destination)
}

function update(context: RunContext, patch: Partial<BrowserRun>) {
  context.run = { ...context.run, ...patch, updatedAt: Date.now() }
  context.emit({ type: 'updated', run: context.run })
}

async function loop(context: RunContext, runner: ModelRunner) {
  try {
    update(context, { status: 'running', error: undefined, pendingAction: undefined })
    while (!context.cancelled && context.run.steps.length < context.run.maxSteps) {
      const page = await snapshot(context)
      update(context, { currentUrl: page.url, estimatedTokens: context.run.estimatedTokens + page.estimatedTokens, savedTokens: context.run.savedTokens + page.savedTokens })
      if (page.challengeDetected) { update(context, { status: 'awaiting_human', error: 'The site is asking for human verification. Complete it in the browser, then resume; Skepo will not bypass it.' }); return }
      const memory = await readMemory(context.request.workspacePath, page.url)
      const response = await runner(context.request.bot, [
        { role: 'system', content: 'You control a browser using compact numbered page controls. Return exactly one JSON object. Allowed actions: {"action":"navigate","url":"https://...","reason":"..."}, {"action":"click","ref":1,"reason":"..."}, {"action":"type","ref":2,"text":"...","reason":"..."}, {"action":"scroll","direction":"down","reason":"..."}, {"action":"extract","reason":"final answer with requested facts"}, {"action":"done","reason":"final result"}. Never attempt CAPTCHA or verification bypass. Never invent a ref. Prefer completing the goal in few steps.' },
        { role: 'user', content: `GOAL: ${context.run.goal}\n\nLOCAL SITE MEMORY:\n${memory || '(none)'}\n\nCURRENT PAGE:\n${page.compact}` },
      ], context.request.ollamaUrl, 120_000)
      const action = parseAction(response.content)
      const step: BrowserStep = { id: uid(), index: context.run.steps.length + 1, action, status: 'planned', createdAt: Date.now(), snapshot: page }
      context.run.steps = [...context.run.steps, step]
      if (action.action === 'done' || action.action === 'extract') { step.status = 'completed'; update(context, { status: 'completed', result: action.reason, steps: [...context.run.steps] }); return }
      if (requiresApproval(action, page)) { update(context, { status: 'awaiting_approval', pendingAction: action, steps: [...context.run.steps] }); return }
      await execute(context.target, action); step.status = 'completed'; await writeMemory(context, page, action)
      update(context, { steps: [...context.run.steps] }); await new Promise(resolve => setTimeout(resolve, 450))
    }
    if (context.cancelled) update(context, { status: 'cancelled' }); else update(context, { status: 'failed', error: `Stopped at the ${context.run.maxSteps}-step safety limit.` })
  } catch (error) { update(context, { status: 'failed', error: error instanceof Error ? error.message : String(error) }) }
}

export async function startBrowserRun(request: BrowserRunRequest, runner: ModelRunner, emit: Emit) {
  if (!path.isAbsolute(request.workspacePath) || path.resolve(request.workspacePath) === path.parse(path.resolve(request.workspacePath)).root) throw new Error('Choose a workspace folder before starting the Web Harness.')
  validateWebUrl(request.startUrl)
  const id = uid(), target = request.mode === 'cdp' ? await CdpTarget.connect(request.cdpUrl || 'http://127.0.0.1:9222') : new ManagedTarget()
  const run: BrowserRun = { id, goal: request.goal.trim(), mode: request.mode, status: 'connecting', startUrl: request.startUrl, botName: request.bot.name, botModel: request.bot.model, maxSteps: Math.max(3, Math.min(30, request.maxSteps || 12)), steps: [], estimatedTokens: 0, savedTokens: 0, startedAt: Date.now(), updatedAt: Date.now() }
  const context: RunContext = { request, run, target, emit, lastLines: [], cancelled: false }; contexts.set(id, context)
  await target.navigate(request.startUrl); void loop(context, runner); return run
}

export async function approveBrowserRun(id: string, allowed: boolean, runner: ModelRunner) {
  const context = contexts.get(id); if (!context || context.run.status !== 'awaiting_approval' || !context.run.pendingAction) throw new Error('This browser run is not awaiting approval.')
  const step = context.run.steps.at(-1)!
  if (!allowed) { step.status = 'blocked'; update(context, { status: 'cancelled', pendingAction: undefined, steps: [...context.run.steps], result: 'Risky browser action was declined.' }); return context.run }
  await execute(context.target, context.run.pendingAction); step.status = 'completed'; update(context, { pendingAction: undefined, steps: [...context.run.steps] }); void loop(context, runner); return context.run
}

export function resumeBrowserRun(id: string, runner: ModelRunner) { const context = contexts.get(id); if (!context) throw new Error('Browser run not found.'); context.lastLines = []; void loop(context, runner); return context.run }
export function cancelBrowserRun(id: string) { const context = contexts.get(id); if (!context) throw new Error('Browser run not found.'); context.cancelled = true; update(context, { status: 'cancelled' }); context.target.close(); return context.run }
export function showBrowserRun(id: string) { const context = contexts.get(id); if (!context) throw new Error('Browser run not found.'); context.target.show() }
export function closeBrowserHarness() { for (const context of contexts.values()) context.target.close(); contexts.clear(); if (managedWindow && !managedWindow.isDestroyed()) managedWindow.destroy(); managedWindow = undefined }
