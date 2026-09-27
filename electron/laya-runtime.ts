import { app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { LayaProgress, LayaStatus } from '../src/types'

const model = 'typed-decisions'
let server: ChildProcessWithoutNullStreams | undefined
let installing = false
let lastError: string | undefined
let idleTimer: ReturnType<typeof setTimeout> | undefined

function runtimeRoot() { return path.join(app.getPath('userData'), 'laya-runtime') }
function managedPython() { return path.join(runtimeRoot(), 'python', 'Scripts', 'python.exe') }
function normalizeEndpoint(raw = 'http://127.0.0.1:8000') {
  const parsed = new URL(raw.trim())
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Laya endpoint must start with http:// or https://')
  return parsed.toString().replace(/\/$/, '')
}
function isLocal(endpoint: string) { const host = new URL(endpoint).hostname.toLowerCase(); return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]' }
async function exists(file: string) { try { await fs.access(file); return true } catch { return false } }

export async function checkLaya(rawEndpoint?: string): Promise<LayaStatus> {
  const endpoint = normalizeEndpoint(rawEndpoint)
  const managedInstalled = await exists(managedPython())
  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2_500) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const health = await response.json() as { status?: string; loaded?: string[]; device?: string }
    return { endpoint, reachable: health.status === 'ok', managedInstalled, running: health.status === 'ok', installing, model, device: health.device, loaded: health.loaded ?? [], error: health.status === 'ok' ? undefined : 'Laya health check did not report ready.' }
  } catch (error) {
    return { endpoint, reachable: false, managedInstalled, running: false, installing, model, error: lastError ?? (error instanceof Error ? error.message : String(error)) }
  }
}

function run(command: string, args: string[], onLine?: (line: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    let errorText = ''
    child.stdout.on('data', data => onLine?.(String(data).trim()))
    child.stderr.on('data', data => { const line = String(data).trim(); errorText = `${errorText}\n${line}`.slice(-3_000); onLine?.(line) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve() : reject(new Error(errorText.trim() || `${path.basename(command)} exited with code ${code}`)))
  })
}

async function findPython() {
  const candidates = [
    { command: 'py', prefix: ['-3.11'] }, { command: 'py', prefix: ['-3.12'] }, { command: 'py', prefix: ['-3.10'] },
    { command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] },
  ]
  for (const candidate of candidates) {
    try { await run(candidate.command, [...candidate.prefix, '-c', 'import sys; assert (3,10) <= sys.version_info[:2] < (3,14)']); return candidate } catch { /* Try the next interpreter. */ }
  }
  throw new Error('Python 3.10–3.13 was not found. Install Python 3.11, then retry the one-click Laya setup.')
}

async function waitUntilReady(endpoint: string, timeoutMs: number, emit?: (progress: LayaProgress) => void) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const status = await checkLaya(endpoint)
    if (status.reachable) return status
    emit?.({ phase: 'downloading-model', message: 'Preparing the local typed-decisions checkpoint…' })
    await new Promise(resolve => setTimeout(resolve, 1_500))
  }
  throw new Error('Laya did not become ready in time. The first model download may still be running; check again shortly.')
}

export async function startManagedLaya(rawEndpoint = 'http://127.0.0.1:8000', emit?: (progress: LayaProgress) => void) {
  const endpoint = normalizeEndpoint(rawEndpoint)
  if (!isLocal(endpoint)) throw new Error('Skepo can only start a managed Laya runtime on localhost.')
  const current = await checkLaya(endpoint); if (current.reachable) return current
  if (!await exists(managedPython())) throw new Error('Install the managed Laya runtime first.')
  if (server && !server.killed) return waitUntilReady(endpoint, 180_000, emit)
  const parsed = new URL(endpoint)
  const threads = Math.max(1, Math.min(4, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / 2)))
  emit?.({ phase: 'starting', message: 'Starting the local Laya decision service…' })
  server = spawn(managedPython(), ['-m', 'laya.serve'], {
    windowsHide: true,
    env: { ...process.env, LAYA_HOST: '127.0.0.1', LAYA_PORT: parsed.port || '8000', LAYA_DEVICE: 'cpu', LAYA_PRELOAD: '1', LAYA_MODELS: model, LAYA_AUTO_TASK: '1', LAYA_MAX_LOADED: '1', LAYA_THREADS: String(threads), LAYA_MAX_CONCURRENT: '2', LAYA_LOG_LEVEL: 'warning', HF_HOME: path.join(runtimeRoot(), 'models') },
  })
  server.stdout.on('data', () => { /* Drain service output; Skepo exposes structured status instead. */ })
  server.stderr.on('data', data => { const value = String(data).trim(); if (value) lastError = value.slice(-800) })
  server.on('close', () => { server = undefined })
  return waitUntilReady(endpoint, 15 * 60_000, emit)
}

export async function installManagedLaya(rawEndpoint: string, emit: (progress: LayaProgress) => void) {
  if (installing) throw new Error('Laya installation is already running.')
  const endpoint = normalizeEndpoint(rawEndpoint)
  if (!isLocal(endpoint)) throw new Error('Use a localhost endpoint for the managed Laya runtime.')
  installing = true; lastError = undefined
  try {
    if (!await exists(managedPython())) {
      emit({ phase: 'checking', message: 'Finding a compatible Python runtime…', percent: 5 })
      const python = await findPython()
      emit({ phase: 'creating-runtime', message: 'Creating Skepo’s isolated Laya environment…', percent: 12 })
      await fs.mkdir(runtimeRoot(), { recursive: true })
      await run(python.command, [...python.prefix, '-m', 'venv', path.join(runtimeRoot(), 'python')])
    }
    emit({ phase: 'installing', message: 'Installing the Apache-2.0 Laya runtime locally…', percent: 25 })
    await run(managedPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', '--upgrade', 'laya[serve]>=0.3.21,<0.4'], line => {
      if (/download|install/i.test(line)) emit({ phase: 'installing', message: line.slice(0, 180), percent: 45 })
    })
    emit({ phase: 'starting', message: 'Runtime installed. Starting the decision service…', percent: 68 })
    const status = await startManagedLaya(endpoint, progress => emit({ ...progress, percent: progress.phase === 'downloading-model' ? 82 : 72 }))
    emit({ phase: 'ready', message: `Laya is ready on ${status.device ?? 'CPU'}.`, percent: 100 })
    return status
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error)
    emit({ phase: 'error', message: lastError })
    throw error
  } finally { installing = false }
}

export async function ensureLaya(rawEndpoint: string) {
  const endpoint = normalizeEndpoint(rawEndpoint)
  const current = await checkLaya(endpoint); if (current.reachable) { touchLaya(); return current }
  if (current.managedInstalled && isLocal(endpoint)) { const ready = await startManagedLaya(endpoint); touchLaya(); return ready }
  throw new Error(current.managedInstalled ? 'Laya is installed but unavailable.' : 'Laya is not installed or connected.')
}

export function touchLaya() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => stopManagedLaya(), 10 * 60_000)
}
export function stopManagedLaya() { if (idleTimer) clearTimeout(idleTimer); idleTimer = undefined; if (server && !server.killed) server.kill(); server = undefined }
