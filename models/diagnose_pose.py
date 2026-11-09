"""Inspect imported geometry in Blender's Z-up world; does not modify source files."""
import bpy, sys, json
from mathutils import Vector

source = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)
report = []
for obj in list(bpy.context.scene.objects):
    if obj.type != 'MESH':
        continue
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    points = [v.co for v in obj.data.vertices]
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    extent = high - low
    # Central mid-height faces, excluding sleeve edges and neck/hem caps.
    faces = [f for f in obj.data.polygons if abs(f.center.x-(low.x+high.x)/2) < extent.x*.25 and low.z+extent.z*.2 < f.center.z < high.z-extent.z*.2]
    area = sum(f.area for f in faces)
    normals = [sum(abs(f.normal[i])*f.area for f in faces)/area if area else None for i in range(3)]
    report.append({'mesh':obj.name,'bbox_xyz':list(extent),'central_area_weighted_abs_normal_xyz':normals,'faces':len(obj.data.polygons),'uv_layers':len(obj.data.uv_layers)})
print('POSE_REPORT ' + json.dumps(report))
