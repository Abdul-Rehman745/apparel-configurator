// E-commerce integration adapters. The configurator only ever emits a ConfigurationResult;
// platform specifics live here and are chosen by tenant configuration.
import { createStore, get, set } from 'idb-keyval'
import type { Tenant } from '../core/types'
import type { ConfigurationResult } from '../export/result'
import { fetchWithTimeout } from './designApi'
import { supabase, SupabaseCartAdapter } from './supabase'

export interface CartResponse { ok: true; cartUrl?: string; message?: string }
export interface CommerceAdapter {
  readonly name: string
  addToCart(r: ConfigurationResult): Promise<CartResponse>
  /** Adapters that own the cart (local, Supabase) can list and remove items. */
  items?(): Promise<(ConfigurationResult & { cartItemId?: string; serverTotal?: number })[]>
  remove?(id: string): Promise<void>
}

const cartStore = createStore('apparel-cart', 'cart')

/** Demo/offline cart kept in IndexedDB. */
export class LocalCartAdapter implements CommerceAdapter {
  readonly name = 'local'
  async addToCart(r: ConfigurationResult) {
    const items = (await get<ConfigurationResult[]>('items', cartStore)) ?? []
    await set('items', [...items, r], cartStore)
    return { ok: true as const }
  }
  items() { return LocalCartAdapter.items() }
  remove(id: string) { return LocalCartAdapter.remove(id) }
  static async items() { return (await get<ConfigurationResult[]>('items', cartStore)) ?? [] }
  static async remove(configurationId: string) {
    const items = await LocalCartAdapter.items()
    await set('items', items.filter((i) => i.configurationId !== configurationId), cartStore)
  }
}

/** Generic REST: POST the full result; the backend owns pricing re-verification and order creation. */
export class RestAdapter implements CommerceAdapter {
  readonly name = 'rest'
  private endpoint: string
  constructor(endpoint: string) { this.endpoint = endpoint }
  async addToCart(r: ConfigurationResult) {
    const res = await fetchWithTimeout(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) })
    return { ok: true as const, ...(await res.json().catch(() => ({}))) }
  }
}

/**
 * Shopify Ajax Cart API. `sku` must be the Shopify variant id for each size (set in the catalog).
 * Underscore-prefixed properties are hidden from customers but visible to fulfilment apps.
 */
export class ShopifyAdapter implements CommerceAdapter {
  readonly name = 'shopify'
  private root: string
  constructor(root = '') { this.root = root }
  async addToCart(r: ConfigurationResult) {
    const items = r.units.map((u) => ({
      id: Number(u.sku), quantity: u.qty,
      properties: { _configuration_id: r.configurationId, _snapshot_hash: r.snapshotHash, _production_job: r.productionJob.id, ...(u.name ? { Name: u.name } : {}), ...(u.number ? { Number: u.number } : {}) },
    }))
    await fetchWithTimeout(`${this.root}/cart/add.js`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) })
    return { ok: true as const, cartUrl: `${this.root}/cart` }
  }
}

/** WooCommerce Store API. Requires the store's `Nonce` header (provided by the host page). */
export class WooCommerceAdapter implements CommerceAdapter {
  readonly name = 'woocommerce'
  private root: string
  private nonce: string
  constructor(root: string, nonce: string) { this.root = root; this.nonce = nonce }
  async addToCart(r: ConfigurationResult) {
    for (const u of r.units) {
      await fetchWithTimeout(`${this.root}/wp-json/wc/store/v1/cart/add-item`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', Nonce: this.nonce },
        body: JSON.stringify({ id: Number(u.sku), quantity: u.qty, meta_data: [{ key: '_configuration_id', value: r.configurationId }, { key: '_snapshot_hash', value: r.snapshotHash }] }),
      })
    }
    return { ok: true as const, cartUrl: `${this.root}/cart` }
  }
}

export class GraphQLAdapter implements CommerceAdapter {
  readonly name = 'graphql'
  private endpoint: string
  constructor(endpoint: string) { this.endpoint = endpoint }
  async addToCart(r: ConfigurationResult) {
    const query = 'mutation AddConfiguredItem($input: ConfiguredItemInput!) { addConfiguredItem(input: $input) { cartUrl } }'
    const res = await fetchWithTimeout(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { input: r } }) })
    const json = await res.json()
    if (json.errors?.length) throw new Error(json.errors[0].message)
    return { ok: true as const, cartUrl: json.data?.addConfiguredItem?.cartUrl }
  }
}

/** For iframe embeds: hands the result to the host page, restricted to its configured origin. */
export class PostMessageAdapter implements CommerceAdapter {
  readonly name = 'postMessage'
  private origin: string
  constructor(origin: string) { this.origin = origin }
  async addToCart(r: ConfigurationResult) {
    if (window.parent === window) throw new Error('Not embedded in a host page.')
    window.parent.postMessage({ type: 'configurator:add-to-cart', payload: r }, this.origin)
    return { ok: true as const, message: 'Sent to store' }
  }
}

export function commerceFor(t: Tenant): CommerceAdapter {
  const c = t.commerce
  switch (c.adapter) {
    case 'rest': return new RestAdapter(c.endpoint!)
    case 'shopify': return new ShopifyAdapter(c.endpoint ?? '')
    case 'woocommerce': return new WooCommerceAdapter(c.endpoint!, (window as any).__CONFIGURATOR__?.wooNonce ?? '')
    case 'graphql': return new GraphQLAdapter(c.endpoint!)
    case 'postMessage': return new PostMessageAdapter(c.endpoint!)
    case 'supabase': if (supabase) return new SupabaseCartAdapter(supabase, t.id); return new LocalCartAdapter()
    default: return new LocalCartAdapter()
  }
}
