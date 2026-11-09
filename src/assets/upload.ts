// Untrusted upload pipeline: size → signature → decode → dimension limits → SVG sanitisation → store.
import DOMPurify from 'dompurify'
import { sniff } from './sniff'
import { putAsset, type AssetMeta } from './assetStore'

export const UPLOAD_LIMITS = { maxBytes: 25 * 1024 * 1024, maxSide: 12000, maxPixels: 80_000_000, minSide: 16 }

export class UploadError extends Error {}

function readWithProgress(file: File, onProgress?: (p: number) => void): Promise<ArrayBuffer> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    r.onload = () => res(r.result as ArrayBuffer)
    r.onerror = () => rej(new UploadError('The file could not be read.'))
    r.readAsArrayBuffer(file)
  })
}

/** Strips scripts, event handlers, foreignObject and any non-fragment references (no network fetches from artwork). */
export function sanitizeSvg(text: string): string {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    for (const attr of ['href', 'xlink:href']) {
      const v = node.getAttribute(attr)
      if (v && !v.startsWith('#') && !/^data:image\/(png|jpeg|webp);base64,/i.test(v)) node.removeAttribute(attr)
    }
    const style = node.getAttribute('style')
    if (style && /url\(\s*['"]?(?!#)/i.test(style)) node.removeAttribute('style')
  })
  try {
    return DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'script', 'style'], FORBID_ATTR: ['onload', 'onerror', 'onclick'] })
  } finally {
    DOMPurify.removeHook('afterSanitizeAttributes')
  }
}

function svgSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const w = parseFloat(svg.getAttribute('width') ?? '') || vb?.[2] || 0
  const h = parseFloat(svg.getAttribute('height') ?? '') || vb?.[3] || 0
  return { w, h }
}

export interface UploadResult { meta: AssetMeta; svgText?: string }

export async function processUpload(file: File, onProgress?: (p: number) => void): Promise<UploadResult> {
  if (file.size > UPLOAD_LIMITS.maxBytes) throw new UploadError(`That file is ${(file.size / 1048576).toFixed(1)} MB — the limit is ${UPLOAD_LIMITS.maxBytes / 1048576} MB.`)
  if (file.size === 0) throw new UploadError('That file is empty.')
  const buf = await readWithProgress(file, onProgress)
  const type = sniff(new Uint8Array(buf))
  if (!type) throw new UploadError('Unsupported file. Upload a PNG, JPG, WebP or SVG image.')
  if (type === 'application/pdf') throw new UploadError('PDF artwork needs server-side conversion, which isn’t enabled for this store. Export your PDF as SVG or PNG.')

  if (type === 'image/svg+xml') {
    const raw = new TextDecoder().decode(buf)
    const clean = sanitizeSvg(raw)
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml')
    const root = doc.documentElement
    if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') throw new UploadError('This SVG is malformed and can’t be used.')
    if (!root.querySelector('path,rect,circle,ellipse,polygon,polyline,line,text,image')) throw new UploadError('This SVG has no drawable content.')
    const { w, h } = svgSize(root as unknown as SVGSVGElement)
    const text = new XMLSerializer().serializeToString(root)
    const meta = await putAsset(new Blob([text], { type }), { kind: 'svg', mime: type, name: file.name, width: w || 512, height: h || 512, hasAlpha: true })
    return { meta, svgText: text }
  }

  const blob = new Blob([buf], { type })
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(blob)
  } catch {
    throw new UploadError('This image is corrupted or can’t be decoded.')
  }
  const { width, height } = bmp
  if (width < UPLOAD_LIMITS.minSide || height < UPLOAD_LIMITS.minSide) { bmp.close(); throw new UploadError('This image is too small to print.') }
  if (width > UPLOAD_LIMITS.maxSide || height > UPLOAD_LIMITS.maxSide || width * height > UPLOAD_LIMITS.maxPixels) {
    bmp.close()
    throw new UploadError(`This image is ${width}×${height}px; the maximum is ${UPLOAD_LIMITS.maxSide}px per side.`)
  }
  let hasAlpha = false
  if (type !== 'image/jpeg') {
    const c = document.createElement('canvas')
    c.width = Math.min(128, width); c.height = Math.min(128, height)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { hasAlpha = true; break }
  }
  bmp.close()
  const meta = await putAsset(blob, { kind: 'raster', mime: type, name: file.name, width, height, hasAlpha })
  return { meta }
}
