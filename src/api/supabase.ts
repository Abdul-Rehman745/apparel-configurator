// Supabase implementations of the persistence/commerce interfaces. Enabled when
// VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set; otherwise the app runs offline.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { DesignState } from '../core/design'
import type { Catalog } from '../core/types'
import { deserializeDesign } from '../state/serialize'
import type { AssetMeta, RemoteAssets } from '../assets/assetStore'
import type { ConfigurationResult } from '../export/result'
import type { CartResponse, CommerceAdapter } from './commerce'
import type { DesignApi } from './designApi'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2', 'model/gltf-binary': 'glb' }
// SVG is stored as text/plain so a raw object URL can never execute script.
const storedType = (mime: string) => (mime === 'image/svg+xml' ? 'text/plain' : mime)

const errMsg = (e: { message?: string } | null, fallback: string) => new Error(e?.message || fallback)

export class SupabaseDesignApi implements DesignApi {
  private sb: SupabaseClient
  private tenantId: string
  constructor(sb: SupabaseClient, tenantId: string) { this.sb = sb; this.tenantId = tenantId }
  async save(design: DesignState, prefix: string) {
    const { data, error } = await this.sb.rpc('save_design', { p_tenant: this.tenantId, p_prefix: prefix, p_design: design })
    if (error) throw errMsg(error, 'Could not save the design.')
    return data as string
  }
  async load(id: string) {
    const { data, error } = await this.sb.rpc('get_design', { p_id: id })
    if (error) throw errMsg(error, 'Could not load the design.')
    if (!data) throw new Error(`Design ${id} was not found.`)
    return deserializeDesign(JSON.stringify(data))
  }
}

export function supabaseAssets(sb: SupabaseClient, tenantId: string): RemoteAssets {
  const pathOf = (m: Pick<AssetMeta, 'id' | 'mime'>) => `${tenantId}/${m.id}.${EXT[m.mime] ?? 'bin'}`
  return {
    async upload(meta, blob) {
      const path = pathOf(meta)
      const { error } = await sb.storage.from('uploads').upload(path, blob, { contentType: storedType(meta.mime), upsert: false })
      // "already exists" is fine: content-addressed, identical bytes.
      if (error && !/exists|duplicate/i.test(error.message)) throw errMsg(error, 'Upload failed')
      const { error: e2 } = await sb.rpc('register_asset', { p: { ...meta, tenantId, path } })
      if (e2) throw errMsg(e2, 'Upload registration failed')
    },
    async download(id) {
      const { data: meta } = await sb.rpc('get_asset', { p_id: id })
      if (!meta) return null
      const { data: signed } = await sb.storage.from('uploads').createSignedUrl(meta.path, 120)
      if (!signed) return null
      const res = await fetch(signed.signedUrl)
      if (!res.ok) return null
      const blob = new Blob([await res.arrayBuffer()], { type: meta.mime })
      const { path: _p, ...rest } = meta
      void _p
      return { meta: rest as AssetMeta, blob }
    },
  }
}

export async function loadRemoteCatalog(sb: SupabaseClient, tenantId: string): Promise<Catalog | null> {
  const { data } = await sb.from('catalogs').select('catalog').eq('tenant_id', tenantId).maybeSingle()
  return (data?.catalog as Catalog | undefined) ?? null
}

export async function saveRemoteCatalog(sb: SupabaseClient, tenantId: string, catalog: Catalog) {
  const { error } = await sb.from('catalogs').upsert({ tenant_id: tenantId, catalog })
  if (error) throw errMsg(error, 'Could not publish the catalog (are you a tenant admin?)')
}

/** Anonymous cart identity: a random bearer id kept in this browser. */
export function cartSessionId(): string {
  const k = 'cart-session'
  try {
    let v = localStorage.getItem(k)
    if (!v) { v = crypto.randomUUID().replace(/-/g, ''); localStorage.setItem(k, v) }
    return v
  } catch {
    return (window as any).__cartSession ??= crypto.randomUUID().replace(/-/g, '')
  }
}

/** Server-validated cart: the edge function re-validates and re-prices; the client total is only compared. */
export class SupabaseCartAdapter implements CommerceAdapter {
  readonly name = 'supabase'
  private sb: SupabaseClient
  private tenantId: string
  constructor(sb: SupabaseClient, tenantId: string) { this.sb = sb; this.tenantId = tenantId }
  async addToCart(r: ConfigurationResult): Promise<CartResponse> {
    const previews: Record<string, string> = {}
    for (const [view, dataUrl] of Object.entries(r.previews)) {
      const path = `previews/${r.configurationId}-${view}.webp`
      const blob = await (await fetch(dataUrl)).blob()
      const { error } = await this.sb.storage.from('uploads').upload(path, blob, { contentType: 'image/webp', upsert: false })
      if (!error || /exists|duplicate/i.test(error.message)) previews[view] = path
    }
    const { data, error } = await this.sb.functions.invoke('add-to-cart', {
      body: { tenantId: this.tenantId, configurationId: r.configurationId, sessionId: cartSessionId(), clientTotal: r.pricingSnapshot.total, previews },
    })
    if (error) {
      const detail = await (error as any).context?.json?.().catch(() => null)
      throw new Error(detail?.issues?.[0]?.message ?? detail?.error ?? error.message)
    }
    return { ok: true, message: data.priceMismatch ? 'Added to cart — price updated to the current store price.' : undefined }
  }
  async items(): Promise<(ConfigurationResult & { cartItemId: string; serverTotal: number })[]> {
    const { data } = await this.sb.rpc('get_cart', { p_session: cartSessionId() })
    const items = (data ?? []) as (ConfigurationResult & { cartItemId: string; serverTotal: number })[]
    // Preview paths → short-lived signed URLs.
    for (const i of items) for (const [k, p] of Object.entries(i.previews ?? {})) {
      const { data: s } = await this.sb.storage.from('uploads').createSignedUrl(p, 600)
      i.previews[k] = s?.signedUrl ?? ''
    }
    return items
  }
  async remove(cartItemId: string) {
    await this.sb.rpc('remove_cart_item', { p_session: cartSessionId(), p_id: cartItemId })
  }
}
