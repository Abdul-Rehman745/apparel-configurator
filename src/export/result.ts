// Immutable, platform-neutral order payload. Everything checkout needs, frozen at add-to-cart time.
import { totalQty, type DesignState } from '../core/design'
import type { Catalog } from '../core/types'
import { resolve } from '../products/lookup'
import { computePrice, type PriceResult } from '../pricing/pricing'
import { priceInput } from '../pricing/priceInput'
import { serializeDesign } from '../state/serialize'
import { validateDesign, needsApproval } from '../validation/validate'
import { hashBytes } from '../assets/assetStore'

export interface ConfigurationResult {
  resultVersion: 1
  configurationId: string
  createdAt: string
  tenantId: string
  product: { id: string; title: string; modelId: string }
  variant: { sizeId: string; sku: string; colors: Record<string, string>; materialId: string; methodId: string }
  quantity: number
  units: { sizeId: string; sku: string; qty: number; name?: string; number?: string }[]
  /** Serialised DesignState — reproduces the order even if the catalog changes later. */
  configurationSnapshot: string
  snapshotHash: string
  pricingSnapshot: PriceResult
  previews: Record<string, string>
  productionJob: { id: string; status: 'pending' | 'requires_approval' }
}

async function thumb(dataUrl: string, max = 640): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) })
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/webp', 0.85)
}

export async function buildConfigurationResult(catalog: Catalog, tenantId: string, d: DesignState, configurationId: string, previews: Record<string, string>): Promise<ConfigurationResult> {
  const { product, model, size } = resolve(catalog, d)
  const snapshot = serializeDesign(d)
  const snapshotHash = await hashBytes(new TextEncoder().encode(snapshot).buffer as ArrayBuffer)
  const issues = validateDesign(catalog, d)
  const thumbs: Record<string, string> = {}
  for (const [k, v] of Object.entries(previews)) thumbs[k] = await thumb(v)
  const skuOf = (id: string) => product.sizes.find((s) => s.id === id)?.sku ?? id
  const units = d.bulk.enabled && d.bulk.rows.length
    ? d.bulk.rows.map((r) => ({ sizeId: r.sizeId, sku: skuOf(r.sizeId), qty: r.qty, name: r.name, number: r.number }))
    : [{ sizeId: d.sizeId, sku: skuOf(d.sizeId), qty: d.quantity }]
  return Object.freeze({
    resultVersion: 1, configurationId, createdAt: new Date().toISOString(), tenantId,
    product: { id: product.id, title: product.title, modelId: model.id },
    variant: { sizeId: size.id, sku: size.sku, colors: { ...d.colors }, materialId: d.materialId, methodId: d.methodId },
    quantity: totalQty(d), units, configurationSnapshot: snapshot, snapshotHash,
    pricingSnapshot: computePrice(catalog.pricing, priceInput(catalog, d)), previews: thumbs,
    productionJob: { id: `JOB-${configurationId}`, status: needsApproval(issues) ? 'requires_approval' : 'pending' },
  }) as ConfigurationResult
}
