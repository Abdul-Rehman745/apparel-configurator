import { useMemo, useState } from 'react'
import { IText } from 'fabric'
import type { FontDef } from '../../core/types'
import { useStore } from '../../state/store'
import { addText, type TextPreset } from '../../design-engine/actions'
import { editor } from '../../design-engine/editor'
import { loadFont } from '../../design-engine/fonts'
import { Section } from '../common'
import { useActiveObject } from '../hooks'

const PRESETS: { id: TextPreset; label: string; cls: string }[] = [
  { id: 'heading', label: 'Add heading', cls: 'p-heading' },
  { id: 'subheading', label: 'Add subheading', cls: 'p-sub' },
  { id: 'body', label: 'Add body text', cls: 'p-body' },
  { id: 'curved', label: 'Add curved text', cls: 'p-curved' },
  { id: 'name', label: 'Add team name', cls: 'p-name' },
  { id: 'number', label: 'Add team number', cls: 'p-number' },
]
const CATS: FontDef['category'][] = ['Sans Serif', 'Serif', 'Display', 'Script', 'Sports', 'College', 'Vintage', 'Handwritten', 'Monospace']

export function FontPicker({ value, onPick }: { value?: string; onPick: (family: string) => void }) {
  const fonts = useStore((s) => s.catalog.fonts)
  const restrict = useStore((s) => s.design.restrictFonts)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('')
  const list = useMemo(() => fonts.filter((f) => (!restrict || restrict.includes(f.family)) && (!cat || f.category === cat) && f.family.toLowerCase().includes(q.toLowerCase())), [fonts, restrict, q, cat])
  return (
    <div className="font-picker">
      <input type="search" placeholder="Search fonts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search fonts" />
      <div className="chips" role="group" aria-label="Font category">
        <button className={`chip ${!cat ? 'is-on' : ''}`} onClick={() => setCat('')}>All</button>
        {CATS.map((c) => <button key={c} className={`chip ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      {restrict && <p className="muted small">This template limits fonts to its brand set.</p>}
      <ul className="font-list" role="listbox" aria-label="Fonts">
        {list.map((f) => (
          <li key={f.family}>
            <button role="option" aria-selected={value === f.family} className={value === f.family ? 'is-on' : ''} style={{ fontFamily: `"${f.family}", system-ui` }} onClick={async () => { await loadFont(f.family); onPick(f.family) }}>
              {f.family}<small>{f.category}</small>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted small">No fonts match.</li>}
      </ul>
    </div>
  )
}

export function TextPanel() {
  const { obj } = useActiveObject()
  const isText = obj instanceof IText
  return (
    <div className="panel-scroll">
      <Section title="Add text">
        <div className="preset-list">
          {PRESETS.map((p) => <button key={p.id} className={`preset ${p.cls}`} onClick={() => addText(p.id)}>{p.label}</button>)}
        </div>
        <p className="muted small">Team name/number layers are filled per player from the Team list.</p>
      </Section>
      <Section title={isText ? 'Change font' : 'Fonts'}>
        <FontPicker value={isText ? obj.fontFamily : undefined} onPick={(f) => (isText ? editor.set(obj, { fontFamily: f }, 'Font') : addText('heading', f))} />
      </Section>
    </div>
  )
}
