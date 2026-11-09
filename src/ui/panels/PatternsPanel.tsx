import { useState } from 'react'
import { FabricImage } from 'fabric'
import { DESIGN_PPI } from '../../core/design'
import { CLIPART } from '../../assets/clipart'
import { addPatternFill } from '../../design-engine/actions'
import { editor } from '../../design-engine/editor'
import type { AnyObj, PatternSpec } from '../../design-engine/docs'
import { Field, Section, Slider, Swatches } from '../common'
import { useActiveObject } from '../hooks'

const MODES: PatternSpec['mode'][] = ['repeat', 'mirror', 'brick', 'half-drop']
const MOTIFS = CLIPART.filter((c) => c.svg && ['star', 'heart', 'leaf', 'paw', 'lightning', 'flower', 'snowflake', 'pixel-heart', 'hexagon-logo', 'zigzag'].includes(c.id))

function Controls({ spec, onChange }: { spec: PatternSpec; onChange: (s: PatternSpec) => void }) {
  const u = (k: keyof PatternSpec) => (v: number | string) => onChange({ ...spec, [k]: v })
  return (
    <>
      <Field label="Repeat mode">
        <select value={spec.mode} onChange={(e) => u('mode')(e.target.value)}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      </Field>
      <Slider label="Scale" value={spec.tile / DESIGN_PPI} min={0.3} max={8} step={0.1} unit='"' onChange={(v) => u('tile')(v * DESIGN_PPI)} />
      <Slider label="X spacing" value={spec.spacingX / DESIGN_PPI} min={0} max={4} step={0.05} unit='"' onChange={(v) => u('spacingX')(v * DESIGN_PPI)} />
      <Slider label="Y spacing" value={spec.spacingY / DESIGN_PPI} min={0} max={4} step={0.05} unit='"' onChange={(v) => u('spacingY')(v * DESIGN_PPI)} />
      <Slider label="Rotation" value={spec.rotation} min={-180} max={180} unit="°" onChange={u('rotation')} />
      <Slider label="Offset X" value={spec.offsetX / DESIGN_PPI} min={-4} max={4} step={0.05} unit='"' onChange={(v) => u('offsetX')(v * DESIGN_PPI)} />
      <Slider label="Offset Y" value={spec.offsetY / DESIGN_PPI} min={-4} max={4} step={0.05} unit='"' onChange={(v) => u('offsetY')(v * DESIGN_PPI)} />
    </>
  )
}

export function PatternsPanel() {
  const { obj } = useActiveObject()
  const [draft, setDraft] = useState<PatternSpec>({ clipartId: 'star', color: '#1f2a44', tile: 1.2 * DESIGN_PPI, spacingX: 0.4 * DESIGN_PPI, spacingY: 0.4 * DESIGN_PPI, rotation: 0, offsetX: 0, offsetY: 0, mode: 'brick' })
  const editing = obj && (obj as AnyObj).patternSpec as PatternSpec | undefined
  const fromImage = obj instanceof FabricImage && (obj as AnyObj).assetId

  if (editing) {
    return (
      <div className="panel-scroll">
        <Section title="Edit pattern">
          <Controls spec={editing} onChange={(s) => editor.setPattern(obj, s)} />
          {editing.color && <Field label="Motif colour"><Swatches label="Motif colour" value={editing.color} colors={['#111111', '#ffffff', '#1f2a44', '#b3202c', '#e2a927', '#26452f'].map((hex) => ({ hex }))} onChange={(c) => editor.setPattern(obj, { ...editing, color: c })} /></Field>}
        </Section>
      </div>
    )
  }

  return (
    <div className="panel-scroll">
      <Section title="Repeating pattern">
        <p className="muted small">Fills the whole print area (including bleed) with a repeating motif. Best on all-over sublimation products.</p>
        {fromImage ? (
          <button className="btn btn-block" onClick={() => addPatternFill({ ...draft, clipartId: undefined, color: undefined, assetId: (obj as AnyObj).assetId })}>Turn selected image into pattern</button>
        ) : (
          <>
            <Field label="Motif">
              <div className="motif-row">
                {MOTIFS.map((m) => (
                  <button key={m.id} className={`motif ${draft.clipartId === m.id ? 'is-on' : ''}`} onClick={() => setDraft({ ...draft, clipartId: m.id, assetId: undefined })} aria-label={m.name} title={m.name}
                    dangerouslySetInnerHTML={{ __html: m.svg.replace(/currentColor/g, draft.color ?? '#111') }} />
                ))}
              </div>
            </Field>
            <Field label="Motif colour"><Swatches label="Motif colour" value={draft.color ?? '#111111'} colors={['#111111', '#ffffff', '#1f2a44', '#b3202c', '#e2a927', '#26452f'].map((hex) => ({ hex }))} onChange={(c) => setDraft({ ...draft, color: c })} /></Field>
          </>
        )}
        <Controls spec={draft} onChange={setDraft} />
        {!fromImage && <button className="btn btn-primary btn-block" onClick={() => addPatternFill(draft)}>Fill print area</button>}
        <p className="muted small">Tip: select an uploaded image first to use it as the pattern tile.</p>
      </Section>
    </div>
  )
}
