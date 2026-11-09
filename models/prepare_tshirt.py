"""
Blender headless: split a single garment mesh from a GLB into named print panels with
print-ready UVs, matching this project's GLB convention (README "GLB preparation standard").

  blender --background --python prepare_tshirt.py -- <input.glb> <out_dir> [--mesh NAME] [--source-json FILE]

Coordinate convention (important -- an earlier version of this script got it wrong):
Blender's glTF importer converts glTF Y-up into Blender Z-up. So inside Blender a correctly
authored garment has height on +Z and its front facing -Y (glTF +Z). The script works in that
native space and exports with export_yup=True, which converts back to glTF Y-up. Do NOT rotate
assets that are already upright in glTF: check first with render_views.py / diagnose_pose.py.

Panels:
  shirt_front / shirt_back   planar UVs over X (width) and Z (height). The back is mirrored in U
                             so artwork reads correctly when the garment is viewed from behind.
  shirt_left_sleeve / right  cylindrical UVs around each sleeve's own principal axis (found by
                             PCA, so hanging and horizontal sleeves both work); the outer face is
                             centred at U=0.5 and the seam sits on the inner (armpit) side.
UV V increases upward in Blender; the glTF exporter flips it so image row 0 is the collar/shoulder,
which is what src/3d/printSurface.ts expects for GLB sources (texture.flipY = false).

Sleeves are separated from the torso by measuring the torso's real half-width in the lower body
(below the armpits) rather than a fixed fraction of total width -- the fixed fraction mislabelled
torso sides as sleeves on garments whose sleeves hang close to the body.

Outputs: tshirt-panels.glb (Draco), panel_measurements.json (inches), verify_*.png renders.
Automatic split, no authored seams: confirm with the in-app checker (?checker=<areaId>) before publishing.
"""
import bpy, bmesh, sys, json, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    sys.exit("Usage: blender --background --python prepare_tshirt.py -- <input.glb> <out_dir> [--mesh NAME] [--source-json FILE]")
INPUT_GLB, OUT_DIR = os.path.abspath(argv[0]), os.path.abspath(argv[1])
opt = {argv[i]: argv[i + 1] for i in range(2, len(argv) - 1) if argv[i].startswith('--')}
MESH_NAME = opt.get('--mesh')
SOURCE = json.load(open(opt['--source-json'], encoding='utf-8')) if '--source-json' in opt else {}
os.makedirs(OUT_DIR, exist_ok=True)
IN = 39.3701  # metres -> inches

# ---------------------------------------------------------------- import + select garment
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT_GLB)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise RuntimeError("No mesh found")
if len(meshes) > 1 and not MESH_NAME:
    raise ValueError("Multiple meshes (" + ", ".join(o.name for o in meshes) + "): pick the garment with --mesh")
src = next((o for o in meshes if o.name == MESH_NAME), None) if MESH_NAME else meshes[0]
if src is None:
    raise ValueError(f"Mesh not found: {MESH_NAME}")
for o in list(bpy.context.scene.objects):
    if o != src:
        bpy.data.objects.remove(o, do_unlink=True)  # hangers, fittings, empties
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------------------------------------------------------------- normalise: hem on floor, centred
vs = [v.co for v in src.data.vertices]
lo = Vector([min(v[i] for v in vs) for i in range(3)])
hi = Vector([max(v[i] for v in vs) for i in range(3)])
src.data.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
src.data.update()
vs = [v.co for v in src.data.vertices]
height = max(v.z for v in vs)
width = max(v.x for v in vs) - min(v.x for v in vs)
depth = max(v.y for v in vs) - min(v.y for v in vs)
print(f"Normalised (in): width={width*IN:.2f} height={height*IN:.2f} depth={depth*IN:.2f}")
if height < depth:
    raise ValueError("Garment is not upright (height < depth). It may genuinely be authored lying down -- inspect with render_views.py.")

# ---------------------------------------------------------------- classify faces
# Torso half-width from the lower body (below the armpits), where no sleeve geometry exists.
lower = [abs(v.x) for v in vs if v.z < height * 0.55]
torso_half = max(lower) * 1.03  # small tolerance for side-seam flare

mesh = src.data
def classify(f):
    c = f.center
    if abs(c.x) > torso_half and c.z > height * 0.45:
        return 'left_sleeve' if c.x > 0 else 'right_sleeve'   # wearer's left = viewer's right (+X)
    return 'front' if f.normal.y <= 0 else 'back'              # glTF +Z front == Blender -Y
region_of = {f.index: classify(f) for f in mesh.polygons}
REGIONS = ('front', 'back', 'left_sleeve', 'right_sleeve')
counts = {r: sum(1 for v in region_of.values() if v == r) for r in REGIONS}
print("Face counts:", counts)
for r in ('front', 'back'):
    if counts[r] == 0:
        raise ValueError(f"No {r} faces classified -- check orientation")

# ---------------------------------------------------------------- split
panels = {}
for r in REGIONS:
    if not counts[r]:
        continue
    o = src.copy(); o.data = src.data.copy(); o.name = o.data.name = f"shirt_{r}"
    bpy.context.collection.objects.link(o)
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if region_of[f.index] != r], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data); bm.free(); o.data.update()
    panels[r] = o
bpy.data.objects.remove(src, do_unlink=True)

def principal_axis(points):
    """Largest-variance direction (power iteration on the covariance matrix)."""
    c = sum(points, Vector()) / len(points)
    cov = [[sum((p - c)[i] * (p - c)[j] for p in points) for j in range(3)] for i in range(3)]
    a = Vector((1, 0, 0))
    for _ in range(50):
        a = Vector([sum(cov[i][j] * a[j] for j in range(3)) for i in range(3)]).normalized()
    return c, a

# ---------------------------------------------------------------- UVs + measurements
# Always recompute extents from live vertices: obj.bound_box is stale after bmesh edits.
measurements = {}
for r, o in panels.items():
    pts = [v.co.copy() for v in o.data.vertices]
    uv = (o.data.uv_layers[0] if o.data.uv_layers else o.data.uv_layers.new(name="UVMap")).data
    if r in ('front', 'back'):
        x0, x1 = min(p.x for p in pts), max(p.x for p in pts)
        z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
        w, h = x1 - x0, z1 - z0
        for loop in o.data.loops:
            p = o.data.vertices[loop.vertex_index].co
            u = (p.x - x0) / w
            uv[loop.index].uv = (u if r == 'front' else 1 - u, (p.z - z0) / h)
        measurements[r] = {"mesh": o.name, "widthIn": round(w * IN, 2), "heightIn": round(h * IN, 2)}
    else:
        side = 1 if r == 'left_sleeve' else -1
        c, a = principal_axis(pts)
        if a.x * side < 0:
            a = -a                                   # axis runs shoulder -> cuff, away from the body
        out = Vector((side, 0, 0)); out = (out - a * out.dot(a)).normalized()  # outer-face direction
        b = out.cross(a)  # U runs toward the viewer's right when the sleeve is seen from outside, on both sides (checked in-app: left/right corr of U vs Z must be -/+)
        ts = [(p - c).dot(a) for p in pts]; t0, t1 = min(ts), max(ts)
        radii = []
        for loop in o.data.loops:
            p = o.data.vertices[loop.vertex_index].co - c
            t = p.dot(a); rad = p - a * t
            radii.append(rad.length)
            ang = math.atan2(rad.dot(b), rad.dot(out))           # 0 at the outer face
            uv[loop.index].uv = (0.5 + ang / (2 * math.pi), 1 - (t - t0) / (t1 - t0))  # shoulder at top
        # Keep each seam-crossing face on one side of the cylindrical unwrap.
        # Interpolating U=.99 to .01 crosses the outer print zone and repeats artwork.
        for face in o.data.polygons:
            values = [uv[i].uv.x for i in face.loop_indices]
            if max(values) - min(values) > 0.5:
                for i in face.loop_indices:
                    if uv[i].uv.x < 0.5:
                        uv[i].uv.x += 1
            if max(uv[i].uv.x for i in face.loop_indices) - min(uv[i].uv.x for i in face.loop_indices) > 0.5:
                # End-cap faces span the tube interior, not a printable sleeve surface.
                # Put these in the unprinted corner rather than across the outer artwork.
                for i in face.loop_indices:
                    uv[i].uv = (0, 0)
                print(f'{r}: excluded cap face {face.index} from printable UVs')
            assert max(uv[i].uv.x for i in face.loop_indices) - min(uv[i].uv.x for i in face.loop_indices) <= 0.5 + 1e-6
        circ = 2 * math.pi * (sum(radii) / len(radii))
        measurements[r] = {"mesh": o.name, "widthIn": round(circ * IN, 2), "heightIn": round((t1 - t0) * IN, 2)}
    o.data.update()

json.dump({
    "source": INPUT_GLB, "selectedMesh": MESH_NAME, **({"license": SOURCE} if SOURCE else {}),
    "normalizedHeightIn": round(height * IN, 2), "panels": measurements,
    "convention": "Blender Z-up during processing; exported glTF Y-up, front +Z. Back panel U mirrored. GLB UV row 0 = top.",
    "note": "Automatic split without authored seams. Verify with the in-app checker (?checker=<areaId>) before publishing.",
}, open(os.path.join(OUT_DIR, "panel_measurements.json"), "w", encoding="utf-8"), indent=2)

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action='DESELECT')
for o in panels.values():
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, "tshirt-panels.glb"), use_selection=True,
                          export_format='GLB', export_yup=True, export_draco_mesh_compression_enable=True)

# ---------------------------------------------------------------- verification renders (panel colours)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = scene.render.resolution_y = 500
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'OBJECT'
for o, col in zip(panels.values(), [(.85, .3, .3, 1), (.3, .5, .85, 1), (.3, .8, .4, 1), (.9, .7, .2, 1)]):
    o.color = col
allp = [v.co for o in panels.values() for v in o.data.vertices]
ctr = sum(allp, Vector()) / len(allp)
size = max(width, height, depth)
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
cam.data.type = 'ORTHO'; cam.data.ortho_scale = size * 1.3
scene.collection.objects.link(cam); scene.camera = cam
for name, d in {"front": Vector((0, -1, 0)), "back": Vector((0, 1, 0)), "side": Vector((1, 0, 0)), "three_quarter": Vector((1, -1, .4))}.items():
    cam.location = ctr + d.normalized() * size * 3
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT_DIR, f"verify_{name}.png")
    bpy.ops.render.render(write_still=True)
print("Done:", OUT_DIR)
