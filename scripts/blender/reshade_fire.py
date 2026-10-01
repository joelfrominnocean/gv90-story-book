# Reopen a saved hero .blend (with its baked fire) and change only the fire's look, then render. Takes seconds, not minutes.
#   BLEND=renders/fire_E.blend OUT=renders/fire_F.png SMOKE=0.2 FLAME_CURVE=0.6 FLAME_POWER=9 /Applications/Blender.app/... -b --python scripts/blender/reshade_fire.py
import bpy, os, time
bpy.ops.wm.open_mainfile(filepath=os.environ["BLEND"])
sc = bpy.context.scene
m = bpy.data.materials["fire_volume"]
nt = m.node_tree
f = lambda k, d: float(os.environ.get(k, d))
for n in nt.nodes:
    if n.type == "MATH" and n.operation == "POWER": n.inputs[1].default_value = f("FLAME_CURVE", n.inputs[1].default_value)
    elif n.type == "MATH" and n.operation == "MULTIPLY" and n.inputs[1].default_value > 3: n.inputs[1].default_value = f("FLAME_POWER", n.inputs[1].default_value)
    elif n.type == "MATH" and n.operation == "MULTIPLY": n.inputs[1].default_value = f("SMOKE", n.inputs[1].default_value)
if "FIRE_FRAME" in os.environ: sc.frame_set(int(os.environ["FIRE_FRAME"]))
for l in bpy.data.lights:
    if l.name == "fire_light": l.energy = f("FIRE_LIGHT", l.energy)
sc.cycles.samples = int(os.environ.get("SAMPLES", sc.cycles.samples))
if os.environ.get("CROP") == "fire":
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = 0.1, 0.9, 0.04, 0.45
else:
    sc.render.use_border = False
sc.render.filepath = os.environ["OUT"]
t = time.time(); bpy.ops.render.render(write_still=True)
print("RESHADE SECONDS:", round(time.time() - t, 1))
