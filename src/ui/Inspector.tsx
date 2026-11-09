import { useEffect, useRef } from 'react'
import { FabricImage, IText } from 'fabric'
import { useShallow } from 'zustand/react/shallow'
import { editor } from '../design-engine/editor'
import { hasArtwork } from '../core/design'
import { setActiveArea, setMode, useStore } from '../state/store'
import { CommonProps, ImageProps, ShapeProps, TextProps, VectorProps } from './props'
import { IconButton, Section } from './common'
import { Icon } from './icons'
import { useActiveObject, useIssues, useResolved } from './hooks'

/** Hosts the single live Fabric canvas; whichever slot is mounted owns it. */
export function EditorSlot({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    editor.attach(el)
    return () => editor.detach(el)
  }, [])
  return <div ref={ref} className={`editor-slot ${className}`} />
}

export function AreaPicker({ compact, onSelect }: { compact?: boolean; onSelect?: () => void }) {
  const { model } = useResolved()
  const { areaId, areas } = useStore(useShallow((s) => ({ areaId: s.activeAreaId, areas: s.design.areas })))
  return (
    <div className={`area-chips ${compact ? 'is-compact' : ''}`} role="tablist" aria-label="Print areas">
      {model.printAreas.map((a) => (
        <button key={a.id} role="tab" aria-selected={a.id === areaId} className={`area-chip ${a.id === areaId ? 'is-on' : ''}`} onClick={() => { setActiveArea(a.id); onSelect?.() }}>
          {a.label}
          {hasArtwork(areas[a.id]) && <span className="dot" aria-label="has artwork" />}
        </button>
      ))}
    </div>
  )
}

function AreaInfo() {
  const { model, method } = useResolved()
  const areaId = useStore((s) => s.activeAreaId)
  const area = model.printAreas.find((a) => a.id === areaId)
  const issues = useIssues().filter((i) => i.areaId === areaId)
  if (!area) return null
  return (
    <Section title={area.label}>
      <dl className="specs">
        <dt>Print size</dt><dd>{area.rect.wIn.toFixed(1)} × {area.rect.hIn.toFixed(1)} in</dd>
        <dt>Safe margin</dt><dd>{area.safeInsetIn}"{area.bleedIn ? ` · bleed ${area.bleedIn}"` : ''}</dd>
        <dt>Method</dt><dd>{method.label}{area.methods.includes(method.id) ? '' : ' (not allowed here)'}</dd>
        {method.goodDpi > 0 && <><dt>Images</dt><dd>{method.goodDpi} DPI ideal · {method.minDpi} min</dd></>}
      </dl>
      <ul className="legend" aria-label="Editor legend">
        <li><span className="lg lg-print" /> Print boundary</li>
        <li><span className="lg lg-safe" /> Safe area</li>
        {area.bleedIn > 0 && <li><span className="lg lg-bleed" /> Bleed</li>}
        {area.exclusions.length > 0 && <li><span className="lg lg-no" /> No-print zone</li>}
      </ul>
      {issues.length > 0 && (
        <ul className="issue-list">
          {issues.map((i) => (
            <li key={i.id} className={`issue issue-${i.severity}`}>
              <Icon name={i.severity === 'error' ? 'alert' : 'info'} size={16} /><span>{i.message}</span>
            </li>
          ))}
        </ul>
      )}
      {!hasArtwork(useStore.getState().design.areas[areaId]) && <p className="muted small">Add text, uploads or clipart from the toolbar. Drag, resize and rotate here or directly on the 3D garment in Design mode.</p>}
    </Section>
  )
}

export function Properties() {
  const { obj } = useActiveObject()
  if (!obj) return <AreaInfo />
  const kind = obj.kind
  return (
    <>
      {obj instanceof IText && <TextProps t={obj as any} />}
      {obj instanceof FabricImage && <ImageProps img={obj as any} />}
      {kind === 'shape' && <ShapeProps o={obj} />}
      {(kind === 'svg' || kind === 'clipart' || kind === 'qr') && <VectorProps o={obj} />}
      <CommonProps o={obj} />
    </>
  )
}

export function Inspector() {
  const mode = useStore((s) => s.mode)
  const { model } = useResolved()
  const areaId = useStore((s) => s.activeAreaId)
  const area = model.printAreas.find((a) => a.id === areaId)
  return (
    <aside className="inspector" aria-label="Design inspector">
      {mode !== 'precision' && (
        <div className="inspector-editor">
          <div className="inspector-editor-head">
            <strong>{area?.label ?? 'Print area'}</strong>
            <span className="muted small">{area ? `${area.rect.wIn.toFixed(1)}×${area.rect.hIn.toFixed(1)}"` : ''}</span>
            <IconButton icon="expand" label="Open 2D precision editor" onClick={() => setMode('precision')} size={18} />
          </div>
          <EditorSlot />
        </div>
      )}
      <div className="inspector-props"><Properties /></div>
    </aside>
  )
}
