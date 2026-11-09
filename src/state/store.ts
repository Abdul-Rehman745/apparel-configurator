// Central normalised state. Three.js objects and Fabric canvases are *views* of this
// state — neither stores business data. History entries hold minimal before/after patches.
import { create } from 'zustand'
import type { Catalog, Id, Tenant } from '../core/types'
import { SCHEMA_VERSION, type AreaDesign, type DesignState } from '../core/design'
import { resolve } from '../products/lookup'
import { remapAreas } from '../design-engine/remap'
import { track } from '../api/analytics'

export type Mode = 'view' | 'design' | 'precision'
export type Tool = 'product' | 'designs' | 'text' | 'upload' | 'clipart' | 'shapes' | 'patterns' | 'layers' | 'team'
export type Quality = 'low' | 'medium' | 'high'
export type Dialog = null | 'share' | 'size' | 'review' | 'cart' | 'preview' | 'export' | 'help'

export interface Toast { id: number; kind: 'info' | 'error' | 'success'; text: string }

type Patch = Partial<Omit<DesignState, 'areas'>> & { areas?: Record<Id, AreaDesign> }
interface HistoryEntry { label: string; before: Patch; after: Patch; key?: string; at: number }

export interface AppState {
  catalog: Catalog
  tenant: Tenant
  design: DesignState
  configurationId: string | null
  /** Bumped whenever design areas change from outside the live editor (undo, load, template, model switch). */
  externalRev: number
  /** Bumped on any editor change so inspector panels re-read the live Fabric selection. */
  editorRev: number
  past: HistoryEntry[]
  future: HistoryEntry[]
  mode: Mode
  tool: Tool | null
  activeAreaId: Id
  selection: string[]
  quality: Quality
  cameraRequest: { id: Id; n: number }
  toasts: Toast[]
  dialog: Dialog
  webgl: boolean
  assetsRev: number
  missingAssets: string[]
}

const EMPTY: AreaDesign = { json: null, objects: [] }
const HISTORY_LIMIT = 150

export function defaultDesign(catalog: Catalog, productId?: Id): DesignState {
  const product = catalog.products.find((p) => p.id === productId && p.published) ?? catalog.products.find((p) => p.published) ?? catalog.products[0]
  const model = product.models[0]
  const colors: Record<Id, Id> = {}
  for (const z of model.colorZones) colors[z.id] = product.colors[0].id
  return {
    schemaVersion: SCHEMA_VERSION,
    productId: product.id,
    modelId: model.id,
    sizeId: product.referenceSize,
    quantity: Math.max(1, product.minQty ?? 1),
    materialId: product.materials[0],
    colors,
    methodId: product.defaultMethod,
    areas: {},
    bulk: { enabled: false, rows: [] },
  }
}

export const useStore = create<AppState>(() => ({} as AppState))

const get = () => useStore.getState()
const set = useStore.setState

export function initStore(catalog: Catalog, tenant: Tenant, design?: DesignState) {
  const d = design ?? defaultDesign(catalog)
  const { model } = resolve(catalog, d)
  const q: Quality = matchMedia('(max-width: 767px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4 ? 'low' : 'medium'
  set({
    catalog, tenant, design: d, configurationId: null, externalRev: 1, editorRev: 0, past: [], future: [],
    mode: 'view', tool: matchMedia('(max-width: 1100px)').matches ? null : 'product', activeAreaId: model.printAreas[0]?.id ?? '', selection: [], quality: q,
    cameraRequest: { id: 'front', n: 0 }, toasts: [], dialog: null, webgl: true, assetsRev: 0, missingAssets: [],
  })
}

function applyPatch(d: DesignState, p: Patch): DesignState {
  const { areas, ...rest } = p
  return { ...d, ...rest, areas: areas ? { ...d.areas, ...areas } : d.areas }
}

function inverse(d: DesignState, p: Patch): Patch {
  const before: Patch = {}
  for (const k of Object.keys(p) as (keyof Patch)[]) {
    if (k === 'areas') before.areas = Object.fromEntries(Object.keys(p.areas!).map((id) => [id, d.areas[id] ?? EMPTY]))
    else (before as Record<string, unknown>)[k] = d[k as keyof DesignState]
  }
  return before
}

/**
 * The single write path for design changes.
 * `key` coalesces rapid edits (typing, slider drags) into one undo step.
 * `external` tells the live editor to reload because the change didn't originate there.
 */
export function commit(label: string, patch: Patch, opts: { key?: string; external?: boolean; history?: boolean } = {}) {
  const s = get()
  const before = inverse(s.design, patch)
  const design = applyPatch(s.design, patch)
  const now = Date.now()
  let past = s.past
  if (opts.history !== false) {
    const last = past[past.length - 1]
    if (opts.key && last?.key === opts.key && now - last.at < 1200) {
      past = [...past.slice(0, -1), { ...last, after: { ...last.after, ...patch, areas: patch.areas ? { ...last.after.areas, ...patch.areas } : last.after.areas }, at: now }]
    } else {
      past = [...past, { label, before, after: patch, key: opts.key, at: now }].slice(-HISTORY_LIMIT)
    }
  }
  const touchesAreas = !!patch.areas || !!patch.modelId || !!patch.productId
  set({ design, past, future: opts.history === false ? s.future : [], externalRev: opts.external && touchesAreas ? s.externalRev + 1 : s.externalRev })
}

export function undo() {
  const s = get()
  const e = s.past[s.past.length - 1]
  if (!e) return
  set({ design: applyPatch(s.design, e.before), past: s.past.slice(0, -1), future: [...s.future, e], externalRev: s.externalRev + 1 })
  fixActiveArea()
}

export function redo() {
  const s = get()
  const e = s.future[s.future.length - 1]
  if (!e) return
  set({ design: applyPatch(s.design, e.after), future: s.future.slice(0, -1), past: [...s.past, e], externalRev: s.externalRev + 1 })
  fixActiveArea()
}

function fixActiveArea() {
  const s = get()
  const { model } = resolve(s.catalog, s.design)
  if (!model.printAreas.some((a) => a.id === s.activeAreaId)) set({ activeAreaId: model.printAreas[0]?.id ?? '' })
}

export function replaceDesign(design: DesignState, configurationId: string | null = null) {
  set({ design, configurationId, past: [], future: [], externalRev: get().externalRev + 1, selection: [] })
  fixActiveArea()
}

// ---- configuration actions ----

export function setActiveArea(id: Id, moveCamera = true) {
  const s = get()
  const { model } = resolve(s.catalog, s.design)
  const area = model.printAreas.find((a) => a.id === id)
  if (!area) return
  set({ activeAreaId: id, selection: [], ...(moveCamera ? { cameraRequest: { id: area.camera, n: s.cameraRequest.n + 1 } } : {}) })
  track('print_area_selected', { areaId: id })
}

export function requestCamera(id: Id) {
  set({ cameraRequest: { id, n: get().cameraRequest.n + 1 } })
}

export function setProduct(productId: Id) {
  const s = get()
  const product = s.catalog.products.find((p) => p.id === productId)
  if (!product || product.id === s.design.productId) return
  const from = resolve(s.catalog, s.design).model
  const next = defaultDesign(s.catalog, productId)
  const model = product.models[0]
  // Carry over compatible choices and artwork.
  for (const z of Object.keys(next.colors)) {
    const keep = s.design.colors[z] ?? s.design.colors.body
    if (product.colors.some((c) => c.id === keep)) next.colors[z] = keep
  }
  if (product.printMethods.includes(s.design.methodId)) next.methodId = s.design.methodId
  if (product.materials.includes(s.design.materialId)) next.materialId = s.design.materialId
  if (product.sizes.some((x) => x.id === s.design.sizeId)) next.sizeId = s.design.sizeId
  next.quantity = s.design.quantity
  next.bulk = s.design.bulk
  next.areas = remapAreas(s.design.areas, from.printAreas, model.printAreas)
  commit(`Product: ${product.title}`, next, { external: true })
  fixActiveArea()
  track('product_changed', { productId })
}

export function setModel(modelId: Id) {
  const s = get()
  const { product, model: from } = resolve(s.catalog, s.design)
  const to = product.models.find((m) => m.id === modelId)
  if (!to || to.id === from.id) return
  const colors = { ...s.design.colors }
  for (const z of to.colorZones) colors[z.id] ??= colors.body
  commit(`Model: ${to.label}`, { modelId, colors, areas: remapAreas(s.design.areas, from.printAreas, to.printAreas) }, { external: true })
  fixActiveArea()
  track('product_changed', { productId: product.id, modelId })
}

export function setColor(zone: Id, colorId: Id) {
  const s = get()
  const { model } = resolve(s.catalog, s.design)
  // Single-zone products colour every zone together.
  const { product } = resolve(s.catalog, s.design)
  const colors = product.multiZoneColors ? { ...s.design.colors, [zone]: colorId } : Object.fromEntries(model.colorZones.map((z) => [z.id, colorId]))
  commit('Garment colour', { colors })
  track('color_changed', { zone, colorId })
}

export const setMaterial = (materialId: Id) => commit('Fabric', { materialId })
export const setMethod = (methodId: Id) => commit('Print method', { methodId })
export const setSize = (sizeId: Id) => commit('Size', { sizeId }, { key: 'size' })
export const setQuantity = (quantity: number) => commit('Quantity', { quantity: Math.max(1, Math.min(10000, Math.round(quantity) || 1)) }, { key: 'qty' })
export const setBulk = (bulk: DesignState['bulk'], key = 'bulk') => commit('Team list', { bulk }, { key })

export function setMode(mode: Mode) {
  set({ mode })
}

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info', ms = 4200) {
  const id = ++toastId
  set({ toasts: [...get().toasts, { id, kind, text }] })
  setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms)
}

export const openDialog = (dialog: Dialog) => set({ dialog })
export const setTool = (tool: Tool | null) => set({ tool })
export const bumpEditor = () => set({ editorRev: get().editorRev + 1 })
