import { useEffect, useRef, useState } from 'react'
import { processUpload, UploadError } from '../../assets/upload'
import { assetUrl, getAssetBlob, listAssets, type AssetMeta } from '../../assets/assetStore'
import { addUploaded } from '../../design-engine/actions'
import { toast, useStore } from '../../state/store'
import { Section } from '../common'
import { Icon } from '../icons'

function Thumb({ meta, onClick }: { meta: AssetMeta; onClick: () => void }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => { assetUrl(meta.id).then(setUrl) }, [meta.id])
  return (
    <button className="asset-thumb" onClick={onClick} title={`${meta.name} — ${meta.width}×${meta.height}`}>
      {url && <img src={url} alt="" loading="lazy" />}
      <span>{meta.kind === 'svg' ? 'SVG' : `${meta.width}×${meta.height}`}</span>
    </button>
  )
}

export function UploadPanel() {
  const [agree, setAgree] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<AssetMeta[]>([])
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const assetsRev = useStore((s) => s.assetsRev)
  useEffect(() => { listAssets().then((a) => setRecent(a.filter((x) => x.kind !== 'font').slice(0, 24))) }, [assetsRev])

  const handle = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!agree) { setError('Please confirm you have the right to print this artwork.'); return }
    setError(''); setProgress(0)
    try {
      const { meta, svgText } = await processUpload(file, setProgress)
      useStore.setState({ assetsRev: useStore.getState().assetsRev + 1 })
      await addUploaded(meta, svgText)
      toast(`Added “${meta.name}”`, 'success')
    } catch (e) {
      setError(e instanceof UploadError ? e.message : 'Upload failed. Please try another file.')
      if (!(e instanceof UploadError)) console.error(e)
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  const reuse = async (m: AssetMeta) => {
    const svgText = m.kind === 'svg' ? await (await getAssetBlob(m.id))?.text() : undefined
    addUploaded(m, svgText)
  }

  return (
    <div className="panel-scroll">
      <Section title="Upload artwork">
        <div
          className={`dropzone ${drag ? 'is-drag' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files) }}
        >
          <Icon name="upload" size={28} />
          <strong>Drop an image here</strong>
          <span className="muted small">PNG, JPG, WebP or SVG · up to 25 MB</span>
          <button className="btn" onClick={() => input.current?.click()} disabled={progress !== null}>Choose file</button>
          <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" onChange={(e) => handle(e.target.files)} />
        </div>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I own this artwork or have permission to print it.</span>
        </label>
        {progress !== null && <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(5, progress * 100)}%` }} /></div>}
        {error && <p className="error-text" role="alert"><Icon name="alert" size={16} /> {error}</p>}
        <p className="muted small">For sharp prints, use images of at least 300 DPI at print size (≈3600 px wide for a 12" print). Vector SVGs always print crisp.</p>
      </Section>
      {recent.length > 0 && (
        <Section title="Your uploads">
          <div className="asset-grid">{recent.map((m) => <Thumb key={m.id} meta={m} onClick={() => reuse(m)} />)}</div>
        </Section>
      )}
    </div>
  )
}
