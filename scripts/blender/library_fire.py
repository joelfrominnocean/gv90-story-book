# Executed inside library_hero.py (shares its namespace). A real fluid-simulated fire in the firebox (Mantaflow):
# fuel burns on the logs, rises, and is rendered as a glowing volume that lights the room.
import tempfile, shutil

FIRE_RES = int(os.environ.get("FIRE_RES", "72"))
FIRE_FRAME = int(os.environ.get("FIRE_FRAME", "60"))
NOISE = os.environ.get("FIRE_NOISE", "0") == "1"
CACHE = f"{ROOT}/renders/_fire_cache"
shutil.rmtree(CACHE, ignore_errors=True)
os.makedirs(CACHE, exist_ok=True)

dz0 = HEARTH + 0.03
dom_h = OPEN_TOP - dz0 - 0.01
dom = box("fire_domain", (OPEN_W - 0.06, 0.34, dom_h), (0, 0.22, dz0 + dom_h / 2))
dm = dom.modifiers.new("Fluid", "FLUID"); dm.fluid_type = "DOMAIN"
ds = dm.domain_settings
ds.domain_type = "GAS"
ds.resolution_max = FIRE_RES
ds.use_noise = NOISE
if NOISE: ds.noise_scale = 2
ds.cache_directory = CACHE
ds.cache_frame_start = 1
ds.cache_frame_end = FIRE_FRAME
# a lazy, licking fire, not a jet: burns fast (short flame), rises gently, swirls a lot
ds.burning_rate = float(os.environ.get("BURN", "1.7"))
ds.flame_vorticity = float(os.environ.get("FVORT", "1.6"))
ds.vorticity = float(os.environ.get("VORT", "0.9"))
ds.flame_smoke = float(os.environ.get("FSMOKE", "0.25"))
ds.flame_ignition = 1.3
ds.flame_max_temp = 3.0
ds.alpha = 0.7   # density buoyancy
ds.beta = float(os.environ.get("BETA", "0.7"))    # heat buoyancy
ds.cache_type = "MODULAR"  # a baked cache, so any frame can be rendered without replaying from frame 1
ds.cache_data_format = "OPENVDB" if "OPENVDB" in [i.identifier for i in ds.bl_rna.properties["cache_data_format"].enum_items] else "UNI"
ds.use_collision_border_top = False  # open at the top: the flame and smoke can leave

# the fuel: a low ellipsoid on top of the logs
fuel = box("fire_fuel", (0.2, 0.1, 0.025), (0.0, 0.2, LOGZ + 0.125))
fm = fuel.modifiers.new("Fluid", "FLUID"); fm.fluid_type = "FLOW"
fs = fm.flow_settings
fs.flow_type = "BOTH"
fs.flow_behavior = "INFLOW"
fs.flow_source = "MESH"
fs.fuel_amount = 1.0
fs.temperature = 1.5
fs.surface_distance = 1.2
fuel.hide_render = True

# material: orange to white-hot flame (emission) and a little dark smoke
vm = bpy.data.materials.new("fire_volume"); vm.use_nodes = True
nt, L = vm.node_tree, vm.node_tree.links
for n in list(nt.nodes): nt.nodes.remove(n)
out = nt.nodes.new("ShaderNodeOutputMaterial")
pv = nt.nodes.new("ShaderNodeVolumePrincipled")
fl = nt.nodes.new("ShaderNodeAttribute"); fl.attribute_name = "flame"
de = nt.nodes.new("ShaderNodeAttribute"); de.attribute_name = "density"
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.55, 0.03, 0.0, 1)
e1 = ramp.color_ramp.elements.new(0.35); e1.color = (1.0, 0.22, 0.02, 1)
e3 = ramp.color_ramp.elements.new(0.7);  e3.color = (1.0, 0.5, 0.08, 1)
e2 = ramp.color_ramp.elements.new(1.0);  e2.color = (1.0, 0.8, 0.4, 1)
mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = float(os.environ.get("FLAME_POWER", "5"))
dmul = nt.nodes.new("ShaderNodeMath"); dmul.operation = "MULTIPLY"; dmul.inputs[1].default_value = float(os.environ.get("SMOKE", "1.2"))
# a contrast curve on the flame: crisp tongues against the glow, not a haze
crv = nt.nodes.new("ShaderNodeMath"); crv.operation = "POWER"; crv.inputs[1].default_value = float(os.environ.get("FLAME_CURVE", "1.7"))
L.new(fl.outputs["Fac"], crv.inputs[0])
L.new(crv.outputs[0], ramp.inputs["Fac"]); L.new(crv.outputs[0], mul.inputs[0])
L.new(ramp.outputs["Color"], pv.inputs["Emission Color"]); L.new(mul.outputs[0], pv.inputs["Emission Strength"])
L.new(de.outputs["Fac"], dmul.inputs[0]); L.new(dmul.outputs[0], pv.inputs["Density"])
pv.inputs["Color"].default_value = (0.02, 0.018, 0.016, 1)
L.new(pv.outputs["Volume"], out.inputs["Volume"])
dom.data.materials.append(vm)

# bake, then jump to the frame we want
bpy.context.view_layer.objects.active = dom
for o in bpy.context.view_layer.objects: o.select_set(False)
dom.select_set(True)
t = time.time()
bpy.ops.fluid.bake_data()
if NOISE:
    # the detail (upres) pass is a separate bake, on top of the base simulation
    bpy.ops.fluid.bake_noise()
print("FIRE BAKE SECONDS:", round(time.time() - t, 1), "res", FIRE_RES, "noise", NOISE)
sc.frame_set(FIRE_FRAME)
