import { requestCamera, useStore } from '../state/store'
import { viewer } from '../3d/bridge'
import { Icon } from './icons'
export function StudioStatus() {
  const quality = useStore(s => s.quality)
  return <div className="studio-status" aria-label="Studio controls">
    <button onClick={() => requestCamera('full')} title="Drag the garment to rotate in any direction"><Icon name="rotate" />360° Rotate</button>
    <button onClick={() => viewer()?.zoom(.8)}><Icon name="zoomIn" />Zoom</button>
    <button onClick={() => requestCamera('front')}><Icon name="reset" />Reset View</button>
    <span className="row"><Icon name="light" />Studio Light</span>
    <button className="status-quality" onClick={() => useStore.setState({ quality: quality === 'high' ? 'medium' : 'high' })}><Icon name="hd" />{quality === 'high' ? 'High' : quality === 'medium' ? 'Medium' : 'Low'} Quality</button>
  </div>
}
