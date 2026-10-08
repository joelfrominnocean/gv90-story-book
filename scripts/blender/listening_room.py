"""
The listening room, v2.1: a glasshouse on a Seoul rooftop at dusk, rain on the roof, a record playing. Built in Blender as
NON-photoreal art: flat colour bands from a toon shader, ink outlines from Freestyle (with a hand's wobble), and a painterly
pass in the compositor (a Kuwahara filter for brush-like patches, a paper grain, a colour grade). The point of doing it in 3D is
real perspective, an angled view and real depth, which the flat SVG scamp could not give; the point of the toon look is that it
does not pretend to be a photograph, so it does not fall into the uncanny "CGI showroom".

Run:  OUT=renders/npr/room.png RES=0.67 SAMPLES=32 /Applications/Blender.app/Contents/MacOS/Blender -b -noaudio --python scripts/blender/listening_room.py

World units are metres. x = across, y = along the glasshouse (the camera looks down +y), z = up.
Everything is data: change a number, re-render in seconds.
"""
import bpy, bmesh, math, os, random, time
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.environ.get("OUT", f"{ROOT}/renders/npr/room.png")
RES = float(os.environ.get("RES", "0.67"))
SAMPLES = int(os.environ.get("SAMPLES", "32"))
# LAYERS=1 renders the room as separate transparent layers (plates, objects) plus a manifest, for the website; see glasshouse_layers.py.
LAYERS = os.environ.get("LAYERS") == "1"
W_PX = int(os.environ.get("W_PX", "4320" if LAYERS else "1920"))
H_PX = int(os.environ.get("H_PX", "1800" if LAYERS else "1080"))
PAINT = os.environ.get("PAINT", "1") == "1"
# the camera: the approved framing (an experiment with a nearer one is possible through CX, CY, CZ, TX, TZ, LENS)
CAMX = float(os.environ.get("CX", "-2.0"))
CAMY = float(os.environ.get("CY", "-3.2"))
CAMZ = float(os.environ.get("CZ", "1.15"))
TGTX = float(os.environ.get("TX", "0.9"))
TGTY = float(os.environ.get("TY", "4.4"))
TGTZ = float(os.environ.get("TZ", "1.0"))
# STYLE=film (the current direction): physically based, procedural materials (walnut, linen, stone, ceramic, brass), soft filmic light,
# no outlines and no halftone; see film_materials.py.
# STYLE=toon (the earlier look): soft four-band colour, bold ink-teal outlines, a painterly filter.
# STYLE=sable: an experiment, kept behind this flag: flat fills in two hard tones, thresholded-noise patches, sparse stipple, thin tinted ink at every change of tone.
STYLE = os.environ.get("STYLE", "film")
random.seed(int(os.environ.get("SEED", "4")))

# Two colour moods for the same room. "teal" is the greenhouse at dusk; "dusk" leans a little toward violet and blue. In both,
# the lamp (and a thin line of horizon) is the only warm colour, so amber stays special.
MOOD_NAME = {"warm": "dusk"}.get(os.environ.get("MOOD", "teal"), os.environ.get("MOOD", "teal"))
MOODS = {
    "teal": dict(
        P={}, glass=(0.78, 0.92, 0.95), ambient=(0.10, 0.24, 0.27), sun=(0.55, 0.78, 0.86),
        sky=[(0.0, (0.88, 0.46, 0.20)), (0.05, (0.62, 0.40, 0.30)), (0.12, (0.24, 0.36, 0.38)), (0.24, (0.09, 0.22, 0.26)), (0.55, (0.02, 0.07, 0.11))],
        hills=(0.15, 0.30, 0.31), far=(0.13, 0.25, 0.28), near=(0.05, 0.12, 0.15), roofs=(0.05, 0.12, 0.15),
    ),
    "dusk": dict(
        P=dict(frame=(0.18, 0.28, 0.32), floor=(0.05, 0.10, 0.12), floor2=(0.10, 0.18, 0.21), timber=(0.28, 0.17, 0.12), rug=(0.34, 0.40, 0.30), stone=(0.50, 0.52, 0.52), paper=(0.92, 0.88, 0.80), desk=(0.14, 0.12, 0.15), chair=(0.15, 0.27, 0.29)),
        glass=(0.78, 0.88, 0.94), ambient=(0.16, 0.25, 0.33), sun=(0.60, 0.74, 0.90),
        sky=[(0.0, (0.92, 0.52, 0.24)), (0.045, (0.56, 0.40, 0.40)), (0.12, (0.24, 0.31, 0.44)), (0.24, (0.12, 0.19, 0.33)), (0.55, (0.04, 0.07, 0.17))],
        hills=(0.20, 0.30, 0.38), far=(0.16, 0.24, 0.34), near=(0.08, 0.13, 0.22), roofs=(0.07, 0.11, 0.19),
    ),
}
MOOD = MOODS[MOOD_NAME]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x = int(W_PX * RES)
sc.render.resolution_y = int(H_PX * RES)
sc.render.filepath = OUT
sc.render.image_settings.file_format = "PNG"
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"
sc.eevee.taa_render_samples = SAMPLES
for attr, val in (("use_shadows", True), ("use_raytracing", False), ("shadow_ray_count", 2), ("shadow_step_count", 6), ("shadow_pool_size", "2048")):
    if hasattr(sc.eevee, attr):
        setattr(sc.eevee, attr, val)

# ---------------------------------------------------------------- collections
def coll(name):
    c = bpy.data.collections.new(name)
    sc.collection.children.link(c)
    return c

C_INK = coll("ink")        # drawn with outlines
C_SOFT = coll("soft")      # foliage and far things: flat colour, no outline
C_SKY = coll("sky")

# ---------------------------------------------------------------- materials
def _ramp(nt, bands, shadow_tint):
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = "CONSTANT"
    while len(r.color_ramp.elements) > 1:
        r.color_ramp.elements.remove(r.color_ramp.elements[-1])
    for i, (pos, mul) in enumerate(bands):
        e = r.color_ramp.elements[0] if i == 0 else r.color_ramp.elements.new(pos)
        e.position = pos
        t = shadow_tint if i == 0 else (1, 1, 1)
        e.color = (mul * t[0], mul * t[1], mul * t[2], 1)
    return r


SABLE_SHADE = (0.58, 0.66, 0.90)   # the shadow side of every fill: the same colour, cooler and darker

def _const_ramp(nt, stops):
    """A colour ramp with hard steps: stops is [(position, value)], each value a grey multiplier."""
    r = nt.nodes.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = "CONSTANT"
    while len(r.color_ramp.elements) > 1:
        r.color_ramp.elements.remove(r.color_ramp.elements[-1])
    for i, (pos, v) in enumerate(stops):
        e = r.color_ramp.elements[0] if i == 0 else r.color_ramp.elements.new(pos)
        e.position = pos
        e.color = (v, v, v, 1)
    return r

def sable(name, base, shadow_tint=None, thr=None, patch=0.10, scale=2.2, fleck=0.12, dots=0.12):
    """Flat colour the way a screen-printed comic does it: one lit tone and one shadow tone with a hard edge between them, patches
    of slightly different tone where a noise crosses a threshold (so a flat surface still has a hand in it), a scatter of small
    flecks, and a sparse stipple of dots in the shadow. The ink between tones is drawn later, in the compositor."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N, Lk = nt.nodes, nt.links
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    d = N.new("ShaderNodeBsdfDiffuse")
    s2r = N.new("ShaderNodeShaderToRGB")
    bw = N.new("ShaderNodeRGBToBW")
    Lk.new(d.outputs[0], s2r.inputs[0])
    Lk.new(s2r.outputs[0], bw.inputs[0])
    lit = N.new("ShaderNodeMath")
    lit.operation = "GREATER_THAN"
    lit.inputs[1].default_value = thr if thr is not None else float(os.environ.get("THR", "0.7"))
    Lk.new(bw.outputs[0], lit.inputs[0])
    sh = shadow_tint or SABLE_SHADE
    col = N.new("ShaderNodeMix")
    col.data_type = "RGBA"
    col.blend_type = "MIX"
    col.inputs[6].default_value = (base[0] * sh[0], base[1] * sh[1], base[2] * sh[2], 1)
    col.inputs[7].default_value = (*base, 1)
    Lk.new(lit.outputs[0], col.inputs[0])
    cur = col.outputs[2]
    tc = None

    def times(a_out, b_out):
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        Lk.new(a_out, mx.inputs[6])
        Lk.new(b_out, mx.inputs[7])
        return mx.outputs[2]

    if patch > 0:
        tc = N.new("ShaderNodeTexCoord")
        nz = N.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = 2
        nz.inputs["Roughness"].default_value = 0.5
        Lk.new(tc.outputs["Object"], nz.inputs["Vector"])
        pr = _const_ramp(nt, [(0.0, 1.0), (0.46, 1.0 - patch), (0.74, 1.0 + patch * 0.5)])
        Lk.new(nz.outputs["Fac"], pr.inputs[0])
        cur = times(cur, pr.outputs[0])
    if fleck > 0:
        tc = tc or N.new("ShaderNodeTexCoord")
        nz2 = N.new("ShaderNodeTexNoise")
        nz2.inputs["Scale"].default_value = scale * 9.0
        nz2.inputs["Detail"].default_value = 0
        Lk.new(tc.outputs["Object"], nz2.inputs["Vector"])
        fr = _const_ramp(nt, [(0.0, 1.0), (0.80, 1.0 - fleck * 1.5)])
        Lk.new(nz2.outputs["Fac"], fr.inputs[0])
        cur = times(cur, fr.outputs[0])
    if dots > 0:
        wc = N.new("ShaderNodeTexCoord")
        mul = N.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = (95.0 * W_PX / H_PX, 95.0, 0.0)
        fra = N.new("ShaderNodeVectorMath")
        fra.operation = "FRACTION"
        sub = N.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = (0.5, 0.5, 0.0)
        ln = N.new("ShaderNodeVectorMath")
        ln.operation = "LENGTH"
        dt = N.new("ShaderNodeMath")
        dt.operation = "LESS_THAN"
        dt.inputs[1].default_value = 0.17
        inv = N.new("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        Lk.new(lit.outputs[0], inv.inputs[1])
        amt0 = N.new("ShaderNodeMath")
        amt0.operation = "MULTIPLY"
        # the stipple only grows in patches of the shadow, so it is a scatter and not a screen
        zc = N.new("ShaderNodeTexCoord")
        zn = N.new("ShaderNodeTexNoise")
        zn.inputs["Scale"].default_value = 1.6
        zn.inputs["Detail"].default_value = 1
        Lk.new(zc.outputs["Object"], zn.inputs["Vector"])
        zr = _const_ramp(nt, [(0.0, 0.0), (0.58, 1.0)])
        Lk.new(zn.outputs["Fac"], zr.inputs[0])
        amt = N.new("ShaderNodeMath")
        amt.operation = "MULTIPLY"
        Lk.new(amt0.outputs[0], amt.inputs[0])
        Lk.new(zr.outputs[0], amt.inputs[1])
        Lk.new(wc.outputs["Window"], mul.inputs[0])
        Lk.new(mul.outputs[0], fra.inputs[0])
        Lk.new(fra.outputs[0], sub.inputs[0])
        Lk.new(sub.outputs[0], ln.inputs[0])
        Lk.new(ln.outputs["Value"], dt.inputs[0])
        Lk.new(dt.outputs[0], amt0.inputs[0])
        Lk.new(inv.outputs[0], amt0.inputs[1])
        dm = N.new("ShaderNodeMix")
        dm.data_type = "RGBA"
        dm.blend_type = "MULTIPLY"
        dm.inputs[7].default_value = (1.0 - dots * 2.4, 1.0 - dots * 2.0, 1.0 - dots * 1.2, 1)
        Lk.new(amt.outputs[0], dm.inputs[0])
        Lk.new(cur, dm.inputs[6])
        cur = dm.outputs[2]
    Lk.new(cur, em.inputs[0])
    Lk.new(em.outputs[0], out.inputs[0])
    return m

def toon(name, base, bands=((0.0, 0.46), (0.16, 0.78), (0.5, 1.0), (0.86, 1.14)), shadow_tint=(0.78, 0.86, 1.05), mottle=0.12, scale=2.2, rim=0.0):
    """Flat colour in a few bands that follow the light, with a slow blotchiness like a wash of paint."""
    if STYLE == "film":
        return film_mat(name, base)
    if STYLE == "sable":
        return sable(name, base, patch=mottle * 0.85, scale=scale, fleck=0.12 if mottle > 0 else 0.0, dots=0.16 if mottle > 0 else 0.0)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    s2r = nt.nodes.new("ShaderNodeShaderToRGB")
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    ramp = _ramp(nt, bands, shadow_tint)
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(d.outputs[0], s2r.inputs[0])
    nt.links.new(s2r.outputs[0], bw.inputs[0])
    nt.links.new(bw.outputs[0], ramp.inputs[0])
    mulb = nt.nodes.new("ShaderNodeMix")
    mulb.data_type = "RGBA"
    mulb.blend_type = "MULTIPLY"
    mulb.inputs[0].default_value = 1.0
    nt.links.new(ramp.outputs[0], mulb.inputs[6])
    if mottle > 0:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = 5
        nz.inputs["Roughness"].default_value = 0.6
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["To Min"].default_value = 1.0 - mottle
        mr.inputs["To Max"].default_value = 1.0 + mottle * 0.4
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
        tint = nt.nodes.new("ShaderNodeMix")
        tint.data_type = "RGBA"
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1.0
        tint.inputs[7].default_value = (*base, 1)
        nt.links.new(mr.outputs["Result"], tint.inputs[6])
        nt.links.new(tint.outputs[2], mulb.inputs[7])
    else:
        mulb.inputs[7].default_value = (*base, 1)
    nt.links.new(mulb.outputs[2], em.inputs[0])
    nt.links.new(em.outputs[0], out.inputs[0])
    return m

def flat(name, col, strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*col, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs[0])
    return m

def clean_glass():
    m = bpy.data.materials.new("glass_clean")
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = False
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*MOOD["glass"], 1)
    em.inputs["Strength"].default_value = 1.1
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = 0.13
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m

def glass_mat():
    if LAYERS:
        return clean_glass()
    """Pale and mostly clear, with rain on it: long streaks that break up, and round drops, each lit along its lower edge as a
    lens would (a flat-colour stand-in for refraction)."""
    m = bpy.data.materials.new("glass")
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    m.use_backface_culling = False
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes
    L = nt.links
    out = N.new("ShaderNodeOutputMaterial")
    tr = N.new("ShaderNodeBsdfTransparent")
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*MOOD["glass"], 1)
    mix = N.new("ShaderNodeMixShader")
    tc = N.new("ShaderNodeTexCoord")

    def ramp(lo, hi, a=0.0, b=1.0):
        r = N.new("ShaderNodeMapRange")
        r.inputs["From Min"].default_value = lo
        r.inputs["From Max"].default_value = hi
        r.inputs["To Min"].default_value = a
        r.inputs["To Max"].default_value = b
        r.clamp = True
        return r

    # long streaks: the edges of tall cells, kept only where a slow noise lets them through, so they start and stop
    mp1 = N.new("ShaderNodeMapping")
    mp1.inputs["Scale"].default_value = (26.0, 26.0, 0.75)
    vo1 = N.new("ShaderNodeTexVoronoi")
    vo1.feature = "DISTANCE_TO_EDGE"
    vo1.inputs["Scale"].default_value = 1.0
    sk = ramp(0.06, 0.0, 0.0, 1.0)
    mp2 = N.new("ShaderNodeMapping")
    mp2.inputs["Scale"].default_value = (3.0, 3.0, 1.6)
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.0
    nz.inputs["Detail"].default_value = 2
    cov = ramp(0.40, 0.56, 0.0, 1.0)
    streak = N.new("ShaderNodeMath")
    streak.operation = "MULTIPLY"
    L.new(tc.outputs["Object"], mp1.inputs["Vector"])
    L.new(mp1.outputs[0], vo1.inputs["Vector"])
    L.new(vo1.outputs["Distance"], sk.inputs["Value"])
    L.new(tc.outputs["Object"], mp2.inputs["Vector"])
    L.new(mp2.outputs[0], nz.inputs["Vector"])
    L.new(nz.outputs["Fac"], cov.inputs["Value"])
    L.new(sk.outputs["Result"], streak.inputs[0])
    L.new(cov.outputs["Result"], streak.inputs[1])

    # drops: round beads, bigger than the eye expects so they survive the painting
    mp3 = N.new("ShaderNodeMapping")
    mp3.inputs["Scale"].default_value = (2.6, 2.6, 2.2)
    vo2 = N.new("ShaderNodeTexVoronoi")
    vo2.feature = "F1"
    vo2.inputs["Scale"].default_value = 1.0
    vo2.inputs["Randomness"].default_value = 1.0
    bead = ramp(0.2, 0.13, 0.0, 1.0)
    sub = N.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sepz = N.new("ShaderNodeSeparateXYZ")
    rim = ramp(-0.22, 0.22, 1.0, 0.0)  # the lower edge of each drop is the bright one
    L.new(tc.outputs["Object"], mp3.inputs["Vector"])
    L.new(mp3.outputs[0], vo2.inputs["Vector"])
    L.new(vo2.outputs["Distance"], bead.inputs["Value"])
    L.new(mp3.outputs[0], sub.inputs[0])
    L.new(vo2.outputs["Position"], sub.inputs[1])
    L.new(sub.outputs[0], sepz.inputs[0])
    L.new(sepz.outputs["Z"], rim.inputs["Value"])
    geo = N.new("ShaderNodeNewGeometry")
    sepn = N.new("ShaderNodeSeparateXYZ")
    steep = ramp(0.3, 0.9, 1.0, 0.08)
    abz = N.new("ShaderNodeMath")
    abz.operation = "ABSOLUTE"
    L.new(geo.outputs["Normal"], sepn.inputs[0])
    L.new(sepn.outputs["Z"], abz.inputs[0])
    L.new(abz.outputs[0], steep.inputs["Value"])
    beads = N.new("ShaderNodeMath")
    beads.operation = "MULTIPLY"
    L.new(bead.outputs["Result"], beads.inputs[0])
    L.new(steep.outputs["Result"], beads.inputs[1])
    beadlit = N.new("ShaderNodeMath")
    beadlit.operation = "MULTIPLY"
    L.new(beads.outputs[0], beadlit.inputs[0])
    L.new(rim.outputs["Result"], beadlit.inputs[1])

    # opacity: a faint pane, plus streaks, plus drops
    a1 = N.new("ShaderNodeMath")
    a1.operation = "MULTIPLY_ADD"
    a1.inputs[1].default_value = 0.62
    a1.inputs[2].default_value = 0.07
    # streaks run down upright glass; across the near-flat roof they would only make a net, so they fade there
    streak_s = N.new("ShaderNodeMath")
    streak_s.operation = "MULTIPLY"
    L.new(streak.outputs[0], streak_s.inputs[0])
    L.new(steep.outputs["Result"], streak_s.inputs[1])
    L.new(streak_s.outputs[0], a1.inputs[0])
    a2 = N.new("ShaderNodeMath")
    a2.operation = "MULTIPLY_ADD"
    a2.inputs[1].default_value = 0.2
    L.new(beads.outputs[0], a2.inputs[0])
    L.new(a1.outputs[0], a2.inputs[2])
    a3 = N.new("ShaderNodeMath")
    a3.operation = "MULTIPLY_ADD"
    a3.inputs[1].default_value = 0.28
    L.new(beadlit.outputs[0], a3.inputs[0])
    L.new(a2.outputs[0], a3.inputs[2])
    # brightness: the lit lower rim of a drop is brighter than the glass
    st = N.new("ShaderNodeMath")
    st.operation = "MULTIPLY_ADD"
    st.inputs[1].default_value = 1.2
    st.inputs[2].default_value = 1.1
    L.new(beadlit.outputs[0], st.inputs[0])
    L.new(st.outputs[0], em.inputs["Strength"])
    L.new(a3.outputs[0], mix.inputs[0])
    L.new(tr.outputs[0], mix.inputs[1])
    L.new(em.outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], out.inputs[0])
    return m

# palette: deep teal-greens, one warm lamp, dark timber, a little vermilion
P = dict(
    timber=(0.30, 0.18, 0.10), timber_dark=(0.15, 0.10, 0.07), frame=(0.20, 0.30, 0.30), floor=(0.05, 0.11, 0.12), floor2=(0.11, 0.20, 0.21),
    rug=(0.36, 0.42, 0.28), leaf=(0.12, 0.30, 0.24), leaf_dark=(0.07, 0.18, 0.15), leaf_light=(0.22, 0.42, 0.30), terracotta=(0.60, 0.30, 0.20),
    porcelain=(0.94, 0.92, 0.85), stone=(0.50, 0.52, 0.50), brass=(0.72, 0.55, 0.22), paper=(0.92, 0.88, 0.76), chair=(0.17, 0.25, 0.26),
    red=(0.72, 0.14, 0.12), ink=(0.05, 0.05, 0.06), desk=(0.10, 0.14, 0.15), sage=(0.50, 0.60, 0.48),
)
def _lin(hexs):
    """A hex colour as the linear values the shaders take."""
    h = hexs.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(round(v, 4) for v in out)

if STYLE == "film":
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "film_materials.py")).read())
    # the same restrained palette, now as the colours of real materials
    P.update(
        timber=_lin("#4A3426"), timber_dark=_lin("#2A1D16"), desk=_lin("#3A281C"), stone=_lin("#A39C8C"), porcelain=_lin("#F0E8D6"),
        chair=_lin("#9A9585"), floor=_lin("#1A2528"), floor2=_lin("#0C1315"), rug=_lin("#6B6F5E"), brass=_lin("#B08D57"), frame=_lin("#232B2C"),
        terracotta=_lin("#4B3A2C"), paper=_lin("#E8DFCF"), red=_lin("#7A1F1B"), leaf=_lin("#3E5A4A"), leaf_dark=_lin("#27382E"), leaf_light=_lin("#5C7C66"),
    )
if STYLE == "toon":
    # the locked palette: shadows #0F1F24, foliage #3E5A4A, brass #B08D57, paper #E8DFCF, amber #E0A458 (under a tenth of the frame)
    _fol = _lin("#3E5A4A")
    P.update(
        floor=_lin("#16292E"), floor2=_lin("#223A40"), brass=_lin("#B08D57"), paper=_lin("#E8DFCF"),
        leaf=_fol, leaf_dark=tuple(round(c * 0.55, 4) for c in _fol), leaf_light=tuple(round(min(1, c * 1.5), 4) for c in _fol),
        # the material language: dark walnut, warm natural stone, linen over charcoal, aged bronze where there was terracotta
        timber=_lin("#4A3426"), timber_dark=_lin("#2A1D16"), stone=_lin("#8C877D"), chair=_lin("#55605C"), terracotta=_lin("#4B3A2C"),
    )
if STYLE == "sable":
    # lighter and more chalky than the toon palette, so that a flat fill reads as a colour rather than as a dark; the lamp stays the only strong warm
    P.update(
        timber=(0.54, 0.31, 0.18), timber_dark=(0.27, 0.16, 0.12), frame=(0.17, 0.30, 0.42), floor=(0.62, 0.55, 0.44), floor2=(0.50, 0.44, 0.36),
        rug=(0.60, 0.20, 0.17), leaf=(0.15, 0.42, 0.30), leaf_dark=(0.07, 0.25, 0.21), leaf_light=(0.34, 0.62, 0.38), terracotta=(0.76, 0.35, 0.22),
        porcelain=(0.96, 0.94, 0.87), stone=(0.60, 0.62, 0.60), brass=(0.88, 0.62, 0.20), paper=(0.95, 0.90, 0.78), chair=(0.17, 0.40, 0.44),
        red=(0.80, 0.17, 0.14), desk=(0.17, 0.22, 0.24), sage=(0.50, 0.62, 0.50),
    )
P.update(MOOD["P"])
M = {k: toon(k, v) for k, v in P.items()}
M["floor_soft"] = toon("floor_soft", P["floor"], bands=((0.0, 0.5), (0.16, 0.7), (0.5, 0.82), (0.86, 0.92)) if STYLE == "toon" else ((0.0, 0.46), (0.16, 0.78), (0.5, 1.0), (0.86, 1.14)), mottle=0.2, scale=1.4)
M["frame"] = toon("frame", P["frame"], mottle=0.0)
M["leaf_soft"] = toon("leaf_soft", P["leaf"], bands=((0.0, 0.5), (0.3, 0.85), (0.7, 1.1)), mottle=0.22, scale=5)
M["leaf_dark_soft"] = toon("leaf_dark_soft", P["leaf_dark"], bands=((0.0, 0.6), (0.5, 1.0), (0.85, 1.25)), mottle=0.15, scale=6)
M["leaf_light_soft"] = toon("leaf_light_soft", P["leaf_light"], bands=((0.0, 0.5), (0.3, 0.85), (0.7, 1.1)), mottle=0.2, scale=5)
M["glass"] = glass_mat()
M["lamp"] = lampshade("lampshade", _lin("#E0A458"), 2.6) if STYLE == "film" else flat("lampglow", _lin("#E0A458") if STYLE == "toon" else (1.0, 0.68, 0.30), 2.4 if STYLE == "toon" else 4.0)
M["window"] = flat("window", (1.0, 0.70, 0.36), 2.0)

# ---------------------------------------------------------------- geometry helpers
# Every object is registered in the group that is current when it is made, so the layers script can render one group at a time.
GROUPS = {}
_cur = [None]

def begin(name):
    _cur[0] = name

def link(ob, c):
    c.objects.link(ob)
    if _cur[0]:
        GROUPS.setdefault(_cur[0], []).append(ob)
    return ob

def box(name, size, center, mat, c=C_INK, rot=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.rotation_euler = rot
    if mat:
        me.materials.append(mat)
    if parent:
        ob.parent = parent
    return link(ob, c)

def cyl(name, r1, r2, depth, center, mat, c=C_INK, rot=(0, 0, 0), seg=28, parent=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.rotation_euler = rot
    if mat:
        me.materials.append(mat)
    if parent:
        ob.parent = parent
    return link(ob, c)

def sphere(name, r, center, mat, c=C_SOFT, scale=(1, 1, 1), seg=18, parent=None, rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.scale = scale
    ob.rotation_euler = rot
    if mat:
        me.materials.append(mat)
    if parent:
        ob.parent = parent
    return link(ob, c)

def empty(name, loc, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.rotation_euler = rot
    sc.collection.objects.link(e)
    return e

def tube(name, splines, radius, mat, c=C_INK, taper=None):
    """A bundle of poly lines, each given a round section: ribs, rails, branches."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    for pts in splines:
        sp = cu.splines.new("POLY")
        sp.points.add(len(pts) - 1)
        for i, p in enumerate(pts):
            sp.points[i].co = (p[0], p[1], p[2], 1)
    ob = bpy.data.objects.new(name, cu)
    if mat:
        cu.materials.append(mat)
    return link(ob, c)

def tapered_curve(name, pts, r0, mat, c=C_SOFT):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = r0
    cu.bevel_resolution = 3
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = 1.0 - 0.75 * i / max(1, len(pts) - 1)
    ob = bpy.data.objects.new(name, cu)
    cu.materials.append(mat)
    return link(ob, c)

if STYLE == "film":
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "furniture_film.py")).read())

# ---------------------------------------------------------------- the glasshouse
A, WALL_H, VAULT_H = 3.3, 1.15, 2.55  # half width, height of the vertical glass, rise of the vault
Y0, Y1 = -6.0, 9.0
RIBS = [Y0 + i * 2.5 for i in range(int((Y1 - Y0) / 2.5) + 1)]

def arch_pts(y, n=40, inset=0.0):
    pts = [(A - inset, y, 0.0), (A - inset, y, WALL_H)]
    for k in range(1, n):
        th = math.pi * k / n
        pts.append(((A - inset) * math.cos(th), y, WALL_H + (VAULT_H - inset) * math.sin(th)))
    pts += [(-(A - inset), y, WALL_H), (-(A - inset), y, 0.0)]
    return pts

begin("frame")
FR = 0.5 if STYLE == "film" else 1.0   # a believable steel section, not a pipe
tube("ribs", [arch_pts(y) for y in RIBS], 0.095 * FR, M["frame"])
purl = []
for th in (0, 45, 90, 135, 180):
    t = math.radians(th)
    x, z = A * math.cos(t), WALL_H + VAULT_H * math.sin(t)
    purl.append([(x, Y0, z), (x, Y1, z)])
tube("purlins", purl, 0.05 * FR, M["frame"])
# the far end: an arched glass wall with mullions
end = [arch_pts(Y1)]
for x in (-1.65, 0.0, 1.65):
    top = WALL_H + VAULT_H * math.sqrt(max(0.0, 1 - (x / A) ** 2))
    end.append([(x, Y1, 0), (x, Y1, top)])
end.append([(-A, Y1, WALL_H), (A, Y1, WALL_H)])
tube("endwall", end, 0.07 * FR, M["frame"])
if STYLE == "film":
    # the glazing sits on a low honed-stone upstand, as it would in a real conservatory
    _wall = toon("stone", _lin("#6A665C"))
    for _sx in (-1, 1):
        box("upstand", (0.22, Y1 - Y0, 0.42), (_sx * (A + 0.11), (Y0 + Y1) / 2, 0.21), _wall, C_INK)
    box("upstand_end", (2 * A + 0.44, 0.22, 0.42), (0, Y1 + 0.11, 0.21), _wall, C_INK)

def vault_glass():
    me = bpy.data.meshes.new("glass")
    bm = bmesh.new()
    ny = 14
    ys = [Y0 + (Y1 - Y0) * i / ny for i in range(ny + 1)]
    prof = [(A, 0.0), (A, WALL_H)] + [(A * math.cos(math.pi * k / 36), WALL_H + VAULT_H * math.sin(math.pi * k / 36)) for k in range(1, 36)] + [(-A, WALL_H), (-A, 0.0)]
    rows = [[bm.verts.new((x, y, z)) for (x, z) in prof] for y in ys]
    for i in range(ny):
        for j in range(len(prof) - 1):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]))
    # the far end
    pts = [(-A, 0.0)] + [(x, 0.0) for x in (-A, A)]
    arc = [(A * math.cos(math.pi * k / 36), WALL_H + VAULT_H * math.sin(math.pi * k / 36)) for k in range(0, 37)]
    ring = [bm.verts.new((x, Y1, z)) for (x, z) in [(A, 0.0), (A, WALL_H)] + arc[1:-1] + [(-A, WALL_H), (-A, 0.0)]]
    try:
        bm.faces.new(ring)
    except ValueError:
        pass
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("glass", me)
    me.materials.append(M["glass"])
    return link(ob, C_SOFT)

begin("glass")
vault_glass()

begin("floor")
# floor: dark teal-black stone, a few large slabs, and the ground outside
fl = box("floor", (2 * A, Y1 - Y0, 0.05), (0, (Y0 + Y1) / 2, -0.025), M["floor_soft"], C_SOFT)
for i in range(int((Y1 - Y0) / 1.2) + 1):
    box(f"tileline{i}", (2 * A, 0.012, 0.004), (0, Y0 + i * 1.2, 0.002), M["floor2"], C_SOFT)
for i in range(-3, 4):
    box(f"tilelinex{i}", (0.012, Y1 - Y0, 0.004), (i * 1.2, (Y0 + Y1) / 2, 0.002), M["floor2"], C_SOFT)
FLATS_GROUND = flat("ground", (0.1, 0.1, 0.1), 1.0)
begin("sky")
box("ground", (900, 900, 0.1), (0, 60, -0.12), FLATS_GROUND, C_SOFT)
begin("floor")

def decal(name, size, center, color, strength, power=2.0, c=C_SOFT, rot=0.0):
    """A soft-edged glow lying flat on a surface: the warm pool of lamplight, a reflection of the lamp in polished stone."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    vs = [bm.verts.new((x * size[0] / 2, y * size[1] / 2, 0)) for (x, y) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.rotation_euler = (0, 0, rot)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.surface_render_method = "BLENDED"
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    mixs = nt.nodes.new("ShaderNodeMixShader")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (0.5, 0.5, 0.0)
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.5
    mr.inputs["From Max"].default_value = 0.0
    mr.clamp = True
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = power
    nt.links.new(tc.outputs["UV"], sub.inputs[0])
    nt.links.new(sub.outputs[0], ln.inputs[0])
    nt.links.new(ln.outputs["Value"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], pw.inputs[0])
    nt.links.new(pw.outputs[0], mixs.inputs[0])
    nt.links.new(tr.outputs[0], mixs.inputs[1])
    nt.links.new(em.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], out.inputs[0])
    me.materials.append(m)
    return link(ob, c)

rug = cyl("rug", 1.9, 1.9, 0.014, (0.1, 2.1, 0.012), M["rug"], C_SOFT, seg=48)
rug.scale = (1.0, 0.68, 1.0)
rug2 = cyl("rugedge", 2.0, 2.0, 0.012, (0.1, 2.1, 0.008), toon("rugedge", (0.30, 0.20, 0.14)), C_SOFT, seg=48)
rug2.scale = (1.0, 0.68, 1.0)

# ---------------------------------------------------------------- the credenza, the turntable, the lamp
begin("credenza")
cred = empty("credenza", (0.45, 3.0, 0), (0, 0, math.radians(8)))
if STYLE == "film":
    film_credenza(cred)
else:
    box("cred_body", (2.4, 0.5, 0.5), (0, 0, 0.45), M["timber"], C_INK, parent=cred)
    box("cred_top", (2.46, 0.54, 0.035), (0, 0, 0.7), M["timber_dark"], C_INK, parent=cred)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl("cred_leg", 0.026, 0.016, 0.2, (sx * 1.1, sy * 0.2, 0.1), M["timber_dark"], C_INK, parent=cred, seg=10)
    for i, x in enumerate((-0.8, 0.0, 0.8)):
        box(f"cred_door{i}", (0.74, 0.012, 0.4), (x, -0.256, 0.45), M["timber_dark"], C_INK, parent=cred)
        cyl("handle", 0.012, 0.012, 0.025, (x + (0.28 if i != 1 else -0.28), -0.272, 0.45), M["brass"], C_INK, rot=(math.radians(90), 0, 0), parent=cred, seg=10)
tt = (-0.26, 0.0, 0.7)   # beside the lamp
begin("tt_base")
box("tt_plinth", (0.58, 0.44, 0.08), (tt[0], tt[1], tt[2] + 0.057), M["timber_dark"], C_INK, parent=cred)
begin("tt_platter")
cyl("platter", 0.175, 0.175, 0.012, (tt[0] - 0.06, tt[1], tt[2] + 0.104), toon("platter", (0.05, 0.05, 0.06), bands=((0.0, 0.9), (0.5, 1.25))), C_INK, parent=cred, seg=40)
cyl("platter_label", 0.055, 0.055, 0.014, (tt[0] - 0.06, tt[1], tt[2] + 0.106), toon("label", (0.78, 0.40, 0.20)), C_INK, parent=cred, seg=24)
begin("tt_arm_room")
tube("tonearm", [[(tt[0] + 0.2, tt[1] + 0.13, tt[2] + 0.115), (tt[0] - 0.05, tt[1] + 0.02, tt[2] + 0.118)]], 0.006, M["brass"], C_INK)
bpy.data.objects["tonearm"].parent = cred
begin("tt_base")
cyl("tt_pivot", 0.025, 0.025, 0.05, (tt[0] + 0.2, tt[1] + 0.13, tt[2] + 0.12), M["brass"], C_INK, parent=cred, seg=12)
# the lamp: its shade is the brightest thing in the room
begin("lamp")
lp = (-0.85, 0.0, 0.7)
if STYLE == "film":
    film_lamp(cred, lp)
else:
    cyl("lamp_base", 0.06, 0.07, 0.24, (lp[0], lp[1], lp[2] + 0.12), M["brass"], C_INK, parent=cred, seg=18)
    cyl("lamp_shade", 0.19, 0.11, 0.24, (lp[0], lp[1], lp[2] + 0.34), M["lamp"], C_INK, parent=cred, seg=24)
ll = bpy.data.lights.new("lamp", "POINT")
ll.color = (1.0, 0.68, 0.34)
ll.energy = float(os.environ.get("LAMP", "700"))
ll.shadow_soft_size = 0.1
lo = bpy.data.objects.new("lamp", ll)
lo.location = (cred.location.x + lp[0] * 0.99, cred.location.y + lp[0] * 0.14, 1.08)
sc.collection.objects.link(lo)

# the lamp's warm pool on the rug and floor, and its reflection in the polished stone in front of the credenza
begin("floor")
decal("lamp_pool", (4.2, 3.2), (-0.15, 2.3, 0.02), (1.0, 0.62, 0.28), 1.1, power=2.2)
decal("lamp_reflection", (0.7, 3.2), (-0.32, 1.45, 0.021), (1.0, 0.72, 0.4), 1.5, power=1.6, rot=math.radians(-6))

# ---------------------------------------------------------------- the moon jar (on the floor, beside the credenza)
def moon_jar(center, scale):
    prof = [(0.0, 0.0), (0.046, 0.0), (0.052, 0.008), (0.048, 0.016), (0.074, 0.03), (0.106, 0.07), (0.126, 0.125), (0.131, 0.178), (0.12, 0.236), (0.094, 0.286), (0.066, 0.318), (0.06, 0.336), (0.067, 0.35), (0.07, 0.357), (0.063, 0.359)]
    if STYLE == "film" and os.environ.get("JARSMOOTH", "1") == "1":
        def _cr(p0, p1, p2, p3, t):
            return tuple(0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t ** 3) for i in range(2))
        pts = [prof[0]] + list(prof) + [prof[-1]]
        sm = []
        for i in range(1, len(pts) - 2):
            for k in range(10):
                q = _cr(pts[i - 1], pts[i], pts[i + 1], pts[i + 2], k / 10)
                sm.append((max(0.0, q[0]), q[1]))
        sm.append(prof[-1])
        prof = sm
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=96 if STYLE == "film" else 64, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("jar")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("jar", me)
    ob.location = center
    ob.scale = (scale, scale, scale)
    me.materials.append(toon("porcelain", P["porcelain"], bands=((0.0, 0.62), (0.2, 0.9), (0.6, 1.05), (0.9, 1.2)), mottle=0.05))
    return link(ob, C_INK)

begin("jar")
(soft_box if STYLE == "film" and os.environ.get("PLINTH", "1") == "1" else box)("jar_plinth", (0.46, 0.46, 0.3), (1.35, 1.5, 0.15), M["stone"], C_INK, **({"bevel": 0.012, "segs": 3} if STYLE == "film" and os.environ.get("PLINTH", "1") == "1" else {}))
moon_jar((1.35, 1.5, 0.3), 1.5)

# ---------------------------------------------------------------- armchair, a stone table, tea
begin("chair")
chair = empty("chair", (-1.45, 1.4, 0), (0, 0, math.radians(-40)))
if STYLE == "film":
    film_chair(chair)
else:
    box("seat", (0.66, 0.62, 0.11), (0, 0, 0.42), M["chair"], C_INK, parent=chair)
    box("back", (0.66, 0.1, 0.52), (0, 0.3, 0.7), M["chair"], C_INK, rot=(math.radians(-14), 0, 0), parent=chair)
    for sx in (-1, 1):
        box("arm", (0.07, 0.56, 0.06), (sx * 0.34, 0.0, 0.62), M["timber"], C_INK, parent=chair)
        box("armpost", (0.05, 0.05, 0.22), (sx * 0.34, -0.22, 0.5), M["timber"], C_INK, parent=chair)
        for sy in (-1, 1):
            cyl("chair_leg", 0.026, 0.014, 0.4, (sx * 0.26, sy * 0.24, 0.2), M["timber"], C_INK, rot=(sy * math.radians(8), sx * math.radians(-8), 0), parent=chair, seg=10)
# ---------------------------------------------------------------- a low table in front of the chair, with a game of Baduk on it
begin("coffee")
_chair_fwd = Vector((math.sin(math.radians(-40)), -math.cos(math.radians(-40)), 0))   # the way the armchair faces
CT_CENTRE = Vector((chair.location.x, chair.location.y, 0)) + _chair_fwd * 0.98
if STYLE == "film":
    GO_TOP = film_coffee_table(CT_CENTRE, math.radians(-40))
else:
    _ct = empty("coffee_table", (CT_CENTRE.x, CT_CENTRE.y, 0), (0, 0, math.radians(-40)))
    box("ct_top", (0.78, 0.78, 0.04), (0, 0, 0.4), M["timber"], C_INK, parent=_ct)
    for _sx in (-1, 1):
        for _sy in (-1, 1):
            cyl("ct_leg", 0.014, 0.027, 0.38, (_sx * 0.33, _sy * 0.33, 0.19), M["timber_dark"], C_INK, parent=_ct, seg=10)
    box("ct_board", (0.5, 0.5, 0.035), (0, 0, 0.4375), toon("kaya", (0.78, 0.62, 0.36)), C_INK, parent=_ct)
    bpy.context.view_layer.update()
    GO_TOP = [_ct.matrix_world @ Vector((lx, ly, 0.455)) for lx, ly in ((-0.25, 0.25), (0.25, 0.25), (0.25, -0.25), (-0.25, -0.25))]

begin("tea")
TBL = (-0.5, 1.95)
cyl("stone_table", 0.31, 0.25, 0.46, (TBL[0], TBL[1], 0.23), M["stone"], C_INK, seg=32)
cyl("tea_tray", 0.12, 0.12, 0.012, (TBL[0] + 0.15, TBL[1] + 0.07, 0.466), M["timber_dark"], C_INK, seg=24)
sphere("teapot", 0.06, (TBL[0] + 0.14, TBL[1] + 0.08, 0.525), M["porcelain"], C_INK, scale=(1.0, 1.0, 0.8))
cyl("teapot_spout", 0.011, 0.006, 0.07, (TBL[0] + 0.2, TBL[1] + 0.08, 0.54), M["porcelain"], C_INK, rot=(0, math.radians(60), 0), seg=10)
sphere("teapot_lid", 0.02, (TBL[0] + 0.14, TBL[1] + 0.08, 0.58), M["porcelain"], C_INK)
for dx, dy in ((0.07, 0.0), (0.2, 0.0)):
    cyl("cup", 0.029, 0.024, 0.04, (TBL[0] + dx + 0.04, TBL[1] + 0.03 + dy, 0.495), M["porcelain"], C_INK, seg=14)
# the tale: an open book on the table, turned toward whoever stands where the camera is
begin("book")
bk = empty("bookroot", (TBL[0] - 0.07, TBL[1] - 0.04, 0.472), (0, 0, math.radians(-14)))
box("book_cover", (0.46, 0.31, 0.02), (0, 0, 0.01), toon("cover", (0.10, 0.14, 0.38), mottle=0.0), C_INK, parent=bk)
box("book_spine", (0.014, 0.31, 0.026), (0, 0, 0.013), M["brass"], C_INK, parent=bk)
pg = toon("page", P["paper"], mottle=0.03)
for sx, rz in ((-1, 5), (1, -5)):
    box("page", (0.205, 0.285, 0.02), (sx * 0.108, 0, 0.026), pg, C_INK, rot=(0, math.radians(rz), 0), parent=bk)
# a sun and a moon on the two pages: a flat vermilion disc and a pale one, and a few lines of text under each
cyl("book_sun", 0.05, 0.05, 0.002, (-0.108, 0.02, 0.0375), flat("booksun", (0.86, 0.22, 0.14), 1.0), C_INK, parent=bk, seg=28)
cyl("book_moon", 0.044, 0.044, 0.002, (0.108, 0.02, 0.0375), flat("bookmoon", (0.98, 0.94, 0.78), 1.0), C_INK, parent=bk, seg=28)
for sx in (-1, 1):
    for i in range(4):
        box("txt", (0.15, 0.011, 0.0015), (sx * 0.108, -0.06 - i * 0.04, 0.0375), flat("text", (0.20, 0.18, 0.16), 0.6), C_SOFT, parent=bk)

# ---------------------------------------------------------------- a bonsai on a stone plinth
begin("bonsai")
box("plinth", (0.46, 0.46, 0.86), (-2.35, 4.6, 0.43), M["stone"], C_INK)
cyl("bonsai_pot", 0.22, 0.18, 0.08, (-2.35, 4.6, 0.9), toon("potglaze", (0.18, 0.28, 0.40)), C_INK, seg=24)
tapered_curve("trunk", [(-2.35, 4.6, 0.93), (-2.32, 4.63, 1.12), (-2.44, 4.58, 1.26), (-2.28, 4.64, 1.38)], 0.035, M["timber_dark"])
for i, (dx, dy, dz, r) in enumerate(((0.12, 0.05, 1.46, 0.2), (-0.14, 0.0, 1.32, 0.17), (0.2, 0.04, 1.22, 0.15), (-0.02, -0.06, 1.55, 0.14), (0.02, 0.08, 1.38, 0.16))):
    if STYLE == "film":
        leafy(f"pad{i}", (-2.35 + dx, 4.6 + dy, dz), (r * 1.15, r * 1.15, r * 0.34), 150, 0.05, M["leaf_light_soft"], seed=40 + i, droop=0.5)
    else:
        sphere(f"pad{i}", r, (-2.35 + dx, 4.6 + dy, dz), M["leaf_soft"], C_SOFT, scale=(1.0, 1.0, 0.5), seg=16)

# ---------------------------------------------------------------- plants: leaves are strips; a fern is a spine with leaflets
def blade(name, base, yaw, length, lift, droop, width, mat, c=C_SOFT, seg=8):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = []
    for i in range(seg + 1):
        t = i / seg
        d = length * t
        pts.append((d * math.cos(yaw), d * math.sin(yaw), lift * t - droop * t * t))
    left, right = [], []
    for i, p in enumerate(pts):
        t = i / seg
        w = width * math.sin(math.pi * min(1.0, 0.18 + t * 0.82)) * (1 - 0.15 * t)
        nx, ny = -math.sin(yaw), math.cos(yaw)
        left.append(bm.verts.new((p[0] + nx * w, p[1] + ny * w, p[2])))
        right.append(bm.verts.new((p[0] - nx * w, p[1] - ny * w, p[2])))
    for i in range(seg):
        bm.faces.new((left[i], left[i + 1], right[i + 1], right[i]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = base
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return link(ob, c)

def fern(base, fronds, length, mat, spread=1.0):
    for i in range(fronds):
        yaw = (i / fronds) * math.pi * 2 + random.uniform(-0.2, 0.2)
        L = length * random.uniform(0.7, 1.1)
        lift = L * random.uniform(0.5, 0.9)
        droop = L * random.uniform(0.5, 0.9) * spread
        blade(f"frond{i}", base, yaw, L, lift, droop, 0.05 * L, mat, seg=10)
        # leaflets down each side
        seg = 11
        for k in range(2, seg):
            t = k / seg
            d = L * t
            px, py, pz = d * math.cos(yaw), d * math.sin(yaw), lift * t - droop * t * t
            for s in (-1, 1):
                ang = yaw + s * math.radians(78)
                ll = L * 0.17 * (1 - 0.55 * t)
                blade(f"leaflet{i}_{k}_{s}", (base[0] + px, base[1] + py, base[2] + pz), ang, ll, ll * 0.1, ll * 0.5, 0.035 * ll, mat, seg=3)

begin("fern_front")
fern((-2.7, -0.3, 0.0), 12, 2.5, M["leaf_dark_soft"], spread=1.0)           # the big dark fern, close to the camera on the left, out of focus
fern((-2.9, 0.6, 0.0), 9, 1.5, M["leaf_dark_soft"])
begin("plants")
fern((2.7, 1.3, 0.0), 8, 1.2, M["leaf_soft"])
fern((-0.2, 6.6, 0.0), 6, 0.9, M["leaf_light_soft"])
fern((1.2, 6.2, 0.0), 6, 0.8, M["leaf_soft"])
# a flowering camellia against the left wall
begin("camellia")
if STYLE == "film":
    leafy("camellia_leaves", (-2.8, 2.9, 0.95), (0.3, 0.7, 0.48), 1100, 0.12, M["leaf_soft"], seed=7, droop=0.35)
else:
  for i in range(10):
    sphere(f"cam{i}", random.uniform(0.2, 0.32), (-2.8 + random.uniform(-0.25, 0.25), 2.9 + random.uniform(-0.5, 0.6), 0.55 + random.uniform(0, 0.8)), M["leaf_soft"], C_SOFT, scale=(1, 1, 0.8), seg=12)
for i in range(7):
    sphere(f"flower{i}", 0.05, (-2.55 + random.uniform(-0.3, 0.15), 2.7 + random.uniform(-0.6, 0.6), 0.6 + random.uniform(0, 0.9)), toon("flower", P["red"], mottle=0.0), C_SOFT)
# big-leaved plants on the right
begin("plants")
for base in ((2.75, 3.2, 0.0), (2.6, 7.6, 0.0), (-2.7, 7.4, 0.0), (-2.9, 5.8, 0.0)):
    for i in range(9):
        yaw = (i / 9) * math.pi * 2 + random.uniform(-0.2, 0.2)
        blade(f"big{i}", base, yaw, random.uniform(0.9, 1.4), random.uniform(0.7, 1.2), random.uniform(0.2, 0.5), 0.12, M["leaf_light_soft"] if i % 3 == 0 else M["leaf_soft"])
# pots
for (x, y) in ((2.95, 2.1), (-2.95, 3.4)):
    cyl("pot", 0.2, 0.15, 0.32, (x, y, 0.16), M["terracotta"], C_INK, seg=20)

# ---------------------------------------------------------------- the six-panel folding screen: one panel for each chapter
begin("screen")
screen = empty("screen", (2.0, 4.3, 0), (0, 0, math.radians(-30)))
open_cols = [(0.88, 0.80, 0.62), (0.70, 0.78, 0.74)]
for i in range(6):
    px = -1.1 + i * 0.44
    zig = math.radians(26) * (1 if i % 2 == 0 else -1)
    panel = empty(f"panel{i}", (px, 0, 0), (0, 0, zig))
    panel.parent = screen
    box(f"pframe{i}", (0.46, 0.035, 1.75), (0, 0, 1.0), M["timber_dark"], C_INK, parent=panel)
    box(f"ppaper{i}", (0.38, 0.014, 1.62), (0, -0.02, 1.0), toon(f"paper{i}", P["paper"], mottle=0.1), C_INK, parent=panel)
    if not LAYERS:
        if i < 2:
            box(f"poster{i}", (0.28, 0.006, 0.4), (0, -0.03, 1.2), toon(f"poster{i}", open_cols[i], mottle=0.05), C_INK, parent=panel)
            sphere(f"posterdot{i}", 0.05, (0, -0.036, 1.25), flat("dot", (0.1, 0.09, 0.1), 1.0), C_INK, scale=(1, 0.2, 1), parent=panel)
        else:
            box(f"empty{i}", (0.28, 0.006, 0.4), (0, -0.03, 1.2), toon(f"empty{i}", (0.07, 0.06, 0.06), mottle=0.0), C_INK, parent=panel)
            box(f"plate{i}", (0.1, 0.005, 0.034), (0, -0.034, 0.9), M["brass"], C_INK, parent=panel)

# the lower half of every panel carries a stretch of one continuous painting: five jade peaks (the middle one tallest) over blue waves,
# after the Sun-Moon-Five-Peaks screen that stood behind the Joseon throne. Under the posters, so the chapters stay the subject.
def _peak_h(x):
    h = 0.0
    for cx_, ph, wd in ((-1.02, 0.30, 0.34), (-0.52, 0.44, 0.36), (0.0, 0.56, 0.40), (0.52, 0.44, 0.36), (1.02, 0.30, 0.34)):
        h = max(h, ph * max(0.0, 1 - abs(x - cx_) / wd) ** 0.8)
    return h
for i in range(6 if os.environ.get("SCREEN_ART") == "1" else 0):
    gx = -1.1 + i * 0.44
    pn = bpy.data.objects[f"panel{i}"]
    for nm, col, hscale, z0 in (("peaks_far", (0.20, 0.52, 0.50), 1.0, 0.24), ("peaks_near", (0.10, 0.36, 0.40), 0.72, 0.24)):
        me_ = bpy.data.meshes.new(f"{nm}{i}")
        bm_ = bmesh.new()
        xs_ = [-0.17 + k * 0.34 / 8 for k in range(9)]
        bot = [bm_.verts.new((x, -0.0305, z0)) for x in xs_]
        topv = [bm_.verts.new((x, -0.0305, z0 + 0.02 + _peak_h(gx + x + (0.1 if nm == "peaks_near" else 0)) * hscale)) for x in xs_]
        for k in range(8):
            bm_.faces.new((bot[k], bot[k + 1], topv[k + 1], topv[k]))
        bm_.to_mesh(me_)
        bm_.free()
        ob_ = bpy.data.objects.new(f"{nm}{i}", me_)
        me_.materials.append(toon(f"{nm}m", col, mottle=0.0))
        ob_.parent = pn
        link(ob_, C_INK)
    me_ = bpy.data.meshes.new(f"waves{i}")
    bm_ = bmesh.new()
    xs_ = [-0.17 + k * 0.34 / 12 for k in range(13)]
    bot = [bm_.verts.new((x, -0.031, 0.20)) for x in xs_]
    topv = [bm_.verts.new((x, -0.031, 0.27 + 0.025 * math.sin((gx + x) * 22.0))) for x in xs_]
    for k in range(12):
        bm_.faces.new((bot[k], bot[k + 1], topv[k + 1], topv[k]))
    bm_.to_mesh(me_)
    bm_.free()
    ob_ = bpy.data.objects.new(f"waves{i}", me_)
    me_.materials.append(toon("wavesm", (0.12, 0.22, 0.46), mottle=0.0))
    ob_.parent = pn
    link(ob_, C_INK)

# ---------------------------------------------------------------- hanji lanterns hanging from the vault, in the five traditional colours
begin("lanterns")
LANT = [(40, 0.9, (0.92, 0.24, 0.16)), (62, 0.55, (0.98, 0.84, 0.36)), (84, 1.05, (0.96, 0.95, 0.88)), (106, 0.6, (0.22, 0.42, 0.78)), (128, 0.95, (0.98, 0.84, 0.36)), (150, 0.5, (0.92, 0.24, 0.16))]
for i, (deg, drop, col) in enumerate(LANT if os.environ.get("LANTERNS") == "1" else []):
    th = math.radians(deg)
    x0, z0 = A * 0.96 * math.cos(th), WALL_H + VAULT_H * 0.96 * math.sin(th)
    ly = 4.0 + (0.35 if i % 2 else -0.2)
    tube(f"lstring{i}", [[(x0, ly, z0), (x0, ly, z0 - drop)]], 0.004, M["timber_dark"], C_INK)
    sphere(f"lantern{i}", 0.15, (x0, ly, z0 - drop - 0.17), flat(f"lant{i}", col, 2.4), C_INK, scale=(1.0, 1.0, 1.2), seg=18)
    cyl(f"lcap{i}", 0.05, 0.05, 0.03, (x0, ly, z0 - drop - 0.01), M["timber_dark"], C_INK, seg=10)
    cyl(f"lfoot{i}", 0.04, 0.04, 0.03, (x0, ly, z0 - drop - 0.36), M["timber_dark"], C_INK, seg=10)

# ---------------------------------------------------------------- the desk in the foreground, with an open book and a pencil
begin("desk")
desk = empty("desk", (2.55, 0.9, 0), (0, 0, math.radians(-16)))
desk.scale = (0.62, 0.62, 0.62)
if STYLE == "film":
    box("desk_top", (1.3, 0.78, 0.045), (0, 0, 0.77), M["timber"], C_INK, parent=desk)
    for _sx in (-1, 1):
        for _sy in (-1, 1):
            cyl("desk_leg", 0.014, 0.03, 0.75, (_sx * 0.58, _sy * 0.32, 0.375), M["timber_dark"], C_INK, rot=(_sy * math.radians(3), -_sx * math.radians(3), 0), parent=desk, seg=12)
    box("desk_apron", (1.18, 0.7, 0.08), (0, 0, 0.7), M["timber_dark"], C_INK, parent=desk)
    box("desk_drawer", (0.5, 0.02, 0.09), (0.25, -0.375, 0.7), M["timber"], C_INK, parent=desk)
    box("desk_pull", (0.12, 0.016, 0.012), (0.25, -0.392, 0.7), M["brass"], C_INK, parent=desk)
else:
    box("desk_top", (1.3, 0.8, 0.06), (0, 0, 0.78), M["timber_dark"], C_INK, parent=desk)
    box("desk_body", (1.22, 0.72, 0.75), (0, 0, 0.375), M["timber_dark"], C_INK, parent=desk)
    box("desk_back", (1.3, 0.07, 0.3), (0, 0.37, 0.96), M["timber_dark"], C_INK, parent=desk)
begin("desk")
cyl("pencil", 0.005, 0.005, 0.2, (0.05, -0.12, 0.84), flat("pencil", (0.85, 0.7, 0.3), 1.0), C_INK, rot=(0, math.radians(90), math.radians(-12)), parent=desk, seg=6)
begin("desk")
for (x, y) in ((0.62, 0.2), (0.45, 0.3)):
    cyl("dpot", 0.07, 0.055, 0.1, (x, y, 0.88), M["terracotta"], C_INK, parent=desk, seg=16)
    sphere("dplant", 0.1, (x, y, 1.0), M["leaf_soft"], C_SOFT, scale=(1, 1, 0.8), parent=desk, seg=10)

# ---------------------------------------------------------------- outside: dusk sky, hills, the old town's roofs, a modern skyline, a tower
begin("sky")
w = bpy.data.worlds.new("dusk")
sc.world = w
w.use_nodes = True
nt = w.node_tree
nt.nodes.clear()
wo = nt.nodes.new("ShaderNodeOutputWorld")
bg2 = nt.nodes.new("ShaderNodeBackground")
bg2.inputs["Color"].default_value = ((0.62, 0.74, 0.82, 1) if STYLE == "sable" else (0.15, 0.27, 0.32, 1) if STYLE == "film" else (*MOOD["ambient"], 1))
bg2.inputs["Strength"].default_value = float(os.environ.get("AMBIENT", "0.6" if STYLE == "sable" else "0.55" if STYLE == "film" else "0.22"))
nt.links.new(bg2.outputs[0], wo.inputs[0])

def sky_dome():
    """What you see through the glass: a glow at the horizon rising to deep teal, blotchy like a wash of watercolour."""
    R = 380.0
    me = bpy.data.meshes.new("dome")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=24, radius=R)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("dome", me)
    ob.location = (0, 60, 0)
    m = bpy.data.materials.new("skymat")
    m.use_nodes = True
    n = m.node_tree
    n.nodes.clear()
    out = n.nodes.new("ShaderNodeOutputMaterial")
    em = n.nodes.new("ShaderNodeEmission")
    tc = n.nodes.new("ShaderNodeTexCoord")
    sep = n.nodes.new("ShaderNodeSeparateXYZ")
    div = n.nodes.new("ShaderNodeMath")
    div.operation = "DIVIDE"
    div.inputs[1].default_value = R
    ramp = n.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    els = ramp.color_ramp.elements
    stops = MOOD["sky"]
    els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
    els[1].position, els[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = els.new(pos)
        e.color = (*col, 1)
    nz = n.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.0
    nz.inputs["Detail"].default_value = 4
    nz.inputs["Roughness"].default_value = 0.65
    mp = n.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 1.0, 3.4)
    mr = n.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = 0.78
    mr.inputs["To Max"].default_value = 1.28
    wash = n.nodes.new("ShaderNodeMix")
    wash.data_type = "RGBA"
    wash.blend_type = "MULTIPLY"
    wash.inputs[0].default_value = 1.0
    n.links.new(tc.outputs["Object"], sep.inputs[0])
    n.links.new(sep.outputs["Z"], div.inputs[0])
    n.links.new(div.outputs[0], ramp.inputs["Fac"])
    n.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    n.links.new(mp.outputs[0], nz.inputs["Vector"])
    n.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    n.links.new(ramp.outputs[0], wash.inputs[6])
    n.links.new(mr.outputs["Result"], wash.inputs[7])
    n.links.new(wash.outputs[2], em.inputs[0])
    n.links.new(em.outputs[0], out.inputs[0])
    me.materials.append(m)
    return link(ob, C_SKY)

sky_dome()

# ---- the far world, restrained: the teal hills, a modern skyline, and a small, low-contrast old town (curved hanok roofs, one palace
# gate) pushed far back. All flat colours, set per time of day by glasshouse_layers.py, so the same shapes serve all three sky plates.
FLATS = {k: flat(k, (0.3, 0.3, 0.3), 1.0) for k in ("far", "mid", "near", "roof", "gate")}
FLATS_GROUND_NODE = FLATS_GROUND
FLATS["ground"] = FLATS_GROUND
for _k, _c in (("far", MOOD["far"]), ("mid", MOOD["hills"]), ("near", MOOD["near"]), ("roof", MOOD["roofs"]), ("gate", MOOD["roofs"])):
    next(n for n in FLATS[_k].node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = (*_c, 1)
next(n for n in FLATS_GROUND.node_tree.nodes if n.type == "EMISSION").inputs["Color"].default_value = (*MOOD["near"], 1)
sky_mat, far_mat, hill_mat, roof_mat = FLATS["near"], FLATS["far"], FLATS["mid"], FLATS["roof"]
WIN_MAT = M["window"]
wins = []

def kroof(name, center, W, D, H, R, lift, mat, yaw=0.0, thick=0.5, nu=14, nv=8, c=C_SKY):
    """A Korean hip roof: concave slopes, and eaves that swing up at the corners. W, D are the eave rectangle, H the rise to the
    ridge, R the length of the ridge, lift how far the corners are raised."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for j in range(nv + 1):
        v = -1 + 2 * j / nv
        row = []
        for i in range(nu + 1):
            u = -1 + 2 * i / nu
            a, b = abs(u) * W / 2, abs(v) * D / 2
            x_ = min((D / 2 - b) / (D / 2), (W / 2 - a) / max(0.01, (W - R) / 2))
            x_ = max(0.0, min(1.0, x_))
            z = H * (x_ ** 1.45) + lift * (abs(u) ** 3.0) * ((1 - x_) ** 2.0) + lift * 0.5 * (abs(v) ** 3.0) * ((1 - x_) ** 2.0)
            row.append(bm.verts.new((u * W / 2, v * D / 2, z)))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thick)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.rotation_euler = (0, 0, yaw)
    me.materials.append(mat)
    return link(ob, c)

# hills
for i, (x, r, h) in enumerate(((-90, 60, 22), (-20, 70, 14), (60, 80, 26), (-150, 80, 28), (130, 70, 20))):
    sphere(f"hill{i}", r, (x, 150, -r + h), hill_mat, C_SKY, scale=(1.4, 0.5, 1.0), seg=24)
# a modern skyline, far
for i in range(70):
    x = -140 + i * 4.1 + random.uniform(-1, 1)
    h = random.uniform(8, 38) * (1.5 if random.random() < 0.12 else 1)
    wd = random.uniform(3, 7)
    box(f"tower{i}", (wd, 3, h), (x, 110 + random.uniform(-6, 6), h / 2 - 1), far_mat, C_SKY)
    for _ in range(int(wd * h * 0.04)):
        if random.random() < 0.4:
            wins.append((x + random.uniform(-wd / 2 + 0.4, wd / 2 - 0.4), 108.3, random.uniform(2, h - 1)))
# a tower on a hill
box("tower_shaft", (0.9, 0.9, 20), (22, 140, 26), sky_mat, C_SKY)
sphere("tower_deck", 3.0, (22, 140, 33), sky_mat, C_SKY, scale=(1, 1, 0.38))
box("tower_mast", (0.25, 0.25, 12), (22, 140, 42), sky_mat, C_SKY)
# the old town: low curved roofs, small, a long way off and the same teal as everything else (so it is a texture on the horizon, not a subject)
hrnd = random.Random(23)
for i in range(26):
    x = -70 + i * 5.6 + hrnd.uniform(-1.5, 1.5)
    y = hrnd.uniform(52, 66)
    W_, D_ = hrnd.uniform(5, 8), hrnd.uniform(4, 5.4)
    box(f"hbody{i}", (W_ * 0.74, D_ * 0.76, 2.4), (x, y, 1.2), roof_mat, C_SKY)
    kroof(f"hroof{i}", (x, y, 2.4), W_, D_, hrnd.uniform(1.5, 2.1), W_ * 0.5, 1.0, roof_mat, yaw=hrnd.uniform(-0.05, 0.05), thick=0.4)
    if hrnd.random() < 0.6:
        wins.append((x, y - D_ * 0.4 - 0.1, random.uniform(0.8, 1.6)))
# one palace gate: off. It was a focal point and read as a theme; the old town stays as a faint texture at the horizon. (GATE=1 brings it back.)
GATE_X, GATE_Y = float(os.environ.get("GATE_X", "-14")), float(os.environ.get("GATE_Y", "128"))
if os.environ.get("GATE") == "1":
    box("gate_base", (15, 5.0, 4.2), (GATE_X, GATE_Y, 2.1), FLATS["gate"], C_SKY)
    box("gate_hall", (11, 4.0, 3.0), (GATE_X, GATE_Y, 4.2 + 1.5), FLATS["gate"], C_SKY)
    kroof("gate_roof1", (GATE_X, GATE_Y, 7.0), 17, 8.5, 2.6, 8, 2.0, FLATS["gate"], thick=0.6)
    box("gate_hall2", (7.5, 3.0, 2.4), (GATE_X, GATE_Y, 9.6 + 1.0), FLATS["gate"], C_SKY)
    kroof("gate_roof2", (GATE_X, GATE_Y, 12.0), 12.5, 6.4, 3.0, 5.5, 2.2, FLATS["gate"], thick=0.6)
# window lights, all in one mesh
me = bpy.data.meshes.new("citylights")
bm = bmesh.new()
for (x, y, z) in wins:
    s_ = random.uniform(0.25, 0.4) if y < 100 else random.uniform(0.14, 0.26)
    vs = [bm.verts.new((x + dx, y, z + dz)) for dx, dz in ((-s_, -s_), (s_, -s_), (s_, s_), (-s_, s_))]
    bm.faces.new(vs)
bm.to_mesh(me)
bm.free()
cl = bpy.data.objects.new("citylights", me)
me.materials.append(WIN_MAT)
link(cl, C_SKY)

# ---- one faint moon, a placeholder for the sky states: a plain flat disc facing the camera, no glow, no craters, no sun
_CAM0 = Vector((CAMX, CAMY, CAMZ))
_TGT0 = Vector((TGTX, TGTY, TGTZ))
_FWD0 = (_TGT0 - _CAM0).normalized()

def sky_dir(yaw_deg, elev_deg):
    """A direction in the sky, as an angle to the right of where the camera looks and an elevation above the horizon."""
    base = math.atan2(_FWD0.x, _FWD0.y)
    az = base + math.radians(yaw_deg)
    el = math.radians(elev_deg)
    return Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))

def place_moon(direction, dist=300.0, scale=1.0):
    pos = _CAM0 + direction * dist
    MOON_DISC.location = pos
    MOON_DISC.rotation_euler = (-direction).to_track_quat("Z", "Y").to_euler()
    MOON_DISC.scale = (scale, scale, scale)

_mm = flat("moon", (0.74, 0.84, 0.84), 0.8)
_me = bpy.data.meshes.new("moon")
_bm = bmesh.new()
bmesh.ops.create_circle(_bm, cap_ends=True, segments=64, radius=15.0)
_bm.to_mesh(_me)
_bm.free()
_me.materials.append(_mm)
MOON_DISC = bpy.data.objects.new("moon", _me)
link(MOON_DISC, C_SKY)
MOON_EM = next(n for n in _mm.node_tree.nodes if n.type == "EMISSION")

# ---------------------------------------------------------------- lights and camera
sun = bpy.data.lights.new("dusk", "SUN")
sun.color = (1.0, 0.80, 0.62) if STYLE == "sable" else (0.60, 0.76, 1.0) if STYLE == "film" else MOOD["sun"]
sun.energy = float(os.environ.get("SUN", "2.8" if STYLE == "sable" else "1.1" if STYLE == "film" else "1.2"))
sun.angle = math.radians(24 if STYLE == "film" else 14)
if STYLE == "film":
    sun.specular_factor = 0.35
so = bpy.data.objects.new("dusk", sun)
so.rotation_euler = (math.radians(58), math.radians(8), math.radians(-52))
sc.collection.objects.link(so)
fill = bpy.data.lights.new("fill", "AREA")
fill.energy = 26 if STYLE == "film" else 30
if STYLE == "film":
    fill.specular_factor = 0.0   # a broad soft light, never a reflection of itself in the floor
fill.size = 6
fill.color = (0.5, 0.7, 0.8)
fo = bpy.data.objects.new("fill", fill)
fo.location = (0, -2, 3.2)
fo.rotation_euler = (math.radians(60), 0, 0)
sc.collection.objects.link(fo)
if STYLE == "film":
    # the last of the day, low behind the far glass: a thin warm edge on whatever stands against the window. Small, so that amber stays the lamp's.
    rim = bpy.data.lights.new("rim", "AREA")
    rim.energy = float(os.environ.get("RIM", "110"))
    rim.shape = "RECTANGLE"
    rim.size = 9
    rim.size_y = 2.0
    rim.color = (1.0, 0.62, 0.34)
    ro = bpy.data.objects.new("rim", rim)
    ro.location = (3.0, 11.5, 1.4)
    ro.rotation_euler = (math.radians(-90), 0, 0)
    sc.collection.objects.link(ro)
    # a soft cool bounce from the room itself, on the camera's side, so that furniture fronts read against the window light behind them
    bounce = bpy.data.lights.new("bounce", "AREA")
    bounce.energy = float(os.environ.get("BOUNCE", "70"))
    bounce.size = 5
    bounce.color = (0.55, 0.72, 0.82)
    bounce.specular_factor = 0.0
    bo = bpy.data.objects.new("bounce", bounce)
    bo.location = (-1.8, -3.0, 2.2)
    bo.rotation_euler = (math.radians(65), 0, math.radians(-12))
    sc.collection.objects.link(bo)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    sc.eevee.use_raytracing = os.environ.get("RT", "0") == "1"
    for attr, val in (("use_gtao", True), ("gtao_distance", 0.5)):
        if hasattr(sc.eevee, attr):
            setattr(sc.eevee, attr, val)

if os.environ.get("HERO"):
    hk = bpy.data.lights.new("herokey", "AREA")
    hk.energy = float(os.environ.get("HEROKEY", "260"))
    hk.size = 1.4
    hk.color = (1.0, 0.86, 0.68)
    hk.specular_factor = 0.8
    hko = bpy.data.objects.new("herokey", hk)
    hko.location = (0.2, 0.2, 1.7)
    hko.rotation_euler = (math.radians(55), math.radians(8), math.radians(-12))
    sc.collection.objects.link(hko)

cam = bpy.data.cameras.new("cam")
cam.lens = float(os.environ.get("LENS", "18" if LAYERS else "22"))
cam.sensor_fit = "HORIZONTAL"
cam.sensor_width = 36
cam.dof.use_dof = os.environ.get("DOF", "1") == "1"
cam.dof.focus_distance = float(os.environ.get("FOCUS", "7.5"))
cam.dof.aperture_fstop = float(os.environ.get("FSTOP", "2.2"))
co = bpy.data.objects.new("cam", cam)
co.location = (CAMX, CAMY, CAMZ)
sc.collection.objects.link(co)
sc.camera = co
tgt = bpy.data.objects.new("target", None)
tgt.location = (TGTX, TGTY, TGTZ)
sc.collection.objects.link(tgt)
tr = co.constraints.new("TRACK_TO")
tr.target = tgt
tr.track_axis = "TRACK_NEGATIVE_Z"
tr.up_axis = "UP_Y"

# ---------------------------------------------------------------- the ink: Freestyle outlines with a hand's wobble
sc.render.use_freestyle = STYLE != "film"
sc.render.line_thickness_mode = "ABSOLUTE"
sc.render.line_thickness = 1.0
vl = bpy.context.view_layer
vl.use_freestyle = STYLE != "film"
fs = vl.freestyle_settings
fs.as_render_pass = True
fs.crease_angle = math.radians(120)
INK_COL = _lin("#0F1F24") if STYLE == "toon" else (0.025, 0.075, 0.09)   # the ink is the shadow colour: bold, dark teal, never black
k = float(os.environ.get("INK", "2.2" if STYLE == "sable" else "3.4")) * RES / 0.67

def ink(name, silhouette, crease, thick):
    ls = fs.linesets.new(name)
    ls.linestyle = bpy.data.linestyles.new(name)
    ls.select_silhouette = silhouette
    ls.select_border = silhouette
    ls.select_crease = crease
    ls.select_by_collection = True
    ls.collection = C_INK
    st = ls.linestyle
    st.color = INK_COL
    st.thickness = thick * k
    try:
        n = st.geometry_modifiers.new("jitter", "SPATIAL_NOISE")
        n.amplitude = 0.8
        n.scale = 55
        n.octaves = 1
        n.smooth = True
        t = st.thickness_modifiers.new("weight", "ALONG_STROKE")
        t.value_min = 0.86 * st.thickness
        t.value_max = 1.08 * st.thickness
    except Exception as ex:
        print("LINESTYLE MODIFIERS skipped:", ex)

ink("outline", True, False, 1.0)     # silhouettes and borders: the confident outer line
ink("inside", False, True, 0.5)      # creases inside a form: lighter

# ---------------------------------------------------------------- the ink between tones (compositor)
EDGE_TINT = (0.34, 0.42, 0.58)   # a line is the local colour taken darker and bluer, never one black

def edge_stage(ng, src, thr=None):
    """Draws a thin line wherever the flat colours change: along shadow edges, patch edges, the borders of every fill. Returns the
    coloured picture with the lines in it, and the threshold node, so a layer can switch the lines off (sky) by raising it."""
    N, Lk = ng.nodes, ng.links
    try:
        cs = N.new("CompositorNodeConvertColorSpace")
        cs.from_color_space = "Linear Rec.709"
        cs.to_color_space = "sRGB"
        Lk.new(src, cs.inputs["Image"])
        seen = cs.outputs[0]
    except Exception as ex:   # edge strength in the dark is then weaker, but still there
        print("EDGE colour space skipped:", ex)
        seen = src
    fl = N.new("CompositorNodeFilter")
    fl.inputs["Type"].default_value = "Sobel"
    Lk.new(seen, fl.inputs["Image"])
    bw = N.new("CompositorNodeRGBToBW")
    Lk.new(fl.outputs[0], bw.inputs[0])
    gt = N.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = thr if thr is not None else float(os.environ.get("EDGE", "0.22"))
    Lk.new(bw.outputs[0], gt.inputs[0])
    dk = N.new("ShaderNodeMix")
    dk.data_type = "RGBA"
    dk.blend_type = "MULTIPLY"
    dk.inputs[0].default_value = 1.0
    dk.inputs[7].default_value = (*EDGE_TINT, 1)
    Lk.new(src, dk.inputs[6])
    mx = N.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.blend_type = "MIX"
    Lk.new(gt.outputs[0], mx.inputs[0])
    Lk.new(src, mx.inputs[6])
    Lk.new(dk.outputs[2], mx.inputs[7])
    return mx.outputs[2], gt

# ---------------------------------------------------------------- the paint: compositor
def compose():
    ng = bpy.data.node_groups.new("Paint", "CompositorNodeTree")
    sc.compositing_node_group = ng
    ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    N = ng.nodes
    L = ng.links
    rl = N.new("CompositorNodeRLayers")
    go = N.new("NodeGroupOutput")
    src = rl.outputs["Image"]
    if STYLE == "sable":
        src, _ = edge_stage(ng, src)
    elif STYLE == "film":
        gl = N.new("CompositorNodeGlare")
        for nm, v in (("Type", "Bloom"), ("Threshold", 0.8), ("Strength", 0.6), ("Size", 0.8)):
            try:
                gl.inputs[nm].default_value = v
            except Exception as ex:
                print("GLARE input skipped", nm, ex)
        L.new(src, gl.inputs["Image"])
        src = gl.outputs[0]
    elif PAINT:
        ku = N.new("CompositorNodeKuwahara")
        ku.inputs["Size"].default_value = int(os.environ.get("BRUSH", "5"))
        for nm, v in (("Uniformity", 4), ("Sharpness", 0.6), ("Eccentricity", 1.0)):
            try:
                if nm in ku.inputs:
                    ku.inputs[nm].default_value = v
            except Exception as ex:
                print("KUWAHARA input skipped", nm, ex)
        L.new(src, ku.inputs["Image"])
        src = ku.outputs[0]
        gl = N.new("CompositorNodeGlare")
        for nm, v in (("Type", "Bloom"), ("Threshold", 0.9), ("Strength", 0.9), ("Size", 0.7)):
            try:
                gl.inputs[nm].default_value = v
            except Exception as ex:
                print("GLARE input skipped", nm, ex)
        L.new(src, gl.inputs["Image"])
        src = gl.outputs[0]
    # paper: a real paper scan multiplied over the picture, so it reads as pigment on paper
    paper_path = f"{ROOT}/assets-src/textures/ambientcg/Paper006/Paper006_1K-JPG_Color.jpg"
    if os.path.exists(paper_path):
        im = bpy.data.images.load(paper_path)
        imn = N.new("CompositorNodeImage")
        imn.image = im
        scl = N.new("CompositorNodeScale")
        for nm, v in (("Type", "Render Size"), ("Frame Type", "Crop")):
            try:
                scl.inputs[nm].default_value = v
            except Exception as ex:
                print("SCALE input skipped", nm, ex)
        L.new(imn.outputs[0], scl.inputs[0])
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = float(os.environ.get("PAPER", "0.1" if STYLE == "film" else "0.45"))
        L.new(src, mx.inputs[6])
        L.new(scl.outputs[0], mx.inputs[7])
        src = mx.outputs[2]
    # a vignette, so the eye is held in the room and the corners fall away
    try:
        el = N.new("CompositorNodeEllipseMask")
        el.inputs["Size"].default_value = (0.82, 0.78)
        bl = N.new("CompositorNodeBlur")
        bl.inputs["Size"].default_value = (140, 140) if hasattr(bl.inputs["Size"].default_value, "__len__") else 140
        L.new(el.outputs[0], bl.inputs["Image"])
        vg = N.new("ShaderNodeMix")
        vg.data_type = "RGBA"
        vg.blend_type = "MULTIPLY"
        vg.inputs[0].default_value = 0.0
        L.new(src, vg.inputs[6])
        dark = N.new("ShaderNodeMix")
        dark.data_type = "RGBA"
        dark.blend_type = "MIX"
        dark.inputs[6].default_value = (0.35, 0.40, 0.44, 1)
        dark.inputs[7].default_value = (1, 1, 1, 1)
        L.new(bl.outputs[0], dark.inputs[0])
        L.new(dark.outputs[2], vg.inputs[7])
        vg.inputs[0].default_value = 1.0
        src = vg.outputs[2]
    except Exception as ex:
        print("VIGNETTE skipped", ex)
    # the ink goes on top, crisp
    if "Freestyle" in rl.outputs:
        ao = N.new("CompositorNodeAlphaOver")
        L.new(src, ao.inputs["Background"])
        L.new(rl.outputs["Freestyle"], ao.inputs["Foreground"])
        src = ao.outputs[0]
    L.new(src, go.inputs[0])

if LAYERS:
    # the room as separate layers for the website
    exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "glasshouse_layers.py")).read())
else:
    compose()

    # ---------------------------------------------------------------- render
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(OUT)[0] + ".blend")
    print("ROOM RENDER SECONDS:", round(time.time() - t0, 1), "->", OUT)
