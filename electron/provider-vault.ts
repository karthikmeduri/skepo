import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

type Vault = { version: 1; keys: Record<string, string> }

function vaultPath() { return path.join(app.getPath('userData'), 'provider-vault.json') }

async function readVault(): Promise<Vault> {
  try {
    const parsed = JSON.parse(await fs.readFile(vaultPath(), 'utf8')) as Partial<Vault>
    return { version: 1, keys: parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {} }
  } catch { return { version: 1, keys: {} } }
}

async function writeVault(vault: Vault) {
  const destination = vaultPath()
  const temp = `${destination}.tmp`
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(temp, JSON.stringify(vault, null, 2), 'utf8')
  await fs.rename(temp, destination)
}

export async function setProviderKey(providerId: string, apiKey: string) {
  const trimmed = apiKey.trim()
  if (!trimmed) throw new Error('Enter an API key.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable; Skepo will not store this key unencrypted.')
  const vault = await readVault()
  vault.keys[providerId] = safeStorage.encryptString(trimmed).toString('base64')
  await writeVault(vault)
}

export async function clearProviderKey(providerId: string) {
  const vault = await readVault()
  delete vault.keys[providerId]
  await writeVault(vault)
}

export async function getProviderKey(providerId: string) {
  if (!safeStorage.isEncryptionAvailable()) return undefined
  const encrypted = (await readVault()).keys[providerId]
  if (!encrypted) return undefined
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')) } catch { return undefined }
}

export async function providerKeyStatus(providerId: string) {
  return { id: providerId, configured: !!await getProviderKey(providerId), encryptionAvailable: safeStorage.isEncryptionAvailable() }
}
