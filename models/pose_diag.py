# Usage: blender --background --python pose_diag.py -- <input.glb>
# Prints per-axis bounding-box extents and average front-face normal direction.
# A correctly Y-up, hanging-pose garment: normal points mostly sideways (small Y component).
# Numeric output alone is not fully reliable (see prepare_tshirt.py docstring) -- prefer
# render_views.py and look at the actual silhouettes.

import bpy, sys
from mathutils import Vector
argv = sys.argv[sys.argv.index("--")+1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
o = [x for x in bpy.context.scene.objects if x.type=='MESH'][0]
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

verts = [o.matrix_world @ v.co for v in o.data.vertices]
axes = {'x':0,'y':1,'z':2}

def profile(height_axis, perp_axes, bins=12):
    hvals = [v[axes[height_axis]] for v in verts]
    lo, hi = min(hvals), max(hvals)
    rows = []
    for i in range(bins):
        b0 = lo + (hi-lo)*i/bins
        b1 = lo + (hi-lo)*(i+1)/bins
        sel = [v for v in verts if b0 <= v[axes[height_axis]] < b1 or (i==bins-1 and v[axes[height_axis]]==hi)]
        if not sel:
            rows.append((i, 0, 0, 0)); continue
        p0vals = [v[axes[perp_axes[0]]] for v in sel]
        p1vals = [v[axes[perp_axes[1]]] for v in sel]
        # cluster count heuristic: gap detection in perp_axes[0] to spot two separate sleeve lobes
        p0sorted = sorted(p0vals)
        gaps = sum(1 for j in range(1,len(p0sorted)) if p0sorted[j]-p0sorted[j-1] > (max(p0vals)-min(p0vals)+1e-6)*0.15)
        rows.append((i, round(max(p0vals)-min(p0vals),3), round(max(p1vals)-min(p1vals),3), len(sel), gaps+1))
    return rows

for h, perp in [('x',('y','z')), ('y',('x','z')), ('z',('x','y'))]:
    print(f"\n=== candidate height axis: {h} (perp spread in {perp[0]},{perp[1]}) ===")
    print("bin | spread_perp0 | spread_perp1 | vert_count | est_clusters")
    for row in profile(h, perp):
        print(row)
