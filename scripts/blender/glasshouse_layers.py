"""
Renders the glasshouse as separate transparent layers for the website, and writes a manifest saying where each one goes.

Run (from the project root):
    LAYERS=1 MOOD=teal OUTDIR=renders/glasshouse RES=1 SAMPLES=48 \
      /Applications/Blender.app/Contents/MacOS/Blender -b -noaudio --python scripts/blender/listening_room.py
(listening_room.py builds the scene and then runs this file.)  ONLY=chair,jar renders just those layers while iterating.

What comes out, back to front:
  sky_late / sky_dusk / sky_night   the city, hills and sky behind the glass, three times of day (wider than the frame, for parallax)
  floor                             the dark stone, the rug, the lamp's pool and its reflection
  objects                           credenza, turntable (base, platter, tonearm), sleeve, lamp, tea, jar, chair, camellia, bonsai,
                                    plants, the folding screen, desk, book, the big fern: each its own cropped RGBA image
  glass, frame                      rendered with every object "held out" of them, so they can sit on top of everything without
                                    covering anything, and the glass image doubles as the mask the page rains inside
manifest.json gives every layer an id, a box (fractions of the frame), a depth, a hit area and an image path, so an illustrator's
art can replace any image without a code change. The poster faces on the folding screen are not modelled: the manifest holds the
four corners of each, and the page draws them from data.
"""
import json
from bpy_extras.object_utils import world_to_camera_view

OUTDIR = os.environ.get("OUTDIR", f"{ROOT}/renders/glasshouse")
ONLY = [x for x in os.environ.get("ONLY", "").split(",") if x]
os.makedirs(OUTDIR, exist_ok=True)
FRAME_W, FRAME_H = int(W_PX * RES), int(H_PX * RES)
MAN = {"aspect": W_PX / H_PX, "layers": [], "mood": MOOD_NAME}
for _l in list(fs.linesets):
    if _l.linestyle is None:   # the empty default set that every new scene carries
        fs.linesets.remove(_l)
INK_BASE = [(ls.linestyle, ls.linestyle.thickness) for ls in fs.linesets]
EDGE_OBJ = float(os.environ.get("EDGE", "0.22"))   # how big a change of tone has to be to get a line, for objects
C_LAYER = coll("layer")
for ls in fs.linesets:
    ls.collection = C_LAYER

# the compositor for layers: (painterly filter for the sky only) -> ink between tones -> keep the alpha -> paper -> Freestyle ink on top
ng = bpy.data.node_groups.new("LayerPaint", "CompositorNodeTree")
sc.compositing_node_group = ng
ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
_rl = ng.nodes.new("CompositorNodeRLayers")
_go = ng.nodes.new("NodeGroupOutput")
_ku = ng.nodes.new("CompositorNodeKuwahara")
for nm, v in (("Uniformity", 4), ("Sharpness", 0.6), ("Eccentricity", 1.0)):
    try:
        _ku.inputs[nm].default_value = v
    except Exception as ex:
        print("KUWAHARA skipped", nm, ex)
ng.links.new(_rl.outputs["Image"], _ku.inputs["Image"])
_km = ng.nodes.new("ShaderNodeMix")      # how much of the painterly filter goes in: all of it for sky and glass, none for objects
_km.data_type = "RGBA"
_km.blend_type = "MIX"
ng.links.new(_rl.outputs["Image"], _km.inputs[6])
ng.links.new(_ku.outputs[0], _km.inputs[7])
_edged, _gt = edge_stage(ng, _km.outputs[2])
_sa = ng.nodes.new("CompositorNodeSetAlpha")
ng.links.new(_edged, _sa.inputs["Image"])
ng.links.new(_rl.outputs["Alpha"], _sa.inputs["Alpha"])
_src = _sa.outputs[0]
_mx = None
_paper = f"{ROOT}/assets-src/textures/ambientcg/Paper006/Paper006_1K-JPG_Color.jpg"
if os.path.exists(_paper):
    _im = ng.nodes.new("CompositorNodeImage")
    _im.image = bpy.data.images.load(_paper)
    _sc = ng.nodes.new("CompositorNodeScale")
    for nm, v in (("Type", "Render Size"), ("Frame Type", "Crop")):
        try:
            _sc.inputs[nm].default_value = v
        except Exception as ex:
            print("SCALE skipped", nm, ex)
    ng.links.new(_im.outputs[0], _sc.inputs[0])
    _mx = ng.nodes.new("ShaderNodeMix")
    _mx.data_type = "RGBA"
    _mx.blend_type = "MULTIPLY"
    ng.links.new(_src, _mx.inputs[6])
    ng.links.new(_sc.outputs[0], _mx.inputs[7])
    _sa2 = ng.nodes.new("CompositorNodeSetAlpha")
    ng.links.new(_mx.outputs[2], _sa2.inputs["Image"])
    ng.links.new(_rl.outputs["Alpha"], _sa2.inputs["Alpha"])
    _src = _sa2.outputs[0]
_ao = ng.nodes.new("CompositorNodeAlphaOver")
if "Freestyle" in _rl.outputs:
    ng.links.new(_src, _ao.inputs["Background"])
    ng.links.new(_rl.outputs["Freestyle"], _ao.inputs["Foreground"])
    ng.links.new(_ao.outputs[0], _go.inputs[0])
else:   # STYLE=film has no ink pass
    ng.links.new(_src, _go.inputs[0])
sc.render.image_settings.color_mode = "RGBA"

# a shader that cuts a hole: objects "held out" of the glass and the frame still hide what is behind them
HOLD = bpy.data.materials.new("hold")
HOLD.use_nodes = True
_n = HOLD.node_tree
_n.nodes.clear()
_o = _n.nodes.new("ShaderNodeOutputMaterial")
_h = _n.nodes.new("ShaderNodeHoldout")
_n.links.new(_h.outputs[0], _o.inputs[0])

LIVE = [g for g in GROUPS if g not in ("tt_arm_room",)]
ALL_OBJ = {ob for g in GROUPS for ob in GROUPS[g]}
cam_main = co

def clear_state():
    for ob in ALL_OBJ:
        ob.visible_camera = True

def set_layer(show, hold=()):
    saved = []
    for g, obs in GROUPS.items():
        for ob in obs:
            if g in show:
                ob.visible_camera = True
            elif g in hold:
                ob.visible_camera = True
                for slot in ob.material_slots:
                    saved.append((slot, slot.material))
                    slot.material = HOLD
            else:
                ob.visible_camera = False
    for ob in list(C_LAYER.objects):
        C_LAYER.objects.unlink(ob)
    for g in show:
        for ob in GROUPS.get(g, []):
            if ob.name in C_INK.objects:
                C_LAYER.objects.link(ob)
    return saved

def restore(saved):
    for slot, mat in saved:
        slot.material = mat

def frame_for(cam_ob):
    """world_to_camera_view uses the scene's render size for its aspect, and the size is whatever the last layer left behind. So every
    projection first sets the size of the camera it is projecting through (the room camera's frame, or an orthographic sprite's square)."""
    if cam_ob is cam_main:
        sc.render.resolution_x, sc.render.resolution_y = FRAME_W, FRAME_H
    else:
        n = int(cam_ob.get("res", FRAME_W))
        sc.render.resolution_x, sc.render.resolution_y = n, n
    sc.render.resolution_percentage = 100

def bbox(groups, cam_ob, names=None, pad=0.0):
    frame_for(cam_ob)
    deps = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for g in groups:
        for ob in GROUPS.get(g, []):
            if ob.type not in {"MESH", "CURVE"} or (names and not any(n in ob.name for n in names)):
                continue
            eo = ob.evaluated_get(deps)
            mw = eo.matrix_world
            for c in eo.bound_box:
                v = world_to_camera_view(sc, cam_ob, mw @ Vector(c))
                if v.z > 0:
                    xs.append(v.x)
                    ys.append(v.y)
    if not xs:
        return None
    return (max(0.0, min(xs) - pad), min(1.0, max(xs) + pad), max(0.0, min(ys) - pad), min(1.0, max(ys) + pad))  # x0, x1, y0 (bottom), y1

def render_layer(name, show, hold=(), full=False, transparent=True, res=1.0, dof=False, pad=0.012, cam_ob=None, extra=0.0, paper=0.45, ink=1.0, ref_bbox=None, hit_names=None, paint=None, edge=EDGE_OBJ, swap=None):
    cam_ob = cam_ob or cam_main
    saved = set_layer(show, hold)
    for g_, mat_ in (swap or {}).items():   # draw a group with a different material for this layer only (the glass mask)
        for ob in GROUPS.get(g_, []):
            for slot in ob.material_slots:
                saved.append((slot, slot.material))
                slot.material = mat_
    sc.camera = cam_ob
    cam_ob.data.dof.use_dof = dof
    box = (0.0, 1.0, 0.0, 1.0) if full else (ref_bbox or bbox(show, cam_ob, pad=pad))
    if box is None:
        restore(saved)
        print("LAYER EMPTY", name)
        return None
    x0, x1, y0, y1 = box
    sc.render.use_border = True
    sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = x0, x1, y0, y1
    base_w = FRAME_W if cam_ob is cam_main else int(cam_ob.get("res", FRAME_W))
    base_h = FRAME_H if cam_ob is cam_main else int(cam_ob.get("res", FRAME_H))
    sc.render.resolution_x = int(base_w * (1 + 2 * extra))
    sc.render.resolution_y = base_h
    sc.render.resolution_percentage = max(10, int(res * 100))
    cam_main.data.sensor_width = 36 * (1 + 2 * extra)
    sc.render.film_transparent = transparent
    if _mx is not None:
        _mx.inputs[0].default_value = paper * 0.12 if STYLE == "film" else paper
    _km.inputs[0].default_value = (0.0 if STYLE in ("sable", "film") else 1.0) if paint is None else (paint if STYLE == "sable" else 1.0 if paint > 0 else 0.0)
    # film: the room is tone-mapped like film; the sky keeps its exact painted colours
    sc.view_settings.view_transform = ("Standard" if (name.startswith("sky") or name == "glassmask") else "AgX") if STYLE == "film" else sc.view_settings.view_transform
    _gt.inputs[1].default_value = edge if (edge is not None and STYLE == "sable") else 99.0
    _ku.inputs["Size"].default_value = max(2, int(round(int(os.environ.get("BRUSH", "4" if STYLE == "film" else "6")) * res)))
    for st, base in INK_BASE:
        st.thickness = base * ink * res
    path = f"{OUTDIR}/{name}.png"
    sc.render.filepath = path
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    restore(saved)
    cam_main.data.sensor_width = 36
    print(f"LAYER {name:14s} {time.time() - t0:5.1f}s  box={tuple(round(v, 3) for v in box)}")
    # fractions of the standard frame, from the top-left
    u0, u1 = x0 * (1 + 2 * extra) - extra, x1 * (1 + 2 * extra) - extra
    return {"file": f"{name}.png", "box": [round(u0, 5), round(1 - y1, 5), round(u1, 5), round(1 - y0, 5)]}

def hit_box(groups, names=None, pad=0.01):
    b = bbox(groups, cam_main, names=names, pad=pad)
    return None if b is None else [round(b[0], 5), round(1 - b[3], 5), round(b[1], 5), round(1 - b[2], 5)]

def proj(world, cam_ob=None):
    frame_for(cam_ob or cam_main)
    v = world_to_camera_view(sc, cam_ob or cam_main, world)
    return Vector((v.x, v.y))

def want(name):
    return not ONLY or name in ONLY

# ================================================================= 1. the sky, three times of day
# One set of shapes (hills, skyline, the old town and its one gate, a faint moon) drawn three times: only the sky colours, how bright the
# flat silhouettes are, the windows, and the moon change. Late afternoon has a warm line at the horizon and nothing else warm; dusk is the
# teal; night is darker. The page crossfades between them as chapters arrive. Amber stays the lamp's, and a thin line of horizon.
STATES = {
    "late": dict(
        ramp=[(0.0, (0.96, 0.64, 0.32)), (0.05, (0.82, 0.58, 0.40)), (0.12, (0.46, 0.54, 0.54)), (0.24, (0.24, 0.40, 0.44)), (0.55, (0.11, 0.22, 0.28))],
        k=1.25, win=0.8, moon=dict(yaw=9.0, elev=15.0, scale=0.5, k=0.45),
    ),
    "dusk": dict(
        ramp=MOOD["sky"], k=1.0, win=2.0, moon=dict(yaw=9.0, elev=15.0, scale=0.5, k=0.8),
    ),
    "night": dict(
        ramp=[(0.0, (0.42, 0.24, 0.12)), (0.05, (0.20, 0.20, 0.22)), (0.12, (0.08, 0.14, 0.18)), (0.24, (0.04, 0.09, 0.13)), (0.55, (0.01, 0.03, 0.06))],
        k=0.62, win=3.0, moon=dict(yaw=9.0, elev=16.0, scale=0.55, k=1.1),
    ),
}
_sky_obj = next(ob for ob in GROUPS["sky"] if ob.name == "dome")
_skyramp = next(n for n in _sky_obj.data.materials[0].node_tree.nodes if n.type == "VALTORGB")
SKYX = 0.13
Z = 0
_win_em = next(n for n in M["window"].node_tree.nodes if n.type == "EMISSION")
# the flat silhouettes' own colours, from the mood: far things lighter, the old town and the gate in the teal range
_flat_base = dict(far=MOOD["far"], mid=MOOD["hills"], near=MOOD["near"], roof=MOOD["roofs"], gate=tuple(min(1.0, c * 1.45 + 0.01) for c in MOOD["roofs"]))

def sky_state(state):
    st = STATES[state]
    els = _skyramp.color_ramp.elements
    for e, (pos, col) in zip(sorted(els, key=lambda e: e.position), sorted(st["ramp"], key=lambda q: q[0])):
        e.color = (*col, 1)
    for k_, col in _flat_base.items():
        next(n for n in FLATS[k_].node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = (*(c * st["k"] for c in col), 1)
    next(n for n in FLATS["ground"].node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = (*(c * st["k"] * 1.0 for c in MOOD["near"]), 1)
    _win_em.inputs["Strength"].default_value = st["win"]
    mb = st["moon"]
    place_moon(sky_dir(mb["yaw"], mb["elev"]), scale=mb["scale"])
    MOON_EM.inputs["Strength"].default_value = mb["k"]

for state in ("late", "dusk", "night"):
    if not want(f"sky_{state}"):
        continue
    sky_state(state)
    r = render_layer(f"sky_{state}", ["sky"], transparent=False, full=True, res=0.5, extra=SKYX, paper=0.25, ink=0.0, paint=1.0, edge=None)
    if r:
        MAN["layers"].append({"id": f"sky_{state}", **r, "par": 0.72, "z": 0, "kind": "sky", "state": state})

# ================================================================= 2. the floor
if want("floor"):
    r = render_layer("floor", ["floor"], full=True, res=0.75, paper=0.3, ink=0.0)
    if r:
        MAN["layers"].append({"id": "floor", **r, "par": 1.0, "z": 5, "kind": "floor"})

# ================================================================= 3. the objects, far to near
HOME_REF = None
OBJECTS = [
    ("plants", ["plants"], 10, 1.0, None),
    ("lanterns", ["lanterns"], 11, 1.0, None),
    ("bonsai", ["bonsai"], 12, 1.0, None),
    ("screen", ["screen"], 14, 1.0, None),
    ("credenza", ["credenza"], 16, 1.0, None),
    ("lamp", ["lamp"], 22, 1.0, None),
    ("tea", ["tea"], 24, 1.0, None),
    ("book", ["book"], 25, 1.0, "tale"),
    ("jar", ["jar"], 26, 1.0, "jar"),
    ("chair", ["chair"], 28, 1.0, None),
    ("coffee", ["coffee"], 29, 1.0, "baduk"),
    ("camellia", ["camellia"], 30, 1.0, None),
    ("desk", ["desk"], 34, 1.1, None),
    ("fern_front", ["fern_front"], 40, 1.15, None),
]
for oid, groups, z, par, interact in OBJECTS:
    if not want(oid):
        continue
    r = render_layer(oid, groups, dof=(oid == "fern_front"), pad=0.03 if oid == "fern_front" else 0.012)
    if not r:
        continue
    entry = {"id": oid, **r, "par": par, "z": z, "kind": "object"}
    if interact:
        entry["interact"] = interact
        names = ["jar"] if oid == "jar" else None
        entry["hit"] = hit_box(groups, names=[n for n in (names or []) if n] or None, pad=0.008)
    MAN["layers"].append(entry)

# ================================================================= 4. glass and frame, with every object held out of them
HOLD_GROUPS = [g for g in GROUPS if g not in ("sky", "floor", "glass", "frame", "tt_arm_room")]
# The mask the rain is cut to: opaque white wherever you can see glass (not where furniture or a plant stands in front of it).
# The glass itself is invisible (it is clear), so this is the only glass layer; a small, lossless picture.
MASKMAT = bpy.data.materials.new("glassmask")
MASKMAT.use_nodes = True
_mn = MASKMAT.node_tree
_mn.nodes.clear()
_mo = _mn.nodes.new("ShaderNodeOutputMaterial")
_me = _mn.nodes.new("ShaderNodeEmission")
_me.inputs["Color"].default_value = (1, 1, 1, 1)
_mn.links.new(_me.outputs[0], _mo.inputs[0])
if want("glassmask"):
    r = render_layer("glassmask", ["glass"], hold=HOLD_GROUPS, full=True, res=0.25, paper=0.0, ink=0.0, paint=0.0, edge=None, swap={"glass": MASKMAT})
    if r:
        MAN["layers"].append({"id": "glassmask", **r, "par": 1.0, "z": 50, "kind": "mask"})
if want("frame"):
    r = render_layer("frame", ["frame"], hold=HOLD_GROUPS, full=True, res=1.0, paper=0.3)
    if r:
        MAN["layers"].append({"id": "frame", **r, "par": 1.0, "z": 52, "kind": "frame"})

# ================================================================= 5. the turntable: three views of the same thing
# Seen from the room camera at eye level the turntable would be a sliver. So it is drawn the way an illustrator would draw it:
# from a little above (the base, the sleeve), with the platter and tonearm drawn flat from straight above so that the page can turn
# one and swing the other. The page squashes the flat ones by sin(elevation), which matches the base.
ELEV = math.radians(36.0)
K = 1000.0  # sprite pixels per metre, for all of them
yaw = cred.rotation_euler.z
xc = Vector((math.cos(yaw), math.sin(yaw), 0))
yc = Vector((-math.sin(yaw), math.cos(yaw), 0))
ttw = cred.matrix_world @ Vector((tt[0], tt[1], tt[2] + 0.1))   # the middle of the top of the plinth

def ortho_cam(name, elev, ortho_m):
    cd = bpy.data.cameras.new(name)
    cd.type = "ORTHO"
    cd.ortho_scale = ortho_m
    cd.sensor_fit = "HORIZONTAL"
    ob = bpy.data.objects.new(name, cd)
    sc.collection.objects.link(ob)
    n = int(ortho_m * K)
    ob["res"] = n
    return ob

def aim(ob, target, elev):
    if abs(elev - math.pi / 2) < 1e-3:
        ob.location = target + Vector((0, 0, 3))
        ob.rotation_euler = (0, 0, yaw)
    else:
        d = (-yc * math.cos(elev) + Vector((0, 0, math.sin(elev)))) * 3.0
        ob.location = target + d
        ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()

cam_e = ortho_cam("tt_elev", ELEV, 1.3)
cam_t = ortho_cam("tt_top", math.pi / 2, 0.8)
aim(cam_e, ttw, ELEV)
aim(cam_t, ttw, math.pi / 2)

# the platter and its label get two marks, so that you can see it turn
begin("tt_platter")
for sgn in (-1, 1):
    box("labelmark", (0.03, 0.006, 0.004), (tt[0] - 0.06 + sgn * 0.032, tt[1], tt[2] + 0.115), flat("mark", (0.05, 0.05, 0.06), 1.0), C_INK, parent=cred)
# the arm, built flat along the credenza's x axis from its pivot, so it can be drawn from above and swung by the page
PIV = Vector((tt[0] + 0.2, tt[1] + 0.13, tt[2] + 0.12))
begin("tt_arm")
tube("arm_tube", [[(PIV.x, PIV.y, PIV.z), (PIV.x + 0.27, PIV.y, PIV.z)]], 0.0065, M["brass"], C_INK)
bpy.data.objects["arm_tube"].parent = cred
box("arm_head", (0.05, 0.022, 0.008), (PIV.x + 0.285, PIV.y, PIV.z), toon("headshell", (0.06, 0.06, 0.07), mottle=0.0), C_INK, parent=cred)
cyl("arm_weight", 0.016, 0.016, 0.04, (PIV.x - 0.045, PIV.y, PIV.z), M["brass"], C_INK, rot=(0, math.radians(90), 0), parent=cred, seg=12)
cyl("arm_post", 0.02, 0.02, 0.04, (PIV.x, PIV.y, PIV.z - 0.02), M["brass"], C_INK, parent=cred, seg=12)
# a record sleeve stands beside the turntable
begin("sleeve")
box("sleeve_card", (0.31, 0.012, 0.31), (tt[0] + 0.5, tt[1] - 0.04, tt[2] + 0.165), toon("sleeve", _lin("#6E4630") if STYLE == "film" else (0.74, 0.46, 0.20), mottle=0.04), C_INK, rot=(math.radians(-9), 0, 0), parent=cred)
cyl("sleeve_disc", 0.095, 0.095, 0.006, (tt[0] + 0.5, tt[1] - 0.052, tt[2] + 0.17), toon("sleevedisc", P["porcelain"], mottle=0.0), C_INK, rot=(math.radians(81), 0, 0), parent=cred, seg=28)
ALL_OBJ = {ob for g in GROUPS for ob in GROUPS[g]}
bpy.context.view_layer.update()

def tt_sprite(name, show, cam_ob, res=1.0, pad=0.02):
    saved = set_layer(show)
    sc.camera = cam_ob
    cam_ob.data.dof.use_dof = False
    deps = bpy.context.evaluated_depsgraph_get()
    b = bbox(show, cam_ob, pad=pad)
    restore(saved)
    n = int(cam_ob["res"])
    r = render_layer(name, show, cam_ob=cam_ob, ref_bbox=b, res=res)
    if not r:
        return None
    x0, x1, y0, y1 = b
    crop = (x0 * n, (1 - y1) * n, (x1 - x0) * n, (y1 - y0) * n)   # left, top, width, height in sprite px
    return {**r, "_crop": crop, "_n": n}

def px_in(cam_ob, world):
    v = proj(world, cam_ob)
    n = int(cam_ob["res"])
    return Vector((v.x * n, (1 - v.y) * n))

def plate_px(world):
    v = proj(world)
    return Vector((v.x * FRAME_W, (1 - v.y) * FRAME_H))

# the scale from sprite pixels to plate pixels: the plinth is 0.58 m wide, and is a little enlarged because it is the hero
TT_SCALE = float(os.environ.get("TT_SCALE", "1.7" if STYLE == "film" else "2.0"))
pl_a = plate_px(cred.matrix_world @ Vector((tt[0] - 0.29, tt[1], tt[2] + 0.1)))
pl_b = plate_px(cred.matrix_world @ Vector((tt[0] + 0.29, tt[1], tt[2] + 0.1)))
S = (abs(pl_b.x - pl_a.x) / (0.58 * K)) * TT_SCALE
q0 = plate_px(ttw)
p0 = px_in(cam_e, ttw)
print("TT scale", round(S, 4), "plinth px", round(abs(pl_b.x - pl_a.x), 1))

def box_for(sprite, cam_ob, origin_px, ref_plate):
    cx, cy, cw, ch = sprite["_crop"]
    left = ref_plate.x + (cx - origin_px.x) * S
    top = ref_plate.y + (cy - origin_px.y) * S
    return [round(left / FRAME_W, 5), round(top / FRAME_H, 5), round((left + cw * S) / FRAME_W, 5), round((top + ch * S) / FRAME_H, 5)]

tt_info = {"squash": round(math.sin(ELEV), 4)}
if want("tt_base"):
    sp = tt_sprite("tt_base", ["tt_base"], cam_e)
    if sp:
        MAN["layers"].append({"id": "tt_base", "file": sp["file"], "box": box_for(sp, cam_e, p0, q0), "par": 1.0, "z": 17, "kind": "object"})
if want("sleeve"):
    sp = tt_sprite("sleeve", ["sleeve"], cam_e)
    if sp:
        MAN["layers"].append({"id": "sleeve", "file": sp["file"], "box": box_for(sp, cam_e, p0, q0), "par": 1.0, "z": 20, "kind": "object", "interact": "sleeve", "hit": box_for(sp, cam_e, p0, q0)})
if want("tt_platter"):
    sp = tt_sprite("tt_platter", ["tt_platter"], cam_t)
    if sp:
        cw_pl = cred.matrix_world @ Vector((tt[0] - 0.06, tt[1], tt[2] + 0.11))
        centre_plate = q0 + (px_in(cam_e, cw_pl) - p0) * S
        cx, cy, w, h = sp["_crop"]
        wpl, hpl = w * S, h * S
        MAN["layers"].append({"id": "tt_platter", "file": sp["file"], "box": [round((centre_plate.x - wpl / 2) / FRAME_W, 5), round((centre_plate.y - hpl / 2) / FRAME_H, 5), round((centre_plate.x + wpl / 2) / FRAME_W, 5), round((centre_plate.y + hpl / 2) / FRAME_H, 5)], "par": 1.0, "z": 18, "kind": "platter"})
if want("tt_arm"):
    sp = tt_sprite("tt_arm", ["tt_arm"], cam_t)
    if sp:
        pw = cred.matrix_world @ PIV
        piv_plate = q0 + (px_in(cam_e, pw) - p0) * S
        piv_sprite = px_in(cam_t, pw)
        cx, cy, w, h = sp["_crop"]
        left, top = piv_plate.x - (piv_sprite.x - cx) * S, piv_plate.y - (piv_sprite.y - cy) * S
        MAN["layers"].append({"id": "tt_arm", "file": sp["file"], "box": [round(left / FRAME_W, 5), round(top / FRAME_H, 5), round((left + w * S) / FRAME_W, 5), round((top + h * S) / FRAME_H, 5)], "pivot": [round((piv_sprite.x - cx) / w, 5), round((piv_sprite.y - cy) / h, 5)], "par": 1.0, "z": 19, "kind": "arm"})
        # the arm's two resting places, in the flat plane (degrees clockwise from along +x as seen from above)
        C = Vector((tt[0] - 0.06, tt[1]))
        P2 = Vector((PIV.x, PIV.y))
        D = C - P2
        r, L = 0.11, 0.27
        cosb = (L * L - D.length_squared - r * r) / (2 * r * D.length)
        beta = math.acos(max(-1, min(1, cosb)))
        base_ang = math.atan2(D.y, D.x)
        best = None
        for sgn in (-1, 1):
            u = Vector((math.cos(base_ang + sgn * beta), math.sin(base_ang + sgn * beta)))
            T = C + r * u
            v = T - P2
            if v.y < 0:   # the tip lands on the front of the record
                best = math.degrees(math.atan2(-v.y, v.x))
        tt_info["armPlay"] = round(best if best is not None else 131.0, 2)
        tt_info["armRest"] = 82.0
        tt_info["armLength"] = 0.27
MAN["tt"] = tt_info

# ================================================================= 6. where things are, for the page
posters = []
for i in range(6):
    pn = bpy.data.objects[f"panel{i}"]
    pts = []
    for (lx, lz) in ((-0.165, 1.58), (0.165, 1.58), (0.165, 1.0), (-0.165, 1.0)):   # a poster 0.33 m wide, 0.58 m tall, on a 0.38 m panel
        v = proj(pn.matrix_world @ Vector((lx, -0.031, lz)))
        pts.append([round(v.x, 5), round(1 - v.y, 5)])
    posters.append({"n": i, "quad": pts})
MAN["posters"] = posters
sh = next(ob for ob in GROUPS["lamp"] if ob.name == "lamp_shade")
lv = proj(sh.matrix_world.translation)
MAN["lamp"] = {"u": round(lv.x, 5), "v": round(1 - lv.y, 5)}
_bk = proj(bk.matrix_world.translation + Vector((0, 0, 0.1)))
_tp = proj(ttw)
cv = (_bk + _tp) / 2   # home: halfway between the book and the record player
MAN["home"] = {"u": round(cv.x, 5), "v": round(1 - cv.y, 5)}
# places the page can look at: the tour pans to these
def _at(world):
    q = proj(world)
    return {"u": round(q.x, 5), "v": round(1 - q.y, 5)}
# the Baduk board on the coffee table: the four corners of its top as they land on the frame, ordered far-left, far-right, near-right, near-left,
# so that the page can warp the live game onto it
_pts = [proj(c) for c in GO_TOP]
_far = sorted(sorted(_pts, key=lambda p_: -p_.y)[:2], key=lambda p_: p_.x)    # larger y is higher in the picture
_near = sorted(sorted(_pts, key=lambda p_: -p_.y)[2:], key=lambda p_: p_.x)
MAN["baduk"] = {"quad": [[round(p_.x, 5), round(1 - p_.y, 5)] for p_ in (_far[0], _far[1], _near[1], _near[0])]}
_gc = sum(GO_TOP, Vector((0, 0, 0))) / 4
MAN["focus"] = {
    "book": _at(bk.matrix_world.translation + Vector((0, 0, 0.1))),
    "record": _at(ttw),
    "screen": _at(screen.matrix_world @ Vector((0, 0, 1.2))),
    "jar": _at(Vector((1.35, 1.5, 0.55))),
    "moon": _at(_CAM0 + sky_dir(9.0, 15.0) * 300.0),
    "table": _at(_gc),
}
# where the two caption plates hang: over the book, and over the top of the screen
MAN["plates"] = {
    "tale": _at(bk.matrix_world.translation + Vector((0, 0, 0.62))),
    "screen": _at(screen.matrix_world @ Vector((0, 0, 2.02))),
}
MAN["frame"] = {"w": FRAME_W, "h": FRAME_H}
MAN["layers"].sort(key=lambda l: l["z"])
with open(f"{OUTDIR}/manifest.json", "w") as f:
    json.dump(MAN, f, indent=1)
print("MANIFEST", len(MAN["layers"]), "layers ->", f"{OUTDIR}/manifest.json")
