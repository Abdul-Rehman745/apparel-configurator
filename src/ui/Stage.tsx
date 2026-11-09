import { Component, lazy, Suspense, type ReactNode } from 'react'
import { requestCamera, setMode, openDialog, toast, useStore, type Mode } from '../state/store'
import { viewer } from '../3d/bridge'
import { AreaPicker, EditorSlot } from './Inspector'
import { IconButton, Segmented } from './common'
import { Icon } from './icons'
import { useFeature, useResolved } from './hooks'

const Viewer = lazy(() => import('../3d/Viewer'))
const VIEWS = [{ id: 'front', label: 'Front' }, { id: 'back', label: 'Back' }, { id: 'left', label: 'Left' }, { id: 'right', label: 'Right' }, { id: 'neck', label: 'Collar' }]

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) {
    console.error('3D viewer failed', e)
    toast('The 3D preview couldn’t start on this device. You can keep designing in 2D.', 'error', 8000)
    useStore.setState({ webgl: false, mode: 'precision' })
  }
  render() { return this.state.failed ? null : this.props.children }
}

export function ModeSwitch() {
  const mode = useStore((s) => s.mode)
  const webgl = useStore((s) => s.webgl)
  const has3d = useFeature('viewer3d') && webgl
  if (!has3d) return <span className="mode-badge"><Icon name="edit" size={16} /> 2D editor</span>
  return (
    <Segmented<Mode> label="Editing mode" value={mode} onChange={setMode} options={[
      { value: 'view', label: <><Icon name="cube" size={16} /> 3D View</>, title: 'Rotate and inspect the garment' },
      { value: 'design', label: <><Icon name="hand" size={16} /> Design</>, title: 'Drag artwork directly on the garment' },
      { value: 'precision', label: <><Icon name="edit" size={16} /> 2D Design</>, title: 'Precise editing of the print area' },
    ]} />
  )
}

function ViewerControls() {
  const current = useStore(s => s.cameraRequest.id)
  const fs = () => {
    const el = viewer()?.element()?.closest('.stage') as HTMLElement | null
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.().catch(() => toast('Fullscreen isn’t available here.'))
  }
  return (
    <div className="viewer-tools" role="toolbar" aria-label="3D view controls">
      <div className="camera-tabs">{VIEWS.map(v => <button key={v.id} className={`view-btn ${v.id === current ? 'is-on' : ''}`} aria-pressed={v.id === current} onClick={() => requestCamera(v.id)}>{v.label}</button>)}</div>
      <div className="camera-actions">
      <IconButton icon="zoomIn" label="Zoom in" onClick={() => viewer()?.zoom(0.8)} />
      <IconButton icon="zoomOut" label="Zoom out" onClick={() => viewer()?.zoom(1.25)} />
      <IconButton icon="expand" label="Fullscreen" onClick={fs} className="hide-sm" />
      </div>
    </div>
  )
}

export function Stage() {
  const mode = useStore((s) => s.mode)
  const webgl = useStore((s) => s.webgl)
  const has3d = useFeature('viewer3d') && webgl
  const preview = useFeature('downloadPreview')
  const tool = useStore(s => s.tool)
  const current = useStore(s => s.cameraRequest.id)
  const browsing = tool === 'product' && mode === 'view' && has3d
  const { method } = useResolved()
  const precision = mode === 'precision' || !has3d
  return (
    <main className={`stage mode-${precision ? 'precision' : mode} ${browsing ? 'is-browsing' : ''}`} aria-label="Product preview">
      <div className="stage-top"><ModeSwitch />{preview && <button className="mockup-btn" onClick={() => openDialog('preview')}><Icon name="image" size={17} /> Mockup</button>}</div>
      {precision && (
        <div className="stage-editor">
          {!has3d && <p className="fallback-note"><Icon name="info" size={16} /> 3D preview isn’t available on this device — everything else works, including ordering.</p>}
          <EditorSlot className="is-large" />
        </div>
      )}
      {has3d && (
        <div className={`stage-viewer ${precision ? 'is-inset' : ''}`} onClick={precision ? () => setMode('view') : undefined} title={precision ? 'Back to 3D' : undefined}>
          <ViewerBoundary>
            <Suspense fallback={<div className="viewer-loading"><span className="spinner" /> Loading 3D preview…</div>}>
              <Viewer />
            </Suspense>
          </ViewerBoundary>
          {!precision && <ViewerControls />}
          {!precision && mode === 'design' && <p className="mode-hint">Drag artwork on the garment · tap a print zone to edit it</p>}
          {method.finish === 'embroidery' && !precision && <p className="viz-note">Embroidery visualisation — stitched result may differ slightly.</p>}
        </div>
      )}
      {browsing ? <>
        <div className="view-arrows">{[-1, 1].map(direction => <IconButton key={direction} icon={direction === -1 ? 'left' : 'right'} label={direction === -1 ? 'Previous garment view' : 'Next garment view'} onClick={() => requestCamera(VIEWS[(Math.max(0, VIEWS.findIndex(v => v.id === current)) + direction + VIEWS.length) % VIEWS.length].id)} />)}</div>
        <nav className="view-strip" aria-label="Garment views">{VIEWS.map(v => <button key={v.id} aria-pressed={v.id === current} onClick={() => requestCamera(v.id)}><img src={`/assets/view-${v.id}.png`} alt="" /><span>{v.label}</span></button>)}</nav>
      </> : <div className="stage-areas"><AreaPicker /></div>}
    </main>
  )
}
