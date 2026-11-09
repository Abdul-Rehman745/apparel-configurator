import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IText } from 'fabric'
import { redo, setTool, undo, useStore, replaceDesign, type Tool } from '../state/store'
import { autosave } from '../api/designApi'
import { editor } from '../design-engine/editor'
import { startSync } from '../design-engine/sync'
import { track } from '../api/analytics'
import { Footer, TopBar, ToolRail, useTools } from './Chrome'
import { Inspector, Properties } from './Inspector'
import { Stage } from './Stage'
import { Dialogs, Toasts } from './Dialogs'
import { IconButton } from './common'
import { Icon } from './icons'
import { loadDesign } from './flows'
import { ProductPanel } from './panels/ProductPanel'
import { TemplatesPanel } from './panels/TemplatesPanel'
import { TextPanel } from './panels/TextPanel'
import { UploadPanel } from './panels/UploadPanel'
import { ClipartPanel } from './panels/ClipartPanel'
import { ShapesPanel } from './panels/ShapesPanel'
import { PatternsPanel } from './panels/PatternsPanel'
import { LayersPanel } from './panels/LayersPanel'
import { TeamPanel } from './panels/TeamPanel'
import { ProductInfo } from './ProductInfo'
import { StudioStatus } from './StudioStatus'

const PANELS: Record<Tool, () => ReactNode> = {
  product: ProductPanel, designs: TemplatesPanel, text: TextPanel, upload: UploadPanel, clipart: ClipartPanel,
  shapes: ShapesPanel, patterns: PatternsPanel, layers: LayersPanel, team: TeamPanel,
}

function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const mq = matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    on() // catch changes between first render and subscription
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

function ToolPanel() {
  const tool = useStore((s) => s.tool)
  const tools = useTools()
  const t = tools.find((x) => x.id === tool)
  if (!t) return null
  const P = PANELS[t.id]
  return (
    <aside className="tool-panel" aria-label={`${t.label} panel`}>
      <header className="tool-panel-head"><h2>{t.label}</h2><IconButton icon="close" label="Close panel" onClick={() => setTool(null)} /></header>
      <P />
    </aside>
  )
}

/** Mobile: bottom bar + draggable sheet; the garment stays visible above the sheet. */
function MobileSheet() {
  const tool = useStore((s) => s.tool)
  const selection = useStore((s) => s.selection)
  const tools = useTools()
  const [tall, setTall] = useState(false)
  const start = useRef<number | null>(null)
  const [edit, setEdit] = useState(false)
  const [menu, setMenu] = useState(false)
  useEffect(() => { if (selection.length) setEdit(true) }, [selection])
  const t = tools.find((x) => x.id === tool)
  const open = !!t || (edit && selection.length > 0)
  const P = t ? PANELS[t.id] : null
  const primary = tools.filter((x) => ['product', 'text', 'upload', 'clipart', 'layers'].includes(x.id))
  const more = tools.filter((x) => !primary.includes(x))
  return (
    <>
      {open && (
        <section className={`sheet ${tall ? 'is-tall' : ''}`} aria-label={t ? `${t.label} panel` : 'Edit selection'}>
          <div className="sheet-grab" role="button" tabIndex={0} aria-label={tall ? 'Collapse panel' : 'Expand panel'}
            onClick={() => setTall(!tall)} onKeyDown={(e) => e.key === 'Enter' && setTall(!tall)}
            onPointerDown={(e) => { start.current = e.clientY }} onPointerUp={(e) => { if (start.current !== null) { const d = e.clientY - start.current; if (d < -30) setTall(true); if (d > 30) { if (tall) setTall(false); else { setTool(null); setEdit(false) } } } start.current = null }}>
            <span />
          </div>
          <header className="tool-panel-head">
            <h2>{t ? t.label : 'Edit'}</h2>
            <IconButton icon="close" label="Close panel" onClick={() => { setTool(null); setEdit(false); editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll() }} />
          </header>
          <div className="sheet-body">{P ? <P /> : <Properties />}</div>
        </section>
      )}
      <nav className="bottom-bar" aria-label="Design tools">
        {primary.map((x) => (
          <button key={x.id} className={`tool ${tool === x.id ? 'is-on' : ''}`} aria-pressed={tool === x.id} onClick={() => { setEdit(false); setTool(tool === x.id ? null : x.id) }}>
            <Icon name={x.icon} size={22} /><span>{x.label}</span>
          </button>
        ))}
        {more.length > 0 && (
          <div className="more-wrap">
            <button className={`tool ${more.some((x) => x.id === tool) ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Icon name="menu" size={22} /><span>More</span>
            </button>
            {menu && (
              <div className="more-menu" role="menu">
                {more.map((x) => <button key={x.id} role="menuitem" onClick={() => { setMenu(false); setEdit(false); setTool(x.id) }}><Icon name={x.icon} size={18} /> {x.label}</button>)}
              </div>
            )}
          </div>
        )}
      </nav>
    </>
  )
}

function RestoreBanner() {
  const [pending, setPending] = useState<{ at: number; design: ReturnType<typeof useStore.getState>['design'] } | null>(null)
  useEffect(() => {
    if (location.pathname.startsWith('/design/')) return
    autosave.read().then((a) => { if (a && Object.values(a.design.areas).some((x) => x.objects.length)) setPending(a) })
  }, [])
  if (!pending) return null
  return (
    <div className="restore" role="alert">
      <Icon name="clock" size={18} />
      <span>Restore your unsaved design from {new Date(pending.at).toLocaleString()}?</span>
      <button className="btn btn-primary" onClick={() => { replaceDesign(pending.design); setPending(null) }}>Restore</button>
      <button className="btn" onClick={() => { autosave.clear(); setPending(null) }}>Discard</button>
    </div>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.closest('input,textarea,select,[contenteditable]') || (editor.active() instanceof IText && (editor.active() as IText).isEditing)
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return }
      if (mod && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); redo(); return }
      if (typing || useStore.getState().dialog) return
      const step = e.shiftKey ? 25 : 2.5 // design units: 0.5" / 0.05"
      switch (true) {
        case e.key === 'Delete' || e.key === 'Backspace': if (editor.active()) { e.preventDefault(); editor.deleteSelection() } break
        case e.key === 'ArrowLeft': if (editor.active()) { e.preventDefault(); editor.nudge(-step, 0) } break
        case e.key === 'ArrowRight': if (editor.active()) { e.preventDefault(); editor.nudge(step, 0) } break
        case e.key === 'ArrowUp': if (editor.active()) { e.preventDefault(); editor.nudge(0, -step) } break
        case e.key === 'ArrowDown': if (editor.active()) { e.preventDefault(); editor.nudge(0, step) } break
        case mod && e.key.toLowerCase() === 'c': editor.copy(); break
        case mod && e.key.toLowerCase() === 'v': e.preventDefault(); editor.paste(); break
        case mod && e.key.toLowerCase() === 'd': e.preventDefault(); editor.duplicate(); break
        case mod && e.key.toLowerCase() === 'g': e.preventDefault(); if (e.shiftKey) editor.ungroup(); else editor.group(); break
        case e.key === 'Escape': editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  const mobile = useMedia('(max-width: 1100px)')
  const tool = useStore((s) => s.tool)
  const mode = useStore((s) => s.mode)
  useKeyboard()

  useEffect(() => {
    const stop = startSync()
    const m = location.pathname.match(/^\/design\/([A-Z0-9-]{6,32})$/i)
    if (m) loadDesign(m[1].toUpperCase())
    track('configurator_opened', { productId: useStore.getState().design.productId })
    // Autosave (debounced) — camera-independent design state only.
    let t = 0
    const unsub = useStore.subscribe((s, p) => {
      if (s.design === p.design) return
      clearTimeout(t)
      t = window.setTimeout(() => autosave.write(useStore.getState().design).catch(() => {}), 800)
    })
    const beforeUnload = () => { autosave.write(useStore.getState().design).catch(() => {}) }
    window.addEventListener('pagehide', beforeUnload)
    return () => { stop(); unsub(); window.removeEventListener('pagehide', beforeUnload) }
  }, [])

  return (
    <div className={`app ${mobile ? 'is-mobile' : 'is-desktop'} ${tool && !mobile ? 'has-panel' : ''} mode-${mode}`}>
      <a href="#stage" className="skip">Skip to preview</a>
      <TopBar />
      <RestoreBanner />
      {!mobile && <ToolRail />}
      {!mobile && <ToolPanel />}
      <div id="stage" className="stage-wrap"><Stage /></div>
      {!mobile && (tool === 'product' && mode === 'view' ? <ProductInfo /> : <Inspector />)}
      <Footer />
      {!mobile && <StudioStatus />}
      {mobile && <MobileSheet />}
      <Dialogs />
      <Toasts />
    </div>
  )
}
