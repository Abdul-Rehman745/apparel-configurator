// Content-addressed asset storage (IndexedDB). Design JSON references assets by id,
// never embeds raster data — keeps history, autosave and share payloads small.
// A server deployment swaps this for object storage + signed URLs behind the same interface.
import { createStore, get, set, keys } from 'idb-keyval'

export interface AssetMeta {
  id: string
  kind: 'raster' | 'svg' | 'font' | 'model'
  mime: string
  name: string
  width: number
  height: number
  hasAlpha: boolean
  bytes: number
  createdAt: string
}

const blobs = createStore('apparel-assets', 'blobs')
const metas = createStore('apparel-asset-meta', 'meta')
const urls = new Map<string, string>()

/** Optional object-storage backend (Supabase). Local IndexedDB stays the cache and offline store. */
export interface RemoteAssets {
  upload(meta: AssetMeta, blob: Blob): Promise<void>
  download(id: string): Promise<{ meta: AssetMeta; blob: Blob } | null>
}
let remote: RemoteAssets | null = null
export const setRemoteAssets = (r: RemoteAssets | null) => { remote = r }

/** Pull an asset from object storage into the local cache (shared designs opened on another device). */
async function fetchRemote(id: string): Promise<boolean> {
  if (!remote) return false
  try {
    const r = await remote.download(id)
    if (!r) return false
    await set(id, r.blob, blobs)
    await set(id, r.meta, metas)
    return true
  } catch {
    return false
  }
}

export async function hashBytes(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return 'a_' + [...new Uint8Array(h).slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function putAsset(blob: Blob, meta: Omit<AssetMeta, 'id' | 'createdAt' | 'bytes'>): Promise<AssetMeta> {
  const buf = await blob.arrayBuffer()
  const id = await hashBytes(buf)
  const existing = await get<AssetMeta>(id, metas)
  const full: AssetMeta = existing ?? { ...meta, id, bytes: blob.size, createdAt: new Date().toISOString() }
  if (!existing) {
    await set(id, blob, blobs)
    await set(id, full, metas)
  }
  // Designs are shared by id, so the bytes must reach object storage before they are referenced.
  if (remote) await remote.upload(full, blob)
  return full
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return (await get<Blob>(id, blobs)) ?? ((await fetchRemote(id)) ? get<Blob>(id, blobs) : undefined)
}

export async function getAssetMeta(id: string): Promise<AssetMeta | undefined> {
  return (await get<AssetMeta>(id, metas)) ?? ((await fetchRemote(id)) ? get<AssetMeta>(id, metas) : undefined)
}

/** Object URL for an asset (cached for the session). Undefined if the asset is missing. */
export async function assetUrl(id: string): Promise<string | undefined> {
  const hit = urls.get(id)
  if (hit) return hit
  const blob = await getAssetBlob(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

export async function listAssets(kind?: AssetMeta['kind']): Promise<AssetMeta[]> {
  const ids = (await keys(metas)) as string[]
  const all = await Promise.all(ids.map((id) => get<AssetMeta>(id, metas)))
  return all.filter((m): m is AssetMeta => !!m && (!kind || m.kind === kind)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function missingAssets(ids: Iterable<string>): Promise<Set<string>> {
  const out = new Set<string>()
  for (const id of new Set(ids)) if (!(await get(id, metas)) && !(await fetchRemote(id))) out.add(id)
  return out
}
