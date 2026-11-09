"""
Blender headless: sew a garment from flat pattern pieces onto a mannequin with cloth simulation,
then export print-ready panels (one mesh per panel, UV = the flat pattern in inches).

  blender --background --python sew_garment.py -- <spec.json> <out_dir> [--frames N] [--res IN]

spec.json comes from the seed catalog (models/specs/<model>.json): garment params plus each
panel's physical W x H. Every pattern piece is cut to exactly that panel size, so the catalog's
print areas (defined in panel inches) land on the same inches of the simulated garment.

Conventions (match src/3d and e2e/real-model.spec.ts):
  Blender Z-up, garment front faces -Y (glTF +Z after export_yup), hem at Z=0, units = metres.
  front U grows with +X; back U mirrored; left sleeve U falls toward the front, right sleeve U grows
  toward the front; V = 0 at the top in glTF (Blender V up, the exporter flips it).
"""
import bpy, bmesh, sys, json, os, math
from mathutils import Vector, Matrix
from mathutils.geometry import delaunay_2d_cdt

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SPEC = json.load(open(argv[0], encoding='utf-8'))
OUT = os.path.abspath(argv[1])
opt = {argv[i]: argv[i + 1] for i in range(2, len(argv) - 1) if argv[i].startswith('--')}
FRAMES = int(opt.get('--frames', 90))
RES = float(opt.get('--res', 0.7))  # target edge length of the simulation mesh, inches
os.makedirs(OUT, exist_ok=True)
K = 0.0254  # inches -> metres
g, P = SPEC['garment'], SPEC['panels']
kind, collar = g['kind'], g['collar']
drop = g.get('drop', 1.0)
chest = g['chestIn']

# ----------------------------------------------------------------- 2D helpers (inches, y up)
def bez(p0, p1, p2, p3, n=64):
    return [tuple(((1 - t) ** 3) * a + 3 * ((1 - t) ** 2) * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(n + 1))]

def polylen(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

def resample(pts, n):
    """n+1 points evenly spaced along a polyline (both ends kept)."""
    L = polylen(pts); out = [pts[0]]; acc = 0.0; i = 0
    for k in range(1, n):
        target = L * k / n
        while acc + math.dist(pts[i], pts[i + 1]) < target:
            acc += math.dist(pts[i], pts[i + 1]); i += 1
        seg = math.dist(pts[i], pts[i + 1]) or 1e-9
        t = (target - acc) / seg
        out.append((pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t))
    out.append(pts[-1])
    return out

def line(a, b):
    return [a, b]

def count(pts):
    return max(2, round(polylen(pts) / RES))

class Piece:
    """A pattern piece: closed outline made of named edges, meshed by constrained Delaunay."""
    def __init__(self, name, edges):
        # edges: list of (seam_key or None, polyline, n_segments); consecutive, closed loop
        self.name, self.edges = name, edges
        self.outline, self.edge_idx = [], {}
        for key, pts, n in edges:
            if n is None: n = len(pts) - 1   # explicit stitch points (already placed where they must sew)
            else: pts = resample(pts, n)
            start = len(self.outline)
            self.outline.extend(pts[:-1])
            idx = list(range(start, start + n + 1))
            self.edge_idx[key] = idx  # last index wraps to the next edge's first point
        total = len(self.outline)
        for key in self.edge_idx:
            self.edge_idx[key] = [i % total for i in self.edge_idx[key]]
        self.mesh()

    def mesh(self):
        xs = [p[0] for p in self.outline]; ys = [p[1] for p in self.outline]
        self.x0, self.x1, self.y0, self.y1 = min(xs), max(xs), min(ys), max(ys)
        pts = list(self.outline)
        n = len(pts)
        def inside(x, y):
            c = False
            for i in range(n):
                (ax, ay), (bx, by) = pts[i], pts[(i + 1) % n]
                if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
                    c = not c
            return c
        def far(x, y):
            return all(math.dist((x, y), q) > RES * 0.55 for q in pts)
        h = RES * math.sqrt(3) / 2
        interior = []
        j = 0
        y = self.y0 + h / 2
        while y < self.y1:
            x = self.x0 + (RES / 2 if j % 2 else 0) + RES / 4
            while x < self.x1:
                if inside(x, y) and far(x, y):
                    interior.append((x, y))
                x += RES
            y += h; j += 1
        verts = [Vector((x, y)) for x, y in pts + interior]
        res = delaunay_2d_cdt(verts, [], [list(range(n))], 1, 1e-6, True)
        out_v, _, faces, orig_v = res[0], res[1], res[2], res[3]
        self.v2 = [(v.x, v.y) for v in out_v]
        self.faces = [list(f) for f in faces]
        # map input outline index -> output vertex index
        self.map = {}
        for o, ins in enumerate(orig_v):
            for i in ins:
                self.map[i] = o
        for key in self.edge_idx:
            self.edge_idx[key] = [self.map[i] for i in self.edge_idx[key]]

def seam_n(*polys):
    return max(count(p) for p in polys)

# ----------------------------------------------------------------- pattern drafting
W, H = P['front']['w'], P['front']['h']
cx = W / 2
scale = (chest / 20) ** 0.7
nk = (4.1 if collar in ('polo', 'dress') else 3.9 if collar == 'hood' else 3.3) * scale  # neck half-width
fd = (5.0 if kind == 'tank' else {'crew': 3.0, 'v': 6.5, 'polo': 2.8, 'dress': 2.6, 'hood': 3.4}[collar]) * scale  # front neck depth
bd = 1.0 * scale
sd = 1.7 * scale                                                                            # shoulder drop
sh = (nk + 1.8 * scale) if kind == 'tank' else min(W / 2 - 0.3, W / 2 * 0.86 * drop)        # shoulder half-width
ad = (0.55 if kind == 'tank' else 0.47 * drop) * chest                                      # armhole depth
ys, yA = H - sd, H - sd - ad
xs = cx - sh

def armhole(side):  # from shoulder point down to underarm, side = -1 (x=0) / +1 (x=W)
    sx = cx + side * sh
    pts = bez((sx, ys), (sx, ys - 0.5 * ad), (cx + side * (cx - xs * 0.35), yA + 0.08 * ad), (cx + side * cx, yA))
    return pts

def neckline(depth):  # from left neck point to right neck point via centre
    if collar == 'v' and depth > 2:
        return [(cx - nk, H), (cx, H - depth), (cx + nk, H)]
    a = bez((cx - nk, H), (cx - nk * 0.95, H - depth * 0.75), (cx - nk * 0.55, H - depth), (cx, H - depth), 24)
    return a + [(2 * cx - x, y) for x, y in reversed(a[:-1])]

arm_L, arm_R = armhole(-1), armhole(+1)
neck_f, neck_b = neckline(fd), neckline(bd)
shoulder_L = line((cx - nk, H), (xs, ys))
shoulder_R = line((cx + sh, ys), (cx + nk, H))
side = line((0, yA), (0, 0))
side_R = line((W, 0), (W, yA))
hem = line((0, 0), (W, 0))

has_sleeves = 'left_sleeve' in P
N = {
    'side': seam_n(side), 'shoulder': seam_n(shoulder_L), 'arm': seam_n(arm_L) + 2,
    'hem': seam_n(hem), 'neck': 2 * math.ceil(max(seam_n(neck_f), seam_n(neck_b)) / 2),
}

def torso(name, neck):
    # outline order: hem (L->R), right side up, right armhole (underarm->shoulder), right shoulder, neck (R->L), left shoulder, left armhole, left side down
    return Piece(name, [
        ('hem', hem, N['hem']),
        ('side_R', side_R, N['side']),
        ('arm_R', list(reversed(arm_R)), N['arm']),
        ('shoulder_R', shoulder_R, N['shoulder']),
        ('neck', list(reversed(neck)), N['neck']),
        ('shoulder_L', shoulder_L, N['shoulder']),
        ('arm_L', arm_L, N['arm']),
        ('side_L', side, N['side']),
    ])

front, back = torso('front', neck_f), torso('back', neck_b)
pieces = [front, back]

sleeves = {}
if has_sleeves:
    Ws, Ls = P['left_sleeve']['w'], P['left_sleeve']['h']
    r0 = Ws / (2 * math.pi)
    long = g['sleeveLengthIn'] > 14
    r1 = 1.9 if long else 0.9 * r0
    if g.get('cuffs') and 'left_cuff' in P:
        r1 = P['left_cuff']['w'] / (2 * math.pi * 1.04)
    Wh = 2 * math.pi * r1
    target = polylen(arm_L)
    def cap(ch):
        half = bez((0, Ls - ch), (Ws * 0.18, Ls - ch), (Ws * 0.3, Ls), (Ws / 2, Ls), 32)
        return half + [(Ws - x, y) for x, y in reversed(half[:-1])]
    ch = max(1.0, min(Ls - 1.2, 4.5))
    for _ in range(40):  # cap height so each half of the cap matches its armhole
        if polylen(cap(ch)) / 2 > target: ch -= 0.1
        else: ch += 0.1
        ch = max(1.0, min(Ls - 1.2, ch))
    c = cap(ch); mid = len(c) // 2
    for sd_ in ('left', 'right'):
        sleeves[sd_] = Piece(f'{sd_}_sleeve', [
            ('hem', line(((Ws - Wh) / 2, 0), ((Ws + Wh) / 2, 0)), max(8, round(Wh / RES))),
            ('under_b', line(((Ws + Wh) / 2, 0), (Ws, Ls - ch)), max(3, round(math.dist(((Ws + Wh) / 2, 0), (Ws, Ls - ch)) / RES))),
            ('cap_f', list(reversed(c[mid:])), N['arm']),
            ('cap_b', list(reversed(c[:mid + 1])), N['arm']),
            ('under_a', line((0, Ls - ch), ((Ws - Wh) / 2, 0)), max(3, round(math.dist(((Ws + Wh) / 2, 0), (Ws, Ls - ch)) / RES))),
        ])
        pieces.append(sleeves[sd_])
    # The cap's x > Ws/2 half faces the front for both sleeves (see placement).

cuffs = {}
if has_sleeves and 'left_cuff' in P:
    Wc, Hc = P['left_cuff']['w'], P['left_cuff']['h']
    for sd_ in ('left', 'right'):
        n_h = sleeves[sd_].edges[0][2]
        cuffs[sd_] = Piece(f'{sd_}_cuff', [
            ('bottom', line((0, 0), (Wc, 0)), n_h),
            ('end_b', line((Wc, 0), (Wc, Hc)), max(2, round(Hc / RES))),
            ('top', line((Wc, Hc), (0, Hc)), n_h),
            ('end_a', line((0, Hc), (0, 0)), max(2, round(Hc / RES))),
        ])
        pieces.append(cuffs[sd_])

neck_loop = 2 * N['neck']
# The neckline loop as sewn: front neck (stored R->L) then the back neck reversed; its fabric arc lengths
# place the band's stitch points so every spring joins matching lengths of cloth.
NECK_IDX = [('front', i) for i in front.edge_idx['neck']] + [('back', i) for i in back.edge_idx['neck'][::-1]][1:]
_nb = len(back.edge_idx['neck'])
_rot = len(front.edge_idx['neck']) + _nb // 2 - 1          # centre-back vertex
NECK_IDX = NECK_IDX[_rot:] + NECK_IDX[1:_rot + 1]           # closed loop starting and ending at centre back
_nl2 = [(front if pc == 'front' else back).v2[i] for pc, i in NECK_IDX]
NECK_CUM = [0.0]
for i in range(1, len(_nl2)): NECK_CUM.append(NECK_CUM[-1] + math.dist(_nl2[i], _nl2[i - 1]))
band = None
if collar in ('crew', 'v', 'polo', 'dress'):
    is_col = collar in ('polo', 'dress')
    bl = P['collar']['w'] if is_col else NECK_CUM[-1]
    bh = P['collar']['h'] if is_col else 0.65 * scale
    bottom = [(c * bl / NECK_CUM[-1], 0) for c in NECK_CUM]
    band = Piece('collar' if is_col else 'neck_rib', [
        ('bottom', bottom, None),
        ('end_b', line((bl, 0), (bl, bh)), 3 if is_col else 2),
        ('top', line((bl, bh), (0, bh)), neck_loop),
        ('end_a', line((0, bh), (0, 0)), 3 if is_col else 2),
    ])
    pieces.append(band)

# Hood: two mirrored halves; each neck edge takes half the neckline (centre front -> centre back).
hoods = []
if collar == 'hood':
    kf = NECK_IDX.index(('front', front.edge_idx['neck'][len(front.edge_idx['neck']) // 2]))
    HOOD_LOOPS = {'hood_left': NECK_IDX[:kf + 1][::-1], 'hood_right': NECK_IDX[kf:]}  # left = wearer's left (+X)
    Hh = 13.5 * scale
    for nm, lp in HOOD_LOOPS.items():
        pts2 = [(front if pc == 'front' else back).v2[i] for pc, i in lp]
        cum = [0.0]
        for i in range(1, len(pts2)): cum.append(cum[-1] + math.dist(pts2[i], pts2[i - 1]))
        Dh = cum[-1]
        backc = bez((Dh, 0), (Dh + 3.0 * scale, Hh * 0.45), (Dh + 0.5, Hh * 0.97), (Dh * 0.42, Hh), 32)
        face = bez((Dh * 0.42, Hh), (Dh * 0.02, Hh * 0.92), (-1.0 * scale, Hh * 0.4), (0, 0), 32)
        pc_ = Piece(nm, [('neck', [(c, 0) for c in cum], None), ('back', backc, count(backc)), ('face', face, count(face))])
        pc_.loop, pc_.cum = lp, cum
        hoods.append(pc_); pieces.append(pc_)

def tack(patch, keys, target):
    """Topstitch: each boundary vertex on the given edges is sewn to the nearest target vertex (same 2D frame)."""
    tv = target.v2
    for k in keys:
        for i in patch.edge_idx[k]:
            x, y = patch.v2[i]
            j = min(range(len(tv)), key=lambda t: (tv[t][0] - x) ** 2 + (tv[t][1] - y) ** 2)
            edges.append((base[patch.name] + i, base[target.name] + j))

patches = []  # (piece, lift above the front, tacked edges)
if g.get('pocket'):
    y0, y1 = 1.4, H * 0.4
    bw, tw = 6.4 * scale, 4.2 * scale
    openR = bez((cx + bw, y0 + 3), (cx + bw, y1 - 2), (cx + tw + 1.5, y1), (cx + tw, y1), 16)
    openL = bez((cx - tw, y1), (cx - tw - 1.5, y1), (cx - bw, y1 - 2), (cx - bw, y0 + 3), 16)
    pocket = Piece('pocket', [
        ('bottom', line((cx - bw, y0), (cx + bw, y0)), round(2 * bw / RES)),
        ('side_R', line((cx + bw, y0), (cx + bw, y0 + 3)), 4),
        ('open_R', openR, count(openR)),
        ('top', line((cx + tw, y1), (cx - tw, y1)), round(2 * tw / RES)),
        ('open_L', openL, count(openL)),
        ('side_L', line((cx - bw, y0 + 3), (cx - bw, y0)), 4),
    ])
    patches.append((pocket, 0.3, ['bottom', 'side_R', 'top', 'side_L'])); pieces.append(pocket)
if g.get('placket'):
    pl_top = H - fd - 0.1
    pl_bot = 1.5 if collar == 'dress' else pl_top - 7 * scale
    placket = Piece('placket', [
        ('bottom', line((cx - 0.75, pl_bot), (cx + 0.75, pl_bot)), 3),
        ('right', line((cx + 0.75, pl_bot), (cx + 0.75, pl_top)), max(4, round((pl_top - pl_bot) / RES))),
        ('top', line((cx + 0.75, pl_top), (cx - 0.75, pl_top)), 3),
        ('left', line((cx - 0.75, pl_top), (cx - 0.75, pl_bot)), max(4, round((pl_top - pl_bot) / RES))),
    ])
    patches.append((placket, 0.12, ['bottom', 'right', 'top', 'left'])); pieces.append(placket)

hem_rib = None
if kind == 'hoodie' or (kind == 'longsleeve' and g.get('cuffs')):
    hem_rib = Piece('hem_rib', [
        ('bottom', line((0, 0), (2 * W, 0)), 2 * N['hem']),
        ('end_b', line((2 * W, 0), (2 * W, 2.2)), 3),
        ('top', line((2 * W, 2.2), (0, 2.2)), 2 * N['hem']),
        ('end_a', line((0, 2.2), (0, 0)), 3),
    ])
    pieces.append(hem_rib)

# ----------------------------------------------------------------- mannequin + placement (inches)
a = 0.402 * chest * drop                       # garment half-width, as src/3d/garmentMath.ts
ax_b, b_b = 0.82 * a / drop, 0.62 * a / drop   # mannequin chest (half width, half depth): human ratio ~0.75
bg = b_b * (1.0 if drop == 1 else 1.05) + 0.7  # starting surface depth: just outside the mannequin
def _half_perim(A, B):
    return sum(math.hypot(A * (math.sin(math.pi * (i + 1) / 200) - math.sin(math.pi * i / 200)), B * (math.cos(math.pi * (i + 1) / 200) - math.cos(math.pi * i / 200))) for i in range(200))
_lo, _hi = bg, 3 * a
for _ in range(50):  # starting width whose half perimeter is the pattern width, so side seams start closed
    a = (_lo + _hi) / 2
    if _half_perim(a, bg) > W: _hi = a
    else: _lo = a
L = g['lengthIn']
neckA = 3.8 if collar == 'hood' else 3.4
neckA *= scale; neckB = neckA * 0.88
shoulder = 0.72 if kind == 'tank' else 0.97

def key_rings():  # port of bodyKeyRings(): the garment surface the pieces start on (shoulders already shaped)
    as_, dr = a * shoulder, 2.2
    slope = [(L - dr * (1 - t), as_ + (neckA - as_) * t, bg * 0.9 + (neckB - bg * 0.9) * t) for t in (0.18, 0.4, 0.6, 0.8, 0.93, 1)]
    return [(0, a * 0.99, bg * 0.98), (L * 0.35, a, bg), (L * 0.66, a, bg), (L - dr - 1.2, a * max(shoulder, 0.985), bg * 0.96), (L - dr, as_, bg * 0.9)] + slope
RINGS = key_rings()

def ring_at(z):
    if z <= RINGS[0][0]: return RINGS[0][1:]
    for i in range(1, len(RINGS)):
        z0, A0, B0 = RINGS[i - 1]; z1, A1, B1 = RINGS[i]
        if z <= z1:
            t = (z - z0) / ((z1 - z0) or 1); s_ = t * t * (3 - 2 * t)
            return A0 + (A1 - A0) * s_, B0 + (B1 - B0) * s_
    return RINGS[-1][1:]

_arc_cache = {}
def angle_for(A, B, s):
    """Angle t (0 = centre line) whose arc length from the centre line is |s|; beyond the side it wraps on."""
    key = (round(A, 2), round(B, 2))
    tab = _arc_cache.get(key)
    if tab is None:
        ts = [math.pi * i / 400 for i in range(401)]; acc = [0.0]
        for i in range(1, 401):
            acc.append(acc[-1] + math.hypot(A * (math.sin(ts[i]) - math.sin(ts[i - 1])), B * (math.cos(ts[i]) - math.cos(ts[i - 1]))))
        tab = _arc_cache[key] = (ts, acc)
    ts, acc = tab
    m = min(abs(s), acc[-1])
    lo, hi = 0, 400
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if acc[mid] < m: lo = mid
        else: hi = mid
    f = (m - acc[lo]) / ((acc[hi] - acc[lo]) or 1)
    return math.copysign(ts[lo] + (ts[hi] - ts[lo]) * f, s)

def torso_pos(x, y, sign, lift=0.0):  # sign -1 front (-Y), +1 back (+Y); pattern y -> height
    z = y * L / H
    A, B = ring_at(z)
    t = angle_for(A, B, x - cx)
    return Vector(((A + lift) * math.sin(t), sign * (B + lift) * math.cos(t), z))

long_sleeve = has_sleeves and g['sleeveLengthIn'] > 14
arm_theta = 0.8 if long_sleeve else 0.95  # A-pose: a long sleeve must start clear of the torso cloth or the solver tangles them
def arm_frame(side):
    sx = 1 if side == 'left' else -1                     # wearer's left = +X
    axis = Vector((sx * math.sin(arm_theta), 0, -math.cos(arm_theta)))
    out = Vector((sx * math.cos(arm_theta), 0, math.sin(arm_theta)))
    rr = (Ws / (2 * math.pi)) if has_sleeves else 2.5
    start = Vector((sx * a * shoulder * 0.93, 0, L - 2.2 - rr * 0.55))
    return start, axis, out

def sleeve_pos(x, y, side, length, width, rad, offset=0.0):
    start, axis, out = arm_frame(side)
    fwd = Vector((0, -1, 0))
    phi = 2 * math.pi * (x - width / 2) / width
    return start + axis * (offset + length - y) + (out * math.cos(phi) + fwd * math.sin(phi)) * rad

placed = {}
placed['front'] = [torso_pos(x, y, -1) for x, y in front.v2]
placed['back'] = [torso_pos(x, y, +1) for x, y in back.v2]
for sd_, pc in sleeves.items():
    placed[pc.name] = [sleeve_pos(x, y, sd_, Ls, Ws, r0) for x, y in pc.v2]
for sd_, pc in cuffs.items():
    placed[pc.name] = [sleeve_pos(x, y, sd_, Hc, Wc, r1 * 1.04, offset=Ls - 0.3) for x, y in pc.v2]

def loop_points(key):  # neck/hem loop: front edge (stored R->L or L->R) then back edge reversed, as sewn below
    if key == 'neck':
        return [placed[pc][i] for pc, i in NECK_IDX]
    f = [placed['front'][i] for i in front.edge_idx[key]]
    b = [placed['back'][i] for i in back.edge_idx[key][::-1]][1:]
    return f + b

def on_loop(pts, frac):
    lens = [0.0]
    for i in range(1, len(pts)): lens.append(lens[-1] + (pts[i] - pts[i - 1]).length)
    m = frac * lens[-1]
    for i in range(1, len(pts)):
        if lens[i] >= m:
            t = (m - lens[i - 1]) / ((lens[i] - lens[i - 1]) or 1)
            return pts[i - 1].lerp(pts[i], t)
    return pts[-1]

def on_cum(pts, cum, d):  # point at fabric distance d along a 3D loop whose 2D arc lengths are cum
    for i in range(1, len(cum)):
        if cum[i] >= d:
            t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) or 1)
            return pts[i - 1].lerp(pts[i], t)
    return pts[-1]
for pc_ in hoods:  # a wall standing on its half of the neckline; it collapses into a draped hood
    lp3 = [placed[pc][i] for pc, i in pc_.loop]
    def hood_pos(x, y, lp3=lp3, cum=pc_.cum):
        d = max(0.0, min(cum[-1], x))
        return on_cum(lp3, cum, d) + Vector((0, (x - d), y))
    placed[pc_.name] = [hood_pos(x, y) for x, y in pc_.v2]
for pc_, lift, _ in patches:
    placed[pc_.name] = [torso_pos(x, y, -1, lift) for x, y in pc_.v2]
if band is not None:  # stands straight up from the neckline it is sewn to
    nl = loop_points('neck')
    sc = NECK_CUM[-1] / band.x1
    placed[band.name] = [on_cum(nl, NECK_CUM, x * sc) + Vector((0, 0, y)) for x, y in band.v2]
if hem_rib is not None:  # hangs straight down from the hem
    hl = loop_points('hem')
    placed[hem_rib.name] = [on_loop(hl, (x - hem_rib.x0) / (hem_rib.x1 - hem_rib.x0)) * 1.0 + Vector((0, 0, y - hem_rib.y1)) for x, y in hem_rib.v2]

# ----------------------------------------------------------------- one cloth mesh + sewing springs
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
verts, faces, edges, owner, base = [], [], [], [], {}
for pc in pieces:
    base[pc.name] = len(verts)
    verts.extend(v * K for v in placed[pc.name])
    owner.extend([pc.name] * len(pc.v2))
    faces.extend([[base[pc.name] + i for i in f] for f in pc.faces])

SEAM_SPANS = {}
def span(name, fn):
    lo_ = len(edges); fn(); SEAM_SPANS[name] = (lo_, len(edges))

def sew(pa, ka, pb, kb, reverse=False):
    ia = [base[pa.name] + i for i in pa.edge_idx[ka]]
    ib = [base[pb.name] + i for i in pb.edge_idx[kb]]
    if reverse: ib = ib[::-1]
    if len(ia) != len(ib):
        ib = [ib[round(k * (len(ib) - 1) / (len(ia) - 1))] for k in range(len(ia))]
    edges.extend(zip(ia, ib))

span('side_L', lambda: sew(front, 'side_L', back, 'side_L'))
span('side_R', lambda: sew(front, 'side_R', back, 'side_R'))
span('shoulder_L', lambda: sew(front, 'shoulder_L', back, 'shoulder_L'))
span('shoulder_R', lambda: sew(front, 'shoulder_R', back, 'shoulder_R'))
if has_sleeves:
    # front armhole (shoulder->underarm) to cap (top->front end); back armhole to cap (top->back end)
    # wearer's left (+X) armhole is the torso's right edge in 2D.
    for sd_, ka in (('left', 'arm_R'), ('right', 'arm_L')):
        sl = sleeves[sd_]
        f_arm = front.edge_idx[ka]; b_arm = back.edge_idx[ka]
        if ka == 'arm_R':  # stored underarm->shoulder
            f_arm, b_arm = f_arm[::-1], b_arm[::-1]
        cap_f = sl.edge_idx['cap_f']   # stored front-end -> top
        cap_b = sl.edge_idx['cap_b']   # stored top -> back-end
        # left sleeve: front of the body is the cap's x > Ws/2 half; the right sleeve is mirrored in X,
        # so its front half is still x > Ws/2 (placement uses the same fwd vector).
        pairs = [(f_arm, cap_f[::-1], front), (b_arm, cap_b, back)]
        for arm_i, cap_i, body in pairs:
          def _do(arm_i=arm_i, cap_i=cap_i, body=body):
            ia = [base[body.name] + i for i in arm_i]
            ib = [base[sl.name] + i for i in cap_i]
            ib = [ib[round(k * (len(ib) - 1) / (len(ia) - 1))] for k in range(len(ia))]
            edges.extend(zip(ia, ib))
          span(f'{sd_}_{body.name}_arm', _do)
        span(f'{sd_}_under', lambda: sew(sl, 'under_a', sl, 'under_b', reverse=True))
for sd_, cf in cuffs.items():
    sew(sleeves[sd_], 'hem', cf, 'top', reverse=True)
    sew(cf, 'end_a', cf, 'end_b', reverse=True)
if band is not None:
    # neckline loop: front neck (stored R->L) then back neck (stored R->L, reversed so the loop continues)
    loop = [base[pc] + i for pc, i in NECK_IDX]
    ib = [base[band.name] + i for i in band.edge_idx['bottom']]
    assert len(ib) == len(loop), (len(ib), len(loop))
    _n0 = len(edges); edges.extend(zip(loop, ib)); SEAM_SPANS['neck_band'] = (_n0, len(edges))
    sew(band, 'end_a', band, 'end_b', reverse=True)
if hem_rib is not None:
    loop = [base['front'] + i for i in front.edge_idx['hem']] + [base['back'] + i for i in back.edge_idx['hem'][::-1]][1:]
    ib = [base[hem_rib.name] + i for i in hem_rib.edge_idx['top'][::-1]]
    ib = [ib[round(k * (len(ib) - 1) / (len(loop) - 1))] for k in range(len(loop))]
    edges.extend(zip(loop, ib))
    sew(hem_rib, 'end_a', hem_rib, 'end_b', reverse=True)

# seam diagnostics: initial gap per sewing spring (a crossed seam shows up as long springs)
_lens = [(Vector(verts[i]) - Vector(verts[j])).length / K for i, j in edges]
for nm, (lo_, hi_) in SEAM_SPANS.items():
    seg = _lens[lo_:hi_]
    if seg: print(f'SEAM {nm:14s} n={len(seg):3d} mean={sum(seg)/len(seg):5.2f} max={max(seg):5.2f} in')
for pc_ in hoods:
    edges.extend((base[pc] + i, base[pc_.name] + j) for (pc, i), j in zip(pc_.loop, pc_.edge_idx['neck']))
if len(hoods) == 2:
    sew(hoods[0], 'back', hoods[1], 'back')
for pc_, _, keys in patches:
    tack(pc_, keys, front)
me = bpy.data.meshes.new('cloth')
me.from_pydata([tuple(v) for v in verts], [tuple(e) for e in edges], [tuple(f) for f in faces])
me.update()
cloth = bpy.data.objects.new('cloth', me)
scene.collection.objects.link(cloth)

# Face winding: every piece's normals point away from what it wraps (needed for front-side print overlays).
def outward(name, p):
    if name in ('left_sleeve', 'right_sleeve', 'left_cuff', 'right_cuff'):
        start, axis, _ = arm_frame(name.split('_')[0])
        start = start * K
        d = p - start
        return d - axis * d.dot(axis)
    return Vector((p.x, p.y, 0))
for pc in pieces:
    b0 = base[pc.name]
    score = 0.0
    for f in pc.faces[::7]:
        vs = [Vector(verts[b0 + i]) for i in f]
        n = (vs[1] - vs[0]).cross(vs[2] - vs[0])
        score += n.dot(outward(pc.name, sum(vs, Vector()) / 3))
    pc.flip = score < 0
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
flip_names = {pc.name for pc in pieces if pc.flip}
for f in bm.faces:
    if owner[f.verts[0].index] in flip_names:
        f.normal_flip()
bm.to_mesh(me); bm.free()

# ----------------------------------------------------------------- mannequin (collision only)
def loft(name, rings, seg=48):
    vs, fs = [], []
    for (z, A, B) in rings:
        for i in range(seg):
            t = 2 * math.pi * i / seg
            vs.append((A * math.sin(t) * K, B * math.cos(t) * K, z * K))
    for r in range(len(rings) - 1):
        for i in range(seg):
            a0, a1 = r * seg + i, r * seg + (i + 1) % seg
            fs.append((a0, a1, a1 + seg, a0 + seg))
    vs.append((0, 0, rings[0][0] * K)); vs.append((0, 0, rings[-1][0] * K))
    bot, top = len(vs) - 2, len(vs) - 1
    for i in range(seg):
        fs.append((bot, (i + 1) % seg, i))
        fs.append((top, (len(rings) - 1) * seg + i, (len(rings) - 1) * seg + (i + 1) % seg))
    m = bpy.data.meshes.new(name); m.from_pydata(vs, [], fs); m.update()
    bm_ = bmesh.new(); bm_.from_mesh(m)
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)  # collision needs outward normals
    bm_.to_mesh(m); bm_.free()
    o = bpy.data.objects.new(name, m); scene.collection.objects.link(o)
    return o

def smooth_rings(keys, n=40):
    out = []
    for k in range(n + 1):
        z = keys[0][0] + (keys[-1][0] - keys[0][0]) * k / n
        for i in range(1, len(keys)):
            if z <= keys[i][0] + 1e-9:
                z0, A0, B0 = keys[i - 1]; z1, A1, B1 = keys[i]
                t = (z - z0) / ((z1 - z0) or 1); s = t * t * (3 - 2 * t)
                out.append((z, A0 + (A1 - A0) * s, B0 + (B1 - B0) * s)); break
    return out

neck_r = nk * 0.72
body_keys = [  # mannequin stays ~0.5-2" inside the starting garment surface at every height
    (-6, ax_b * 0.96, b_b * 0.96), (L * 0.3, ax_b * 0.93, b_b * 0.92), (L - 10, ax_b, b_b),
    (L - 3.4, ax_b * 0.98, b_b * 0.9), (L - 2.6, ax_b * 0.85, b_b * 0.8),
    (L - 1.0, neck_r * 1.3, neck_r * 1.15), (L + 0.3, neck_r, neck_r * 0.92), (L + 5, neck_r * 0.95, neck_r * 0.9),
]
body = loft('mannequin', smooth_rings(body_keys))
parts = [body]
for sd_ in ('left', 'right'):
    start, axis, out = arm_frame(sd_)
    arm_r = (r0 * 0.62) if has_sleeves else 2.0 * scale
    length = 26 * scale
    seg_rings = [(0, arm_r * 1.12, arm_r * 1.12), (length * 0.4, arm_r, arm_r * 0.95), (length, arm_r * 0.7, arm_r * 0.68)]
    arm = loft(f'arm_{sd_}', smooth_rings([(z, A, B) for z, A, B in seg_rings], 16), 32)
    # loft runs along +Z from 0; orient it along the arm axis
    rot = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
    arm.matrix_world = Matrix.Translation(start * K) @ rot
    parts.append(arm)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=arm_r * 1.05 * K, location=start * K, segments=32, ring_count=16)
    parts.append(bpy.context.active_object)
for o in parts:
    mod = o.modifiers.new('Collision', 'COLLISION')
    o.collision.thickness_outer = 0.004
    o.collision.cloth_friction = 8
    for poly in o.data.polygons: poly.use_smooth = True

# ----------------------------------------------------------------- simulate
# Rib knit (neck, cuffs, hem bands) stretches far more than the body fabric: weight 0 = soft.
vg = cloth.vertex_groups.new(name='stiff')
RIB = {'neck_rib', 'hem_rib', 'left_cuff', 'right_cuff'}  # hood/pocket/placket use body fabric
vg.add([i for i, o in enumerate(owner) if o not in RIB], 1.0, 'REPLACE')
vg.add([i for i, o in enumerate(owner) if o in RIB], 0.0, 'REPLACE')
mod = cloth.modifiers.new('Cloth', 'CLOTH')
s = mod.settings
s.vertex_group_structural_stiffness = 'stiff'
s.tension_stiffness_max = s.compression_stiffness_max = 15
s.quality = int(opt.get("--quality", 12))
s.mass = 0.4 / len(verts)  # Blender's mass is per vertex: ~0.4 kg garment in total
s.tension_stiffness = s.compression_stiffness = 1.5  # rib (weight 0); body fabric uses the max
s.shear_stiffness = 8
s.bending_stiffness = 0.6 if kind in ('tee', 'tank', 'polo') else 1.2
s.air_damping = 1.0
s.use_sewing_springs = True
s.sewing_force_max = 0.0
cs = mod.collision_settings
cs.collision_quality = 4
cs.distance_min = 0.003
cs.use_self_collision = True
cs.self_distance_min = 0.0025
mod.point_cache.frame_start = 1
mod.point_cache.frame_end = FRAMES
scene.frame_start, scene.frame_end = 1, FRAMES
for f in range(1, FRAMES + 1):
    scene.frame_set(f)
dg = bpy.context.evaluated_depsgraph_get()
sim = cloth.evaluated_get(dg).to_mesh()
final = [v.co.copy() for v in sim.vertices]
cloth.evaluated_get(dg).to_mesh_clear()
for pc in pieces:
    b0 = base[pc.name]; st = []
    for f in pc.faces[::5]:
        for i, j in ((f[0], f[1]), (f[1], f[2])):
            r = math.dist(pc.v2[i], pc.v2[j]) * K
            st.append((final[b0 + i] - final[b0 + j]).length / r)
    st.sort()
    print(f'STRETCH {pc.name:12s} median={st[len(st)//2]:.3f} p95={st[int(len(st)*0.95)]:.3f}')

# ----------------------------------------------------------------- panels: rebuild each piece with UVs
for o in list(scene.objects):
    bpy.data.objects.remove(o, do_unlink=True)
zmin = min(v.z for v in final)

SMOOTH = int(opt.get('--smooth', 2))
def smoothed(pc):
    """Laplacian smoothing of interior vertices: removes inch-scale sim ripples, keeps folds and seams."""
    b0 = base[pc.name]
    pts = [final[b0 + i].copy() for i in range(len(pc.v2))]
    nb = [set() for _ in pts]; edge_count = {}
    for f in pc.faces:
        for k in range(3):
            i, j = f[k], f[(k + 1) % 3]
            nb[i].add(j); nb[j].add(i)
            e = (min(i, j), max(i, j)); edge_count[e] = edge_count.get(e, 0) + 1
    boundary = {v for e, c in edge_count.items() if c == 1 for v in e}
    for _ in range(SMOOTH):
        pts = [p if i in boundary or not nb[i] else p.lerp(sum((pts[j] for j in nb[i]), Vector()) / len(nb[i]), 0.5) for i, p in enumerate(pts)]
    return pts

def make(name, pc, uv_fn, flip_uv_faces=False):
    vs = [tuple(p - Vector((0, 0, zmin))) for p in smoothed(pc)]
    fs = [tuple(f[::-1]) if pc.flip else tuple(f) for f in pc.faces]
    m = bpy.data.meshes.new(name); m.from_pydata(vs, [], fs); m.update()
    uvl = m.uv_layers.new(name='UVMap')
    for loop in m.loops:
        uvl.data[loop.index].uv = uv_fn(*pc.v2[loop.vertex_index])
    for poly in m.polygons: poly.use_smooth = True
    o = bpy.data.objects.new(name, m); scene.collection.objects.link(o)
    sub = o.modifiers.new('Subdivision', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    sub.uv_smooth = 'NONE'
    sub.boundary_smooth = 'PRESERVE_CORNERS'
    return o

out_objs = []
out_objs.append(make('shirt_front', front, lambda x, y: (x / W, y / H)))
out_objs.append(make('shirt_back', back, lambda x, y: (1 - x / W, y / H)))
bi = make('shirt_back_inside', back, lambda x, y: (x / W, y / H))
out_objs.append(bi)
for sd_, pc in sleeves.items():
    fn = (lambda x, y: (1 - x / Ws, y / Ls)) if sd_ == 'left' else (lambda x, y: (x / Ws, y / Ls))
    out_objs.append(make(f'shirt_{sd_}_sleeve', pc, fn))
for sd_, pc in cuffs.items():
    fn = (lambda x, y: (1 - x / Wc, y / Hc)) if sd_ == 'left' else (lambda x, y: (x / Wc, y / Hc))
    out_objs.append(make(f'shirt_{sd_}_cuff', pc, fn))
if band is not None:
    if band.name == 'collar':
        out_objs.append(make('shirt_collar', band, lambda x, y: (x / band.x1, y / band.y1)))
    else:
        out_objs.append(make('shirt_neck_rib', band, lambda x, y: (x / band.x1, y / band.y1)))
if hem_rib is not None:
    out_objs.append(make('shirt_hem_rib', hem_rib, lambda x, y: (x / hem_rib.x1, y / hem_rib.y1)))
for pc_ in hoods:
    out_objs.append(make(f'shirt_{pc_.name}', pc_, lambda x, y, p=pc_: ((x - p.x0) / (p.x1 - p.x0), y / p.y1)))
for pc_, _, _ in patches:
    out_objs.append(make(f'shirt_{pc_.name}', pc_, lambda x, y, p=pc_: ((x - p.x0) / (p.x1 - p.x0), (y - p.y0) / (p.y1 - p.y0))))
if g.get('placket'):  # buttons sit on the settled placket, facing out of the fabric
    pl = next(pc_ for pc_, _, _ in patches if pc_.name == 'placket')
    plv = smoothed(pl)
    nbtn = 7 if collar == 'dress' else 3
    for k in range(nbtn):
        yb = pl.y1 - 0.9 - (pl.y1 - pl.y0 - 1.6) * k / max(1, nbtn - 1)
        i = min(range(len(pl.v2)), key=lambda t: (pl.v2[t][0] - cx) ** 2 + (pl.v2[t][1] - yb) ** 2)
        j = min(range(len(pl.v2)), key=lambda t: (pl.v2[t][0] - cx) ** 2 + (pl.v2[t][1] - yb + 0.6) ** 2)
        p0 = plv[i] - Vector((0, 0, zmin))
        down = (plv[j] - plv[i]).normalized()
        nrm = Vector((p0.x, p0.y, 0)).normalized().cross(Vector((0, 0, 1))).cross(down).normalized() if False else Vector((p0.x, p0.y, 0)).normalized()
        bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.27 * K, depth=0.1 * K, location=p0 + nrm * 0.12 * K)
        btn = bpy.context.active_object
        btn.rotation_euler = Vector((0, 0, 1)).rotation_difference(nrm).to_euler()
        btn.name = btn.data.name = f'shirt_button_{k + 1:02d}'
        out_objs.append(btn)

# ----------------------------------------------------------------- finish: subdivide, weld seams, bake AO
from mathutils.kdtree import KDTree
for o in out_objs:
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

# Subdivision rounds each panel's border on its own, opening hairline gaps along seams. Pull every border
# vertex onto the average of the nearest border vertices of the other panels (meshes stay separate).
def border(o):
    bm_ = bmesh.new(); bm_.from_mesh(o.data)
    ids = {v.index for e in bm_.edges if len(e.link_faces) == 1 for v in e.verts}
    bm_.free(); return ids
weldable = [o for o in out_objs if o.name != 'shirt_back_inside' and not o.name.startswith('shirt_button')]
bverts = [(oi, vi, o.data.vertices[vi].co.copy()) for oi, o in enumerate(weldable) for vi in border(o)]
kd = KDTree(len(bverts))
for k, (_, _, co) in enumerate(bverts): kd.insert(co, k)
kd.balance()
moved = 0
for oi, vi, co in bverts:
    near = [bverts[k][2] for _, k, d in kd.find_range(co, 0.35 * K) if bverts[k][0] != oi]
    if near:
        weldable[oi].data.vertices[vi].co = (co + sum(near, Vector()) / len(near)) / 2; moved += 1
print('WELD border verts moved:', moved)
bo = next(o for o in out_objs if o.name == 'shirt_back')
bi = next(o for o in out_objs if o.name == 'shirt_back_inside')
for v, w in zip(bi.data.vertices, bo.data.vertices): v.co = w.co

# Ambient occlusion baked to vertex colours: underarms, the neck opening, pocket and collar edges darken
# like real fabric. The viewer multiplies the fabric (and print) colour by it.
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'; scene.cycles.samples = int(opt.get('--ao-samples', 48))
wld = bpy.data.worlds.new('w'); scene.world = wld; wld.light_settings.distance = 3.0 * K
bi.hide_render = True  # a coincident copy of the back would occlude it completely
for o in out_objs:
    o.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
    o.data.color_attributes.active_color = o.data.color_attributes['AO']
    if o is bi: continue
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
bi.hide_render = False
for v, w in zip(bi.data.color_attributes['AO'].data, bo.data.color_attributes['AO'].data): v.color = w.color

bpy.ops.object.select_all(action='DESELECT')
for o in out_objs: o.select_set(True)
bpy.context.view_layer.objects.active = out_objs[0]
glb = os.path.join(OUT, f"{SPEC['model']}.glb")
bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_format='GLB', export_yup=True,
                          export_apply=True, export_draco_mesh_compression_enable=True, export_materials='NONE',
                          export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True)

# ----------------------------------------------------------------- report + verification renders
dims = {o.name: [round(d / K, 2) for d in o.dimensions] for o in out_objs}
json.dump({'model': SPEC['model'], 'frames': FRAMES, 'res_in': RES, 'pieces': {pc.name: [round(pc.x1 - pc.x0, 2), round(pc.y1 - pc.y0, 2)] for pc in pieces},
           'object_dims_in': dims, 'tris': sum(len(o.data.polygons) for o in out_objs) * 4},
          open(os.path.join(OUT, f"{SPEC['model']}.report.json"), 'w'), indent=1)

scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x, scene.render.resolution_y = 600, 700
sh_ = scene.display.shading
sh_.light = 'STUDIO'; sh_.color_type = 'VERTEX'
sh_.show_cavity = True; sh_.cavity_type = 'BOTH'
scene.display.shading.show_shadows = False
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
cam.data.type = 'ORTHO'
allz = [v.co.z for o in out_objs for v in o.data.vertices]
hgt = max(allz) - min(allz)
cam.data.ortho_scale = hgt * 1.25
scene.collection.objects.link(cam); scene.camera = cam
ctr = Vector((0, 0, hgt / 2))
for nm, d in {'front': Vector((0, -1, 0)), 'back': Vector((0, 1, 0)), 'side': Vector((1, 0, 0)), 'three_quarter': Vector((0.8, -1, 0.15))}.items():
    cam.location = ctr + d.normalized() * 3
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(OUT, f"{SPEC['model']}_{nm}.png")
    bpy.ops.render.render(write_still=True)
print('DONE', glb)
