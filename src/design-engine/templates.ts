import { StaticCanvas, type FabricObject } from 'fabric'
import { DESIGN_PPI, type AreaDesign } from '../core/design'
import type { Template } from '../core/types'
import { commit, defaultDesign, toast, useStore } from '../state/store'
import { resolve } from '../products/lookup'
import { summarize, toStoredJSON, type AnyObj } from './docs'
import { createClipart, createText } from './objects'
import { track } from '../api/analytics'

export async function applyTemplate(t: Template) {
  const st = useStore.getState()
  const product = st.catalog.products.find((p) => p.id === t.productId)
  if (!product) { toast('This template’s product is no longer available.', 'error'); return }
  const base = st.design.productId === product.id ? { ...st.design } : defaultDesign(st.catalog, product.id)
  // Patches merge area maps, so previous areas must be cleared explicitly (a template starts fresh).
  const cleared = Object.fromEntries(Object.keys(st.design.areas).map((id) => [id, { json: null, objects: [] } as AreaDesign]))
  const design = { ...base, modelId: t.modelId ?? base.modelId, templateId: t.id, restrictFonts: t.restrictFonts, restrictColors: t.restrictColors, areas: cleared }
  if (t.colors) for (const [zone, c] of Object.entries(t.colors)) if (zone in design.colors || zone === 'body') design.colors[zone] = c
  if (t.methodId && product.printMethods.includes(t.methodId)) design.methodId = t.methodId
  const { model } = resolve(st.catalog, design)
  for (const [areaId, els] of Object.entries(t.areas)) {
    const area = model.printAreas.find((a) => a.id === areaId)
    if (!area) continue
    const W = area.rect.wIn * DESIGN_PPI, H = area.rect.hIn * DESIGN_PPI
    const sc = new StaticCanvas(document.createElement('canvas'), { width: W, height: H, renderOnAddRemove: false })
    for (const el of els) {
      let o: FabricObject
      if (el.kind === 'text') o = await createText({ text: el.text ?? '', fontFamily: el.fontFamily ?? 'Inter', fontSizeIn: el.fontSize ?? 1, fill: el.fill, name: el.name })
      else {
        o = await createClipart(el.clipartId!, el.fill)
        const w = (el.widthFrac ?? 0.3) * W
        o.scale(w / o.width)
      }
      Object.assign(o as AnyObj, { name: el.name, lockLevel: el.lock, required: !!el.required, bulkField: el.bulkField })
      o.set({ left: el.x * W, top: el.y * H })
      o.setCoords()
      sc.add(o)
    }
    design.areas[areaId] = { json: toStoredJSON(sc), objects: summarize(sc.getObjects()) }
    sc.dispose()
  }
  commit(`Template: ${t.title}`, design, { external: true })
  const first = Object.keys(t.areas).find((id) => model.printAreas.some((a) => a.id === id))
  if (first) useStore.setState({ activeAreaId: first, cameraRequest: { id: model.printAreas.find((a) => a.id === first)!.camera, n: useStore.getState().cameraRequest.n + 1 } })
  track('product_changed', { productId: product.id, templateId: t.id })
}
