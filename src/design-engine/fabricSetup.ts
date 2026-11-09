// Global Fabric configuration: serialised custom properties and branded controls.
import { Control, FabricObject, InteractiveFabricObject, Textbox, controlsUtils, type TPointerEventInfo, type Transform } from 'fabric'

export const CUSTOM_PROPS = ['uid', 'name', 'kind', 'assetId', 'lockLevel', 'required', 'bulkField', 'premium', 'patternSpec', 'curve', 'qrText', 'clipartId', 'aspectUnlocked', 'lockedLayer', 'autoName'] as const

let done = false
let onDelete: (target: FabricObject) => void = () => {}
export const setDeleteHandler = (fn: (t: FabricObject) => void) => { onDelete = fn }

function accent() {
  return getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim() || '#1f5eff'
}

function renderDelete(ctx: CanvasRenderingContext2D, left: number, top: number) {
  const r = 11
  ctx.save()
  ctx.translate(left, top)
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#d23b3b'; ctx.lineWidth = 2; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(4, 4); ctx.moveTo(4, -4); ctx.lineTo(-4, 4); ctx.stroke()
  ctx.restore()
}

function renderRotate(ctx: CanvasRenderingContext2D, left: number, top: number) {
  ctx.save()
  ctx.translate(left, top)
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = accent(); ctx.lineWidth = 1.8
  ctx.beginPath(); ctx.arc(0, 0, 5, -Math.PI * 0.9, Math.PI * 0.55); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(-5.5, -4.5); ctx.lineTo(-5, 0.5); ctx.lineTo(-1, -2.5); ctx.fillStyle = accent(); ctx.fill()
  ctx.restore()
}

function brandedControls(base: Record<string, Control>) {
  return {
    ...base,
    mtr: new Control({ ...base.mtr, x: 0, y: 0.5, offsetY: 26, withConnection: false, cursorStyle: 'grab', render: renderRotate, sizeX: 24, sizeY: 24, actionHandler: controlsUtils.rotationWithSnapping, actionName: 'rotate' }),
    del: new Control({
      x: 0.5, y: -0.5, offsetX: 14, offsetY: -14, cursorStyle: 'pointer', sizeX: 24, sizeY: 24, render: renderDelete,
      mouseUpHandler: (_e: TPointerEventInfo['e'], t: Transform) => { onDelete(t.target); return true },
    }),
  }
}

export function setupFabric(primary = '#1f5eff') {
  if (done) return
  done = true
  FabricObject.customProperties = [...CUSTOM_PROPS]
  InteractiveFabricObject.ownDefaults = {
    ...InteractiveFabricObject.ownDefaults,
    transparentCorners: false,
    cornerStyle: 'circle',
    cornerColor: '#ffffff',
    cornerStrokeColor: primary,
    borderColor: primary,
    cornerSize: 12,
    touchCornerSize: 30,
    padding: 4,
    borderScaleFactor: 1.5,
    borderOpacityWhenMoving: 0.5,
    snapAngle: 45,
    snapThreshold: 4,
  }
  const objCtrls = FabricObject.createControls
  FabricObject.createControls = () => ({ controls: brandedControls(objCtrls().controls) })
  const txtCtrls = Textbox.createControls
  Textbox.createControls = () => ({ controls: brandedControls(txtCtrls().controls) })
}
