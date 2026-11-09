// The single live Fabric editor. Only the active print area is ever loaded into it;
// other areas live as JSON in the store and are rendered offscreen on demand.
import { ActiveSelection, Canvas, FabricImage, FabricObject, Group, IText, Point, Shadow, type TPointerEventInfo } from 'fabric'
import { DESIGN_PPI, type AreaDesign } from '../core/design'
import type { PrintArea } from '../core/types'
import { bumpEditor, commit, toast, useStore } from '../state/store'
import { applyCurve, applyPattern, hydrateJSON, reviveSpecials, summarize, toStoredJSON, type AnyObj, type PatternSpec } from './docs'
import { setDeleteHandler, setupFabric } from './fabricSetup'
import { uid } from './objects'

export type AlignTo = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

const SNAP_PX = 7
const MARGIN_PX = 28

class Editor {
  canvas!: Canvas
  host!: HTMLDivElement
  area: PrintArea | null = null
  onBitmap: ((areaId: string, bmp: HTMLCanvasElement) => void) | null = null
  texPpi = 40
  /** Garment colour behind the print area so artwork is judged against the real shirt. */
  garmentHex = '#ffffff'
  flagged = new Map<string, 'error' | 'warning'>()
  private loading = false
  private token = 0
  private guides: { x: number[]; y: number[] } = { x: [], y: [] }
  private clipboard: FabricObject | null = null
  private ro: ResizeObserver | null = null
  private fastPending = false
  private lastFast = 0

  get W() { return (this.area?.rect.wIn ?? 1) * DESIGN_PPI }
  get H() { return (this.area?.rect.hIn ?? 1) * DESIGN_PPI }
  get zoom() { return this.canvas.getZoom() }

  init(primary: string) {
    if (this.canvas) return
    setupFabric(primary)
    this.host = document.createElement('div')
    this.host.className = 'editor-host'
    const el = document.createElement('canvas')
    el.setAttribute('aria-label', 'Print area design canvas')
    this.host.appendChild(el)
    this.canvas = new Canvas(el, {
      width: 360, height: 420, preserveObjectStacking: true, controlsAboveOverlay: true, backgroundColor: '',
      selectionColor: 'rgba(31,94,255,0.08)', selectionBorderColor: primary, selectionLineWidth: 1, uniformScaling: true, targetFindTolerance: 6,
    })
    setDeleteHandler(() => this.deleteSelection())
    this.bindEvents()
  }

  // ---------- mounting / viewport ----------

  attach(slot: HTMLElement) {
    slot.appendChild(this.host)
    this.ro?.disconnect()
    this.ro = new ResizeObserver(() => this.resize(slot))
    this.ro.observe(slot)
    this.resize(slot)
  }

  detach(slot: HTMLElement) {
    if (this.host.parentElement === slot) {
      this.ro?.disconnect()
      slot.removeChild(this.host)
    }
  }

  private resize(slot: HTMLElement) {
    const w = Math.max(120, Math.floor(slot.clientWidth)), h = Math.max(120, Math.floor(slot.clientHeight))
    if (w === this.canvas.width && h === this.canvas.height) return
    this.canvas.setDimensions({ width: w, height: h })
    this.fit()
  }

  fit() {
    if (!this.area) return
    const cw = this.canvas.width, ch = this.canvas.height
    const bleed = this.area.bleedIn * DESIGN_PPI
    const z = Math.min((cw - MARGIN_PX * 2) / (this.W + bleed * 2), (ch - MARGIN_PX * 2) / (this.H + bleed * 2))
    this.canvas.setViewportTransform([z, 0, 0, z, (cw - this.W * z) / 2, (ch - this.H * z) / 2])
    this.canvas.requestRenderAll()
  }

  // ---------- loading & committing ----------

  async loadArea(area: PrintArea, doc: AreaDesign | undefined) {
    const t = ++this.token
    this.loading = true
    this.area = area
    try {
      const { json, missing } = await hydrateJSON(doc?.json ?? { objects: [] })
      if (t !== this.token) return
      await this.canvas.loadFromJSON(json)
      if (t !== this.token) return
      await reviveSpecials(this.canvas.getObjects())
      this.canvas.getObjects().forEach((o) => this.applyLockState(o))
      this.canvas.backgroundColor = ''
      if (missing.length) toast(`${missing.length} uploaded image(s) for ${area.label} are missing from this device. Re-upload them before ordering.`, 'error', 7000)
    } catch (e) {
      console.error(e)
      toast(`The ${area.label} design couldn't be loaded. It has been left untouched.`, 'error')
    } finally {
      if (t === this.token) {
        this.loading = false
        this.fit()
        this.pushBitmap(false)
        useStore.setState({ selection: [] })
        bumpEditor()
      }
    }
  }

  /** Writes the live canvas back to the store (one undo step, optionally coalesced by key). */
  commit(label: string, key?: string) {
    if (this.loading || !this.area) return
    const doc: AreaDesign = { json: toStoredJSON(this.canvas), objects: summarize(this.canvas.getObjects()) }
    commit(label, { areas: { [this.area.id]: doc } }, { key })
    this.pushBitmap(false)
    bumpEditor()
  }

  /** Renders exactly the print area (no pasteboard, controls or guides) for the 3D texture. */
  renderBitmap(pxPerIn: number): HTMLCanvasElement {
    const z = this.zoom, v = this.canvas.viewportTransform
    return this.canvas.toCanvasElement(pxPerIn / DESIGN_PPI / z, { left: v[4], top: v[5], width: this.W * z, height: this.H * z })
  }

  pushBitmap(fast: boolean) {
    if (!this.area || !this.onBitmap || this.loading) return
    const areaId = this.area.id
    if (!fast) { this.onBitmap(areaId, this.renderBitmap(this.texPpi)); return }
    // Throttled low-res updates during continuous drags; full quality follows on release.
    if (this.fastPending) return
    this.fastPending = true
    requestAnimationFrame(() => {
      this.fastPending = false
      const now = performance.now()
      if (now - this.lastFast < 50 || !this.area || this.area.id !== areaId) return
      this.lastFast = now
      this.onBitmap?.(areaId, this.renderBitmap(this.texPpi * 0.5))
    })
  }

  // ---------- events ----------

  private bindEvents() {
    const c = this.canvas
    c.on('object:modified', () => this.commit('Transform'))
    c.on('text:changed', (e) => { this.syncAutoName(e.target as AnyObj); this.commit('Edit text', 'text:' + (e.target as AnyObj).uid) })
    c.on('object:moving', (e) => { this.snap(e.target); this.pushBitmap(true) })
    c.on('object:scaling', () => this.pushBitmap(true))
    c.on('object:rotating', () => this.pushBitmap(true))
    c.on('mouse:up', () => { if (this.guides.x.length || this.guides.y.length) { this.guides = { x: [], y: [] }; c.requestRenderAll() } })
    const sel = () => { useStore.setState({ selection: c.getActiveObjects().map((o) => (o as AnyObj).uid) }); bumpEditor() }
    c.on('selection:created', sel)
    c.on('selection:updated', sel)
    c.on('selection:cleared', sel)
    c.on('before:render', ({ ctx }) => { if (!(c as any).skipControlsDrawing) this.drawPasteboard(ctx) })
    c.on('after:render', ({ ctx }) => { if (!(c as any).skipControlsDrawing) this.drawOverlays(ctx) })
    c.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      if (!opt.e.ctrlKey) return // plain wheel scrolls the page/panel; ctrl/pinch zooms
      const z = Math.min(12, Math.max(0.2, c.getZoom() * 0.999 ** opt.e.deltaY))
      c.zoomToPoint(new Point(opt.e.offsetX, opt.e.offsetY), z)
      opt.e.preventDefault()
    })
  }

  private toScreen(x: number, y: number) {
    const v = this.canvas.viewportTransform
    return [x * v[0] + v[4], y * v[3] + v[5]] as const
  }

  private drawPasteboard(ctx: CanvasRenderingContext2D) {
    if (!this.area) return
    const [x0, y0] = this.toScreen(0, 0), [x1, y1] = this.toScreen(this.W, this.H)
    ctx.save()
    ctx.fillStyle = getComputedStyle(this.host).getPropertyValue('--c-pasteboard') || '#eef0f3'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0)
    ctx.fillStyle = this.garmentHex
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
    ctx.restore()
  }

  private drawOverlays(ctx: CanvasRenderingContext2D) {
    const a = this.area
    if (!a) return
    const z = this.zoom
    const rect = (x: number, y: number, w: number, h: number) => { const [sx, sy] = this.toScreen(x, y); return [sx, sy, w * z, h * z] as const }
    ctx.save()
    // Bleed (outside), trim/print boundary, safe area.
    if (a.bleedIn > 0) {
      const b = a.bleedIn * DESIGN_PPI
      ctx.setLineDash([2, 4]); ctx.strokeStyle = '#d9a400'; ctx.lineWidth = 1
      ctx.strokeRect(...rect(-b, -b, this.W + 2 * b, this.H + 2 * b))
    }
    ctx.setLineDash([]); ctx.strokeStyle = '#2e9f5a'; ctx.lineWidth = 1.5
    ctx.strokeRect(...rect(0, 0, this.W, this.H))
    const s = a.safeInsetIn * DESIGN_PPI
    ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(217,164,0,0.9)'; ctx.lineWidth = 1
    ctx.strokeRect(...rect(s, s, this.W - 2 * s, this.H - 2 * s))
    // No-print zones: hatched red.
    for (const ex of a.exclusions) {
      const [x, y, w, h] = rect(ex.xIn * DESIGN_PPI, ex.yIn * DESIGN_PPI, ex.wIn * DESIGN_PPI, ex.hIn * DESIGN_PPI)
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(210,59,59,0.14)'; ctx.fillRect(x, y, w, h)
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
      ctx.strokeStyle = 'rgba(210,59,59,0.5)'; ctx.lineWidth = 1
      for (let i = -h; i < w; i += 8) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke() }
      ctx.restore()
      if (w > 60 && h > 14) { ctx.fillStyle = '#b02a2a'; ctx.font = '600 10px system-ui'; ctx.fillText(ex.label.toUpperCase(), x + 4, y + 12) }
    }
    // Validation outlines (not colour-only: dashed pattern differs by severity).
    for (const o of this.canvas.getObjects() as AnyObj[]) {
      const f = this.flagged.get(o.uid)
      if (!f || !o.visible) continue
      const r = o.getBoundingRect()
      ctx.strokeStyle = f === 'error' ? '#d23b3b' : '#d9a400'
      ctx.setLineDash(f === 'error' ? [5, 3] : [2, 3]); ctx.lineWidth = 2
      ctx.strokeRect(...rect(r.left - 2, r.top - 2, r.width + 4, r.height + 4))
    }
    // Smart guides
    ctx.setLineDash([]); ctx.strokeStyle = '#ff2d9b'; ctx.lineWidth = 1
    for (const gx of this.guides.x) { const [sx] = this.toScreen(gx, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, this.canvas.height); ctx.stroke() }
    for (const gy of this.guides.y) { const [, sy] = this.toScreen(0, gy); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(this.canvas.width, sy); ctx.stroke() }
    ctx.restore()
  }

  private snap(target: FabricObject | undefined) {
    if (!target || !this.area) return
    const th = SNAP_PX / this.zoom
    const s = this.area.safeInsetIn * DESIGN_PPI
    const xs = [0, s, this.W / 2, this.W - s, this.W], ys = [0, s, this.H / 2, this.H - s, this.H]
    const moving = new Set(this.canvas.getActiveObjects())
    for (const o of this.canvas.getObjects()) {
      if (moving.has(o) || !o.visible) continue
      const r = o.getBoundingRect()
      xs.push(r.left, r.left + r.width / 2, r.left + r.width)
      ys.push(r.top, r.top + r.height / 2, r.top + r.height)
    }
    const r = target.getBoundingRect()
    const best = (edges: number[], cands: number[]) => {
      let d = Infinity, at = 0
      for (const e of edges) for (const c of cands) if (Math.abs(c - e) < Math.abs(d)) { d = c - e; at = c }
      return Math.abs(d) <= th ? { d, at } : null
    }
    const bx = best([r.left, r.left + r.width / 2, r.left + r.width], xs)
    const by = best([r.top, r.top + r.height / 2, r.top + r.height], ys)
    this.guides = { x: bx ? [bx.at] : [], y: by ? [by.at] : [] }
    if (bx) target.set({ left: target.left + bx.d })
    if (by) target.set({ top: target.top + by.d })
    target.setCoords()
  }

  // ---------- object access ----------

  objects(): AnyObj[] { return this.canvas.getObjects() as AnyObj[] }
  active(): AnyObj | undefined { return this.canvas.getActiveObject() as AnyObj | undefined }
  byId(id: string): AnyObj | undefined { return this.objects().find((o) => o.uid === id) }

  applyLockState(o: FabricObject) {
    const a = o as AnyObj
    const templateLocked = a.lockLevel === 'locked' || a.lockLevel === 'hidden'
    const locked = templateLocked || !!a.lockedLayer
    o.set({
      lockMovementX: locked, lockMovementY: locked, lockScalingX: locked, lockScalingY: locked, lockRotation: locked,
      hasControls: !locked, selectable: a.lockLevel !== 'hidden' && a.lockLevel !== 'locked', evented: a.lockLevel !== 'hidden' && a.lockLevel !== 'locked',
    })
    if (a.lockLevel === 'hidden') o.set({ visible: true })
    if (o instanceof IText) o.set({ editable: !locked && !a.curve })
  }

  /** Adds an object centred in the area (fit to 60% if larger) and selects it. */
  add(o: FabricObject, label: string, opts: { at?: { x: number; y: number }; fit?: number } = {}) {
    if (!this.area) return
    const maxW = this.W * (opts.fit ?? 0.6), maxH = this.H * (opts.fit ?? 0.6)
    const w = o.getScaledWidth(), h = o.getScaledHeight()
    if (w > maxW || h > maxH) o.scale(Math.min(maxW / w, maxH / h) * (o.scaleX ?? 1))
    o.set({ left: opts.at?.x ?? this.W / 2, top: opts.at?.y ?? this.H / 2 })
    this.applyLockState(o)
    this.canvas.add(o)
    this.canvas.setActiveObject(o)
    o.setCoords()
    this.canvas.requestRenderAll()
    this.commit(label)
  }

  // ---------- property edits ----------

  set(o: AnyObj, props: Record<string, unknown>, label: string, key?: string) {
    o.set(props)
    this.syncAutoName(o)
    if (o instanceof IText) { o.initDimensions(); const curve = (o as AnyObj).curve; if (curve) applyCurve(o, curve) }
    o.setCoords()
    this.canvas.requestRenderAll()
    this.commit(label, key ? `${key}:${o.uid}` : undefined)
  }

  setCurve(t: IText, curve: number) {
    applyCurve(t, curve)
    this.applyLockState(t)
    this.canvas.requestRenderAll()
    this.commit('Curve text', 'curve:' + (t as AnyObj).uid)
  }

  setShadow(o: AnyObj, on: boolean) {
    o.set({ shadow: on ? new Shadow({ color: 'rgba(0,0,0,0.45)', blur: 6, offsetX: 3, offsetY: 3 }) : null })
    this.canvas.requestRenderAll()
    this.commit('Shadow')
  }

  async setPattern(o: AnyObj, spec: PatternSpec, key = 'pattern') {
    await applyPattern(o, spec)
    this.canvas.requestRenderAll()
    this.commit('Pattern', `${key}:${o.uid}`)
  }

  applyFilters(img: FabricImage, key: string) {
    img.applyFilters()
    this.canvas.requestRenderAll()
    this.commit('Image adjustment', `${key}:${(img as AnyObj).uid}`)
  }

  // ---------- selection operations ----------

  select(ids: string[]) {
    const objs = ids.map((id) => this.byId(id)).filter((o): o is AnyObj => !!o && o.selectable !== false)
    this.canvas.discardActiveObject()
    if (objs.length === 1) this.canvas.setActiveObject(objs[0])
    else if (objs.length > 1) this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }))
    this.canvas.requestRenderAll()
  }

  deleteSelection() {
    const objs = this.canvas.getActiveObjects().filter((o) => (o as AnyObj).lockLevel === 'editable' || !(o as AnyObj).lockLevel)
    if (!objs.length) return
    if (objs.some((o) => (o as AnyObj).required)) { toast('That layer is required by the template and can’t be deleted.', 'error'); return }
    this.canvas.discardActiveObject()
    objs.forEach((o) => this.canvas.remove(o))
    this.canvas.requestRenderAll()
    this.commit(objs.length > 1 ? `Delete ${objs.length} layers` : 'Delete layer')
  }

  async duplicate() {
    const src = this.canvas.getActiveObjects()
    if (!src.length) return
    const clones: FabricObject[] = []
    for (const o of src) {
      const c = (await o.clone()) as AnyObj
      c.set({ left: o.getCenterPoint().x + 12, top: o.getCenterPoint().y + 12, angle: o.angle })
      c.uid = uid(); c.name = `${(o as AnyObj).name} copy`; c.lockLevel = 'editable'; c.required = false; c.lockedLayer = false
      await reviveSpecials([c])
      this.applyLockState(c)
      this.canvas.add(c)
      clones.push(c)
    }
    this.canvas.discardActiveObject()
    this.canvas.setActiveObject(clones.length > 1 ? new ActiveSelection(clones, { canvas: this.canvas }) : clones[0])
    this.canvas.requestRenderAll()
    this.commit('Duplicate')
  }

  async copy() {
    const a = this.canvas.getActiveObject()
    if (a) this.clipboard = await a.clone()
  }

  async paste() {
    if (!this.clipboard) return
    const c = (await this.clipboard.clone()) as AnyObj
    const objs = c instanceof ActiveSelection ? c.removeAll() : [c]
    for (const o of objs as AnyObj[]) {
      o.set({ left: o.left + 14, top: o.top + 14 })
      o.uid = uid(); o.lockLevel = 'editable'; o.required = false
      await reviveSpecials([o])
      this.applyLockState(o)
      this.canvas.add(o)
    }
    this.clipboard.set({ left: this.clipboard.left + 14, top: this.clipboard.top + 14 })
    this.canvas.setActiveObject(objs.length > 1 ? new ActiveSelection(objs, { canvas: this.canvas }) : objs[0])
    this.canvas.requestRenderAll()
    this.commit('Paste')
  }

  nudge(dx: number, dy: number) {
    const a = this.canvas.getActiveObject() as AnyObj | undefined
    if (!a || a.lockMovementX) return
    a.set({ left: a.left + dx, top: a.top + dy })
    a.setCoords()
    this.canvas.requestRenderAll()
    this.commit('Move', 'nudge')
  }

  align(to: AlignTo) {
    const a = this.canvas.getActiveObject()
    if (!a) return
    const multi = a instanceof ActiveSelection && a.size() > 1
    const targets = multi ? (a as ActiveSelection).getObjects() : [a]
    // Multi-selection aligns items to each other; a single object aligns to the print area.
    const ref = multi ? a.getBoundingRect() : { left: 0, top: 0, width: this.W, height: this.H }
    if (multi) this.canvas.discardActiveObject()
    for (const o of targets) {
      const r = o.getBoundingRect(), c = o.getCenterPoint()
      let dx = 0, dy = 0
      if (to === 'left') dx = ref.left - r.left
      if (to === 'right') dx = ref.left + ref.width - (r.left + r.width)
      if (to === 'hcenter') dx = ref.left + ref.width / 2 - c.x
      if (to === 'top') dy = ref.top - r.top
      if (to === 'bottom') dy = ref.top + ref.height - (r.top + r.height)
      if (to === 'vcenter') dy = ref.top + ref.height / 2 - c.y
      o.set({ left: o.left + dx, top: o.top + dy })
      o.setCoords()
    }
    if (multi) this.canvas.setActiveObject(new ActiveSelection(targets, { canvas: this.canvas }))
    this.canvas.requestRenderAll()
    this.commit('Align')
  }

  distribute(axis: 'x' | 'y') {
    const a = this.canvas.getActiveObject()
    if (!(a instanceof ActiveSelection) || a.size() < 3) { toast('Select three or more layers to space them evenly.'); return }
    const objs = a.getObjects()
    this.canvas.discardActiveObject()
    const rects = objs.map((o) => ({ o, r: o.getBoundingRect() })).sort((p, q) => (axis === 'x' ? p.r.left - q.r.left : p.r.top - q.r.top))
    const start = axis === 'x' ? rects[0].r.left : rects[0].r.top
    const last = rects[rects.length - 1].r
    const end = axis === 'x' ? last.left + last.width : last.top + last.height
    const total = rects.reduce((s, { r }) => s + (axis === 'x' ? r.width : r.height), 0)
    const gap = (end - start - total) / (rects.length - 1)
    let cur = start
    for (const { o, r } of rects) {
      const d = cur - (axis === 'x' ? r.left : r.top)
      o.set(axis === 'x' ? { left: o.left + d } : { top: o.top + d })
      o.setCoords()
      cur += (axis === 'x' ? r.width : r.height) + gap
    }
    this.canvas.setActiveObject(new ActiveSelection(objs, { canvas: this.canvas }))
    this.canvas.requestRenderAll()
    this.commit('Distribute')
  }

  flip(axis: 'x' | 'y') {
    for (const o of this.canvas.getActiveObjects()) o.set(axis === 'x' ? { flipX: !o.flipX } : { flipY: !o.flipY })
    this.canvas.requestRenderAll()
    this.commit('Flip')
  }

  reorder(op: 'forward' | 'backward' | 'front' | 'back', ids?: string[]) {
    const objs = ids ? ids.map((i) => this.byId(i)).filter(Boolean) as AnyObj[] : (this.canvas.getActiveObjects() as AnyObj[])
    for (const o of objs) {
      if (op === 'forward') this.canvas.bringObjectForward(o)
      if (op === 'backward') this.canvas.sendObjectBackwards(o)
      if (op === 'front') this.canvas.bringObjectToFront(o)
      if (op === 'back') this.canvas.sendObjectToBack(o)
    }
    this.canvas.requestRenderAll()
    this.commit('Reorder layers')
  }

  /** Moves a layer to an absolute stack index (0 = bottom), used by drag-and-drop in the layers panel. */
  moveTo(id: string, index: number) {
    const o = this.byId(id)
    if (!o) return
    this.canvas.moveObjectTo(o, Math.max(0, Math.min(this.objects().length - 1, index)))
    this.canvas.requestRenderAll()
    this.commit('Reorder layers')
  }

  group() {
    const a = this.canvas.getActiveObject()
    if (!(a instanceof ActiveSelection) || a.size() < 2) return
    const objs = a.removeAll()
    this.canvas.discardActiveObject()
    objs.forEach((o) => this.canvas.remove(o))
    const g = new Group(objs, { uid: uid(), name: 'Group', kind: 'group', lockLevel: 'editable' } as any)
    this.canvas.add(g)
    this.canvas.setActiveObject(g)
    this.canvas.requestRenderAll()
    this.commit('Group')
  }

  ungroup() {
    const g = this.canvas.getActiveObject()
    if (!(g instanceof Group) || g instanceof ActiveSelection || (g as AnyObj).kind !== 'group') return
    const idx = this.canvas.getObjects().indexOf(g)
    this.canvas.remove(g)
    const items = g.removeAll()
    items.forEach((o, i) => { this.canvas.insertAt(idx + i, o); o.setCoords() })
    this.canvas.setActiveObject(new ActiveSelection(items, { canvas: this.canvas }))
    this.canvas.requestRenderAll()
    this.commit('Ungroup')
  }

  toggleVisible(id: string) {
    const o = this.byId(id)
    if (!o) return
    o.set({ visible: !o.visible })
    if (!o.visible) this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
    this.commit(o.visible ? 'Show layer' : 'Hide layer')
  }

  toggleLock(id: string) {
    const o = this.byId(id)
    if (!o || o.lockLevel !== 'editable') return
    o.lockedLayer = !o.lockedLayer
    this.applyLockState(o)
    this.canvas.requestRenderAll()
    this.commit(o.lockedLayer ? 'Lock layer' : 'Unlock layer')
  }

  /** Text layers are named after their content until the customer renames them. */
  private syncAutoName(o: AnyObj) {
    if (o.autoName && o instanceof IText) (o as AnyObj).name = o.text.split('\n')[0].slice(0, 24) || 'Text'
  }

  rename(id: string, name: string) {
    const o = this.byId(id)
    if (!o) return
    o.autoName = false
    o.name = name.slice(0, 60) || o.name
    this.commit('Rename layer', 'rename:' + id)
  }

  /** Fit/cover the selected image to the print (or safe) area. */
  fitSelection(mode: 'contain' | 'cover') {
    const o = this.active()
    if (!o || !this.area) return
    const s = this.area.safeInsetIn * DESIGN_PPI
    const w = this.W - 2 * s, h = this.H - 2 * s
    const ow = o.width, oh = o.height
    const k = mode === 'contain' ? Math.min(w / ow, h / oh) : Math.max(w / ow, h / oh)
    o.set({ scaleX: k * Math.sign(o.scaleX || 1), scaleY: k * Math.sign(o.scaleY || 1), angle: 0, left: this.W / 2, top: this.H / 2 })
    o.setCoords()
    this.canvas.requestRenderAll()
    this.commit(mode === 'contain' ? 'Fit to area' : 'Fill area')
  }

  // ---------- 3D direct manipulation (Fabric stays authoritative) ----------

  /** Topmost selectable object at area-local design coordinates. */
  hitTest(x: number, y: number): AnyObj | undefined {
    const p = new Point(x, y)
    const objs = this.objects()
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i]
      if (o.visible && o.evented !== false && o.selectable !== false && o.containsPoint(p)) return o
    }
    return undefined
  }

  dragBy(o: AnyObj, dx: number, dy: number) {
    if (o.lockMovementX) return
    o.set({ left: o.left + dx, top: o.top + dy })
    o.setCoords()
    this.canvas.requestRenderAll()
    this.pushBitmap(true)
  }

  setFlags(map: Map<string, 'error' | 'warning'>) {
    this.flagged = map
    this.canvas?.requestRenderAll()
  }
}

export const editor = new Editor()
