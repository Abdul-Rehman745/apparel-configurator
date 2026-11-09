import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { GarmentModel } from '../core/types'
import { DESIGN_PPI } from '../core/design'
import { resolve } from '../products/lookup'
import { setActiveArea, toast, useStore } from '../state/store'
import { useShallow } from 'zustand/react/shallow'
import { editor } from '../design-engine/editor'
import { setSurface } from '../design-engine/sync'
import { buildProceduralGarment, type BuiltGarment } from './proceduralGarment'
import { PrintSurface } from './printSurface'
import { weaveNormalMap, yarnMap } from './weave'
import { registerViewer } from './bridge'
import { assetUrl } from '../assets/assetStore'

const QUALITY = {
  low: { dpr: [1, 1.25] as [number, number], texPpi: 28, shadow: 256, env: 64 },
  medium: { dpr: [1, 1.75] as [number, number], texPpi: 40, shadow: 512, env: 128 },
  high: { dpr: [1, 2] as [number, number], texPpi: 60, shadow: 1024, env: 256 },
}

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

// ---------------- garment ----------------

function useGarment(model: GarmentModel): BuiltGarment | null {
  const zoneOf = (panelId: string) => {
    const z = model.panels.find((p) => p.id === panelId)?.colorZone
    return model.colorZones.some((c) => c.id === z) ? z! : 'body'
  }
  const zoneOrBody = (z: string) => (model.colorZones.some((c) => c.id === z) ? z : z === 'buttons' ? 'buttons' : 'body')
  return useMemo(() => {
    if (model.source.type !== 'procedural') return null
    const g = buildProceduralGarment(model.source.garment, zoneOf)
    g.trims.forEach((t) => (t.zone = zoneOrBody(t.zone)))
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model])
}

/** GLB sources may be admin uploads stored as "asset:<id>"; resolve to an object URL first. */
function GlbGarment({ model }: { model: GarmentModel }) {
  const src = model.source.type === 'glb' ? model.source.url : ''
  const [url, setUrl] = useState(src.startsWith('asset:') ? '' : src)
  useEffect(() => {
    if (!src.startsWith('asset:')) { setUrl(src); return }
    assetUrl(src.slice(6)).then((u) => (u ? setUrl(u) : toast('This garment’s 3D model file is missing.', 'error')))
  }, [src])
  return url ? <GlbScene model={model} url={url} /> : null
}

function GlbScene({ model, url }: { model: GarmentModel; url: string }) {
  const gltf = useGLTF(url, true, true)
  const built = useMemo(() => {
    const root = gltf.scene.clone(true)
    root.name = 'garment' // camera framing looks the garment up by this name
    const panels = new Map<string, THREE.Mesh>()
    const trims: BuiltGarment['trims'] = []
    const byName = new Map<string, THREE.Mesh>()
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) byName.set(o.name, o as THREE.Mesh) })
    for (const p of model.panels) {
      const m = p.mesh ? byName.get(p.mesh) : undefined
      if (m) { m.userData.panelId = p.id; m.userData.zone = p.colorZone; m.userData.inside = p.id.endsWith('_inside'); panels.set(p.id, m); byName.delete(p.mesh!) }
    }
    // Trims by mesh name (models/sew_garment.py naming); a zone the model doesn't offer falls back to body.
    const has = (z: string) => model.colorZones.some((c) => c.id === z)
    const trimZone = (n: string) => /button/.test(n) ? 'buttons' : /hem_rib/.test(n) && has('cuffs') ? 'cuffs' : /neck_rib|collar/.test(n) && has('collar') ? 'collar' : /hood/.test(n) && has('hood') ? 'hood' : 'body'
    for (const m of byName.values()) trims.push({ mesh: m, zone: trimZone(m.name) })
    // Normalise: real-world inches, hem on the floor, centred.
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const unit = model.source.type === 'glb' ? model.source.unit : undefined
    const target = unit ? size.y * (unit === 'm' ? 39.3701 : 1) : Math.max(...model.panels.map((p) => p.heightIn)) || 30
    const s = unit === 'm' ? 39.3701 : unit === 'in' ? 1 : size.y > 0 ? target / size.y : 1
    root.scale.setScalar(s)
    const c = box.getCenter(new THREE.Vector3())
    root.position.set(-c.x * s, -box.min.y * s, -c.z * s)
    const missing = model.panels.filter((p) => !panels.has(p.id)).map((p) => p.mesh ?? p.id)
    if (missing.length) toast(`Model is missing mesh(es): ${missing.join(', ')}`, 'error')
    return { root, panels, trims, height: target } satisfies BuiltGarment
  }, [gltf, model])
  return <GarmentView model={model} built={built} />
}

function GarmentView({ model, built }: { model: GarmentModel; built: BuiltGarment }) {
  const { catalog, design, quality, mode } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design, quality: s.quality, mode: s.mode })))
  const invalidate = useThree((s) => s.invalidate)
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const { product, material, method } = resolve(catalog, design)

  const surface = useMemo(() => new PrintSurface(model, QUALITY[quality].texPpi), [model, quality])
  useEffect(() => {
    surface.onUpdate = invalidate
    editor.texPpi = QUALITY[quality].texPpi
    setSurface(surface)
    return () => { setSurface(null); surface.dispose() }
  }, [surface, invalidate, quality])

  // Materials are created once per garment; colour/fabric changes mutate them (no GLB reload, no new textures).
  // Pure memo (StrictMode may run it twice); binding to meshes happens in the layout effect below.
  const mats = useMemo(() => {
    const base = new Map<string, THREE.MeshPhysicalMaterial>()
    const print = new Map<string, THREE.MeshStandardMaterial>()
    // Baked ambient occlusion (vertex colour COLOR_0 on sewn GLBs) darkens fabric and print alike.
    const ao = (mesh: THREE.Mesh) => !!mesh.geometry.attributes.color
    for (const [id, mesh] of built.panels) {
      const inside = !!mesh.userData.inside
      if (!inside) {
        const m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, vertexColors: ao(mesh) })
        m.userData.panel = model.panels.find((p) => p.id === id)!
        base.set(id, m)
      }
      print.set(id, new THREE.MeshStandardMaterial({
        map: surface.panels.get(id)!.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        side: inside ? THREE.BackSide : THREE.FrontSide, metalness: 0, vertexColors: ao(mesh),
      }))
    }
    const trim = new Map<string, THREE.MeshPhysicalMaterial>()
    for (const t of built.trims) if (!trim.has(t.zone)) trim.set(t.zone, new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, vertexColors: built.trims.every((x) => x.zone !== t.zone || ao(x.mesh)) }))
    return { base, print, trim }
  }, [built, model, surface])

  useLayoutEffect(() => {
    const hidden = new THREE.MeshBasicMaterial({ visible: false })
    for (const [id, mesh] of built.panels) {
      mesh.material = mats.base.get(id) ?? hidden
      let overlay = mesh.children.find((c) => c.userData.overlay) as THREE.Mesh | undefined
      if (!overlay) {
        overlay = new THREE.Mesh(mesh.geometry)
        overlay.userData = { overlay: true, panelId: id }
        overlay.renderOrder = 1
        mesh.add(overlay)
      }
      overlay.material = mats.print.get(id)!
    }
    for (const t of built.trims) t.mesh.material = mats.trim.get(t.zone)!
    invalidate()
    return () => hidden.dispose()
  }, [mats, built, invalidate])

  useEffect(() => () => {
    mats.base.forEach((m) => { m.normalMap?.dispose(); m.dispose() })
    mats.print.forEach((m) => m.dispose())
    mats.trim.forEach((m) => { m.normalMap?.dispose(); m.dispose() })
  }, [mats])

  useEffect(() => () => {
    built.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() })
  }, [built])

  // Garment colours per zone.
  useEffect(() => {
    const hex = (zone: string) => {
      if (zone === 'buttons') return '#e8e4dc'
      const id = design.colors[zone] ?? design.colors.body
      return product.colors.find((c) => c.id === id)?.hex ?? '#ffffff'
    }
    const heather = (zone: string) => /heather|marl|melange/i.test(product.colors.find((c) => c.id === (design.colors[zone] ?? design.colors.body))?.name ?? '')
    const dye = (m: THREE.MeshPhysicalMaterial, zone: string, w: number, h: number) => {
      m.color.set(hex(zone))
      // Cotton sheen carries the dye colour; a white sheen makes dark garments look dusty.
      m.sheenColor.copy(m.color).lerp(new THREE.Color('#ffffff'), 0.35)
      m.map?.dispose()
      m.map = zone === 'buttons' ? null : yarnMap(material.weave, heather(zone), w, h)
      m.needsUpdate = true
    }
    for (const [id, m] of mats.base) dye(m, built.panels.get(id)!.userData.zone ?? 'body', m.userData.panel.widthIn, m.userData.panel.heightIn)
    for (const [zone, m] of mats.trim) dye(m, zone, 20, 20)
    invalidate()
  }, [design.colors, mats, product, built, material, invalidate])

  // Fabric appearance.
  useEffect(() => {
    const apply = (m: THREE.MeshPhysicalMaterial, w: number, h: number) => {
      m.roughness = material.roughness
      m.sheen = material.sheen
      m.sheenRoughness = 0.75
      m.normalMap?.dispose()
      m.normalMap = weaveNormalMap(material.weave, w, h)
      m.normalScale.setScalar(material.normalScale * 0.45) // weave should read as texture, not stripes
      m.needsUpdate = true
    }
    for (const m of mats.base.values()) apply(m, m.userData.panel.widthIn, m.userData.panel.heightIn)
    for (const m of mats.trim.values()) apply(m, 20, 20)
    invalidate()
  }, [material, mats, invalidate])

  // Ink/finish appearance per print method.
  useEffect(() => {
    for (const m of mats.print.values()) {
      m.roughness = method.finish === 'glossy' ? 0.35 : method.finish === 'embroidery' ? 0.55 : method.finish === 'dye' ? material.roughness : 0.85
      m.bumpMap = method.finish === 'embroidery' ? m.map : null
      m.bumpScale = 2.5
      m.needsUpdate = true
    }
    invalidate()
  }, [method, material, mats, invalidate])

  // ---- direct 3D manipulation: raycast → UV → print-area coordinates → Fabric object ----
  const drag = useRef<{ id: string; areaId: string; panelId: string; x: number; y: number; moved: boolean } | null>(null)

  const hitFromEvent = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const panelId = e.object.userData.panelId as string | undefined
    if (!panelId || !e.uv) return null
    const hit = surface.hitArea(panelId, e.uv.x, e.uv.y)
    return hit && { ...hit, panelId, x: hit.xIn * DESIGN_PPI, y: hit.yIn * DESIGN_PPI }
  }

  useEffect(() => {
    const up = () => {
      const d = drag.current
      if (!d) return
      drag.current = null
      if (controls) controls.enabled = true
      document.body.style.cursor = ''
      if (d.moved) editor.commit('Move on garment')
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [controls])

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (mode !== 'design') return
    const h = hitFromEvent(e)
    if (!h) return
    e.stopPropagation()
    if (useStore.getState().activeAreaId !== h.area.id || editor.area?.id !== h.area.id) {
      setActiveArea(h.area.id, false)
      return // first tap selects the area; the editor loads it, next drag moves artwork
    }
    const o = editor.hitTest(h.x, h.y)
    if (!o) { editor.canvas.discardActiveObject(); editor.canvas.requestRenderAll(); return }
    editor.select([o.uid])
    if (o.lockMovementX) return
    drag.current = { id: o.uid, areaId: h.area.id, panelId: h.panelId, x: h.x, y: h.y, moved: false }
    if (controls) controls.enabled = false // never fight OrbitControls for the same gesture
    document.body.style.cursor = 'grabbing'
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    if (!d) {
      if (mode === 'design') {
        const h = hitFromEvent(e)
        const over = h && h.area.id === editor.area?.id && editor.hitTest(h.x, h.y)
        document.body.style.cursor = over ? 'grab' : ''
      }
      return
    }
    e.stopPropagation()
    const h = hitFromEvent(e)
    if (!h || h.area.id !== d.areaId || h.panelId !== d.panelId) return
    const dx = h.x - d.x, dy = h.y - d.y
    // Large jumps mean the ray crossed a UV seam or silhouette edge: ignore rather than teleport artwork.
    if (Math.hypot(dx, dy) > DESIGN_PPI * 3) {
      drag.current = null
      if (controls) controls.enabled = true
      toast('That move crosses a seam — switched to the 2D editor for precise placement.')
      useStore.setState({ mode: 'precision' })
      return
    }
    const o = editor.byId(d.id)
    if (o) editor.dragBy(o, dx, dy)
    d.x = h.x; d.y = h.y; d.moved = true
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 'view' || e.delta > 4) return
    const h = hitFromEvent(e)
    if (h) { e.stopPropagation(); setActiveArea(h.area.id, false) }
  }

  return <primitive object={built.root} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onClick={onClick} />
}

function Garment({ model }: { model: GarmentModel }) {
  const procedural = useGarment(model)
  if (model.source.type === 'glb') return <GlbGarment model={model} />
  return procedural ? <GarmentView model={model} built={procedural} /> : null
}

// ---------------- camera ----------------

function CameraRig({ model }: { model: GarmentModel }) {
  const { camera, invalidate, scene, gl } = useThree()
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null
  const cameras = useStore((s) => s.catalog.cameras)
  const req = useStore((s) => s.cameraRequest)
  const anim = useRef<{ fromP: THREE.Vector3; toP: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t0: number; dur: number } | null>(null)
  const height = useMemo(() => Math.max(...model.panels.filter((p) => p.id === 'front' || p.id === 'back').map((p) => p.heightIn), 28) + 2, [model])

  const presetPose = (id: string) => {
    const p = cameras.find((c) => c.id === id) ?? cameras[0]
    // Frame the real garment bounds (hoods, collars, sleeves) rather than a nominal height.
    const g = scene.getObjectByName('garment')
    const box = g ? new THREE.Box3().setFromObject(g) : new THREE.Box3(new THREE.Vector3(-15, 0, -5), new THREE.Vector3(15, height, 5))
    const size = box.getSize(new THREE.Vector3())
    const target = box.getCenter(new THREE.Vector3())
    let r = p.distance * size.y
    if (p.focus) {
      // Procedural and GLB panels are both tagged with userData.panelId (GLB mesh names differ).
      let mesh: THREE.Object3D | undefined
      scene.traverse((o) => { if (!mesh && o.userData.panelId === p.focus && !o.userData.overlay) mesh = o })
      if (mesh) new THREE.Box3().setFromObject(mesh).getCenter(target)
      r = p.distance * height
      if (p.focus === 'back_inside') { target.y = box.max.y - 1.5; r = 22 }
    } else {
      // Fit width too so sleeves stay in frame on portrait (mobile) viewports.
      const aspect = (camera as THREE.PerspectiveCamera).aspect || 1
      r *= Math.max(1, (size.x * 1.08) / (size.y * aspect))
    }
    const pos = new THREE.Vector3().setFromSphericalCoords(r, p.polar, p.azimuth).add(target)
    return { pos, target }
  }

  const goTo = (pos: THREE.Vector3, target: THREE.Vector3, instant = false) => {
    if (!controls) return
    if (instant || prefersReducedMotion()) {
      camera.position.copy(pos); controls.target.copy(target); controls.update(); invalidate(); anim.current = null; return
    }
    anim.current = { fromP: camera.position.clone(), toP: pos, fromT: controls.target.clone(), toT: target, t0: performance.now(), dur: 750 }
    invalidate()
  }

  useEffect(() => {
    if (!controls) return
    const { pos, target } = presetPose(req.id)
    goTo(pos, target, req.n === 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req, controls, model])

  // Re-frame on canvas resize (e.g. mobile sheet opens) unless the customer has orbited/zoomed themselves.
  const size = useThree((st) => st.size)
  const userMoved = useRef(false)
  useEffect(() => {
    if (!controls) return
    const onStart = () => { userMoved.current = true; anim.current = null }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])
  useEffect(() => { userMoved.current = false }, [req])
  useEffect(() => {
    if (!controls || userMoved.current) return
    const { pos, target } = presetPose(req.id)
    goTo(pos, target, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height])

  useFrame(() => {
    const a = anim.current
    if (!a || !controls) return
    const k = Math.min(1, (performance.now() - a.t0) / a.dur)
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
    // Interpolate on a sphere around the target so the camera orbits rather than cutting through the garment.
    const t = a.fromT.clone().lerp(a.toT, e)
    const s0 = new THREE.Spherical().setFromVector3(a.fromP.clone().sub(a.fromT))
    const s1 = new THREE.Spherical().setFromVector3(a.toP.clone().sub(a.toT))
    let dTheta = s1.theta - s0.theta
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI
    const s = new THREE.Spherical(s0.radius + (s1.radius - s0.radius) * e, s0.phi + (s1.phi - s0.phi) * e, s0.theta + dTheta * e)
    camera.position.setFromSpherical(s).add(t)
    controls.target.copy(t)
    controls.update()
    if (k >= 1) anim.current = null
    invalidate()
  })

  // Imperative API: zoom buttons and screenshot capture.
  useEffect(() => {
    registerViewer({
      element: () => gl.domElement.parentElement?.parentElement ?? null,
      debug: import.meta.env.DEV ? () => ({ scene, camera, controls }) : undefined,
      zoom: (f) => {
        if (!controls) return
        const dir = camera.position.clone().sub(controls.target)
        const len = THREE.MathUtils.clamp(dir.length() * f, controls.minDistance, controls.maxDistance)
        goTo(controls.target.clone().add(dir.setLength(len)), controls.target.clone())
      },
      capture: async ({ views, background }) => {
        const out: Record<string, string> = {}
        const saved = { p: camera.position.clone(), t: controls?.target.clone(), bg: scene.background, pr: gl.getPixelRatio() }
        const st = useStore.getState()
        useStore.setState({ mode: 'view' })
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        scene.background = background === 'studio' ? new THREE.Color('#f3f2ef') : null
        gl.setPixelRatio(Math.max(2, saved.pr))
        for (const v of views) {
          const { pos, target } = presetPose(v)
          camera.position.copy(pos)
          controls?.target.copy(target)
          controls?.update()
          camera.updateMatrixWorld()
          gl.render(scene, camera)
          out[v] = gl.domElement.toDataURL('image/png')
        }
        gl.setPixelRatio(saved.pr)
        scene.background = saved.bg
        camera.position.copy(saved.p)
        if (saved.t) controls?.target.copy(saved.t)
        controls?.update()
        useStore.setState({ mode: st.mode })
        invalidate()
        return out
      },
    })
    return () => registerViewer(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, gl, scene, camera, cameras, model])

  return null
}

function Studio({ quality }: { quality: keyof typeof QUALITY }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[30, 60, 40]} intensity={1.1} />
      <directionalLight position={[-40, 30, -30]} intensity={0.45} />
      <Environment resolution={QUALITY[quality].env} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 60, 40]} scale={[80, 40, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-70, 20, 10]} rotation-y={Math.PI / 2} scale={[60, 40, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[70, 20, 10]} rotation-y={-Math.PI / 2} scale={[60, 40, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[0, 20, -70]} scale={[80, 40, 1]} />
      </Environment>
    </>
  )
}

export default function Viewer() {
  const { catalog, design, quality, mode } = useStore(useShallow((s) => ({ catalog: s.catalog, design: s.design, quality: s.quality, mode: s.mode })))
  const { model } = resolve(catalog, design)
  const q = QUALITY[quality]
  // ponytail: R3F's container measurement can miss the first layout when mounted inside a lazy
  // Suspense boundary (canvas stays at the 300×150 default and the scene never initialises). A single
  // nudge at mount proved too early once layout settled later (e.g. GLB default model + restore banner),
  // so keep nudging until the canvas is actually sized, giving up after ~4s.
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let tries = 0, id = 0
    const tick = () => {
      const c = canvasRef.current
      if (c && (c.width !== 300 || c.height !== 150)) return
      window.dispatchEvent(new Event('resize'))
      if (++tries < 40) id = window.setTimeout(tick, 100)
    }
    tick()
    return () => clearTimeout(id)
  }, [])
  return (
    <Canvas
      ref={canvasRef}
      className={`viewer-canvas mode-${mode}`}
      frameloop="demand"
      dpr={q.dpr}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
      camera={{ fov: 30, near: 1, far: 800, position: [0, 20, 90] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.0
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          toast('The 3D preview stopped (graphics memory). Switched to 2D editing — your design is safe.', 'error', 8000)
          useStore.setState({ webgl: false, mode: 'precision' })
        })
      }}
      aria-label="3D garment preview"
    >
      <Studio quality={quality} />
      <Suspense fallback={null}>
        <Garment key={model.id} model={model} />
      </Suspense>
      <ContactShadows key={`cs-${model.id}`} position={[0, -2.2, 0]} scale={60} blur={2.6} opacity={0.35} far={40} resolution={q.shadow} frames={1} />
      <OrbitControls makeDefault enablePan={false} enableDamping={false} minDistance={14} maxDistance={140} minPolarAngle={0.25} maxPolarAngle={Math.PI * 0.62} rotateSpeed={0.7} />
      <CameraRig model={model} />
    </Canvas>
  )
}
