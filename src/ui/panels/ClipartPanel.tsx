import { useEffect, useMemo, useRef, useState } from 'react'
import { allClipart, CLIPART_CATEGORIES, colorizeSvg, type Clipart } from '../../assets/clipart'
import { addClipart } from '../../design-engine/actions'
import { Section, Swatches } from '../common'
import { Icon } from '../icons'
import { useFeature } from '../hooks'
import { useStore } from '../../state/store'

// Per-viewer conveniences only (safe if storage is unavailable).
const load = (k: string): string[] => { try { return JSON.parse(localStorage.getItem(k) ?? '[]') } catch { return [] } }
const save = (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* storage blocked */ } }

const INKS = ['#111111', '#ffffff', '#1f2a44', '#2250a8', '#b3202c', '#26452f', '#e2a927', '#f08a24', '#6d3fa0', '#a7a8aa']
const PAGE = 36

function Tile({ c, fav, onFav, color }: { c: Clipart; fav: boolean; onFav: () => void; color: string }) {
  const src = useMemo(() => (c.svg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(colorizeSvg(c.svg, color === '#ffffff' ? '#cfcfcf' : color)) : ''), [c, color])
  return (
    <div className="clip-tile">
      <button className="clip-btn" onClick={() => { addClipart(c.id, color); const r = [c.id, ...load('clip-recent').filter((x) => x !== c.id)].slice(0, 18); save('clip-recent', r) }} title={c.name} aria-label={`Add ${c.name}`}>
        {src ? <img src={src} alt="" loading="lazy" /> : <span className="clip-text" style={{ fontFamily: `"${c.textPreset!.font}"`, color }}>{c.textPreset!.text}</span>}
        {c.premium && <span className="premium">PRO</span>}
      </button>
      <button className={`fav ${fav ? 'is-on' : ''}`} onClick={onFav} aria-label={fav ? `Remove ${c.name} from favourites` : `Add ${c.name} to favourites`} aria-pressed={fav}><Icon name="star" size={14} /></button>
    </div>
  )
}

export function ClipartPanel() {
  const premiumOk = useFeature('premiumAssets')
  const restrictColors = useStore((s) => s.design.restrictColors)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [color, setColor] = useState(restrictColors?.[0] ?? '#111111')
  const [favs, setFavs] = useState(() => load('clip-favs'))
  const [limit, setLimit] = useState(PAGE)
  const sentinel = useRef<HTMLDivElement>(null)

  const list = useMemo(() => {
    const pool = allClipart().filter((c) => premiumOk || !c.premium)
    const recent = load('clip-recent')
    const base = cat === '★' ? pool.filter((c) => favs.includes(c.id)) : cat === 'recent' ? recent.map((id) => pool.find((c) => c.id === id)).filter((c): c is Clipart => !!c) : pool.filter((c) => !cat || c.category === cat)
    const s = q.trim().toLowerCase()
    return s ? base.filter((c) => c.name.toLowerCase().includes(s) || c.tags.some((t) => t.includes(s)) || c.category.toLowerCase().includes(s)) : base
  }, [q, cat, favs, premiumOk])

  useEffect(() => setLimit(PAGE), [q, cat])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((l) => l + PAGE))
    io.observe(el)
    return () => io.disconnect()
  }, [list])

  const toggleFav = (id: string) => { const f = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(f); save('clip-favs', f) }

  return (
    <div className="panel-scroll">
      <Section title="Clipart">
        <input type="search" placeholder="Search clipart (e.g. trophy, leaf)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clipart" />
        <div className="chips" role="group" aria-label="Clipart category">
          <button className={`chip ${!cat ? 'is-on' : ''}`} onClick={() => setCat('')}>All</button>
          <button className={`chip ${cat === '★' ? 'is-on' : ''}`} onClick={() => setCat('★')}>Favourites</button>
          <button className={`chip ${cat === 'recent' ? 'is-on' : ''}`} onClick={() => setCat('recent')}>Recent</button>
          {[...new Set([...CLIPART_CATEGORIES, ...allClipart().map((c) => c.category)])].map((c) => <button key={c} className={`chip ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="ink-row"><span className="muted small">Colour</span><Swatches label="Clipart colour" value={color} onChange={setColor} colors={(restrictColors ?? INKS).map((hex) => ({ hex }))} allowCustom={!restrictColors} /></div>
        <div className="clip-grid">
          {list.slice(0, limit).map((c) => <Tile key={c.id} c={c} color={color} fav={favs.includes(c.id)} onFav={() => toggleFav(c.id)} />)}
        </div>
        {!list.length && <p className="muted small">{cat === '★' ? 'Star clipart to keep it here.' : 'Nothing matches your search.'}</p>}
        <div ref={sentinel} aria-hidden />
        <p className="muted small">All clipart is original artwork licensed for printing on your order.</p>
      </Section>
    </div>
  )
}
