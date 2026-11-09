// Production package: the manufacturing source of truth. Independent of the 3D preview.
import { zipSync, strToU8 } from 'fflate'
import { DESIGN_PPI, hasArtwork, orderUnits, totalQty, type BulkRow, type DesignState } from '../core/design'
import type { Catalog } from '../core/types'
import { resolve, sizeScale } from '../products/lookup'
import { validateDesign, needsApproval } from '../validation/validate'
import { renderDoc, renderDocSvg } from '../design-engine/docs'
import { getAssetBlob, getAssetMeta } from '../assets/assetStore'
import { stableStringify } from '../state/serialize'
import { computePrice } from '../pricing/pricing'
import { priceInput } from '../pricing/priceInput'

export interface ManifestAreaFile { rowId?: string; name?: string; number?: string; sizeId?: string; production: string; vector: string; widthPx: number; heightPx: number; physicalWidthIn: number; physicalHeightIn: number }

export interface Manifest {
  manifestVersion: 1
  orderId: string
  configurationId: string
  createdAt: string
  productId: string
  productName: string
  modelId: string
  variantId: string
  size: string
  quantity: number
  units: { sku: string; sizeId: string; qty: number; name?: string; number?: string }[]
  baseColor: Record<string, { id: string; name: string; hex: string; mfrId?: string }>
  material: { id: string; label: string }
  printingMethod: { id: string; label: string }
  printSizing: 'constant' | 'scale'
  areas: {
    areaId: string; label: string; panel: string
    physicalWidth: number; physicalHeight: number; units: 'in'
    resolution: number; safeArea: number; bleed: number
    exclusions: { label: string; kind: string; xIn: number; yIn: number; wIn: number; hIn: number }[]
    objects: unknown[]
    productionFile: string; vectorFile: string; designFile: string; previewFile: string | null
    files: ManifestAreaFile[]
  }[]
  fonts: { family: string; license: string; source: string }[]
  assets: { assetId: string; name: string; mime: string; width: number; height: number; file: string }[]
  validation: { requiresApproval: boolean; warnings: string[] }
  pricing: ReturnType<typeof computePrice>
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'x'

async function canvasPng(c: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
  if (!blob) throw new Error('PNG encoding failed (image too large for this browser?)')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Browser blob: URLs don't survive outside this tab — inline them so SVGs are self-contained. */
async function inlineBlobUrls(svg: string): Promise<string> {
  const urls = [...new Set(svg.match(/blob:[^"')\s]+/g) ?? [])]
  for (const u of urls) {
    const b = await (await fetch(u)).blob()
    const data = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(b) })
    svg = svg.split(u).join(data)
  }
  return svg
}

const dataUrlBytes = (d: string) => Uint8Array.from(atob(d.split(',')[1] ?? ''), (c) => c.charCodeAt(0))

export async function buildProductionPackage(catalog: Catalog, d: DesignState, ids: { orderId: string; configurationId: string }, previews: Record<string, string> = {}, onProgress?: (msg: string) => void) {
  const { product, model, method, material, size } = resolve(catalog, d)
  const dpi = method.goodDpi || 300
  const files: Record<string, Uint8Array> = {}
  const units = orderUnits(d)
  const issues = validateDesign(catalog, d)
  const bulkRows: (BulkRow | undefined)[] = d.bulk.enabled && d.bulk.rows.length ? d.bulk.rows : [undefined]
  const usedAssets = new Set<string>()
  const fonts = new Set<string>()

  const areas: Manifest['areas'] = []
  for (const area of model.printAreas) {
    const doc = d.areas[area.id]
    if (!hasArtwork(doc)) continue
    doc!.objects.forEach((o) => { if (o.assetId) usedAssets.add(o.assetId); if (o.fontFamily) fonts.add(o.fontFamily) })
    const personalised = doc!.objects.some((o) => o.bulkField)
    // Per-row files when names/numbers vary or print scales with each row's size; otherwise one shared file.
    const rows = personalised || product.printSizing === 'scale' ? bulkRows : [undefined]
    const out: ManifestAreaFile[] = []
    for (const row of rows) {
      const scale = sizeScale(product, row?.sizeId ?? d.sizeId)
      const suffix = row ? `__${String(d.bulk.rows.indexOf(row) + 1).padStart(2, '0')}-${slug(row.name || row.number || row.id)}` : ''
      onProgress?.(`Rendering ${area.label}${row ? ` (${row.name || row.number})` : ''}…`)
      const png = await renderDoc(doc!, area, dpi * scale, personalised ? row : undefined)
      const svg = await inlineBlobUrls(await renderDocSvg(doc!, area, personalised ? row : undefined))
      const base = `${area.id}${suffix}`
      files[`print/${base}.png`] = await canvasPng(png)
      files[`print/${base}.svg`] = strToU8(svg)
      out.push({ rowId: row?.id, name: row?.name, number: row?.number, sizeId: row?.sizeId, production: `print/${base}.png`, vector: `print/${base}.svg`, widthPx: png.width, heightPx: png.height, physicalWidthIn: area.rect.wIn * scale, physicalHeightIn: area.rect.hIn * scale })
    }
    files[`design/${area.id}.json`] = strToU8(stableStringify(doc!.json))
    const previewFile = previews[area.camera] ? `preview/${area.camera}.png` : null
    areas.push({
      areaId: area.id, label: area.label, panel: area.panel, physicalWidth: area.rect.wIn, physicalHeight: area.rect.hIn, units: 'in',
      resolution: dpi, safeArea: area.safeInsetIn, bleed: area.bleedIn,
      exclusions: area.exclusions.map(({ label, kind, xIn, yIn, wIn, hIn }) => ({ label, kind, xIn, yIn, wIn, hIn })),
      objects: doc!.objects.map((o) => ({ ...o, bboxIn: { x: o.bbox.x / DESIGN_PPI, y: o.bbox.y / DESIGN_PPI, w: o.bbox.w / DESIGN_PPI, h: o.bbox.h / DESIGN_PPI } })),
      productionFile: out[0].production, vectorFile: out[0].vector, designFile: `design/${area.id}.json`, previewFile, files: out,
    })
  }

  for (const [view, url] of Object.entries(previews)) files[`preview/${view}.png`] = dataUrlBytes(url)

  const assets: Manifest['assets'] = []
  for (const id of usedAssets) {
    const [blob, meta] = await Promise.all([getAssetBlob(id), getAssetMeta(id)])
    if (!blob || !meta) continue
    const file = `assets/${id}.${EXT[meta.mime] ?? 'bin'}`
    files[file] = new Uint8Array(await blob.arrayBuffer())
    assets.push({ assetId: id, name: meta.name, mime: meta.mime, width: meta.width, height: meta.height, file })
  }

  const colors: Manifest['baseColor'] = {}
  for (const [zone, cid] of Object.entries(d.colors)) {
    const c = product.colors.find((x) => x.id === cid)
    if (c) colors[zone] = { id: c.id, name: c.name, hex: c.hex, mfrId: c.mfrId }
  }
  const manifest: Manifest = {
    manifestVersion: 1, orderId: ids.orderId, configurationId: ids.configurationId, createdAt: new Date().toISOString(),
    productId: product.id, productName: product.title, modelId: model.id, variantId: size.sku, size: size.id, quantity: totalQty(d),
    units: units.map((u) => ({ sku: product.sizes.find((s) => s.id === u.sizeId)?.sku ?? u.sizeId, sizeId: u.sizeId, qty: u.qty, name: u.row?.name, number: u.row?.number })),
    baseColor: colors, material: { id: material.id, label: material.label }, printingMethod: { id: method.id, label: method.label }, printSizing: product.printSizing,
    areas,
    fonts: [...fonts].map((f) => { const def = catalog.fonts.find((x) => x.family === f); return { family: f, license: def?.license ?? 'unknown', source: def?.source ?? 'unknown' } }),
    assets,
    validation: { requiresApproval: needsApproval(issues), warnings: issues.filter((i) => i.severity !== 'error').map((i) => i.message) },
    pricing: computePrice(catalog.pricing, priceInput(catalog, d)),
  }
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2))
  onProgress?.('Compressing…')
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [`${ids.orderId}/${k}`, v])), { level: 6 })
  return { zip, manifest }
}

export function downloadBytes(bytes: Uint8Array | Blob, filename: string, type = 'application/zip') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
