"""
Materials for STYLE=film: physically based, procedural, tactile. No outlines, no halftone, no flat bands: a surface is what it is made of.
Walnut has grain, linen has a weave, stone is honed and faintly veined, glazed ceramic is glossy and very slightly crazed, brass is
brushed, the floor is dark polished stone. Every material is driven by its base colour (the locked palette) and a role, picked from the
material's name, so the scene builder keeps calling toon(name, colour) and gets the right thing.

This file is exec'd by listening_room.py after `bpy`, `math`, `STYLE` and `_lin` exist.
"""

def _mk(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt, nt.nodes, nt.links

def _principled(N, L, out, base=None, rough=0.5, metal=0.0, **kw):
    p = N.new("ShaderNodeBsdfPrincipled")
    if base is not None:
        p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    for k, v in kw.items():
        nm = k.replace("_", " ")
        if nm in p.inputs:
            p.inputs[nm].default_value = v
    L.new(p.outputs["BSDF"], out.inputs["Surface"])
    return p

def _coord(N, scale=(1, 1, 1)):
    tc = N.new("ShaderNodeTexCoord")
    mp = N.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = scale
    return tc, mp

def _ramp(N, stops, interp="LINEAR"):
    r = N.new("ShaderNodeValToRGB")
    r.color_ramp.interpolation = interp
    while len(r.color_ramp.elements) > 1:
        r.color_ramp.elements.remove(r.color_ramp.elements[-1])
    for i, (pos, col) in enumerate(stops):
        e = r.color_ramp.elements[0] if i == 0 else r.color_ramp.elements.new(pos)
        e.position = pos
        e.color = (*col, 1) if len(col) == 3 else col
    return r

def _scaled(c, k):
    return tuple(max(0.0, min(1.0, v * k)) for v in c)

def _bump(N, L, height_out, strength, dist, p):
    b = N.new("ShaderNodeBump")
    b.inputs["Strength"].default_value = strength
    b.inputs["Distance"].default_value = dist
    L.new(height_out, b.inputs["Height"])
    L.new(b.outputs["Normal"], p.inputs["Normal"])
    return b

def walnut(name, base, rough=0.42, grain=26.0, bump=0.18):
    """Open-pored walnut, finished with oil: long figured grain, darker growth lines, a satin sheen that is stronger along the grain."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc, mp = _coord(N, (1.0, grain, grain * 0.55))
    wv = N.new("ShaderNodeTexWave")
    wv.wave_type = "BANDS"
    wv.bands_direction = "Y"
    wv.wave_profile = "SIN"
    wv.inputs["Scale"].default_value = 1.0
    wv.inputs["Distortion"].default_value = 3.2
    wv.inputs["Detail"].default_value = 3.0
    wv.inputs["Detail Scale"].default_value = 1.6
    wv.inputs["Detail Roughness"].default_value = 0.6
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.2
    nz.inputs["Detail"].default_value = 6
    nz.inputs["Roughness"].default_value = 0.55
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    L.new(mp.outputs[0], wv.inputs["Vector"])
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    col = _ramp(N, [(0.0, _scaled(base, 0.5)), (0.55, base), (1.0, _scaled(base, 1.45))])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs[0].default_value = 0.35
    L.new(wv.outputs["Fac"], mix.inputs[2])
    L.new(nz.outputs["Fac"], mix.inputs[3])
    L.new(mix.outputs[0], col.inputs[0])
    p = _principled(N, L, out, rough=rough, Specular_IOR_Level=0.5, Coat_Weight=0.12, Coat_Roughness=0.3)
    L.new(col.outputs[0], p.inputs["Base Color"])
    rmap = N.new("ShaderNodeMapRange")
    rmap.inputs["To Min"].default_value = rough - 0.07
    rmap.inputs["To Max"].default_value = rough + 0.1
    L.new(wv.outputs["Fac"], rmap.inputs["Value"])
    L.new(rmap.outputs["Result"], p.inputs["Roughness"])
    _bump(N, L, wv.outputs["Fac"], bump, 0.002, p)
    return m

def linen(name, base, rough=0.92, weave=420.0, bump=0.35):
    """Upholstery linen: a real over-and-under weave, slubs, and a soft fibre sheen at grazing angles."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc, mp = _coord(N, (weave, weave, weave))
    wx = N.new("ShaderNodeTexWave")
    wx.wave_type = "BANDS"
    wx.bands_direction = "X"
    wx.wave_profile = "TRI"
    wx.inputs["Distortion"].default_value = 0.6
    wy = N.new("ShaderNodeTexWave")
    wy.wave_type = "BANDS"
    wy.bands_direction = "Y"
    wy.wave_profile = "TRI"
    wy.inputs["Distortion"].default_value = 0.6
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    L.new(mp.outputs[0], wx.inputs["Vector"])
    L.new(mp.outputs[0], wy.inputs["Vector"])
    cross = N.new("ShaderNodeMath")
    cross.operation = "MULTIPLY"
    L.new(wx.outputs["Fac"], cross.inputs[0])
    L.new(wy.outputs["Fac"], cross.inputs[1])
    slub = N.new("ShaderNodeTexNoise")
    slub.inputs["Scale"].default_value = 60.0
    slub.inputs["Detail"].default_value = 3
    L.new(tc.outputs["Object"], slub.inputs["Vector"])
    col = _ramp(N, [(0.0, _scaled(base, 0.78)), (1.0, _scaled(base, 1.12))])
    mixc = N.new("ShaderNodeMix")
    mixc.data_type = "FLOAT"
    mixc.inputs[0].default_value = 0.45
    L.new(cross.outputs[0], mixc.inputs[2])
    L.new(slub.outputs["Fac"], mixc.inputs[3])
    L.new(mixc.outputs[0], col.inputs[0])
    p = _principled(N, L, out, rough=rough, Sheen_Weight=0.7, Sheen_Roughness=0.35)
    L.new(col.outputs[0], p.inputs["Base Color"])
    _bump(N, L, cross.outputs[0], bump, 0.0015, p)
    return m

def stone(name, base, rough=0.58, vein=True):
    """Honed natural stone: soft cloudy variation, a few long faint veins, a fine tooth."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    cloud = N.new("ShaderNodeTexNoise")
    cloud.inputs["Scale"].default_value = 3.0
    cloud.inputs["Detail"].default_value = 8
    cloud.inputs["Roughness"].default_value = 0.62
    L.new(tc.outputs["Object"], cloud.inputs["Vector"])
    fine = N.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 260.0
    fine.inputs["Detail"].default_value = 2
    L.new(tc.outputs["Object"], fine.inputs["Vector"])
    col = _ramp(N, [(0.25, _scaled(base, 0.82)), (0.5, base), (0.78, _scaled(base, 1.12))])
    src = cloud.outputs["Fac"]
    if vein:
        vw = N.new("ShaderNodeTexWave")
        vw.wave_type = "BANDS"
        vw.bands_direction = "DIAGONAL"
        vw.inputs["Scale"].default_value = 3.4
        vw.inputs["Distortion"].default_value = 9.0
        vw.inputs["Detail"].default_value = 2.0
        L.new(tc.outputs["Object"], vw.inputs["Vector"])
        thr = _ramp(N, [(0.0, (0.0, 0.0, 0.0)), (0.93, (0.0, 0.0, 0.0)), (0.99, (1.0, 1.0, 1.0))])
        L.new(vw.outputs["Fac"], thr.inputs[0])
        # veins darken the cloud value a little where the thresholded wave is on
        mul = N.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 0.05
        L.new(thr.outputs[0], mul.inputs[0])
        sub = N.new("ShaderNodeMath")
        sub.operation = "SUBTRACT"
        L.new(cloud.outputs["Fac"], sub.inputs[0])
        L.new(mul.outputs[0], sub.inputs[1])
        src = sub.outputs[0]
    L.new(src, col.inputs[0])
    p = _principled(N, L, out, rough=rough, Specular_IOR_Level=0.45)
    L.new(col.outputs[0], p.inputs["Base Color"])
    _bump(N, L, fine.outputs["Fac"], 0.12, 0.003, p)
    return m

def ceramic(name, base, rough=0.2, crackle=True):
    """Glazed ceramic: a deep, even sheen, very slight variation in the glaze, and (for the old white jar) a faint crazing."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 5.0
    nz.inputs["Detail"].default_value = 5
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    col = _ramp(N, [(0.3, _scaled(base, 0.93)), (0.7, _scaled(base, 1.03))])
    L.new(nz.outputs["Fac"], col.inputs[0])
    p = _principled(N, L, out, rough=rough, Specular_IOR_Level=0.6, Coat_Weight=0.35, Coat_Roughness=0.08)
    colsrc = col.outputs[0]
    if crackle:
        vo = N.new("ShaderNodeTexVoronoi")
        vo.feature = "DISTANCE_TO_EDGE"
        vo.inputs["Scale"].default_value = 90.0
        L.new(tc.outputs["Object"], vo.inputs["Vector"])
        thr = _ramp(N, [(0.0, (0.86, 0.86, 0.86, 1)), (0.02, (1.0, 1.0, 1.0, 1))], "LINEAR")
        L.new(vo.outputs["Distance"], thr.inputs[0])
        mx = N.new("ShaderNodeMix")
        mx.data_type = "RGBA"
        mx.blend_type = "MULTIPLY"
        mx.inputs[0].default_value = 1.0
        L.new(col.outputs[0], mx.inputs[6])
        L.new(thr.outputs[0], mx.inputs[7])
        colsrc = mx.outputs[2]
    L.new(colsrc, p.inputs["Base Color"])
    return m

def brass(name, base, rough=0.36):
    """Aged, brushed brass: metal, with fine lengthwise scoring that breaks the highlight up."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc, mp = _coord(N, (1.0, 1.0, 90.0))
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 24.0
    nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    L.new(mp.outputs[0], nz.inputs["Vector"])
    patina = N.new("ShaderNodeTexNoise")
    patina.inputs["Scale"].default_value = 4.0
    patina.inputs["Detail"].default_value = 5
    L.new(tc.outputs["Object"], patina.inputs["Vector"])
    col = _ramp(N, [(0.35, _scaled(base, 0.7)), (0.7, base)])
    L.new(patina.outputs["Fac"], col.inputs[0])
    p = _principled(N, L, out, rough=rough, metal=1.0)
    L.new(col.outputs[0], p.inputs["Base Color"])
    rm = N.new("ShaderNodeMapRange")
    rm.inputs["To Min"].default_value = rough - 0.08
    rm.inputs["To Max"].default_value = rough + 0.12
    L.new(nz.outputs["Fac"], rm.inputs["Value"])
    L.new(rm.outputs["Result"], p.inputs["Roughness"])
    _bump(N, L, nz.outputs["Fac"], 0.06, 0.001, p)
    return m

def bronze_steel(name, base, rough=0.46):
    """Dark, oxidised bronze steel for the glasshouse frame: nearly black, a little warmth in the highlights."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 30.0
    nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    p = _principled(N, L, out, base=base, rough=rough, metal=0.85, Specular_IOR_Level=0.5)
    rm = N.new("ShaderNodeMapRange")
    rm.inputs["To Min"].default_value = rough - 0.1
    rm.inputs["To Max"].default_value = rough + 0.14
    L.new(nz.outputs["Fac"], rm.inputs["Value"])
    L.new(rm.outputs["Result"], p.inputs["Roughness"])
    _bump(N, L, nz.outputs["Fac"], 0.04, 0.0008, p)
    return m

def polished_floor(name, base, rough=0.3):
    """Dark honed-and-polished stone: glossy, with the gloss varying a little across each slab so that reflections are never perfect."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.6
    nz.inputs["Detail"].default_value = 7
    nz.inputs["Roughness"].default_value = 0.6
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    fine = N.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 150.0
    L.new(tc.outputs["Object"], fine.inputs["Vector"])
    col = _ramp(N, [(0.3, _scaled(base, 0.8)), (0.7, _scaled(base, 1.25))])
    L.new(nz.outputs["Fac"], col.inputs[0])
    p = _principled(N, L, out, rough=rough, Specular_IOR_Level=0.32, Coat_Weight=0.0)
    L.new(col.outputs[0], p.inputs["Base Color"])
    rm = N.new("ShaderNodeMapRange")
    rm.inputs["To Min"].default_value = rough * 0.7
    rm.inputs["To Max"].default_value = rough * 1.9
    L.new(nz.outputs["Fac"], rm.inputs["Value"])
    L.new(rm.outputs["Result"], p.inputs["Roughness"])
    _bump(N, L, fine.outputs["Fac"], 0.05, 0.001, p)
    return m

def wool(name, base, rough=1.0):
    """A hand-woven wool rug: matte, with a fine pile that catches light as a soft sheen."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 520.0
    nz.inputs["Detail"].default_value = 3
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    mott = N.new("ShaderNodeTexNoise")
    mott.inputs["Scale"].default_value = 3.0
    mott.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], mott.inputs["Vector"])
    col = _ramp(N, [(0.3, _scaled(base, 0.82)), (0.7, _scaled(base, 1.12))])
    L.new(mott.outputs["Fac"], col.inputs[0])
    p = _principled(N, L, out, rough=rough, Sheen_Weight=0.9, Sheen_Roughness=0.5)
    L.new(col.outputs[0], p.inputs["Base Color"])
    _bump(N, L, nz.outputs["Fac"], 0.5, 0.004, p)
    return m

def leaf(name, base, rough=0.42):
    """Leaves: each object a little different, a soft sheen on the upper side."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    oi = N.new("ShaderNodeObjectInfo")
    at = N.new("ShaderNodeAttribute")
    at.attribute_type = "GEOMETRY"
    at.attribute_name = "leafvar"
    vsum = N.new("ShaderNodeMath")
    vsum.operation = "MULTIPLY_ADD"
    vsum.inputs[1].default_value = 0.7
    L.new(at.outputs["Fac"], vsum.inputs[0])
    L.new(oi.outputs["Random"], vsum.inputs[2])
    vsum.inputs[2].default_value = 0.0
    vsc = N.new("ShaderNodeMath")
    vsc.operation = "MULTIPLY"
    vsc.inputs[1].default_value = 0.3
    L.new(oi.outputs["Random"], vsc.inputs[0])
    vadd = N.new("ShaderNodeMath")
    vadd.operation = "ADD"
    L.new(vsum.outputs[0], vadd.inputs[0])
    L.new(vsc.outputs[0], vadd.inputs[1])
    col = _ramp(N, [(0.0, _scaled(base, 0.74)), (1.0, _scaled(base, 1.3))])
    L.new(vadd.outputs[0], col.inputs[0])
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 14.0
    nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.5
    L.new(col.outputs[0], mix.inputs[6])
    nrm = _ramp(N, [(0.0, (0.82, 0.82, 0.82, 1)), (1.0, (1.1, 1.1, 1.1, 1))])
    L.new(nz.outputs["Fac"], nrm.inputs[0])
    L.new(nrm.outputs[0], mix.inputs[7])
    p = _principled(N, L, out, rough=rough, Specular_IOR_Level=0.5, Subsurface_Weight=0.12)
    L.new(mix.outputs[2], p.inputs["Base Color"])
    return m

def vinyl(name, base):
    """A record: black, glossy, with the fine concentric grooves catching light."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc, mp = _coord(N, (1.0, 1.0, 1.0))
    L.new(tc.outputs["Object"], mp.inputs["Vector"])
    wv = N.new("ShaderNodeTexWave")
    wv.wave_type = "RINGS"
    wv.rings_direction = "Z"
    wv.inputs["Scale"].default_value = 260.0
    L.new(mp.outputs[0], wv.inputs["Vector"])
    p = _principled(N, L, out, base=base, rough=0.2, Specular_IOR_Level=0.7, Coat_Weight=0.5, Coat_Roughness=0.15)
    _bump(N, L, wv.outputs["Fac"], 0.05, 0.0004, p)
    return m

def plain(name, base, rough=0.6, metal=0.0):
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    _principled(N, L, out, base=base, rough=rough, metal=metal, Specular_IOR_Level=0.45)
    return m

def paper(name, base):
    """Washi / card: matte, a little fibre."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 140.0
    nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    col = _ramp(N, [(0.3, _scaled(base, 0.92)), (0.7, _scaled(base, 1.04))])
    L.new(nz.outputs["Fac"], col.inputs[0])
    p = _principled(N, L, out, rough=0.85, Subsurface_Weight=0.1)
    L.new(col.outputs[0], p.inputs["Base Color"])
    _bump(N, L, nz.outputs["Fac"], 0.2, 0.001, p)
    return m

def lampshade(name, col, strength=2.0):
    """A linen shade with a lamp inside: brighter at the middle of the face, deeper amber toward the edges."""
    m, nt, N, L = _mk(name)
    out = N.new("ShaderNodeOutputMaterial")
    em = N.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*col, 1)
    lw = N.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    st = N.new("ShaderNodeMapRange")
    st.inputs["From Min"].default_value = 0.0
    st.inputs["From Max"].default_value = 1.0
    st.inputs["To Min"].default_value = strength * 1.1
    st.inputs["To Max"].default_value = strength * 0.45
    L.new(lw.outputs["Facing"], st.inputs["Value"])
    L.new(st.outputs["Result"], em.inputs["Strength"])
    L.new(em.outputs[0], out.inputs["Surface"])
    return m

# which recipe a material name gets (anything not listed is a plain satin material in its colour)
_ROLE = {
    "timber": ("walnut", {}), "kaya": ("walnut", dict(rough=0.5, grain=14.0, bump=0.06)), "timber_dark": ("walnut", dict(rough=0.4)), "desk": ("walnut", dict(rough=0.46)),
    "chair": ("linen", {}), "rug": ("wool", {}), "stone": ("stone", {}), "floor": ("floor", {}), "floor2": ("floor", dict(rough=0.3)),
    "porcelain": ("ceramic", {}), "brass": ("brass", {}), "frame": ("bronze", {}), "terracotta": ("ceramic", dict(rough=0.35, crackle=False)),
    "leaf": ("leaf", {}), "leaf_dark": ("leaf", {}), "leaf_light": ("leaf", {}), "red": ("ceramic", dict(rough=0.45, crackle=False)),
    "paper": ("paper", {}), "platter": ("vinyl", {}), "cover": ("linen", dict(rough=0.8, weave=300.0)), "page": ("paper", {}),
    "label": ("paper", {}), "sleeve": ("paper", {}), "sleevedisc": ("vinyl", {}), "potglaze": ("ceramic", dict(crackle=False)),
    "headshell": ("plain", dict(rough=0.35)), "flower": ("plain", dict(rough=0.4)), "ground": ("plain", dict(rough=0.9)),
    "floor_soft": ("floor", {}), "leaf_soft": ("leaf", {}), "leaf_dark_soft": ("leaf", {}), "leaf_light_soft": ("leaf", {}),
}

def film_mat(name, base, **_ignore):
    kind, kw = _ROLE.get(name, (None, {}))
    if kind is None:
        for key in ("paper", "poster", "empty"):
            if name.startswith(key):
                kind = "paper"
                break
    if kind is None:
        kind = "plain"
    fn = {"walnut": walnut, "linen": linen, "stone": stone, "floor": polished_floor, "ceramic": ceramic, "brass": brass, "bronze": bronze_steel,
          "leaf": leaf, "wool": wool, "paper": paper, "vinyl": vinyl, "plain": plain}[kind]
    return fn(name, base, **kw)
