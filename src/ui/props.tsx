import { useRef } from 'react'
import { ActiveSelection, FabricImage, Group, IText, filters } from 'fabric'
import { DESIGN_PPI } from '../core/design'
import { editor } from '../design-engine/editor'
import type { AnyObj } from '../design-engine/docs'
import { createImage, createSvg, recolor } from '../design-engine/objects'
import { processUpload, UploadError } from '../assets/upload'
import { imageDpi, rateDpi } from '../print-areas/dpi'
import { sizeScale } from '../products/lookup'
import { toast, useStore } from '../state/store'
import { Field, IconButton, NumberInput, Section, Segmented, Slider, Swatches } from './common'
import { FontPicker } from './panels/TextPanel'
import { useResolved } from './hooks'

const DEFAULT_INKS = ['#111111', '#ffffff', '#1f2a44', '#2250a8', '#b3202c', '#26452f', '#e2a927', '#f08a24', '#6d3fa0', '#a7a8aa', '#f4b6c2', '#8fc1e3']

/** Colours the customer may choose: thread palette for embroidery, template restriction, or a default set + custom. */
function useInks() {
  const { method } = useResolved()
  const restrict = useStore((s) => s.design.restrictColors)
  if (method.palette) return { colors: method.palette, custom: false, note: `${method.label} thread colours` }
  if (restrict) return { colors: restrict, custom: false, note: 'Brand colours' }
  return { colors: DEFAULT_INKS, custom: true, note: '' }
}

function Ink({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const inks = useInks()
  return (
    <Field label={label} hint={inks.note || undefined}>
      <Swatches label={label} value={typeof value === 'string' ? value : ''} colors={inks.colors.map((hex) => ({ hex }))} allowCustom={inks.custom} onChange={onChange} />
    </Field>
  )
}

export function CommonProps({ o }: { o: AnyObj }) {
  const multi = o instanceof ActiveSelection
  const locked = !!o.lockMovementX
  const inch = (v: number) => v / DESIGN_PPI
  const aspectLocked = !o.aspectUnlocked && (o instanceof FabricImage || o.kind === 'svg' || o.kind === 'clipart' || o.kind === 'qr')
  const setSize = (wIn: number | null, hIn: number | null) => {
    const w = o.width, h = o.height
    let sx = wIn !== null ? (wIn * DESIGN_PPI) / w : o.scaleX, sy = hIn !== null ? (hIn * DESIGN_PPI) / h : o.scaleY
    if (aspectLocked) { if (wIn !== null) sy = sx; else sx = sy }
    editor.set(o, { scaleX: sx, scaleY: sy }, 'Resize')
  }
  return (
    <Section title={multi ? `${(o as ActiveSelection).size()} layers` : 'Position & size'}>
      {!multi && (
        <div className="grid-2">
          <Field label="X (in)"><NumberInput label="X position in inches" value={inch(o.left)} onCommit={(v) => editor.set(o, { left: v * DESIGN_PPI }, 'Move')} /></Field>
          <Field label="Y (in)"><NumberInput label="Y position in inches" value={inch(o.top)} onCommit={(v) => editor.set(o, { top: v * DESIGN_PPI }, 'Move')} /></Field>
          <Field label="Width (in)"><NumberInput label="Width in inches" value={inch(o.getScaledWidth())} min={0.05} onCommit={(v) => setSize(v, null)} /></Field>
          <Field label="Height (in)"><NumberInput label="Height in inches" value={inch(o.getScaledHeight())} min={0.05} onCommit={(v) => setSize(null, v)} /></Field>
        </div>
      )}
      {!multi && (o instanceof FabricImage || o.kind === 'svg' || o.kind === 'clipart') && (
        <label className="check small">
          <input type="checkbox" checked={!!o.aspectUnlocked} onChange={(e) => { o.aspectUnlocked = e.target.checked; o.setControlsVisibility({ ml: e.target.checked, mr: e.target.checked, mt: e.target.checked, mb: e.target.checked }); editor.commit('Aspect lock') }} />
          <span>Allow stretching (unlock aspect ratio)</span>
        </label>
      )}
      {!multi && <Slider label="Rotation" value={Math.round(o.angle ?? 0)} min={-180} max={180} unit="°" onChange={(v) => { o.rotate(v); editor.set(o, {}, 'Rotate', 'rotate') }} />}
      <Slider label="Opacity" value={Math.round((o.opacity ?? 1) * 100)} min={5} max={100} unit="%" onChange={(v) => editor.set(o, { opacity: v / 100 }, 'Opacity', 'opacity')} />
      <div className="btn-row wrap" role="toolbar" aria-label="Align">
        <IconButton icon="alignL" label="Align left" onClick={() => editor.align('left')} disabled={locked} />
        <IconButton icon="alignCH" label="Centre horizontally" onClick={() => editor.align('hcenter')} disabled={locked} />
        <IconButton icon="alignR" label="Align right" onClick={() => editor.align('right')} disabled={locked} />
        <IconButton icon="alignT" label="Align top" onClick={() => editor.align('top')} disabled={locked} />
        <IconButton icon="alignCV" label="Centre vertically" onClick={() => editor.align('vcenter')} disabled={locked} />
        <IconButton icon="alignB" label="Align bottom" onClick={() => editor.align('bottom')} disabled={locked} />
        {multi && <IconButton icon="distH" label="Space evenly horizontally" onClick={() => editor.distribute('x')} />}
        {multi && <IconButton icon="distV" label="Space evenly vertically" onClick={() => editor.distribute('y')} />}
      </div>
      <div className="btn-row wrap" role="toolbar" aria-label="Arrange">
        <IconButton icon="flipH" label="Flip horizontal" onClick={() => editor.flip('x')} disabled={locked} />
        <IconButton icon="flipV" label="Flip vertical" onClick={() => editor.flip('y')} disabled={locked} />
        <IconButton icon="up" label="Bring forward" onClick={() => editor.reorder('forward')} />
        <IconButton icon="down" label="Send backward" onClick={() => editor.reorder('backward')} />
        {multi ? <IconButton icon="group" label="Group" onClick={() => editor.group()} /> : o.kind === 'group' && <IconButton icon="ungroup" label="Ungroup" onClick={() => editor.ungroup()} />}
        {!multi && <IconButton icon={o.lockedLayer ? 'lock' : 'unlock'} label={o.lockedLayer ? 'Unlock' : 'Lock'} onClick={() => editor.toggleLock(o.uid)} />}
        <IconButton icon="copy" label="Duplicate" onClick={() => editor.duplicate()} />
        <IconButton icon="trash" label="Delete" onClick={() => editor.deleteSelection()} className="danger" />
      </div>
    </Section>
  )
}

export function TextProps({ t }: { t: IText & AnyObj }) {
  const { method } = useResolved()
  const curved = !!t.curve
  const caseOf = t.text === t.text.toUpperCase() ? 'upper' : t.text === t.text.toLowerCase() ? 'lower' : 'mixed'
  return (
    <>
      <Section title="Text">
        <textarea className="text-input" rows={Math.min(4, t.text.split('\n').length + 1)} value={t.text} aria-label="Text content"
          onChange={(e) => editor.set(t, { text: e.target.value }, 'Edit text', 'text')} readOnly={!!t.lockMovementX && t.lockLevel === 'locked'} />
        {t.bulkField && <p className="muted small">Linked to team {t.bulkField} — each player’s value replaces this in production.</p>}
        <div className="grid-2">
          <Field label="Size (in)"><NumberInput label="Font size in inches" value={(t.fontSize * t.scaleY) / DESIGN_PPI} min={0.1} max={20} onCommit={(v) => editor.set(t, { fontSize: (v * DESIGN_PPI) / t.scaleY }, 'Font size')} /></Field>
          <Field label="Case">
            <select value={caseOf} onChange={(e) => editor.set(t, { text: e.target.value === 'upper' ? t.text.toUpperCase() : e.target.value === 'lower' ? t.text.toLowerCase() : t.text.replace(/\b\w/g, (c) => c.toUpperCase()) }, 'Text case')}>
              <option value="mixed">Aa</option><option value="upper">AA</option><option value="lower">aa</option>
            </select>
          </Field>
        </div>
        <div className="btn-row wrap" role="toolbar" aria-label="Text style">
          <button className={`tbtn ${t.fontWeight === 'bold' || +t.fontWeight >= 600 ? 'is-on' : ''}`} onClick={() => editor.set(t, { fontWeight: t.fontWeight === 'bold' || +t.fontWeight >= 600 ? 'normal' : 'bold' }, 'Bold')} aria-label="Bold"><b>B</b></button>
          <button className={`tbtn ${t.fontStyle === 'italic' ? 'is-on' : ''}`} onClick={() => editor.set(t, { fontStyle: t.fontStyle === 'italic' ? 'normal' : 'italic' }, 'Italic')} aria-label="Italic"><i>I</i></button>
          <button className={`tbtn ${t.underline ? 'is-on' : ''}`} onClick={() => editor.set(t, { underline: !t.underline }, 'Underline')} aria-label="Underline"><u>U</u></button>
          <Segmented label="Alignment" value={t.textAlign as 'left' | 'center' | 'right'} onChange={(v) => editor.set(t, { textAlign: v }, 'Align text')} options={[{ value: 'left', label: 'L', title: 'Left' }, { value: 'center', label: 'C', title: 'Centre' }, { value: 'right', label: 'R', title: 'Right' }]} />
        </div>
        <Slider label="Letter spacing" value={t.charSpacing ?? 0} min={-100} max={800} step={10} onChange={(v) => editor.set(t, { charSpacing: v }, 'Letter spacing', 'spacing')} />
        <Slider label="Line height" value={t.lineHeight ?? 1} min={0.7} max={2.5} step={0.05} onChange={(v) => editor.set(t, { lineHeight: v }, 'Line height', 'lh')} />
        <Slider label="Curve" value={t.curve ?? 0} min={-100} max={100} format={(v) => (v === 0 ? 'Straight' : v > 0 ? `Arch ${v}` : `Dip ${-v}`)} onChange={(v) => editor.setCurve(t, v)} />
        {curved && <p className="muted small">Curved text is edited in the box above.</p>}
      </Section>
      <Section title="Colour">
        <Ink label="Fill" value={t.fill as string} onChange={(c) => editor.set(t, { fill: c }, 'Text colour', 'fill')} />
        <Ink label="Outline" value={(t.stroke as string) || '#000000'} onChange={(c) => editor.set(t, { stroke: c, strokeWidth: t.strokeWidth || 0.04 * DESIGN_PPI }, 'Outline colour', 'stroke')} />
        <Slider label="Outline width" value={(t.strokeWidth ?? 0) / DESIGN_PPI} min={0} max={0.3} step={0.01} unit='"' onChange={(v) => editor.set(t, { strokeWidth: v * DESIGN_PPI, stroke: t.stroke || '#000000', paintFirst: 'stroke' }, 'Outline width', 'strokew')} />
        <label className="check small">
          <input type="checkbox" checked={!!t.shadow} disabled={!method.allowsShadow && !t.shadow} onChange={(e) => editor.setShadow(t, e.target.checked)} />
          <span>Drop shadow {!method.allowsShadow && <em className="muted">(not printable with {method.label})</em>}</span>
        </label>
      </Section>
      <Section title="Font">
        <FontPicker value={t.fontFamily} onPick={(f) => editor.set(t, { fontFamily: f }, 'Font')} />
      </Section>
    </>
  )
}

function setFilter(img: FabricImage, type: string, f: any | null) {
  const list = (img.filters ?? []).filter((x: any) => x?.type !== type)
  img.filters = f ? [...list, f] : list
}
const getFilter = (img: FabricImage, type: string) => (img.filters ?? []).find((x: any) => x?.type === type) as any

export function ImageProps({ img }: { img: FabricImage & AnyObj }) {
  const design = useStore((s) => s.design)
  const areaId = useStore((s) => s.activeAreaId)
  const { method, product } = useResolved()
  const file = useRef<HTMLInputElement>(null)
  const summary = design.areas[areaId]?.objects.find((o) => o.id === img.uid)
  const dpi = summary?.image ? imageDpi(summary.image, sizeScale(product, design.sizeId)) : null
  const rating = dpi !== null ? rateDpi(dpi, method) : 'n/a'
  const nw = (img as any)._originalElement?.naturalWidth ?? img.width, nh = (img as any)._originalElement?.naturalHeight ?? img.height
  const crop = { l: img.cropX / nw, t: img.cropY / nh, r: 1 - (img.cropX + img.width) / nw, b: 1 - (img.cropY + img.height) / nh }
  const setCrop = (k: 'l' | 't' | 'r' | 'b', v: number) => {
    const c = { ...crop, [k]: v }
    if (c.l + c.r > 0.9 || c.t + c.b > 0.9) return
    editor.set(img, { cropX: c.l * nw, cropY: c.t * nh, width: nw * (1 - c.l - c.r), height: nh * (1 - c.t - c.b) }, 'Crop', 'crop')
  }
  const adj = (type: string, make: (v: number) => any, v: number, neutral: number) => {
    setFilter(img, type, v === neutral ? null : make(v))
    editor.applyFilters(img, type)
  }
  const bright = getFilter(img, 'Brightness')?.brightness ?? 0
  const contrast = getFilter(img, 'Contrast')?.contrast ?? 0
  const sat = getFilter(img, 'Saturation')?.saturation ?? 0
  const tint = getFilter(img, 'BlendColor')

  const replace = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    try {
      const { meta, svgText } = await processUpload(f)
      const next = (svgText ? await createSvg(svgText, meta.name, 'svg', { assetId: meta.id }) : await createImage(meta)) as AnyObj
      const w = img.getScaledWidth()
      next.scale(w / next.width)
      next.set({ left: img.left, top: img.top, angle: img.angle })
      next.uid = img.uid; next.name = meta.name
      const idx = editor.canvas.getObjects().indexOf(img)
      editor.canvas.remove(img)
      editor.canvas.insertAt(idx, next)
      editor.canvas.setActiveObject(next)
      editor.commit('Replace image')
      useStore.setState({ assetsRev: useStore.getState().assetsRev + 1 })
    } catch (e) {
      toast(e instanceof UploadError ? e.message : 'Could not replace the image.', 'error')
    }
  }

  return (
    <>
      <Section title="Print quality">
        {dpi !== null && method.goodDpi ? (
          <div className={`dpi dpi-${rating}`} role="status">
            <strong>{rating === 'good' ? 'Good' : rating === 'acceptable' ? 'Acceptable' : 'Low resolution'}</strong>
            <span>{Math.round(dpi)} DPI at {(img.getScaledWidth() / DESIGN_PPI).toFixed(1)}" wide</span>
            <meter min={0} max={method.goodDpi * 1.2} low={method.minDpi} high={method.goodDpi} optimum={method.goodDpi * 1.2} value={Math.min(dpi, method.goodDpi * 1.2)} aria-label="Effective DPI" />
          </div>
        ) : <p className="muted small">{method.label} doesn’t print photos — use vector artwork.</p>}
        <div className="btn-row">
          <button className="btn" onClick={() => editor.fitSelection('contain')}>Fit to area</button>
          <button className="btn" onClick={() => editor.fitSelection('cover')}>Fill area</button>
          <button className="btn" onClick={() => file.current?.click()}>Replace…</button>
          <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => replace(e.target.files)} />
        </div>
      </Section>
      <Section title="Crop">
        <div className="grid-2">
          <Slider label="Left" value={Math.round(crop.l * 100)} min={0} max={80} unit="%" onChange={(v) => setCrop('l', v / 100)} />
          <Slider label="Right" value={Math.round(crop.r * 100)} min={0} max={80} unit="%" onChange={(v) => setCrop('r', v / 100)} />
          <Slider label="Top" value={Math.round(crop.t * 100)} min={0} max={80} unit="%" onChange={(v) => setCrop('t', v / 100)} />
          <Slider label="Bottom" value={Math.round(crop.b * 100)} min={0} max={80} unit="%" onChange={(v) => setCrop('b', v / 100)} />
        </div>
      </Section>
      <Section title="Adjust">
        <Slider label="Brightness" value={Math.round(bright * 100)} min={-60} max={60} onChange={(v) => adj('Brightness', (x) => new filters.Brightness({ brightness: x / 100 }), v, 0)} />
        <Slider label="Contrast" value={Math.round(contrast * 100)} min={-60} max={80} onChange={(v) => adj('Contrast', (x) => new filters.Contrast({ contrast: x / 100 }), v, 0)} />
        <Slider label="Saturation" value={Math.round(sat * 100)} min={-100} max={80} onChange={(v) => adj('Saturation', (x) => new filters.Saturation({ saturation: x / 100 }), v, 0)} />
        <label className="check small"><input type="checkbox" checked={!!getFilter(img, 'Grayscale')} onChange={(e) => adj('Grayscale', () => new filters.Grayscale(), e.target.checked ? 1 : 0, 0)} /><span>Monochrome</span></label>
        <label className="check small"><input type="checkbox" checked={!!getFilter(img, 'RemoveColor')} onChange={(e) => adj('RemoveColor', () => new filters.RemoveColor({ color: '#FFFFFF', distance: 0.12 }), e.target.checked ? 1 : 0, 0)} /><span>Remove white background</span></label>
        <Field label="Recolour (tint)">
          <Swatches label="Tint colour" value={tint?.color ?? ''} colors={DEFAULT_INKS.slice(0, 8).map((hex) => ({ hex }))} onChange={(c) => adj('BlendColor', () => new filters.BlendColor({ color: c, mode: 'tint', alpha: 0.85 }), 1, 0)} />
          {tint && <button className="link" onClick={() => adj('BlendColor', () => null, 0, 0)}>Remove tint</button>}
        </Field>
      </Section>
    </>
  )
}

export function ShapeProps({ o }: { o: AnyObj }) {
  const isLine = o.type?.toLowerCase() === 'line'
  return (
    <Section title="Style">
      {!isLine && <Ink label="Fill" value={typeof o.fill === 'string' ? o.fill : ''} onChange={(c) => editor.set(o, { fill: c }, 'Fill', 'fill')} />}
      <Ink label={isLine ? 'Colour' : 'Outline'} value={typeof o.stroke === 'string' ? o.stroke : '#000000'} onChange={(c) => editor.set(o, { stroke: c, strokeWidth: o.strokeWidth || 0.05 * DESIGN_PPI }, 'Outline', 'stroke')} />
      <Slider label={isLine ? 'Thickness' : 'Outline width'} value={(o.strokeWidth ?? 0) / DESIGN_PPI} min={0} max={0.5} step={0.01} unit='"' onChange={(v) => editor.set(o, { strokeWidth: v * DESIGN_PPI }, 'Outline width', 'strokew')} />
    </Section>
  )
}

export function VectorProps({ o }: { o: AnyObj }) {
  const first = o instanceof Group ? (o.getObjects().find((c: any) => typeof c.fill === 'string' && c.fill && c.fill !== 'none') as AnyObj | undefined)?.fill : o.fill
  return (
    <Section title="Colour">
      <Ink label="Artwork colour" value={typeof first === 'string' ? first : ''} onChange={(c) => { recolor(o, c); editor.set(o, {}, 'Recolour', 'recolor') }} />
      {o.kind === 'qr' && <p className="muted small">Encodes: {o.qrText}</p>}
    </Section>
  )
}
