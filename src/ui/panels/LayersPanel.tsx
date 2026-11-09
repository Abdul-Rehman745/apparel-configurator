import { useState } from 'react'
import { useStore } from '../../state/store'
import { editor } from '../../design-engine/editor'
import { Empty, IconButton, Section } from '../common'
import { Icon } from '../icons'
import { useResolved } from '../hooks'

const KIND_ICON: Record<string, string> = { text: 'text', image: 'upload', svg: 'file', clipart: 'sticker', shape: 'shapes', pattern: 'pattern', qr: 'qr', group: 'group' }

export function LayersPanel() {
  const areaId = useStore((s) => s.activeAreaId)
  const doc = useStore((s) => s.design.areas[s.activeAreaId])
  const selection = useStore((s) => s.selection)
  const { model } = useResolved()
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const area = model.printAreas.find((a) => a.id === areaId)
  // Top of the list = front-most layer. Template-hidden layers are production-only and not listed.
  const layers = (doc?.objects ?? []).map((o, i) => ({ ...o, index: i })).filter((o) => o.lockLevel !== 'hidden').reverse()

  const click = (id: string, e: React.MouseEvent) => {
    const multi = e.ctrlKey || e.metaKey || e.shiftKey
    editor.select(multi ? (selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]) : [id])
  }

  return (
    <div className="panel-scroll">
      <Section title={`Layers · ${area?.label ?? ''}`}>
        {!layers.length ? (
          <Empty icon="layers" title="No layers yet">Add text, an image or clipart to this print area.</Empty>
        ) : (
          <ul className="layer-list" aria-label="Layers">
            {layers.map((l) => {
              const templateLocked = l.lockLevel === 'locked'
              return (
                <li
                  key={l.id}
                  className={`layer ${selection.includes(l.id) ? 'is-selected' : ''} ${!l.visible ? 'is-hidden' : ''} ${dragId === l.id ? 'is-drag' : ''}`}
                  draggable={!templateLocked}
                  onDragStart={() => setDragId(l.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId && dragId !== l.id) editor.moveTo(dragId, l.index); setDragId(null) }}
                >
                  <span className="grip" aria-hidden><Icon name="grip" size={16} /></span>
                  <Icon name={KIND_ICON[l.kind] ?? 'layers'} size={16} className="layer-kind" />
                  {renaming === l.id ? (
                    <input className="layer-rename" autoFocus defaultValue={l.name} aria-label="Layer name"
                      onBlur={(e) => { editor.rename(l.id, e.target.value); setRenaming(null) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null) }} />
                  ) : (
                    <button className="layer-name" onClick={(e) => click(l.id, e)} onDoubleClick={() => !templateLocked && setRenaming(l.id)} disabled={templateLocked} title={templateLocked ? 'Locked by template' : 'Click to select, double-click to rename'}>
                      {l.name}
                      {l.bulkField && <em className="tag">{l.bulkField}</em>}
                      {l.required && <em className="tag">required</em>}
                    </button>
                  )}
                  {!templateLocked && <IconButton icon={l.visible ? 'eye' : 'eyeOff'} label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} onClick={() => editor.toggleVisible(l.id)} size={16} />}
                  <IconButton icon={l.locked || templateLocked ? 'lock' : 'unlock'} label={templateLocked ? 'Locked by template' : l.locked ? `Unlock ${l.name}` : `Lock ${l.name}`} onClick={() => editor.toggleLock(l.id)} disabled={templateLocked} size={16} />
                </li>
              )
            })}
          </ul>
        )}
      </Section>
      {layers.length > 0 && (
        <Section title="Arrange">
          <div className="btn-row wrap">
            <IconButton icon="up" label="Bring forward" onClick={() => editor.reorder('forward')} disabled={!selection.length} />
            <IconButton icon="down" label="Send backward" onClick={() => editor.reorder('backward')} disabled={!selection.length} />
            <IconButton icon="front" label="Bring to front" onClick={() => editor.reorder('front')} disabled={!selection.length} />
            <IconButton icon="back" label="Send to back" onClick={() => editor.reorder('back')} disabled={!selection.length} />
            <IconButton icon="group" label="Group" onClick={() => editor.group()} disabled={selection.length < 2} />
            <IconButton icon="ungroup" label="Ungroup" onClick={() => editor.ungroup()} disabled={selection.length !== 1} />
            <IconButton icon="copy" label="Duplicate" onClick={() => editor.duplicate()} disabled={!selection.length} />
            <IconButton icon="trash" label="Delete" onClick={() => editor.deleteSelection()} disabled={!selection.length} />
          </div>
          <p className="muted small">Ctrl/⌘-click to multi-select · drag rows to reorder.</p>
        </Section>
      )}
    </div>
  )
}
