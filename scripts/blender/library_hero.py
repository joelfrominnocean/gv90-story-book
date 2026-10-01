"""
The library hero shot, built in Blender from real CC0 textures (Poly Haven, ambientCG) instead of code-drawn ones.

Run:   OUT=renders/hero.png RES=0.5 SAMPLES=64 FIRE=0 /Applications/Blender.app/Contents/MacOS/Blender -b -noaudio --python scripts/blender/library_hero.py

World units match the web scene (a page is 1 wide, books stand 0.8 tall), with Blender's axes:
  x = across the shelf, y = depth (camera looks along +y), z = up. Shelf front is y = 0, back wall y = 0.66.
Everything here is data: change a number, re-render in seconds. Textures live in assets-src/textures (not shipped).
"""
import bpy, bmesh, math, os, random, time, json
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = f"{ROOT}/assets-src/textures"
LAB = f"{ROOT}/assets-src/generated/labels"
OUT = os.environ.get("OUT", f"{ROOT}/renders/hero.png")
RES = float(os.environ.get("RES", "0.5"))
SAMPLES = int(os.environ.get("SAMPLES", "64"))
FIRE = os.environ.get("FIRE", "1") == "1"
# WALL=1: the whole library wall (fireplace is one bay in the middle) instead of the tight shot on the six books
WALL = os.environ.get("WALL", "0") == "1"
WALL_W = float(os.environ.get("WALL_W", "7.2"))
WALL_BOT, WALL_TOP = -0.85, 3.5
BAY = 0.92  # half-width of the middle bay (fireplace + the six books + the jar)
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------------------------------------------------------- render
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "METAL"
sc.cycles.device = "GPU"
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.volume_bounces = 2
if WALL:
    WALL_PX = int(os.environ.get("WALL_PX", "2000"))  # plate height in pixels at RES=1
    sc.render.resolution_y = int(WALL_PX * RES)
    sc.render.resolution_x = int(WALL_PX * (WALL_W / (WALL_TOP - WALL_BOT)) * RES)
else:
    sc.render.resolution_x = int(1170 * RES)
    sc.render.resolution_y = int(2532 * RES)
sc.render.filepath = OUT
sc.render.image_settings.file_format = "PNG"
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" in [l.name for l in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"
sc.view_settings.exposure = float(os.environ.get("EXPOSURE", "0.0"))

# ---------------------------------------------------------------- helpers
def load(path, cs="sRGB"):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = cs
    return im

def principled(m):
    return m.node_tree.nodes["Principled BSDF"]

def set_in(node, names, value):
    for n in names if isinstance(names, (list, tuple)) else [names]:
        if n in node.inputs:
            node.inputs[n].default_value = value
            return True
    return False

def mix_color(nt, a, b, blend="MULTIPLY", fac=1.0):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    m.blend_type = blend
    m.inputs[0].default_value = fac
    if hasattr(a, "default_value") or a is None:
        pass
    return m

def pbr(name, diff, nor=None, rough=None, scale=1.0, rot=0.0, tint=None, tint_fac=1.0, rough_mul=1.0, nor_strength=1.0, box=True, value=1.0, mono=False):
    """A PBR material from real maps. Box projection in object space, so boards of any size get an even grain."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt, L = m.node_tree, m.node_tree.links
    b = principled(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, scale, scale)
    mp.inputs["Rotation"].default_value = rot if isinstance(rot, tuple) else (0, 0, rot)
    L.new(tc.outputs["Object" if box else "UV"], mp.inputs["Vector"])

    def tex(path, cs):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = load(path, cs)
        if box:
            t.projection = "BOX"
            t.projection_blend = 0.2
        L.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t

    d = tex(diff, "sRGB")
    col = d.outputs["Color"]
    if value != 1.0 or tint is not None or mono:
        hsv = nt.nodes.new("ShaderNodeHueSaturation")
        hsv.inputs["Value"].default_value = value
        if mono: hsv.inputs["Saturation"].default_value = 0.0
        L.new(col, hsv.inputs["Color"])
        col = hsv.outputs["Color"]
    if tint is not None:
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = tint_fac
        L.new(col, mx.inputs[6])
        mx.inputs[7].default_value = (*tint, 1)
        col = mx.outputs[2]
    L.new(col, b.inputs["Base Color"])
    if rough:
        r = tex(rough, "Non-Color")
        if rough_mul != 1.0:
            mu = nt.nodes.new("ShaderNodeMath")
            mu.operation = "MULTIPLY"
            mu.inputs[1].default_value = rough_mul
            L.new(r.outputs["Color"], mu.inputs[0])
            L.new(mu.outputs[0], b.inputs["Roughness"])
        else:
            L.new(r.outputs["Color"], b.inputs["Roughness"])
    if nor:
        n = tex(nor, "Non-Color")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nor_strength
        L.new(n.outputs["Color"], nm.inputs["Color"])
        L.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m

def flat(name, color, rough=0.6, **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    for k, v in kw.items():
        set_in(b, k.replace("_", " ").title(), v)
    return m

def image_mat(name, path, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt, L = m.node_tree, m.node_tree.links
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = load(path)
    b = principled(m)
    L.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    return m

def box(name, size, center, mat=None, collection=None, bevel=0.0):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts:
        v.co.x *= size[0]; v.co.y *= size[1]; v.co.z *= size[2]
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    (collection or sc.collection).objects.link(ob)
    if mat: me.materials.append(mat)
    if bevel:
        bv = ob.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = 2; bv.limit_method = "ANGLE"
    return ob

def plane(name, w, h, center, mat, face="-y"):
    """A plane facing the camera (-y) by default."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bm.loops.layers.uv.verify()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5, calc_uvs=True)
    for v in bm.verts:
        v.co.x *= 2 * w; v.co.z = v.co.y * 2 * h; v.co.y = 0
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    sc.collection.objects.link(ob)
    me.materials.append(mat)
    return ob

def cylinder(name, r, length, center, rot, mat, seg=24):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=length, calc_uvs=True)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.rotation_euler = rot
    sc.collection.objects.link(ob)
    me.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    return ob

# ---------------------------------------------------------------- materials (real maps)
PH = f"{TEX}/polyhaven"
AC = f"{TEX}/ambientcg"
wood_args = dict(diff=f"{PH}/dark_wood/dark_wood_diff_2k.jpg", nor=f"{PH}/dark_wood/dark_wood_nor_gl_2k.jpg", rough=f"{PH}/dark_wood/dark_wood_rough_2k.jpg")
wood_board = pbr("wood_board", scale=1.1, rot=0.0, value=0.85, **wood_args)
wood_wall = pbr("wood_wall", scale=1.1, rot=(0, math.radians(90), 0), value=0.62, **wood_args)
slate = pbr("slate", f"{AC}/Tiles140/Tiles140_1K-JPG_Color.jpg", f"{AC}/Tiles140/Tiles140_1K-JPG_NormalGL.jpg", f"{AC}/Tiles140/Tiles140_1K-JPG_Roughness.jpg", scale=1.4, value=0.7)
soot = pbr("soot", f"{AC}/Tiles140/Tiles140_1K-JPG_Color.jpg", f"{AC}/Tiles140/Tiles140_1K-JPG_NormalGL.jpg", f"{AC}/Tiles140/Tiles140_1K-JPG_Roughness.jpg", scale=1.4, value=0.07 if WALL else 0.18, tint=(0.5, 0.42, 0.36))
cloth_args = dict(diff=f"{PH}/book_pattern/book_pattern_col1_2k.jpg", nor=f"{PH}/book_pattern/book_pattern_nor_gl_2k.jpg", rough=f"{PH}/book_pattern/book_pattern_rough_2k.jpg")
pages_mat = pbr("pages", f"{PH}/book_pattern/book_pattern_page_2k.jpg", scale=2.0, box=True)
paper_plain = pbr("paper", f"{AC}/Paper006/Paper006_1K-JPG_Color.jpg", f"{AC}/Paper006/Paper006_1K-JPG_NormalGL.jpg", f"{AC}/Paper006/Paper006_1K-JPG_Roughness.jpg", scale=2.0)
thread_mat = flat("thread", (0.78, 0.74, 0.66), rough=0.85)

# one restrained cloth colour per chapter (deep, not bright): teal-grey, celadon, amber, walnut, clay, dusk
ACCENTS = {0: (0.18, 0.26, 0.27), 1: (0.27, 0.34, 0.30), 2: (0.52, 0.33, 0.12), 3: (0.28, 0.19, 0.12), 4: (0.46, 0.27, 0.20), 5: (0.17, 0.23, 0.38)}

def cloth(name, tint, value=1.5):
    return pbr(name, scale=2.4, tint=tint, tint_fac=1.0, value=value, mono=True, **cloth_args)

# ---------------------------------------------------------------- the room
SHELF_BACK = 0.66
ROW, UPPER, TOP = 0.42, 1.38, 2.34
HEARTH = -0.42
BOARD_T = 0.055
WIDE = WALL_W + 0.2 if WALL else 7.0

box("back_wall", (WIDE, 0.05, 8.0), (0, SHELF_BACK + 0.025, 0.5), wood_wall)
for z in (ROW, UPPER, TOP):
    box(f"board_{z}", (WIDE, SHELF_BACK, BOARD_T), (0, SHELF_BACK / 2, z - BOARD_T / 2), wood_board, bevel=0.003)
# base cabinet below the hearth, and the hearth slab projecting into the room
box("plinth", (WIDE, SHELF_BACK, 0.4), (0, SHELF_BACK / 2, HEARTH - 0.1 - 0.2), wood_board)
box("hearth", (1.28, 0.62, 0.1), (0, 0.0, HEARTH - 0.05), slate, bevel=0.004)

# timber either side of the fireplace opening, and the lintel over it
OPEN_W, OPEN_TOP = 0.78, 0.30
for sx in (-1, 1):
    box(f"jamb_{sx}", (WIDE / 2 - OPEN_W / 2, SHELF_BACK, ROW - BOARD_T - HEARTH), (sx * (OPEN_W / 2 + (WIDE / 2 - OPEN_W / 2) / 2), SHELF_BACK / 2, (ROW - BOARD_T + HEARTH) / 2), wood_board)
box("lintel", (OPEN_W, SHELF_BACK, ROW - BOARD_T - OPEN_TOP), (0, SHELF_BACK / 2, (ROW - BOARD_T + OPEN_TOP) / 2), wood_board)
# the firebox: dark, sooty slate
FB_BACK = 0.42
box("fb_back", (OPEN_W + 0.04, 0.03, OPEN_TOP - HEARTH), (0, FB_BACK + 0.015, (OPEN_TOP + HEARTH) / 2), soot)
for sx in (-1, 1):
    box(f"fb_side_{sx}", (0.03, FB_BACK, OPEN_TOP - HEARTH), (sx * (OPEN_W / 2 + 0.005), FB_BACK / 2, (OPEN_TOP + HEARTH) / 2), soot)
box("fb_top", (OPEN_W + 0.04, FB_BACK, 0.03), (0, FB_BACK / 2, OPEN_TOP - 0.015), soot)
box("fb_floor", (OPEN_W, FB_BACK, 0.02), (0, FB_BACK / 2, HEARTH + 0.01), soot)

# ---------------------------------------------------------------- books
TITLE_PAGES = {0: 4, 1: 16, 2: 10, 3: 14, 4: 3, 5: 3}
S = 0.8 / 1.45
H_BOOK = 0.8
D_BOOK = 1.0 * S
FRONT = 0.03  # spine plane, a little behind the board edge
GAP = 0.016
thick = {n: (0.17 + 0.004 * p) * S for n, p in TITLE_PAGES.items()}
total = sum(thick.values()) + GAP * 5
HIGHLIGHT = int(os.environ.get("HIGHLIGHT", "-1" if WALL else "1"))
# on the wall plate the sealed bands and the "newest stands proud" are drawn by the page (they change with the date), not baked
LOCKED = {2, 3, 4, 5} if (not WALL or os.environ.get("BANDS", "0") == "1") else set()
HIDE_BOOK = int(os.environ.get("HIDE_BOOK", "-1"))  # render with one of the six missing: the empty slot, for the take-down

def hero_book(n, x_left):
    w, h, d = thick[n], H_BOOK, D_BOOK
    front = FRONT - (0.07 if n == HIGHLIGHT else 0.0)  # the newest stands a little proud
    zc = ROW + h / 2
    cx = x_left + w / 2
    if n == HIDE_BOOK:
        return
    cm = cloth(f"cloth_{n}", ACCENTS[n])
    # covers, page block, wrapped spine
    cw = 0.007
    box(f"b{n}_coverL", (cw, d, h), (x_left + cw / 2, front + d / 2, zc), cm, bevel=0.0015)
    box(f"b{n}_coverR", (cw, d, h), (x_left + w - cw / 2, front + d / 2, zc), cm, bevel=0.0015)
    box(f"b{n}_pages", (w - 2 * cw, d - 0.012, h - 0.014), (cx, front + d / 2 + 0.002, zc), pages_mat)
    box(f"b{n}_spine", (w, 0.006, h), (cx, front + 0.003, zc), cm, bevel=0.002)
    # slip pasted on the spine, and the stitching over the cloth (the middle loops hide under the slip)
    slip_w = min(w * 0.82, 0.496 / 6)
    plane(f"b{n}_slip", slip_w / 2, 0.496 / 2, (cx, front - 0.0012, zc + 0.01), image_mat(f"slip_{n}", f"{LAB}/slip_{n}.png"))
    for r in (0.1, 0.3, 0.5, 0.7, 0.9):
        cylinder(f"b{n}_thread", 0.0026, w * 0.98, (cx, front - 0.0004, ROW + h * r), (0, math.radians(90), 0), thread_mat, seg=10)
    if n in LOCKED:
        band_mat = image_mat(f"band_{n}", f"{LAB}/band_{n}.png", rough=0.9)
        box(f"b{n}_band", (w + 0.012, d + 0.012, 0.19), (cx, front + d / 2, zc + 0.07), paper_plain)
        plane(f"b{n}_bandface", (w + 0.012) / 2, 0.19 / 2, (cx, front - 0.0062, zc + 0.07), band_mat)

x = -total / 2
spans = {}
for n in range(6):
    spans[n] = (x, thick[n])
    hero_book(n, x)
    x += thick[n] + GAP
OUR_FROM, OUR_TO = -total / 2 - 0.03, total / 2 + 0.03

# background books: dim, varied, to make the wall feel full
PALETTE = [(0.34, 0.14, 0.11), (0.26, 0.21, 0.14), (0.14, 0.24, 0.19), (0.2, 0.17, 0.27), (0.42, 0.29, 0.16), (0.12, 0.13, 0.15), (0.36, 0.22, 0.14), (0.27, 0.13, 0.12), (0.5, 0.42, 0.3), (0.13, 0.22, 0.26), (0.3, 0.16, 0.22), (0.22, 0.26, 0.15)]
if WALL:
    PALETTE = [tuple(min(0.85, c * 1.3) for c in col) for col in PALETTE] + [(0.58, 0.31, 0.15), (0.45, 0.11, 0.09), (0.66, 0.58, 0.42), (0.17, 0.29, 0.40), (0.31, 0.37, 0.19), (0.47, 0.36, 0.21), (0.72, 0.66, 0.52), (0.26, 0.09, 0.13), (0.55, 0.22, 0.12), (0.38, 0.30, 0.18)]
filler_mats = [cloth(f"fill_{i}", c, value=1.8 if WALL else 1.25) for i, c in enumerate(PALETTE)]
label_mat = flat("label", (0.55, 0.5, 0.38), rough=0.85)
gilt_mat = flat("gilt", (0.62, 0.48, 0.2), rough=0.35, metallic=0.9)
fcount = 0

def shelf_fill(x0, x1, top, hmin, hmax, skip=lambda cx: False, gaps=0.0):
    """A run of spines standing on the shelf whose top surface is at `top`."""
    global fcount
    x = x0
    while x < x1:
        w = 0.034 + random.random() * 0.05
        h = hmin + random.random() * (hmax - hmin)
        d = 0.44 + random.random() * 0.04
        cx = x + w / 2
        if cx + w / 2 <= x1 and not skip(cx):
            m = random.choice(filler_mats)
            ob = box(f"fill_{fcount}", (w, d, h), (cx, 0.04 + d / 2, top + h / 2), m, bevel=0.0015)
            lean = random.random() < 0.07
            if lean:
                ob.rotation_euler = (0, random.uniform(-0.08, 0.08), 0)
            elif w > 0.04:  # spine decoration: a paper label or two gilt bands
                r = random.random()
                if r < 0.4:
                    lh = random.uniform(0.07, 0.13) * (h / 0.63)
                    box(f"fill_{fcount}_label", (w * 0.8, 0.002, lh), (cx, 0.04 - 0.001, top + h * random.uniform(0.55, 0.78)), label_mat)
                elif r < 0.7:
                    for zz in (0.8, 0.84):
                        box(f"fill_{fcount}_gilt", (w * 0.98, 0.0025, 0.004), (cx, 0.04 - 0.0008, top + h * zz), gilt_mat)
            fcount += 1
        x += w + 0.002 + (random.random() * 0.05 if random.random() < 0.05 else 0)
        if gaps and random.random() < gaps:
            x += random.uniform(0.12, 0.5)

if not WALL:
    shelf_fill(-2.4, 2.4, ROW, 0.5, 0.76, lambda cx: OUR_FROM < cx < OUR_TO)
    shelf_fill(-2.4, 2.4, UPPER, 0.5, 0.76, lambda cx: 0.1 < cx < 0.52)
else:
    # middle bay keeps the tall shelves (the six books, the jar); the wings run to a half-height pitch so the wall reads as a library
    shelf_fill(-BAY, BAY, ROW, 0.5, 0.76, lambda cx: OUR_FROM < cx < OUR_TO)
    shelf_fill(-BAY, BAY, UPPER, 0.5, 0.76, lambda cx: 0.1 < cx < 0.52)
    PITCH = 0.48
    HALF = WALL_W / 2 - 0.06
    wing_tops = [ROW + k * PITCH for k in range(0, 6)]  # 0.42, 0.90, 1.38 ... 2.82
    # a few gaps are left on the wings for a jar or a flat stack of books
    PROPS = [(-1.55, 1.86, "jar"), (-3.05, 0.90, "stack"), (-2.05, 0.42, "stack"), (1.95, 1.38, "jar"), (2.85, 2.34, "stack"), (1.5, 0.42, "stack"), (-2.75, 2.82, "jar"), (3.0, 0.90, "jar")]
    def gap(cx, t):
        return any(abs(cx - px) < 0.2 and abs(t - pt) < 1e-6 for px, pt, _ in PROPS)
    for t in wing_tops:
        for x0, x1 in ((-HALF, -BAY - 0.05), (BAY + 0.05, HALF)):
            shelf_fill(x0, x1, t, 0.30, 0.43, lambda cx, t=t: gap(cx, t), gaps=0.012)
    # the top of the middle bay, above the 2.34 board
    for t in (TOP, TOP + PITCH):
        shelf_fill(-BAY, BAY, t, 0.30, 0.43)

# ---------------------------------------------------------------- the moon jar
def moon_jar(center, scale=1.0):
    prof = [(0.0, 0.0), (0.046, 0.0), (0.052, 0.008), (0.048, 0.016), (0.074, 0.03), (0.106, 0.07), (0.126, 0.125), (0.131, 0.178), (0.12, 0.236), (0.094, 0.286), (0.066, 0.318), (0.06, 0.336), (0.067, 0.35), (0.07, 0.357), (0.063, 0.359)]
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=96, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for v in bm.verts:  # two hand-joined halves: never quite symmetrical
        th = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.02 * math.sin(2 * th + 0.8) + 0.012 * math.sin(3 * th) * min(1, v.co.z / 0.2)
        v.co.x = v.co.x * k + v.co.z * 0.03 * 1.05; v.co.y *= k; v.co.z *= 1.0 + 0.012 * math.sin(th)
        v.co *= 1.05
    me = bpy.data.meshes.new("jar")
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new("jar", me)
    ob.location = center
    ob.scale = (scale, scale, scale)
    sc.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    sub = ob.modifiers.new("sub", "SUBSURF"); sub.levels = 1; sub.render_levels = 2
    m = bpy.data.materials.new("porcelain"); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (0.9, 0.9, 0.88, 1)
    b.inputs["Roughness"].default_value = 0.12
    set_in(b, "Coat Weight", 0.7); set_in(b, "Coat Roughness", 0.05)
    set_in(b, "Subsurface Weight", 0.04)
    me.materials.append(m)
    return ob

moon_jar((0.3, 0.3, UPPER))

if WALL:
    GILT_CYL = gilt_mat
    # extra boards for the wings' half-height pitch, a closing top board for the middle bay, and a crown
    wing_w = WIDE / 2 - BAY
    for z in (ROW + 0.48, ROW + 0.48 * 3):
        for sx in (-1, 1):
            box(f"wboard_{z:.2f}_{sx}", (wing_w, SHELF_BACK, BOARD_T), (sx * (BAY + wing_w / 2), SHELF_BACK / 2, z - BOARD_T / 2), wood_board, bevel=0.003)
    box("board_top2", (WIDE, SHELF_BACK, BOARD_T), (0, SHELF_BACK / 2, ROW + 0.48 * 5 - BOARD_T / 2), wood_board, bevel=0.003)
    box("crown", (WIDE, SHELF_BACK + 0.1, 0.2), (0, (SHELF_BACK + 0.1) / 2 - 0.05, 3.36), wood_board, bevel=0.01)
    box("crown_lip", (WIDE, 0.04, 0.05), (0, -0.07, 3.27), wood_board, bevel=0.004)
    # pilasters framing the middle bay, and a plinth skirting
    for sx in (-1, 1):
        box(f"pilaster_{sx}", (0.07, SHELF_BACK + 0.04, 3.78), (sx * (BAY + 0.02), (SHELF_BACK + 0.04) / 2 - 0.04, 1.37), wood_board, bevel=0.004)
    box("skirt", (WIDE, 0.04, 0.12), (0, -0.04, -0.86), wood_board, bevel=0.003)
    # cupboard doors under the wings (plinth + jamb timber behind), each with a recessed panel and a brass knob
    DOOR_Z0, DOOR_Z1 = -0.80, 0.34
    dw = (WALL_W / 2 + 0.2 - BAY - 0.08) / 4
    for sx in (-1, 1):
        for i in range(4):
            cx = sx * (BAY + 0.07 + dw * (i + 0.5))
            cz = (DOOR_Z0 + DOOR_Z1) / 2
            box(f"door_{sx}_{i}", (dw - 0.012, 0.022, DOOR_Z1 - DOOR_Z0), (cx, -0.011, cz), wood_board, bevel=0.004)
            box(f"door_in_{sx}_{i}", (dw - 0.17, 0.01, DOOR_Z1 - DOOR_Z0 - 0.16), (cx, -0.026, cz), wood_wall, bevel=0.003)
            kx = cx - sx * (dw / 2 - 0.05) if i % 2 == 0 else cx + sx * (dw / 2 - 0.05)
            cylinder(f"knob_{sx}_{i}", 0.014, 0.03, (kx, -0.04, cz + 0.12), (math.radians(90), 0, 0), gilt_mat, seg=16)
    for sx in (-1, 1):
        box(f"surround_{sx}", (0.12, 0.05, ROW - BOARD_T - HEARTH), (sx * (OPEN_W / 2 + 0.06), -0.025, (ROW - BOARD_T + HEARTH) / 2), slate, bevel=0.004)
    box("surround_top", (OPEN_W + 0.24, 0.05, ROW - BOARD_T - OPEN_TOP), (0, -0.025, (ROW - BOARD_T + OPEN_TOP) / 2), slate, bevel=0.004)
    box("hearth_step", (1.5, 0.74, 0.04), (0, -0.02, HEARTH - 0.12), slate, bevel=0.004)
    # the rolling ladder on the left wing: rails, rungs, and the brass rail it hangs from
    LB, LT, LY0, LY1 = -0.84, 3.05, -0.34, -0.06
    lean = math.atan((LY1 - LY0) / (LT - LB))
    for lx in (-2.62, -2.2):
        box(f"ladder_rail_{lx}", (0.035, 0.03, math.hypot(LT - LB, LY1 - LY0)), (lx, (LY0 + LY1) / 2, (LB + LT) / 2), wood_board, bevel=0.004).rotation_euler = (-lean, 0, 0)
    z = LB + 0.3
    while z < LT - 0.1:
        yy = LY0 + (LY1 - LY0) * (z - LB) / (LT - LB)
        cylinder(f"ladder_rung_{z:.2f}", 0.011, 0.44, (-2.41, yy - 0.012, z), (0, math.radians(90), 0), wood_board, seg=12)
        z += 0.3
    cylinder("ladder_rail_brass", 0.011, WALL_W / 2 - 0.4, (-(WALL_W / 2 - 0.4) / 2 - 0.6, -0.07, 3.1), (0, math.radians(90), 0), gilt_mat, seg=16)
    # props in the gaps left on the wings
    for px, pt, kind in PROPS:
        if kind == "jar":
            moon_jar((px, 0.3, pt), scale=random.uniform(0.62, 0.78))
        else:
            zc = pt
            for k in range(random.randint(3, 4)):
                bh = random.uniform(0.035, 0.05)
                bw, bd = random.uniform(0.22, 0.28), random.uniform(0.17, 0.21)
                m = random.choice(filler_mats)
                ob = box(f"stack_{px}_{k}", (bw, bd, bh), (px + random.uniform(-0.015, 0.015), 0.24, zc + bh / 2), m, bevel=0.002)
                ob.rotation_euler = (0, 0, random.uniform(-0.12, 0.12))
                box(f"stack_{px}_{k}_pg", (bw - 0.012, bd - 0.01, bh - 0.012), (ob.location.x + 0.006, 0.24, zc + bh / 2), pages_mat).rotation_euler = ob.rotation_euler
                zc += bh

# ---------------------------------------------------------------- logs
char = bpy.data.materials.new("char"); char.use_nodes = True
nt, L = char.node_tree, char.node_tree.links
b = principled(char)
tc = nt.nodes.new("ShaderNodeTexCoord"); nz = nt.nodes.new("ShaderNodeTexNoise")
nz.inputs["Scale"].default_value = 9; nz.inputs["Detail"].default_value = 8; nz.inputs["Roughness"].default_value = 0.7
L.new(tc.outputs["Object"], nz.inputs["Vector"])
cr = nt.nodes.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.60; cr.color_ramp.elements[1].position = 0.70
L.new(nz.outputs["Fac"], cr.inputs["Fac"])
b.inputs["Base Color"].default_value = (0.012, 0.009, 0.007, 1); b.inputs["Roughness"].default_value = 0.97
bk = nt.nodes.new("ShaderNodeTexNoise"); bk.inputs["Scale"].default_value = 38; bk.inputs["Detail"].default_value = 12; bk.inputs["Roughness"].default_value = 0.65
bm_ = nt.nodes.new("ShaderNodeBump"); bm_.inputs["Strength"].default_value = 0.9; bm_.inputs["Distance"].default_value = 0.02
bn = nt.nodes.new("ShaderNodeTexImage"); bn.image = load(f"{PH}/dark_wood/dark_wood_nor_gl_2k.jpg", "Non-Color"); bn.projection = "BOX"
nmn = nt.nodes.new("ShaderNodeNormalMap"); nmn.inputs["Strength"].default_value = 1.6
mpn = nt.nodes.new("ShaderNodeMapping"); mpn.inputs["Scale"].default_value = (3.0, 3.0, 3.0)
L.new(tc.outputs["Object"], mpn.inputs["Vector"]); L.new(mpn.outputs["Vector"], bn.inputs["Vector"]); L.new(bn.outputs["Color"], nmn.inputs["Color"])
L.new(tc.outputs["Object"], bk.inputs["Vector"]); L.new(bk.outputs["Fac"], bm_.inputs["Height"]); L.new(nmn.outputs["Normal"], bm_.inputs["Normal"])
L.new(bm_.outputs["Normal"], b.inputs["Normal"])
em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (1.0, 0.28, 0.04, 1); em.inputs["Strength"].default_value = 3.5
mixs = nt.nodes.new("ShaderNodeMixShader"); out = nt.nodes["Material Output"]
L.new(cr.outputs["Color"], mixs.inputs["Fac"])
L.new(b.outputs["BSDF"], mixs.inputs[1]); L.new(em.outputs["Emission"], mixs.inputs[2]); L.new(mixs.outputs["Shader"], out.inputs["Surface"])
LOGZ = HEARTH + 0.06
cylinder("log1", 0.055, 0.55, (-0.02, 0.22, LOGZ), (0, math.radians(90), math.radians(8)), char)
cylinder("log2", 0.05, 0.5, (0.06, 0.28, LOGZ + 0.085), (0, math.radians(90), math.radians(-18)), char)
cylinder("log3", 0.048, 0.46, (-0.1, 0.14, LOGZ + 0.075), (0, math.radians(90), math.radians(30)), char)

# ---------------------------------------------------------------- light
# the room: the real Fireplace HDRI, kept low (a warm fill from the front)
w = bpy.data.worlds.new("room"); sc.world = w; w.use_nodes = True
nt, L = w.node_tree, w.node_tree.links; nt.nodes.clear()
envn = nt.nodes.new("ShaderNodeTexEnvironment"); envn.image = load(f"{PH}/fireplace/fireplace_2k.hdr", "Linear Rec.709" if "Linear Rec.709" in bpy.types.Image.bl_rna.properties["colorspace_settings"].fixed_type.properties["name"].enum_items.keys() else "Non-Color")
mpw = nt.nodes.new("ShaderNodeMapping"); mpw.inputs["Rotation"].default_value = (0, 0, math.radians(float(os.environ.get("ENV_ROT", "200"))))
tcw = nt.nodes.new("ShaderNodeTexCoord")
bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = float(os.environ.get("ENV_STRENGTH", "0.28"))
wo = nt.nodes.new("ShaderNodeOutputWorld")
L.new(tcw.outputs["Generated"], mpw.inputs["Vector"]); L.new(mpw.outputs["Vector"], envn.inputs["Vector"])
L.new(envn.outputs["Color"], bg.inputs["Color"]); L.new(bg.outputs["Background"], wo.inputs["Surface"])

# the cool two-line lamp under the upper shelf, above our books
for dy in (0.045, 0.064):
    ld = bpy.data.lights.new(f"lamp_{dy}", "AREA"); ld.shape = "RECTANGLE"; ld.size = 1.1; ld.size_y = 0.006
    ld.color = (0.78, 1.0, 0.94); ld.energy = float(os.environ.get("LAMP", "40"))
    lo = bpy.data.objects.new(ld.name, ld); lo.location = (0, dy, UPPER - BOARD_T - 0.004); lo.rotation_euler = (0, 0, 0)
    sc.collection.objects.link(lo)
    mm = flat(f"lampmat_{dy}", (0.8, 1, 0.95), rough=0.4)
    p = principled(mm); set_in(p, "Emission Color", (0.8, 1, 0.95, 1)); set_in(p, "Emission Strength", 1.3)
    strip = box(f"lampstrip_{dy}", (1.1, 0.006, 0.004), (0, dy, UPPER - BOARD_T - 0.002), mm)

# a large soft key from out of frame at the front left, as through a hanji screen: cool against the fire's warmth
key = bpy.data.lights.new("hanji_key", "AREA"); key.shape = "RECTANGLE"; key.size = 3.0; key.size_y = 3.0
key.color = (0.82, 0.9, 1.0); key.energy = float(os.environ.get("KEY", "120"))
ko = bpy.data.objects.new("hanji_key", key); ko.location = (-2.6, -3.0, 2.2); sc.collection.objects.link(ko)
kt = ko.constraints.new("TRACK_TO"); kt.target = bpy.data.objects.new("keytgt", None); kt.target.location = (0, 0.2, 0.7); sc.collection.objects.link(kt.target)
kt.track_axis = "TRACK_NEGATIVE_Z"; kt.up_axis = "UP_Y"

if WALL:
    rf = bpy.data.lights.new("right_fill", "AREA"); rf.shape = "RECTANGLE"; rf.size = 3.0; rf.size_y = 3.0
    rf.color = (0.85, 0.92, 1.0); rf.energy = float(os.environ.get("RIGHT_FILL", "90"))
    rfo = bpy.data.objects.new("right_fill", rf); rfo.location = (3.4, -3.0, 2.0); sc.collection.objects.link(rfo)
    rft = rfo.constraints.new("TRACK_TO"); rft.target = bpy.data.objects.new("rftgt", None); rft.target.location = (1.2, 0.3, 1.2); sc.collection.objects.link(rft.target)
    rft.track_axis = "TRACK_NEGATIVE_Z"; rft.up_axis = "UP_Y"

sp = bpy.data.lights.new("window", "SPOT"); sp.spot_size = math.radians(70); sp.spot_blend = 1.0
sp.color = (1.0, 0.93, 0.82); sp.energy = float(os.environ.get("WINDOW", "900")); sp.shadow_soft_size = 0.8
so = bpy.data.objects.new("window", sp); so.location = (-2.4, -2.8, 2.8); sc.collection.objects.link(so)
stg = bpy.data.objects.new("windowtgt", None); stg.location = (-0.35, 0.3, 0.85); sc.collection.objects.link(stg)
stc = so.constraints.new("TRACK_TO"); stc.target = stg; stc.track_axis = "TRACK_NEGATIVE_Z"; stc.up_axis = "UP_Y"

# the fire's own light (the volume adds more when FIRE=1)
fl = bpy.data.lights.new("fire_light", "POINT"); fl.color = (1.0, 0.5, 0.2); fl.energy = float(os.environ.get("FIRE_LIGHT", "22")); fl.shadow_soft_size = 0.12
flo = bpy.data.objects.new("fire_light", fl); flo.location = (0, 0.12, HEARTH + 0.3); sc.collection.objects.link(flo)
if WALL:
    # the glow that leaves the firebox: it warms the hearth, the timber and the foot of the books above
    sp2 = bpy.data.lights.new("fire_spill", "POINT"); sp2.color = (1.0, 0.52, 0.22); sp2.energy = float(os.environ.get("FIRE_SPILL", "30")); sp2.shadow_soft_size = 0.35
    spo = bpy.data.objects.new("fire_spill", sp2); spo.location = (0, -0.42, HEARTH + 0.34); sc.collection.objects.link(spo)

# ---------------------------------------------------------------- camera (same framing as the web library)
cam = bpy.data.cameras.new("cam"); cam.sensor_fit = "VERTICAL"; cam.angle = math.radians(22)
cam.clip_start = 0.1; cam.clip_end = 60
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
if WALL:
    # square-on to the wall, centred: the wall is parallel to the sensor, so there is no keystoning, only an even scale
    dist = (WALL_TOP - WALL_BOT) / (2 * math.tan(math.radians(11)))
    target = Vector((0, 0.6, (WALL_TOP + WALL_BOT) / 2))
    co.location = (0, target.y - dist, target.z)
else:
    dist = 2.5 / (2 * math.tan(math.radians(11)))
    target = Vector((0, 0.6, float(os.environ.get("TARGET_Z", "0.56"))))
    co.location = (-0.035, target.y - dist * 0.996, target.z - dist * 0.09)
tgt = bpy.data.objects.new("target", None); tgt.location = target; sc.collection.objects.link(tgt)
tr = co.constraints.new("TRACK_TO"); tr.target = tgt; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"

# depth of field: a touch, focused on the books
cam.dof.use_dof = os.environ.get("DOF", "0" if WALL else "1") == "1"
cam.dof.focus_distance = (co.location - Vector((0, 0.3, ROW + 0.4))).length
cam.dof.aperture_fstop = float(os.environ.get("FSTOP", "5.6"))

if FIRE:
    exec(open(f"{os.path.dirname(__file__)}/library_fire.py").read())

if WALL:
    # Where things land on the plate, in 0..1 from the top-left, by the same pinhole the camera uses.
    asp = WALL_W / (WALL_TOP - WALL_BOT)
    th = math.tan(math.radians(11))
    def uv(x, y, z):
        d = y - co.location.y
        return ((x / (d * th * asp)) + 1) / 2, (1 - (z - co.location.z) / (d * th)) / 2
    def rect(x0, x1, z0, z1, y):
        a, b = uv(x0, y, z1), uv(x1, y, z0)
        return {"u0": round(a[0], 5), "v0": round(a[1], 5), "u1": round(b[0], 5), "v1": round(b[1], 5)}
    lay = {"aspect": asp, "books": [], "fire": rect(-OPEN_W / 2, OPEN_W / 2, HEARTH, OPEN_TOP, 0.0)}
    for n in range(6):
        x0, w_ = spans[n]
        lay["books"].append(rect(x0, x0 + w_, ROW, ROW + H_BOOK, FRONT))
    lay["bay"] = rect(OUR_FROM - 0.04, OUR_TO + 0.04, ROW, ROW + H_BOOK + 0.02, FRONT)
    json.dump(lay, open(os.path.splitext(OUT)[0] + "_layout.json", "w"), indent=1)
    b = os.environ.get("BORDER")
    if b:
        u0, v0, u1, v1 = [float(t) for t in b.split(",")]
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = u0, u1, 1 - v1, 1 - v0

if os.environ.get("CROP") == "fire":
    # render only the fireplace, for fast iteration on the flame
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = 0.1, 0.9, 0.04, 0.45
os.makedirs(os.path.dirname(OUT), exist_ok=True)
t0 = time.time()
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(OUT)[0] + ".blend")
print("HERO RENDER SECONDS:", round(time.time() - t0, 1), "->", OUT)
import subprocess
ff = f"{ROOT}/node_modules/ffmpeg-static/ffmpeg"
if os.path.exists(ff) and os.environ.get("GRADE", "1") == "1":
    graded = os.path.splitext(OUT)[0] + "_graded.png"
    subprocess.run([ff, "-y", "-loglevel", "error", "-i", OUT, "-vf", "vignette=angle=PI/5:mode=backward,noise=alls=5:allf=t+u", "-frames:v", "1", graded], check=False)
    print("GRADED ->", graded)
