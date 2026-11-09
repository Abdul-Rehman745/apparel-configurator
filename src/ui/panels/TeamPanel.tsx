import { useState } from 'react'
import type { BulkRow } from '../../core/design'
import { setBulk, useStore } from '../../state/store'
import { addText } from '../../design-engine/actions'
import { IconButton, Section } from '../common'
import { useResolved } from '../hooks'

const newRow = (sizeId: string): BulkRow => ({ id: 'r' + Math.random().toString(36).slice(2, 8), name: '', number: '', sizeId, qty: 1 })

export function TeamPanel() {
  const bulk = useStore((s) => s.design.bulk)
  const areas = useStore((s) => s.design.areas)
  const sizeId = useStore((s) => s.design.sizeId)
  const { product, model } = useResolved()
  const [csv, setCsv] = useState('')
  const linked = model.printAreas.flatMap((a) => (areas[a.id]?.objects ?? []).filter((o) => o.bulkField).map((o) => `${o.bulkField} on ${a.label}`))

  const update = (rows: BulkRow[], key = 'bulk') => setBulk({ ...bulk, rows }, key)
  const edit = (id: string, patch: Partial<BulkRow>) => update(bulk.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)), 'bulk:' + id)

  const importCsv = () => {
    const rows = csv.split(/\r?\n/).map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((c) => c.some(Boolean)).map(([name = '', number = '', size = '', qty = '1']) => ({
      ...newRow(product.sizes.find((s) => s.id.toLowerCase() === size.toLowerCase() || s.label.toLowerCase() === size.toLowerCase())?.id ?? sizeId),
      name, number, qty: Math.max(1, parseInt(qty) || 1),
    }))
    if (rows.length) { update([...bulk.rows, ...rows]); setCsv('') }
  }

  return (
    <div className="panel-scroll">
      <Section title="Team / bulk order">
        <label className="check">
          <input type="checkbox" checked={bulk.enabled} onChange={(e) => setBulk({ enabled: e.target.checked, rows: bulk.rows.length ? bulk.rows : [newRow(sizeId), newRow(sizeId)] })} />
          <span>Personalise each shirt with its own name, number and size</span>
        </label>
        {bulk.enabled && (
          <>
            <div className="linked">
              {linked.length ? <p className="small">Linked layers: {linked.join(' · ')}</p> : <p className="small warn-text">No text layer is linked yet — add one:</p>}
              <div className="btn-row">
                <button className="btn" onClick={() => addText('name')}>+ Name layer</button>
                <button className="btn" onClick={() => addText('number')}>+ Number layer</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="bulk-table">
                <thead><tr><th>#</th><th>Name</th><th>No.</th><th>Size</th><th>Qty</th><th><span className="sr-only">Remove</span></th></tr></thead>
                <tbody>
                  {bulk.rows.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td><input value={r.name} onChange={(e) => edit(r.id, { name: e.target.value.slice(0, 24) })} aria-label={`Player ${i + 1} name`} /></td>
                      <td><input value={r.number} onChange={(e) => edit(r.id, { number: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} aria-label={`Player ${i + 1} number`} inputMode="numeric" className="w-num" /></td>
                      <td>
                        <select value={r.sizeId} onChange={(e) => edit(r.id, { sizeId: e.target.value })} aria-label={`Player ${i + 1} size`}>
                          {product.sizes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td><input type="number" min={1} value={r.qty} onChange={(e) => edit(r.id, { qty: Math.max(1, +e.target.value || 1) })} aria-label={`Player ${i + 1} quantity`} className="w-num" /></td>
                      <td><IconButton icon="trash" label={`Remove row ${i + 1}`} size={16} onClick={() => update(bulk.rows.filter((x) => x.id !== r.id))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn" onClick={() => update([...bulk.rows, newRow(sizeId)])}>+ Add player</button>
            <details className="csv">
              <summary>Paste a list</summary>
              <textarea rows={4} placeholder={'Name, Number, Size, Qty\nSMITH, 24, L, 1'} value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="Paste team list" />
              <button className="btn" onClick={importCsv}>Import rows</button>
            </details>
            <p className="muted small">Total: {bulk.rows.reduce((s, r) => s + r.qty, 0)} shirts. Production files are generated per player.</p>
          </>
        )}
      </Section>
    </div>
  )
}
