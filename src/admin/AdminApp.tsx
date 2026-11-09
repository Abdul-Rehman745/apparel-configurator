// Admin configurator builder: products, models, print areas, pricing, fonts, clipart,
// templates and validation rules — all data, no source changes needed to add a garment.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import type * as THREE from 'three'
import type { AreaGroup, Catalog, ExclusionKind, FontDef, GarmentModel, PricingRule, PrintArea, Product, ProceduralGarment, ValidationPolicy } from '../core/types'
import { catalogApi } from '../api/designApi'
import { tenantFromLocation } from '../tenants/tenants'
import { supabase } from '../api/supabase'
import { proceduralModel } from '../products/modelFactory'
import { putAsset } from '../assets/assetStore'
import { sanitizeSvg } from '../assets/upload'
import { CLIPART, CLIPART_LICENSE } from '../assets/clipart'
import { validateCatalog } from './validateCatalog'
import { Icon } from '../ui/icons'
import '../ui/styles.css'
import './admin.css'

type SectionId = 'products' | 'areas' | 'pricing' | 'templates' | 'fonts' | 'clipart' | 'rules' | 'licenses' | 'json'
const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'products', label: 'Products & models', icon: 'shirt' },
  { id: 'areas', label: 'Print areas', icon: 'crop' },
  { id: 'pricing', label: 'Pricing', icon: 'cart' },
  { id: 'templates', label: 'Templates', icon: 'layout' },
  { id: 'fonts', label: 'Fonts', icon: 'text' },
  { id: 'clipart', label: 'Clipart', icon: 'sticker' },
  { id: 'rules', label: 'Validation rules', icon: 'alert' },
  { id: 'licenses', label: 'Asset licences', icon: 'file' },
  { id: 'json', label: 'Import / export', icon: 'download' },
]

const clone = <T,>(v: T): T => structuredClone(v)
const num = (v: string) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0)
const ids = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="a-card"><header><h2>{title}</h2><div>{actions}</div></header>{children}</section>
}

// ---------------------------------------------------------------- products & models

function ProductEditor({ p, onChange, cat }: { p: Product; onChange: (p: Product) => void; cat: Catalog }) {
  const set = (patch: Partial<Product>) => onChange({ ...p, ...patch })
  return (
    <>
      <Card title="Details">
        <div className="a-grid">
          <label>Title<input value={p.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label>Slug<input value={p.slug} onChange={(e) => set({ slug: e.target.value.replace(/[^a-z0-9-]/g, '') })} /></label>
          <label>Category<input value={p.category} onChange={(e) => set({ category: e.target.value })} /></label>
          <label>Print sizing<select value={p.printSizing} onChange={(e) => set({ printSizing: e.target.value as Product['printSizing'] })}><option value="constant">Constant physical size</option><option value="scale">Scale with garment size</option></select></label>
          <label className="span2">Description<input value={p.description} onChange={(e) => set({ description: e.target.value })} /></label>
          <label className="check-line"><input type="checkbox" checked={p.published} onChange={(e) => set({ published: e.target.checked })} /> Published</label>
          <label className="check-line"><input type="checkbox" checked={p.multiZoneColors} onChange={(e) => set({ multiZoneColors: e.target.checked })} /> Separate colours per zone</label>
        </div>
      </Card>
      <Card title="Colours" actions={<button className="btn" onClick={() => set({ colors: [...p.colors, { id: `c${Date.now().toString(36)}`, name: 'New colour', hex: '#888888' }] })}>+ Colour</button>}>
        <table className="a-table"><thead><tr><th>Swatch</th><th>Name</th><th>Hex</th><th>Mfr ID</th><th /></tr></thead><tbody>
          {p.colors.map((c, i) => (
            <tr key={c.id}>
              <td><input type="color" value={c.hex} onChange={(e) => { const cs = clone(p.colors); cs[i].hex = e.target.value; set({ colors: cs }) }} /></td>
              <td><input value={c.name} onChange={(e) => { const cs = clone(p.colors); cs[i].name = e.target.value; set({ colors: cs }) }} /></td>
              <td><input value={c.hex} onChange={(e) => { const cs = clone(p.colors); cs[i].hex = e.target.value; set({ colors: cs }) }} /></td>
              <td><input value={c.mfrId ?? ''} onChange={(e) => { const cs = clone(p.colors); cs[i].mfrId = e.target.value; set({ colors: cs }) }} /></td>
              <td><button className="link" onClick={() => set({ colors: p.colors.filter((_, j) => j !== i) })}>Remove</button></td>
            </tr>
          ))}
        </tbody></table>
      </Card>
      <Card title="Sizes" actions={<button className="btn" onClick={() => set({ sizes: [...p.sizes, { id: 'NEW', label: 'New', chestIn: 20, lengthIn: 28, sleeveIn: 8, sku: '', scale: 1 }] })}>+ Size</button>}>
        <table className="a-table"><thead><tr><th>ID</th><th>Label</th><th>Chest"</th><th>Length"</th><th>Sleeve"</th><th>Print scale</th><th>SKU / variant ID</th><th>In stock</th><th /></tr></thead><tbody>
          {p.sizes.map((s, i) => {
            const u = (patch: Partial<typeof s>) => { const ss = clone(p.sizes); ss[i] = { ...ss[i], ...patch }; set({ sizes: ss }) }
            return (
              <tr key={i}>
                <td><input value={s.id} onChange={(e) => u({ id: e.target.value })} className="w-s" /></td>
                <td><input value={s.label} onChange={(e) => u({ label: e.target.value })} className="w-s" /></td>
                <td><input value={s.chestIn} onChange={(e) => u({ chestIn: num(e.target.value) })} className="w-s" /></td>
                <td><input value={s.lengthIn} onChange={(e) => u({ lengthIn: num(e.target.value) })} className="w-s" /></td>
                <td><input value={s.sleeveIn} onChange={(e) => u({ sleeveIn: num(e.target.value) })} className="w-s" /></td>
                <td><input value={s.scale ?? 1} onChange={(e) => u({ scale: num(e.target.value) })} className="w-s" /></td>
                <td><input value={s.sku} onChange={(e) => u({ sku: e.target.value })} /></td>
                <td><input type="checkbox" checked={s.inStock !== false} onChange={(e) => u({ inStock: e.target.checked })} /></td>
                <td><button className="link" onClick={() => set({ sizes: p.sizes.filter((_, j) => j !== i) })}>Remove</button></td>
              </tr>
            )
          })}
        </tbody></table>
        <label>Reference size <select value={p.referenceSize} onChange={(e) => set({ referenceSize: e.target.value })}>{p.sizes.map((s) => <option key={s.id}>{s.id}</option>)}</select></label>
      </Card>
      <Card title="Fabrics & print methods">
        <div className="a-checks">
          {cat.materials.map((m) => <label key={m.id}><input type="checkbox" checked={p.materials.includes(m.id)} onChange={(e) => set({ materials: e.target.checked ? [...p.materials, m.id] : p.materials.filter((x) => x !== m.id) })} /> {m.label}</label>)}
        </div>
        <div className="a-checks">
          {cat.printMethods.map((m) => <label key={m.id}><input type="checkbox" checked={p.printMethods.includes(m.id)} onChange={(e) => set({ printMethods: e.target.checked ? [...p.printMethods, m.id] : p.printMethods.filter((x) => x !== m.id) })} /> {m.label}</label>)}
        </div>
        <label>Default method <select value={p.defaultMethod} onChange={(e) => set({ defaultMethod: e.target.value })}>{p.printMethods.map((m) => <option key={m}>{m}</option>)}</select></label>
      </Card>
      <Card title="3D models" actions={<>
        <button className="btn" onClick={() => set({ models: [...p.models, proceduralModel({ id: `${p.id}-m${p.models.length + 1}`, label: 'New fit', garment: { kind: 'tee', chestIn: 20, lengthIn: 28, sleeveLengthIn: 8, collar: 'crew' } })] })}>+ Procedural model</button>
        <GlbUpload onModel={(m) => set({ models: [...p.models, m] })} />
      </>}>
        {p.models.map((m, i) => <ModelEditor key={m.id + i} m={m} onChange={(nm) => { const ms = clone(p.models); ms[i] = nm; set({ models: ms }) }} onRemove={p.models.length > 1 ? () => set({ models: p.models.filter((_, j) => j !== i) }) : undefined} />)}
      </Card>
    </>
  )
}

function ModelEditor({ m, onChange, onRemove }: { m: GarmentModel; onChange: (m: GarmentModel) => void; onRemove?: () => void }) {
  const g = m.source.type === 'procedural' ? m.source.garment : null
  const regen = (patch: Partial<ProceduralGarment>) => {
    if (!g) return
    const next = proceduralModel({ id: m.id, label: m.label, garment: { ...g, ...patch }, multiZone: m.colorZones.length > 1, allOver: m.printAreas.some((a) => a.group === 'allover') })
    onChange(next)
  }
  return (
    <div className="a-model">
      <div className="a-grid">
        <label>Model ID<input value={m.id} onChange={(e) => onChange({ ...m, id: e.target.value })} /></label>
        <label>Label<input value={m.label} onChange={(e) => onChange({ ...m, label: e.target.value })} /></label>
        <label>Licence source<select value={m.license.source} onChange={(e) => onChange({ ...m, license: { ...m.license, source: e.target.value as GarmentModel['license']['source'] } })}>{['internal', 'commissioned', 'sketchfab', 'blenderkit', 'marketplace', 'cc0'].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Licence<input value={m.license.license} onChange={(e) => onChange({ ...m, license: { ...m.license, license: e.target.value } })} /></label>
        <label>Author<input value={m.license.author} onChange={(e) => onChange({ ...m, license: { ...m.license, author: e.target.value } })} /></label>
        <label>Source URL<input value={m.license.url ?? ''} onChange={(e) => onChange({ ...m, license: { ...m.license, url: e.target.value } })} /></label>
      </div>
      {g && (
        <div className="a-grid">
          <label>Kind<select value={g.kind} onChange={(e) => regen({ kind: e.target.value as ProceduralGarment['kind'] })}>{['tee', 'polo', 'hoodie', 'tank', 'longsleeve', 'dress'].map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Collar<select value={g.collar} onChange={(e) => regen({ collar: e.target.value as ProceduralGarment['collar'] })}>{['crew', 'v', 'polo', 'hood', 'dress'].map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Chest (flat) "<input type="number" value={g.chestIn} onChange={(e) => regen({ chestIn: num(e.target.value) || 20 })} /></label>
          <label>Length "<input type="number" value={g.lengthIn} onChange={(e) => regen({ lengthIn: num(e.target.value) || 28 })} /></label>
          <label>Sleeve "<input type="number" value={g.sleeveLengthIn} onChange={(e) => regen({ sleeveLengthIn: num(e.target.value) })} /></label>
          <label>Oversize factor<input type="number" step="0.01" value={g.drop ?? 1} onChange={(e) => regen({ drop: num(e.target.value) || 1 })} /></label>
          <label className="check-line"><input type="checkbox" checked={!!g.placket} onChange={(e) => regen({ placket: e.target.checked })} /> Placket</label>
          <label className="check-line"><input type="checkbox" checked={!!g.pocket} onChange={(e) => regen({ pocket: e.target.checked })} /> Pocket</label>
          <label className="check-line"><input type="checkbox" checked={!!g.cuffs} onChange={(e) => regen({ cuffs: e.target.checked })} /> Cuffs</label>
        </div>
      )}
      {m.source.type === 'glb' && <PanelMapping m={m} onChange={onChange} />}
      <p className="muted small">{m.panels.length} panels · {m.printAreas.length} print areas{g ? ' · changing garment dimensions regenerates standard print areas' : ''}</p>
      {onRemove && <button className="link danger" onClick={onRemove}>Remove model</button>}
    </div>
  )
}

interface MeshInfo { name: string; vertices: number; hasUv: boolean; material: string }

async function inspectGlb(buf: ArrayBuffer): Promise<MeshInfo[]> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(draco)
  const gltf = await loader.parseAsync(buf, '')
  const out: MeshInfo[] = []
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    out.push({ name: mesh.name, vertices: mesh.geometry.attributes.position?.count ?? 0, hasUv: !!mesh.geometry.attributes.uv, material: mat?.name ?? '' })
  })
  draco.dispose()
  return out
}

const MEANINGLESS = /^(cube|object|mesh|plane|cylinder|sphere)[._]?\d*$/i

function GlbUpload({ onModel }: { onModel: (m: GarmentModel) => void }) {
  const [err, setErr] = useState('')
  const pick = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    try {
      const buf = await f.arrayBuffer()
      const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 4))
      if (magic !== 'glTF') throw new Error('Not a binary glTF (.glb) file.')
      const meshes = await inspectGlb(buf)
      if (!meshes.length) throw new Error('The GLB contains no meshes.')
      const meta = await putAsset(new Blob([buf], { type: 'model/gltf-binary' }), { kind: 'model', mime: 'model/gltf-binary', name: f.name, width: 0, height: 0, hasAlpha: false })
      const printable = meshes.filter((x) => x.hasUv)
      onModel({
        id: `glb-${meta.id.slice(2, 8)}`, label: f.name.replace(/\.glb$/i, ''), source: { type: 'glb', url: `asset:${meta.id}` },
        panels: printable.map((x) => ({ id: x.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: x.name, widthIn: 20, heightIn: 28, colorZone: 'body', mesh: x.name })),
        colorZones: [{ id: 'body', label: 'Body' }], printAreas: [],
        license: { source: 'internal', author: '', license: '', attributionRequired: false, redistribution: 'embedded-only', downloadedAt: new Date().toISOString().slice(0, 10) },
      })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  return (
    <label className="btn">
      Upload GLB
      <input type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {err && <span className="error-text small">{err}</span>}
    </label>
  )
}

function PanelMapping({ m, onChange }: { m: GarmentModel; onChange: (m: GarmentModel) => void }) {
  const [meshes, setMeshes] = useState<MeshInfo[] | null>(null)
  useEffect(() => {
    if (m.source.type !== 'glb') return
    const url = m.source.url
    ;(async () => {
      const { assetUrl } = await import('../assets/assetStore')
      const u = url.startsWith('asset:') ? await assetUrl(url.slice(6)) : url
      if (!u) return
      setMeshes(await inspectGlb(await (await fetch(u)).arrayBuffer()))
    })().catch(() => setMeshes([]))
  }, [m.source])
  const upd = (i: number, patch: Partial<GarmentModel['panels'][number]>) => { const ps = clone(m.panels); ps[i] = { ...ps[i], ...patch }; onChange({ ...m, panels: ps }) }
  return (
    <>
      <h3>Mesh → panel mapping</h3>
      {meshes && (
        <ul className="a-meshes">
          {meshes.map((x) => (
            <li key={x.name} className={!x.hasUv || MEANINGLESS.test(x.name) ? 'warn' : ''}>
              <code>{x.name || '(unnamed)'}</code> · {x.vertices.toLocaleString()} verts · {x.hasUv ? 'UVs ✓' : 'no UVs — not printable'} {MEANINGLESS.test(x.name) && '· rename in Blender (e.g. shirt_body)'}
            </li>
          ))}
        </ul>
      )}
      <table className="a-table"><thead><tr><th>Panel ID</th><th>Label</th><th>Mesh</th><th>UV width "</th><th>UV height "</th><th>Colour zone</th></tr></thead><tbody>
        {m.panels.map((p, i) => (
          <tr key={i}>
            <td><input value={p.id} onChange={(e) => upd(i, { id: e.target.value })} /></td>
            <td><input value={p.label} onChange={(e) => upd(i, { label: e.target.value })} /></td>
            <td><select value={p.mesh ?? ''} onChange={(e) => upd(i, { mesh: e.target.value })}><option value="">—</option>{meshes?.map((x) => <option key={x.name}>{x.name}</option>)}</select></td>
            <td><input value={p.widthIn} onChange={(e) => upd(i, { widthIn: num(e.target.value) })} className="w-s" /></td>
            <td><input value={p.heightIn} onChange={(e) => upd(i, { heightIn: num(e.target.value) })} className="w-s" /></td>
            <td><input value={p.colorZone} onChange={(e) => upd(i, { colorZone: e.target.value })} className="w-s" /></td>
          </tr>
        ))}
      </tbody></table>
      <p className="muted small">UV width/height = the real-world inches the mesh’s 0–1 UV square covers. Measure in Blender (UV island size × garment scale).</p>
    </>
  )
}

// ---------------------------------------------------------------- print areas

function AreasEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const [pi, setPi] = useState(0)
  const [mi, setMi] = useState(0)
  const p = cat.products[pi], m = p?.models[mi]
  if (!m) return null
  const setAreas = (areas: PrintArea[]) => { const c = clone(cat); c.products[pi].models[mi].printAreas = areas; setCat(c) }
  const upd = (i: number, patch: Partial<PrintArea>) => { const as = clone(m.printAreas); as[i] = { ...as[i], ...patch }; setAreas(as) }
  const updRect = (i: number, k: keyof PrintArea['rect'], v: number) => upd(i, { rect: { ...m.printAreas[i].rect, [k]: v } })
  return (
    <>
      <Card title="Garment">
        <div className="a-grid">
          <label>Product<select value={pi} onChange={(e) => { setPi(+e.target.value); setMi(0) }}>{cat.products.map((x, i) => <option key={x.id} value={i}>{x.title}</option>)}</select></label>
          <label>Model<select value={mi} onChange={(e) => setMi(+e.target.value)}>{p.models.map((x, i) => <option key={x.id} value={i}>{x.label}</option>)}</select></label>
        </div>
        <p className="muted small">Panels: {m.panels.map((x) => `${x.id} (${x.widthIn.toFixed(1)}×${x.heightIn.toFixed(1)}")`).join(' · ')}</p>
      </Card>
      <Card title="Print areas" actions={<button className="btn" onClick={() => setAreas([...m.printAreas, { id: `area_${m.printAreas.length + 1}`, label: 'New area', panel: m.panels[0].id, rect: { xIn: 1, yIn: 1, wIn: 4, hIn: 4 }, safeInsetIn: 0.25, bleedIn: 0, exclusions: [], methods: [...p.printMethods], camera: 'front', group: 'small' }])}>+ Area</button>}>
        {m.printAreas.map((a, i) => (
          <details key={i} className="a-area">
            <summary><strong>{a.label}</strong> <span className="muted">{a.id} · {a.panel} · {a.rect.wIn}×{a.rect.hIn}"</span></summary>
            <div className="a-grid">
              <label>ID<input value={a.id} onChange={(e) => upd(i, { id: e.target.value })} /></label>
              <label>Label<input value={a.label} onChange={(e) => upd(i, { label: e.target.value })} /></label>
              <label>Panel<select value={a.panel} onChange={(e) => upd(i, { panel: e.target.value })}>{m.panels.map((x) => <option key={x.id}>{x.id}</option>)}</select></label>
              <label>Camera<select value={a.camera} onChange={(e) => upd(i, { camera: e.target.value })}>{cat.cameras.map((c) => <option key={c.id}>{c.id}</option>)}</select></label>
              <label>X "<input value={a.rect.xIn} onChange={(e) => updRect(i, 'xIn', num(e.target.value))} /></label>
              <label>Y "<input value={a.rect.yIn} onChange={(e) => updRect(i, 'yIn', num(e.target.value))} /></label>
              <label>Width "<input value={a.rect.wIn} onChange={(e) => updRect(i, 'wIn', num(e.target.value))} /></label>
              <label>Height "<input value={a.rect.hIn} onChange={(e) => updRect(i, 'hIn', num(e.target.value))} /></label>
              <label>Safe margin "<input value={a.safeInsetIn} onChange={(e) => upd(i, { safeInsetIn: num(e.target.value) })} /></label>
              <label>Bleed "<input value={a.bleedIn} onChange={(e) => upd(i, { bleedIn: num(e.target.value) })} /></label>
              <label>Pricing group<select value={a.group} onChange={(e) => upd(i, { group: e.target.value as AreaGroup })}>{['large', 'small', 'sleeve', 'label', 'allover'].map((g) => <option key={g}>{g}</option>)}</select></label>
              <label>Conflicts with (ids)<input value={(a.conflictsWith ?? []).join(', ')} onChange={(e) => upd(i, { conflictsWith: ids(e.target.value) })} /></label>
            </div>
            <div className="a-checks">{cat.printMethods.map((pm) => <label key={pm.id}><input type="checkbox" checked={a.methods.includes(pm.id)} onChange={(e) => upd(i, { methods: e.target.checked ? [...a.methods, pm.id] : a.methods.filter((x) => x !== pm.id) })} /> {pm.label}</label>)}</div>
            <h4>No-print zones (area-local inches)</h4>
            <table className="a-table"><thead><tr><th>Label</th><th>Kind</th><th>X</th><th>Y</th><th>W</th><th>H</th><th /></tr></thead><tbody>
              {a.exclusions.map((ex, j) => {
                const ue = (patch: Partial<typeof ex>) => { const es = clone(a.exclusions); es[j] = { ...es[j], ...patch }; upd(i, { exclusions: es }) }
                return (
                  <tr key={j}>
                    <td><input value={ex.label} onChange={(e) => ue({ label: e.target.value })} /></td>
                    <td><select value={ex.kind} onChange={(e) => ue({ kind: e.target.value as ExclusionKind })}>{['seam', 'collar', 'zipper', 'button', 'pocket', 'armpit', 'stitching', 'other'].map((k) => <option key={k}>{k}</option>)}</select></td>
                    {(['xIn', 'yIn', 'wIn', 'hIn'] as const).map((k) => <td key={k}><input className="w-s" value={ex[k]} onChange={(e) => ue({ [k]: num(e.target.value) })} /></td>)}
                    <td><button className="link" onClick={() => upd(i, { exclusions: a.exclusions.filter((_, x) => x !== j) })}>Remove</button></td>
                  </tr>
                )
              })}
            </tbody></table>
            <div className="btn-row">
              <button className="btn" onClick={() => upd(i, { exclusions: [...a.exclusions, { id: `ex${Date.now().toString(36)}`, label: 'Seam', kind: 'seam', xIn: 0, yIn: 0, wIn: 0.5, hIn: a.rect.hIn }] })}>+ No-print zone</button>
              <a className="btn" href={`/?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), product: p.id, model: m.id, checker: a.id })}`} target="_blank" rel="noreferrer">Test with checker artwork ↗</a>
              <button className="link danger" onClick={() => setAreas(m.printAreas.filter((_, x) => x !== i))}>Delete area</button>
            </div>
          </details>
        ))}
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- pricing / rules / fonts / clipart / templates

function PricingEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const rules = cat.pricing.rules
  const setRules = (r: PricingRule[]) => setCat({ ...cat, pricing: { ...cat.pricing, rules: r } })
  const upd = (i: number, patch: Partial<PricingRule>) => { const r = clone(rules); r[i] = { ...r[i], ...patch }; setRules(r) }
  const updWhen = (i: number, k: keyof NonNullable<PricingRule['when']>, v: string) => { const w = { ...(rules[i].when ?? {}) } as Record<string, string[]>; const list = ids(v); if (list.length) w[k] = list; else delete w[k]; upd(i, { when: Object.keys(w).length ? w : undefined }) }
  return (
    <>
      <Card title="Currency"><label>ISO code <input className="w-s" value={cat.pricing.currency} onChange={(e) => setCat({ ...cat, pricing: { ...cat.pricing, currency: e.target.value.toUpperCase().slice(0, 3) } })} /></label></Card>
      <Card title="Price rules" actions={<button className="btn" onClick={() => setRules([...rules, { id: `r${Date.now().toString(36)}`, label: 'New rule', amount: 0, per: 'unit' }])}>+ Rule</button>}>
        <div className="table-scroll"><table className="a-table"><thead><tr><th>Label</th><th>Amount</th><th>Per</th><th>Products</th><th>Models</th><th>Sizes</th><th>Materials</th><th>Methods</th><th>Area groups</th><th /></tr></thead><tbody>
          {rules.map((r, i) => (
            <tr key={r.id}>
              <td><input value={r.label} onChange={(e) => upd(i, { label: e.target.value })} /></td>
              <td><input className="w-s" value={r.amount} onChange={(e) => upd(i, { amount: num(e.target.value) })} /></td>
              <td><select value={r.per} onChange={(e) => upd(i, { per: e.target.value as PricingRule['per'] })}>{['unit', 'area', 'order', 'color', 'personalizedUnit', 'premiumAsset'].map((x) => <option key={x}>{x}</option>)}</select></td>
              {(['productIds', 'modelIds', 'sizeIds', 'materialIds', 'methodIds', 'areaGroups'] as const).map((k) => <td key={k}><input defaultValue={(r.when?.[k] ?? []).join(', ')} onBlur={(e) => updWhen(i, k, e.target.value)} placeholder="any" /></td>)}
              <td><button className="link" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button></td>
            </tr>
          ))}
        </tbody></table></div>
      </Card>
      <Card title="Quantity tiers" actions={<button className="btn" onClick={() => setCat({ ...cat, pricing: { ...cat.pricing, tiers: [...cat.pricing.tiers, { minQty: 500, pctOff: 25, label: '500+' }] } })}>+ Tier</button>}>
        <table className="a-table"><thead><tr><th>Min qty</th><th>% off</th><th>Label</th><th /></tr></thead><tbody>
          {cat.pricing.tiers.map((t, i) => {
            const u = (patch: Partial<typeof t>) => { const ts = clone(cat.pricing.tiers); ts[i] = { ...ts[i], ...patch }; setCat({ ...cat, pricing: { ...cat.pricing, tiers: ts } }) }
            return <tr key={i}><td><input className="w-s" value={t.minQty} onChange={(e) => u({ minQty: num(e.target.value) })} /></td><td><input className="w-s" value={t.pctOff} onChange={(e) => u({ pctOff: num(e.target.value) })} /></td><td><input value={t.label} onChange={(e) => u({ label: e.target.value })} /></td><td><button className="link" onClick={() => setCat({ ...cat, pricing: { ...cat.pricing, tiers: cat.pricing.tiers.filter((_, j) => j !== i) } })}>Remove</button></td></tr>
          })}
        </tbody></table>
      </Card>
    </>
  )
}

function RulesEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const opts: ValidationPolicy[] = ['warn', 'block', 'approval']
  const labels: Record<keyof Catalog['validation'], string> = { outOfBounds: 'Artwork outside print area', lowDpi: 'Image below minimum DPI', exclusion: 'Artwork over seams / no-print zones', methodLimits: 'Print-method limits (colours, raster, text size)' }
  return (
    <Card title="When a design breaks a production rule">
      {(Object.keys(labels) as (keyof Catalog['validation'])[]).map((k) => (
        <label key={k} className="a-rule">{labels[k]}
          <select value={cat.validation[k]} onChange={(e) => setCat({ ...cat, validation: { ...cat.validation, [k]: e.target.value as ValidationPolicy } })}>
            {opts.map((o) => <option key={o} value={o}>{o === 'warn' ? 'Warn only' : o === 'block' ? 'Prevent checkout' : 'Allow, require manual approval'}</option>)}
          </select>
        </label>
      ))}
      <p className="muted small">Artwork is never clipped silently — customers always see the warning.</p>
    </Card>
  )
}

function FontsEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const [family, setFamily] = useState('')
  const [license, setLicense] = useState('')
  const [category, setCategory] = useState<FontDef['category']>('Display')
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState('')
  const upload = async (f: File | undefined) => {
    if (!f) return
    setErr('')
    if (!family.trim() || !license.trim() || !ok) { setErr('Enter the family name and licence, and confirm commercial embedding rights first.'); return }
    const b = new Uint8Array(await f.slice(0, 4).arrayBuffer())
    const sig = String.fromCharCode(...b)
    if (!['wOFF', 'wOF2', 'OTTO', 'true', '\u0000\u0001\u0000\u0000'].includes(sig)) { setErr('Not a TTF, OTF, WOFF or WOFF2 font file.'); return }
    try {
      const face = new FontFace(family, await f.arrayBuffer())
      await face.load()
    } catch { setErr('This font file could not be loaded.'); return }
    const meta = await putAsset(f, { kind: 'font', mime: f.type || 'font/ttf', name: f.name, width: 0, height: 0, hasAlpha: false })
    setCat({ ...cat, fonts: [...cat.fonts.filter((x) => x.family !== family), { family: family.trim(), category, license: license.trim(), source: 'upload', url: meta.id }] })
    setFamily(''); setLicense(''); setOk(false)
  }
  return (
    <>
      <Card title="Upload a font">
        <div className="a-grid">
          <label>Family name<input value={family} onChange={(e) => setFamily(e.target.value)} /></label>
          <label>Category<select value={category} onChange={(e) => setCategory(e.target.value as FontDef['category'])}>{['Sans Serif', 'Serif', 'Display', 'Script', 'Sports', 'College', 'Vintage', 'Handwritten', 'Monospace'].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="span2">Licence (e.g. “OFL-1.1”, or commercial licence reference)<input value={license} onChange={(e) => setLicense(e.target.value)} /></label>
          <label className="check-line span2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I confirm this licence permits web embedding and use on printed products for customers.</label>
          <label className="btn">Choose font file<input type="file" hidden accept=".ttf,.otf,.woff,.woff2" onChange={(e) => upload(e.target.files?.[0])} /></label>
        </div>
        {err && <p className="error-text small">{err}</p>}
      </Card>
      <Card title={`Font library (${cat.fonts.length})`}>
        <table className="a-table"><thead><tr><th>Family</th><th>Category</th><th>Licence</th><th>Source</th><th /></tr></thead><tbody>
          {cat.fonts.map((f) => <tr key={f.family}><td style={{ fontFamily: `"${f.family}"` }}>{f.family}</td><td>{f.category}</td><td>{f.license}</td><td>{f.source}</td><td><button className="link" onClick={() => setCat({ ...cat, fonts: cat.fonts.filter((x) => x !== f) })}>Remove</button></td></tr>)}
        </tbody></table>
      </Card>
    </>
  )
}

function ClipartEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Icons')
  const [license, setLicense] = useState('')
  const [author, setAuthor] = useState('')
  const [err, setErr] = useState('')
  const add = async (f: File | undefined) => {
    if (!f) return
    if (!name || !license || !author) { setErr('Name, author and licence are required for every clipart item.'); return }
    const clean = sanitizeSvg(await f.text())
    if (!/<svg[\s>]/i.test(clean)) { setErr('Not a valid SVG.'); return }
    // Normalise to single-colour so it can be recoloured by customers.
    const svg = clean.replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"').replace(/stroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
    setCat({ ...cat, customClipart: [...(cat.customClipart ?? []), { id: `cc-${Date.now().toString(36)}`, name, category, tags: name.toLowerCase().split(/\s+/), svg, license: { source: 'marketplace', author, license, attributionRequired: false, redistribution: 'embedded-only' } }] })
    setName(''); setErr('')
  }
  return (
    <>
      <Card title="Add clipart">
        <div className="a-grid">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Category<input value={category} onChange={(e) => setCategory(e.target.value)} /></label>
          <label>Author / source<input value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
          <label>Licence<input value={license} onChange={(e) => setLicense(e.target.value)} /></label>
          <label className="btn">Choose SVG<input type="file" hidden accept=".svg,image/svg+xml" onChange={(e) => add(e.target.files?.[0])} /></label>
        </div>
        {err && <p className="error-text small">{err}</p>}
      </Card>
      <Card title={`Library (${CLIPART.length} built-in, ${cat.customClipart?.length ?? 0} custom)`}>
        <div className="a-clips">
          {[...(cat.customClipart ?? []), ...CLIPART.filter((c) => c.svg)].map((c) => (
            <figure key={c.id} title={`${c.name} — ${c.license.license}`}>
              <img alt="" src={'data:image/svg+xml;utf8,' + encodeURIComponent(c.svg.replace(/currentColor/g, '#222'))} />
              <figcaption>{c.name}</figcaption>
            </figure>
          ))}
        </div>
      </Card>
    </>
  )
}

function TemplatesEditor({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const [i, setI] = useState(0)
  const [txt, setTxt] = useState('')
  const [err, setErr] = useState('')
  const t = cat.templates[i]
  useEffect(() => setTxt(t ? JSON.stringify(t, null, 2) : ''), [t])
  return (
    <Card title="Templates" actions={<button className="btn" onClick={() => { setCat({ ...cat, templates: [...cat.templates, { id: `tpl-${Date.now().toString(36)}`, title: 'New template', description: '', productId: cat.products[0].id, areas: {} }] }); setI(cat.templates.length) }}>+ Template</button>}>
      <div className="a-grid">
        <label>Template<select value={i} onChange={(e) => setI(+e.target.value)}>{cat.templates.map((x, j) => <option key={x.id} value={j}>{x.title}</option>)}</select></label>
      </div>
      <p className="muted small">Elements: kind (text/clipart), x/y (0–1 in area), lock (editable/locked/hidden), required, bulkField (name/number). restrictFonts / restrictColors limit customer choices.</p>
      <textarea className="a-json" rows={22} value={txt} onChange={(e) => setTxt(e.target.value)} spellCheck={false} aria-label="Template JSON" />
      {err && <p className="error-text small">{err}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => { try { const v = JSON.parse(txt); const ts = clone(cat.templates); ts[i] = v; setCat({ ...cat, templates: ts }); setErr('') } catch (e) { setErr((e as Error).message) } }}>Apply</button>
        <button className="link danger" onClick={() => { setCat({ ...cat, templates: cat.templates.filter((_, j) => j !== i) }); setI(0) }}>Delete template</button>
      </div>
    </Card>
  )
}

function LicenseReport({ cat }: { cat: Catalog }) {
  const rows = [
    ...cat.products.flatMap((p) => p.models.map((m) => ({ type: '3D model', name: `${p.title} / ${m.label}`, ...m.license }))),
    ...cat.fonts.map((f) => ({ type: 'Font', name: f.family, source: f.source, author: f.source === 'google' ? 'Google Fonts' : 'uploaded', license: f.license, attributionRequired: false, redistribution: 'embedded-only', url: undefined as string | undefined })),
    { type: 'Clipart', name: `Built-in library (${CLIPART.length} items)`, ...CLIPART_LICENSE },
    ...(cat.customClipart ?? []).map((c) => ({ type: 'Clipart', name: c.name, ...c.license })),
    { type: 'Textures', name: 'Fabric weave normal maps', source: 'internal', author: 'Generated procedurally in code', license: 'Proprietary', attributionRequired: false, redistribution: 'embedded-only', url: undefined },
  ]
  const csv = () => {
    const lines = [['Type', 'Asset', 'Source', 'Author', 'Licence', 'Attribution', 'Redistribution', 'URL'], ...rows.map((r) => [r.type, r.name, r.source, r.author, r.license, r.attributionRequired ? 'required' : 'no', r.redistribution, r.url ?? ''])]
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'asset-licences.csv' }); a.click()
  }
  return (
    <Card title="Third-party asset licences" actions={<button className="btn" onClick={csv}>Export CSV</button>}>
      <div className="table-scroll"><table className="a-table"><thead><tr><th>Type</th><th>Asset</th><th>Source</th><th>Author</th><th>Licence</th><th>Attribution</th><th>Redistribution</th></tr></thead><tbody>
        {rows.map((r, i) => <tr key={i} className={!r.license ? 'warn' : ''}><td>{r.type}</td><td>{r.name}</td><td>{r.source}</td><td>{r.author || '—'}</td><td>{r.license || 'MISSING'}</td><td>{r.attributionRequired ? 'Required' : 'No'}</td><td>{r.redistribution}</td></tr>)}
      </tbody></table></div>
    </Card>
  )
}

function JsonIO({ cat, setCat }: { cat: Catalog; setCat: (c: Catalog) => void }) {
  const [err, setErr] = useState('')
  const exp = () => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(cat, null, 2)], { type: 'application/json' })), download: 'catalog.json' }); a.click() }
  const imp = async (f: File | undefined) => {
    if (!f) return
    try { const c = JSON.parse(await f.text()) as Catalog; const e = validateCatalog(c); if (e.length) throw new Error(e.slice(0, 5).join(' ')); setCat(c); setErr('') } catch (e) { setErr((e as Error).message) }
  }
  return (
    <Card title="Catalog data">
      <div className="btn-row">
        <button className="btn" onClick={exp}>Export catalog.json</button>
        <label className="btn">Import catalog.json<input type="file" hidden accept="application/json,.json" onChange={(e) => imp(e.target.files?.[0])} /></label>
      </div>
      {err && <p className="error-text small">{err}</p>}
      <p className="muted small">Use export/import to move configuration between environments or tenants.</p>
    </Card>
  )
}

// ---------------------------------------------------------------- auth (Supabase only)

/** Catalog writes are protected by RLS (tenant_admins). Admin accounts are created by the operator in Supabase Auth. */
function AuthBar({ tenantId }: { tenantId: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [err, setErr] = useState('')
  const refresh = async () => {
    const { data } = await supabase!.auth.getUser()
    setUser(data.user?.email ?? null)
    if (data.user) {
      const { data: rows } = await supabase!.from('tenant_admins').select('tenant_id').eq('tenant_id', tenantId)
      setIsAdmin(!!rows?.length)
    } else setIsAdmin(false)
  }
  useEffect(() => { refresh() }, [])
  const signIn = async () => {
    setErr('')
    const { error } = await supabase!.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
    setPassword('')
    refresh()
  }
  return (
    <div className="a-auth">
      {user ? (
        <>
          <span>Signed in as <strong>{user}</strong> · {isAdmin ? 'admin of this store' : <span className="error-text">not an admin of this store — publishing will be refused</span>}</span>
          <button className="btn" onClick={async () => { await supabase!.auth.signOut(); refresh() }}>Sign out</button>
        </>
      ) : (
        <form className="row" onSubmit={(e) => { e.preventDefault(); signIn() }}>
          <span className="muted small">Sign in to publish:</span>
          <input type="email" autoComplete="username" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Admin email" />
          <input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Admin password" />
          <button className="btn btn-primary" type="submit">Sign in</button>
          {err && <span className="error-text small">{err}</span>}
        </form>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- shell

export default function AdminApp() {
  const [cat, setCatState] = useState<Catalog | null>(null)
  const [saved, setSaved] = useState<Catalog | null>(null)
  const [section, setSection] = useState<SectionId>('products')
  const [pi, setPi] = useState(0)
  const [publishError, setPublishError] = useState('')
  const tenant = useMemo(tenantFromLocation, [])
  useEffect(() => { catalogApi.load(tenant).then((c) => { setCatState(c); setSaved(c) }) }, [tenant])
  const errors = useMemo(() => (cat ? validateCatalog(cat) : []), [cat])
  if (!cat) return <div className="admin-loading"><span className="spinner" /> Loading catalog…</div>
  const setCat = (c: Catalog) => setCatState(c)
  const dirty = cat !== saved
  const save = async () => {
    if (errors.length) return
    try { await catalogApi.save(tenant, cat); setSaved(cat); setPublishError('') } catch (e) { setPublishError((e as Error).message) }
  }
  const p = cat.products[pi]
  return (
    <div className="admin">
      <header className="a-top">
        <strong>Configurator admin</strong><span className="badge">{tenant.companyName}</span>
        <span className="muted small">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className="a-top-actions">
          <a className="btn" href={`/${location.search}`} target="_blank" rel="noreferrer">Open storefront ↗</a>
          <button className="btn" onClick={async () => { if (confirm('Reset the catalog to the default seed data?')) { await catalogApi.reset(tenant); const c = catalogApi.seed(tenant); setCatState(c); setSaved(c) } }}>Reset</button>
          <button className="btn btn-primary" disabled={!dirty || errors.length > 0} onClick={save}>Publish changes</button>
        </div>
      </header>
      {supabase && <AuthBar tenantId={tenant.id} />}
      {publishError && <div className="a-errors a-banner" role="alert">{publishError}</div>}
      <nav className="a-nav" aria-label="Admin sections">
        {SECTIONS.map((s) => <button key={s.id} className={section === s.id ? 'is-on' : ''} onClick={() => setSection(s.id)}><Icon name={s.icon} size={18} /> {s.label}</button>)}
      </nav>
      <main className="a-main">
        {errors.length > 0 && <div className="a-errors" role="alert"><strong>{errors.length} problem(s) must be fixed before publishing:</strong><ul>{errors.slice(0, 12).map((e) => <li key={e}>{e}</li>)}</ul></div>}
        {section === 'products' && (
          <>
            <Card title="Products" actions={<button className="btn" onClick={() => { const base = clone(cat.products[0]); base.id = `product-${Date.now().toString(36)}`; base.slug = base.id; base.title = 'New product'; base.published = false; setCat({ ...cat, products: [...cat.products, base] }); setPi(cat.products.length) }}>+ New product</button>}>
              <div className="a-plist">
                {cat.products.map((x, i) => <button key={x.id} className={i === pi ? 'is-on' : ''} onClick={() => setPi(i)}>{x.title}<span className={`badge ${x.published ? 'on' : ''}`}>{x.published ? 'Live' : 'Draft'}</span></button>)}
              </div>
            </Card>
            {p && <ProductEditor key={p.id + pi} p={p} cat={cat} onChange={(np) => { const ps = clone(cat.products); ps[pi] = np; setCat({ ...cat, products: ps }) }} />}
            {p && cat.products.length > 1 && <button className="link danger" onClick={() => { if (confirm(`Delete ${p.title}?`)) { setCat({ ...cat, products: cat.products.filter((_, j) => j !== pi) }); setPi(0) } }}>Delete product</button>}
          </>
        )}
        {section === 'areas' && <AreasEditor cat={cat} setCat={setCat} />}
        {section === 'pricing' && <PricingEditor cat={cat} setCat={setCat} />}
        {section === 'templates' && <TemplatesEditor cat={cat} setCat={setCat} />}
        {section === 'fonts' && <FontsEditor cat={cat} setCat={setCat} />}
        {section === 'clipart' && <ClipartEditor cat={cat} setCat={setCat} />}
        {section === 'rules' && <RulesEditor cat={cat} setCat={setCat} />}
        {section === 'licenses' && <LicenseReport cat={cat} />}
        {section === 'json' && <JsonIO cat={cat} setCat={setCat} />}
      </main>
    </div>
  )
}
