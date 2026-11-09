// Design persistence behind an interface. `LocalDesignApi` works offline (IndexedDB);
// `RestDesignApi` is the server contract a deployment implements for cross-device sharing.
import { createStore, del, get, set } from 'idb-keyval'
import type { DesignState } from '../core/design'
import { deserializeDesign, serializeDesign } from '../state/serialize'
import type { Catalog, Tenant } from '../core/types'
import { defaultCatalog } from '../products/defaultCatalog'

export interface DesignApi {
  save(design: DesignState, prefix: string): Promise<string>
  load(id: string): Promise<DesignState>
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I confusion

export function newConfigId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `${prefix.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'DESIGN'}-${[...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('')}`
}

const designs = createStore('apparel-designs', 'designs')
const session = createStore('apparel-session', 'session')

export class LocalDesignApi implements DesignApi {
  async save(design: DesignState, prefix: string) {
    const id = newConfigId(prefix)
    await set(id, serializeDesign(design), designs)
    return id
  }
  async load(id: string) {
    const text = await get<string>(id, designs)
    if (!text) throw new Error(`Design ${id} was not found on this device.`)
    return deserializeDesign(text)
  }
}

export class RestDesignApi implements DesignApi {
  private base: string
  constructor(base: string) { this.base = base }
  async save(design: DesignState, prefix: string) {
    const r = await fetchWithTimeout(`${this.base}/designs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefix, design: serializeDesign(design) }) })
    return ((await r.json()) as { id: string }).id
  }
  async load(id: string) {
    const r = await fetchWithTimeout(`${this.base}/designs/${encodeURIComponent(id)}`)
    return deserializeDesign(await r.text())
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 15000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal })
    if (!r.ok) throw new Error(`Server responded ${r.status}`)
    return r
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? 'The server took too long to respond. Please try again.' : (e as Error).message)
  } finally {
    clearTimeout(t)
  }
}

export let designApi: DesignApi = new LocalDesignApi()
export const setDesignApi = (a: DesignApi) => { designApi = a }

// ---- autosave / crash recovery ----
export const autosave = {
  write: (d: DesignState) => set('autosave', { at: Date.now(), design: serializeDesign(d) }, session),
  async read(): Promise<{ at: number; design: DesignState } | null> {
    const v = await get<{ at: number; design: string }>('autosave', session)
    if (!v) return null
    try { return { at: v.at, design: deserializeDesign(v.design) } } catch { await del('autosave', session); return null }
  },
  clear: () => del('autosave', session),
}

// ---- catalog (admin overrides, one per tenant) ----
/** Unconfigured tenants start from the seed catalog priced in their own currency (amounts are placeholders for admin to set). */
const seedFor = (tenant: Pick<Tenant, 'currency'>): Catalog =>
  tenant.currency === defaultCatalog.pricing.currency ? defaultCatalog : { ...defaultCatalog, pricing: { ...defaultCatalog.pricing, currency: tenant.currency } }

export interface RemoteCatalog { load(tenantId: string): Promise<Catalog | null>; save(tenantId: string, c: Catalog): Promise<void> }
let remoteCatalog: RemoteCatalog | null = null
export const setRemoteCatalog = (r: RemoteCatalog | null) => { remoteCatalog = r }

export const catalogApi = {
  async load(tenant: Pick<Tenant, 'id' | 'currency'>): Promise<Catalog> {
    const fresh = (c: Catalog | null | undefined) => (c && c.schemaVersion === defaultCatalog.schemaVersion ? c : null)
    if (remoteCatalog) return fresh(await remoteCatalog.load(tenant.id)) ?? seedFor(tenant)
    return fresh(await get<Catalog>('catalog:' + tenant.id, session)) ?? seedFor(tenant)
  },
  save: (tenant: Pick<Tenant, 'id'>, c: Catalog) => (remoteCatalog ? remoteCatalog.save(tenant.id, c) : set('catalog:' + tenant.id, c, session)),
  reset: (tenant: Pick<Tenant, 'id' | 'currency'>) => (remoteCatalog ? remoteCatalog.save(tenant.id, seedFor(tenant)) : del('catalog:' + tenant.id, session)),
  isRemote: () => !!remoteCatalog,
  seed: seedFor,
}
