# Usage: blender --background --python render_views.py -- <input.glb> <output_dir>
# Renders flat-shaded orthographic silhouettes looking down +X, +Y, +Z into <output_dir>.
# View the resulting PNGs with an image-capable tool before trusting any axis assumption
# about a source GLB -- this is how the Nour t-shirt axis-swap bug (see prepare_tshirt.py)
# was actually diagnosed, after numeric bounding-box heuristics gave an ambiguous read.

import bpy, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--")+1:]
glb, outdir = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
o = [x for x in bpy.context.scene.objects if x.type=='MESH'][0]
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("mesh verts:", len(o.data.vertices), "polys:", len(o.data.polygons))

mat = bpy.data.materials.new("diag")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.85, 0.15, 0.15, 1)
o.data.materials.clear()
o.data.materials.append(mat)

bbox = [o.matrix_world @ Vector(c) for c in o.bound_box]
center = sum(bbox, Vector((0,0,0))) / 8
ext = Vector((max(v.x for v in bbox)-min(v.x for v in bbox),
              max(v.y for v in bbox)-min(v.y for v in bbox),
              max(v.z for v in bbox)-min(v.z for v in bbox)))
dist = max(ext) * 3
print("center:", center, "extent:", ext, "dist:", dist)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'  # simplest possible, no lighting setup needed, flat-shaded
scene.render.resolution_x = 500
scene.render.resolution_y = 500
scene.display.shading.light = 'FLAT'
scene.display.shading.color_type = 'MATERIAL'

cam_data = bpy.data.cameras.new("C")
cam_data.type = 'ORTHO'
cam_data.ortho_scale = max(ext) * 1.4
cam = bpy.data.objects.new("C", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

def look_at(cam_obj, target, from_dir):
    cam_obj.location = target + from_dir.normalized() * dist
    direction = target - cam_obj.location
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()

views = {"from_plusX": Vector((1,0,0)), "from_plusY": Vector((0,1,0)), "from_plusZ": Vector((0,0,1))}
for name, d in views.items():
    look_at(cam, center, d)
    scene.render.filepath = f"{outdir}/{name}.png"
    bpy.ops.render.render(write_still=True)
    print("wrote", scene.render.filepath, "cam loc", cam.location, "rot", cam.rotation_euler)
