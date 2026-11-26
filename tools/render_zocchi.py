import json, re, sys, math
import numpy as np
from PIL import Image
src = open(sys.argv[1] + "/scripts/zocchihedron-shape.js").read()
B = json.loads(src[src.index("{"):src.rindex("}") + 1])
V = np.array(B["vertices"]); F = B["faces"]
# rebuild normals/bases exactly like the builder
N = len(F)
P = np.array([np.mean(V[f], 0) for f in F]); P /= np.linalg.norm(P, axis=1)[:, None]
# plane offsets
D = np.array([V[f[0]] @ P[i] for i, f in enumerate(F)])
atlas = np.array(Image.open(sys.argv[1] + "/models/zocchihedron-atlas-preview.png")).astype(float) / 255
# recover UV mapping from glb is complex; instead reproject with the same basis rule
import struct
glb = open(sys.argv[1] + "/models/zocchihedron.glb", "rb").read()
jl = struct.unpack("<I", glb[12:16])[0]; G = json.loads(glb[20:20 + jl]); bin_ = glb[20 + jl + 8:]
def acc(i, dt, n):
    a = G["accessors"][i]; v = G["bufferViews"][a["bufferView"]]
    return np.frombuffer(bin_[v["byteOffset"]:v["byteOffset"] + v["byteLength"]], dt).reshape(-1, n)
pos, uv = acc(0, np.float32, 3) / B.get("meshScale", 1), acc(2, np.float32, 2)
# per-face affine map from (e1,e2) plane coords to uv using first 3 verts of each face
maps, off = [], 0
bases = []
for i, f in enumerate(F):
    n = P[i]; ref = np.array([0, 1, 0]) if abs(n[1]) < 0.9 else np.array([1, 0, 0])
    e1 = np.cross(ref, n); e1 /= np.linalg.norm(e1); e2 = np.cross(n, e1); bases.append((e1, e2))
    pts = pos[off:off + len(f)]; tx = uv[off:off + len(f)]; off += len(f)
    A = np.c_[pts @ e1, pts @ e2, np.ones(len(f))]
    M, *_ = np.linalg.lstsq(A, tx, rcond=None); maps.append(M)
def render(view_dir, up, size=420):
    w = -np.array(view_dir, float); w /= np.linalg.norm(w)
    u = np.cross(up, w); u /= np.linalg.norm(u); v = np.cross(w, u)
    ys, xs = np.mgrid[0:size, 0:size]
    sx = (xs - size / 2) / (size / 2.4); sy = -(ys - size / 2) / (size / 2.4)
    O = (sx[..., None] * u + sy[..., None] * v + 5 * w).reshape(-1, 3); Dd = np.tile(-w, (len(O), 1))
    nd = Dd @ P.T; no = O @ P.T
    t = (D - no) / np.where(nd == 0, 1e-12, nd)
    tin = np.where(nd < 0, t, -np.inf); tout = np.where(nd > 0, t, np.inf)
    te, fe = tin.max(1), tin.argmax(1); hit = te < tout.min(1)
    X = O + te[:, None] * Dd
    out = np.zeros((len(O), 3)) + 0.15
    for i in np.unique(fe[hit]):
        m = hit & (fe == i); e1, e2 = bases[i]
        t2 = np.c_[X[m] @ e1, X[m] @ e2, np.ones(m.sum())] @ maps[i]
        px = np.clip((t2 * 1024).astype(int), 0, 1023)
        col = atlas[px[:, 1], px[:, 0]]
        L = np.array([0.4, 0.8, 0.5]); L /= np.linalg.norm(L)
        shade = 0.35 + 0.65 * max(P[i] @ L, 0)
        out[m] = col * shade
    return Image.fromarray((np.clip(out, 0, 1).reshape(size, size, 3) * 255).astype(np.uint8))
a = render([0.3, -0.5, -1], [0, 1, 0]); b = render([0, -1, 0.01], [0, 0, 1])
c = Image.new("RGB", (840, 420)); c.paste(a, (0, 0)); c.paste(b, (420, 0)); c.save("/tmp/zocchi_preview.png")
