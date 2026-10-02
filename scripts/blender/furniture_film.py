"""
Designed pieces for STYLE=film: things that look chosen rather than generic. A slatted walnut credenza on splayed legs with brass bar
pulls; a Jeanneret-style lounge chair (walnut frame, linen cushions); a ceramic lamp with a linen drum shade; foliage built leaf by leaf.

Exec'd by listening_room.py after the geometry helpers (box, cyl, sphere, tube, begin, link, empty) and the materials M exist.
"""

def soft_box(name, size, center, mat, c=None, rot=(0, 0, 0), parent=None, bevel=0.02, segs=3, pillow=False):
    """A box with rounded edges; with `pillow`, smooth-shaded and subdivided too, so a cushion looks stuffed."""
    ob = box(name, size, center, mat, c or C_INK, rot, parent)
    bv = ob.modifiers.new("bevel", "BEVEL")
    bv.width = bevel
    bv.segments = segs
    bv.limit_method = "NONE"
    if pillow:
        ss = ob.modifiers.new("subsurf", "SUBSURF")
        ss.levels = 1
        ss.render_levels = 2
        for p_ in ob.data.polygons:
            p_.use_smooth = True
    return ob

def lathe(name, prof, center, scale, mat, parent=None, c=None, steps=48):
    """A vessel turned on a lathe from a profile of (radius, height) points."""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p_ in me.polygons:
        p_.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = center
    ob.scale = (scale, scale, scale)
    if mat:
        me.materials.append(mat)
    if parent:
        ob.parent = parent
    return link(ob, c or C_INK)

def film_credenza(cred):
    """Low, long, walnut: a carcass on four splayed legs, three fluted doors, brass bar pulls, a top with a slim overhang."""
    wal, wal_d, brs = M["timber"], M["timber_dark"], M["brass"]
    box("cred_body", (2.3, 0.46, 0.42), (0, 0, 0.47), wal_d, C_INK, parent=cred)
    box("cred_top", (2.42, 0.52, 0.03), (0, 0, 0.7), wal, C_INK, parent=cred)
    box("cred_inlay", (2.3, 0.004, 0.006), (0, -0.2615, 0.675), brs, C_INK, parent=cred)   # a thread of brass under the top
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl("cred_leg", 0.014, 0.03, 0.24, (sx * 1.08, sy * 0.19, 0.12), wal_d, C_INK, rot=(sy * math.radians(6), -sx * math.radians(5), 0), parent=cred, seg=12)
    for i, x in enumerate((-0.75, 0.0, 0.75)):
        box(f"cred_door{i}", (0.71, 0.012, 0.38), (x, -0.236, 0.47), wal_d, C_INK, parent=cred)
        n = 14
        for k in range(n):
            sx_ = x - 0.335 + (k + 0.5) * (0.67 / n)
            box("flute", (0.034, 0.022, 0.37), (sx_, -0.25, 0.47), wal, C_INK, parent=cred)
        px = x + (0.31 if i != 1 else -0.31)
        box("pull", (0.012, 0.016, 0.2), (px, -0.272, 0.5), brs, C_INK, parent=cred)

def film_chair(chair):
    """A lounge chair in the manner of Pierre Jeanneret's: a walnut frame with raked legs and a long arm rail, linen cushions on top."""
    wal, lin_ = M["timber"], M["chair"]
    soft_box("seat", (0.58, 0.5, 0.11), (0, -0.0, 0.43), lin_, C_INK, parent=chair, bevel=0.035, segs=3, pillow=True)
    soft_box("back", (0.54, 0.1, 0.4), (0, 0.29, 0.7), lin_, C_INK, rot=(math.radians(-15), 0, 0), parent=chair, bevel=0.04, segs=3, pillow=True)
    for sx in (-1, 1):
        box("siderail", (0.04, 0.54, 0.05), (sx * 0.325, 0.0, 0.355), wal, C_INK, parent=chair)
        box("arm", (0.055, 0.56, 0.032), (sx * 0.345, 0.0, 0.62), wal, C_INK, parent=chair)
        cyl("armpost", 0.019, 0.026, 0.27, (sx * 0.345, -0.25, 0.485), wal, C_INK, rot=(math.radians(4), 0, 0), parent=chair, seg=12)
        box("backpost", (0.04, 0.05, 0.62), (sx * 0.325, 0.31, 0.62), wal, C_INK, rot=(math.radians(-15), 0, 0), parent=chair)
        cyl("fleg", 0.014, 0.026, 0.36, (sx * 0.325, -0.26, 0.18), wal, C_INK, rot=(math.radians(-5), -sx * math.radians(6), 0), parent=chair, seg=12)
        cyl("bleg", 0.014, 0.026, 0.4, (sx * 0.325, 0.3, 0.2), wal, C_INK, rot=(math.radians(8), -sx * math.radians(6), 0), parent=chair, seg=12)
    box("toprail", (0.66, 0.045, 0.05), (0, 0.36, 0.9), wal, C_INK, rot=(math.radians(-15), 0, 0), parent=chair)
    box("frontrail", (0.65, 0.04, 0.05), (0, -0.27, 0.355), wal, C_INK, parent=chair)
    box("backrail", (0.65, 0.04, 0.05), (0, 0.27, 0.355), wal, C_INK, parent=chair)

def film_lamp(cred, lp):
    """A ceramic gourd base, a brass neck, a linen drum shade with the lamp inside it."""
    lathe("lamp_base", [(0.0, 0.0), (0.045, 0.0), (0.058, 0.012), (0.085, 0.05), (0.098, 0.1), (0.088, 0.16), (0.055, 0.2), (0.03, 0.222), (0.0, 0.228)], (lp[0], lp[1], lp[2]), 1.0, M["porcelain"], parent=cred)
    cyl("lamp_neck", 0.012, 0.012, 0.12, (lp[0], lp[1], lp[2] + 0.28), M["brass"], C_INK, parent=cred, seg=12)
    cyl("lamp_shade", 0.17, 0.145, 0.22, (lp[0], lp[1], lp[2] + 0.43), M["lamp"], C_INK, parent=cred, seg=36)

def leafy(name, centre, radii, n, size, mat, c=None, droop=0.3, seed=0, flatten=0.0):
    """Foliage built leaf by leaf: n small pointed leaves scattered through an ellipsoid, each turned outward with some noise."""
    rnd = random.Random(seed)
    bm = bmesh.new()
    var = []
    cen = Vector(centre)
    for i in range(n):
        while True:
            x, y, z = rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)
            if x * x + y * y + z * z <= 1.0:
                break
        p = Vector((x * radii[0], y * radii[1], z * radii[2]))
        nrm = (p.normalized() if p.length > 1e-4 else Vector((0, 0, 1))) + Vector((rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6)))
        nrm.normalize()
        t = nrm.cross(Vector((0, 0, 1)))
        if t.length < 1e-3:
            t = Vector((1, 0, 0))
        t.normalize()
        b = nrm.cross(t)
        L_ = size * rnd.uniform(0.7, 1.3)
        W_ = L_ * 0.38
        base = p
        tip = p + t * L_ + Vector((0, 0, -droop * L_ * rnd.uniform(0.3, 1.0)))
        mid = p + t * L_ * 0.5 + nrm * L_ * 0.06
        v0 = bm.verts.new(cen + base)
        v1 = bm.verts.new(cen + mid + b * W_ * 0.5)
        v2 = bm.verts.new(cen + tip)
        v3 = bm.verts.new(cen + mid - b * W_ * 0.5)
        f1 = bm.faces.new((v0, v1, v2))
        f2 = bm.faces.new((v0, v2, v3))
        r_ = rnd.random()
        var += [r_, r_]
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    a = me.attributes.new("leafvar", "FLOAT", "FACE")
    a.data.foreach_set("value", var)
    me.materials.append(mat)
    for p_ in me.polygons:
        p_.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    return link(ob, c or C_SOFT)
