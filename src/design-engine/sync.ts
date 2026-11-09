// Store ⇄ editor ⇄ 3D texture orchestration. Keeps exactly one live Fabric canvas; every
// other area is rendered from JSON only when its data changes from outside the editor.
import { hasArtwork } from '../core/design'
import type { PrintSurface } from '../3d/printSurface'
import { resolve } from '../products/lookup'
import { useStore } from '../state/store'
import { missingAssets } from '../assets/assetStore'
import { validateDesign } from '../validation/validate'
import { renderDoc } from './docs'
import { editor } from './editor'

let surface: PrintSurface | null = null
let renderToken = 0

const TEX_PPI = { low: 28, medium: 40, high: 60 } as const

export function setSurface(s: PrintSurface | null) {
  surface = s
  editor.onBitmap = (id, bmp) => surface?.setAreaBitmap(id, bmp)
  if (s) {
    const st = useStore.getState()
    s.setFinish(resolve(st.catalog, st.design).method.finish)
    s.setGuides(st.activeAreaId, st.mode !== 'view')
    renderInactive()
    editor.pushBitmap(false)
  }
}

async function renderInactive() {
  const t = ++renderToken
  const st = useStore.getState()
  const { model } = resolve(st.catalog, st.design)
  const s = surface
  if (!s) return
  for (const area of model.printAreas) {
    if (area.id === st.activeAreaId && editor.area?.id === area.id) continue
    const doc = st.design.areas[area.id]
    if (!hasArtwork(doc)) { s.setAreaBitmap(area.id, null); continue }
    try {
      const bmp = await renderDoc(doc!, area, editor.texPpi)
      if (t !== renderToken || s !== surface) return
      s.setAreaBitmap(area.id, bmp)
    } catch (e) {
      console.error('Area render failed', area.id, e)
    }
  }
}

function loadActive() {
  const st = useStore.getState()
  const { model } = resolve(st.catalog, st.design)
  const area = model.printAreas.find((a) => a.id === st.activeAreaId) ?? model.printAreas[0]
  if (!area) return
  editor.garmentHex = garmentHex(area.panel)
  editor.loadArea(area, st.design.areas[area.id])
}

function garmentHex(panelId: string) {
  const st = useStore.getState()
  const { product, model } = resolve(st.catalog, st.design)
  const zone = model.panels.find((p) => p.id === panelId)?.colorZone ?? 'body'
  const id = st.design.colors[zone] ?? st.design.colors.body
  return product.colors.find((c) => c.id === id)?.hex ?? '#ffffff'
}

async function refreshMissing() {
  const ids = Object.values(useStore.getState().design.areas).flatMap((a) => a.objects.map((o) => o.assetId).filter((x): x is string => !!x))
  const missing = await missingAssets(ids)
  const prev = useStore.getState().missingAssets
  if (prev.length !== missing.size || prev.some((x) => !missing.has(x))) useStore.setState({ missingAssets: [...missing] })
}

let flagTimer = 0
function refreshFlags() {
  clearTimeout(flagTimer)
  flagTimer = window.setTimeout(() => {
    const st = useStore.getState()
    const issues = validateDesign(st.catalog, st.design, { missingAssets: new Set(st.missingAssets) })
    const map = new Map<string, 'error' | 'warning'>()
    for (const i of issues) if (i.objectId && i.areaId === st.activeAreaId) {
      if (i.severity === 'error' || !map.has(i.objectId)) map.set(i.objectId, i.severity === 'error' ? 'error' : 'warning')
    }
    editor.setFlags(map)
  }, 150)
}

export function startSync() {
  loadActive()
  refreshMissing()
  refreshFlags()
  return useStore.subscribe((s, p) => {
    const modelChanged = s.design.modelId !== p.design.modelId || s.design.productId !== p.design.productId
    if (s.externalRev !== p.externalRev || s.activeAreaId !== p.activeAreaId || modelChanged) loadActive()
    if (s.externalRev !== p.externalRev && !modelChanged) renderInactive()
    if (s.quality !== p.quality) { editor.texPpi = TEX_PPI[s.quality]; }
    if (s.design.methodId !== p.design.methodId && surface) surface.setFinish(resolve(s.catalog, s.design).method.finish)
    if ((s.mode !== p.mode || s.activeAreaId !== p.activeAreaId) && surface) surface.setGuides(s.activeAreaId, s.mode !== 'view')
    if (s.design.colors !== p.design.colors && editor.area) { editor.garmentHex = garmentHex(editor.area.panel); editor.canvas.requestRenderAll() }
    if (s.design !== p.design) { refreshFlags(); if (s.externalRev !== p.externalRev || s.assetsRev !== p.assetsRev) refreshMissing() }
  })
}

export const texPpiFor = (q: keyof typeof TEX_PPI) => TEX_PPI[q]
