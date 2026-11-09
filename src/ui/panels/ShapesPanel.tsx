import { useState } from 'react'
import { addQr, addShape } from '../../design-engine/actions'
import type { ShapeKind } from '../../design-engine/objects'
import { Section } from '../common'

const SHAPES: { id: ShapeKind; label: string; svg: string }[] = [
  { id: 'rect', label: 'Rectangle', svg: '<rect x="3" y="6" width="18" height="12"/>' },
  { id: 'rounded', label: 'Rounded rectangle', svg: '<rect x="3" y="6" width="18" height="12" rx="3"/>' },
  { id: 'circle', label: 'Circle', svg: '<circle cx="12" cy="12" r="9"/>' },
  { id: 'ellipse', label: 'Ellipse', svg: '<ellipse cx="12" cy="12" rx="10" ry="6.5"/>' },
  { id: 'triangle', label: 'Triangle', svg: '<path d="M12 4l9 16H3z"/>' },
  { id: 'star', label: 'Star', svg: '<path d="M12 3l2.6 5.6L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.7z"/>' },
  { id: 'polygon', label: 'Hexagon', svg: '<path d="M21 12l-4.5 7.8h-9L3 12l4.5-7.8h9z"/>' },
  { id: 'line', label: 'Line', svg: '<path d="M3 12h18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' },
  { id: 'badge', label: 'Badge', svg: '<path d="M12 2l2 2.4 3-.6.6 3 2.8 1.2-1 2.9 1.6 2.6-2.6 1.5.1 3.1-3.1.3L14 21l-2-2.2L10 21l-1.4-2.8-3.1-.3.1-3.1L3 13.3l1.6-2.6-1-2.9 2.8-1.2.6-3 3 .6z"/>' },
  { id: 'banner', label: 'Banner', svg: '<path d="M2 7h20l-2 5 2 5H2l2-5z"/>' },
]

export function ShapesPanel() {
  const [qr, setQr] = useState('https://')
  return (
    <div className="panel-scroll">
      <Section title="Shapes">
        <div className="shape-grid">
          {SHAPES.map((s) => (
            <button key={s.id} className="shape-btn" onClick={() => addShape(s.id)} aria-label={`Add ${s.label}`} title={s.label}>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" dangerouslySetInnerHTML={{ __html: s.svg }} />
            </button>
          ))}
        </div>
      </Section>
      <Section title="QR code">
        <div className="row">
          <input value={qr} onChange={(e) => setQr(e.target.value)} aria-label="QR code link or text" maxLength={400} />
          <button className="btn" onClick={() => addQr(qr)}>Add</button>
        </div>
        <p className="muted small">QR codes are vector and print sharply. Keep them at least 1" wide and test-scan the preview.</p>
      </Section>
    </div>
  )
}
