// User-level flows that span several modules (save, share, cart, export).
import { designApi, newConfigId, autosave } from '../api/designApi'
import { commerceFor } from '../api/commerce'
import { track } from '../api/analytics'
import { viewer } from '../3d/bridge'
import { buildConfigurationResult } from '../export/result'
import { buildProductionPackage, downloadBytes } from '../export/production'
import { renderDoc } from '../design-engine/docs'
import { hasArtwork } from '../core/design'
import { resolve } from '../products/lookup'
import { blocking, validateDesign } from '../validation/validate'
import { defaultDesign, replaceDesign, toast, useStore } from '../state/store'

const prefix = () => {
  const s = useStore.getState()
  return resolve(s.catalog, s.design).product.slug.replace(/-/g, '')
}

export async function saveDesign(): Promise<string | null> {
  const s = useStore.getState()
  try {
    const id = await designApi.save(s.design, prefix())
    useStore.setState({ configurationId: id })
    history.replaceState(null, '', `/design/${id}${location.search}`)
    toast(`Design saved · ${id}`, 'success')
    track('design_saved', { configurationId: id })
    return id
  } catch (e) {
    toast(`Couldn’t save: ${(e as Error).message}`, 'error')
    return null
  }
}

export async function loadDesign(id: string) {
  try {
    const d = await designApi.load(id)
    const s = useStore.getState()
    if (!s.catalog.products.some((p) => p.id === d.productId)) throw new Error('This design’s product is no longer available.')
    replaceDesign(d, id)
    toast(`Opened design ${id}`, 'success')
  } catch (e) {
    toast((e as Error).message, 'error', 7000)
  }
}

export async function startNew() {
  if (!confirm('Start a new design? Your current design will be cleared (save or share it first to keep it).')) return
  const s = useStore.getState()
  replaceDesign(defaultDesign(s.catalog, s.design.productId))
  await autosave.clear()
  history.replaceState(null, '', `/${location.search}`)
}

/** 3D screenshots when available; otherwise flat renders of each decorated area. */
export async function capturePreviews(views = ['front', 'back', 'left', 'right', 'full'], background: 'transparent' | 'studio' = 'studio'): Promise<Record<string, string>> {
  const v = viewer()
  if (v && useStore.getState().webgl) {
    try { return await v.capture({ views, background }) } catch (e) { console.error(e) }
  }
  const s = useStore.getState()
  const { model } = resolve(s.catalog, s.design)
  const out: Record<string, string> = {}
  for (const a of model.printAreas) {
    const doc = s.design.areas[a.id]
    if (hasArtwork(doc)) out[a.id] = (await renderDoc(doc!, a, 60)).toDataURL('image/png')
  }
  return out
}

export async function addToCart(): Promise<boolean> {
  const s = useStore.getState()
  const issues = validateDesign(s.catalog, s.design, { missingAssets: new Set(s.missingAssets) })
  if (blocking(issues).length) {
    track('validation_failed', { count: blocking(issues).length })
    toast('Please fix the highlighted issues before adding to cart.', 'error')
    return false
  }
  try {
    const id = s.configurationId ?? (await designApi.save(s.design, prefix()))
    const previews = await capturePreviews(['front', 'back'])
    const result = await buildConfigurationResult(s.catalog, s.tenant.id, s.design, id, previews)
    const res = await commerceFor(s.tenant).addToCart(result)
    useStore.setState({ configurationId: id })
    track('add_to_cart', { configurationId: id, total: result.pricingSnapshot.total, quantity: result.quantity })
    toast(res.message ?? 'Added to cart', 'success')
    if (res.cartUrl) location.href = res.cartUrl
    return true
  } catch (e) {
    toast(`Couldn’t add to cart: ${(e as Error).message}`, 'error', 7000)
    return false
  }
}

export async function downloadPreviews(background: 'transparent' | 'studio') {
  const shots = await capturePreviews(['front', 'back', 'left', 'right', 'full'], background)
  for (const [k, url] of Object.entries(shots)) {
    const bytes = Uint8Array.from(atob(url.split(',')[1]), (c) => c.charCodeAt(0))
    downloadBytes(bytes, `preview-${k}.png`, 'image/png')
  }
}

export async function exportProduction(onProgress: (m: string) => void) {
  const s = useStore.getState()
  const configurationId = s.configurationId ?? (await designApi.save(s.design, prefix()))
  useStore.setState({ configurationId })
  const orderId = `ORD-${newConfigId('X').split('-')[1]}`
  onProgress('Capturing previews…')
  const previews = await capturePreviews(['front', 'back', 'left', 'right'], 'transparent')
  const { zip } = await buildProductionPackage(s.catalog, s.design, { orderId, configurationId }, previews, onProgress)
  downloadBytes(zip, `${orderId}.zip`)
  return orderId
}
