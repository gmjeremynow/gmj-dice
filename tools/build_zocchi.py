"""Build a Zocchihedron-style 100-faced ball for Dice So Nice!.

Outputs:
  models/zocchihedron.glb          visual model (silver, numbered faces)
  scripts/zocchihedron-shape.js    addDiceShape bundle (collider, values, rotations)
The visual mesh and the collider share the same vertices and face order.
"""
import json, math, struct, io, sys
import numpy as np
from scipy.spatial import ConvexHull
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
N = 100

# 1. Evenly spread 100 face directions (Fibonacci lattice).
i = np.arange(N) + 0.5
phi = np.arccos(1 - 2 * i / N)
theta = math.pi * (1 + 5 ** 0.5) * i
P = np.stack([np.cos(theta) * np.sin(phi), np.cos(phi), np.sin(theta) * np.sin(phi)], 1)

# 2. Faces are planes tangent to the unit sphere at those points.
#    Polyhedron vertices = points where three neighbouring planes meet.
hull = ConvexHull(P)
verts, vmap = [], {}
def vid(x):
    for k, v in enumerate(verts):
        if np.linalg.norm(v - x) < 1e-6:
            return k
    verts.append(x); return len(verts) - 1
face_vs = [set() for _ in range(N)]
for tri in hull.simplices:
    x = np.linalg.solve(P[tri], np.ones(3))
    k = vid(x)
    for t in tri: face_vs[t].add(k)
verts = np.array(verts)

faces, bases = [], []
for f in range(N):
    n = P[f]
    ref = np.array([0, 1, 0]) if abs(n[1]) < 0.9 else np.array([1, 0, 0])
    e1 = np.cross(ref, n); e1 /= np.linalg.norm(e1)
    e2 = np.cross(n, e1)
    ids = sorted(face_vs[f], key=lambda k: math.atan2(verts[k] @ e2, verts[k] @ e1))
    faces.append(ids); bases.append((e1, e2))

r_out = np.linalg.norm(verts, axis=1).max()
print(f"faces={N} vertices={len(verts)} sides={sorted(set(len(f) for f in faces))} circum/in={r_out:.4f}")

# 3. Values 1-100 spread so low and high numbers mix (stride 37 is coprime to 100).
values = [(f * 37) % 100 + 1 for f in range(N)]

# 4. Rotation table: for faces a,b a 180-degree turn about the axis halfway
#    between their normals swaps them, so it works in either direction.
def euler_xyz(R):
    m13 = max(-1.0, min(1.0, R[0, 2]))
    y = math.asin(m13)
    if abs(m13) < 0.9999999:
        x = math.atan2(-R[1, 2], R[2, 2]); z = math.atan2(-R[0, 1], R[0, 0])
    else:
        x = math.atan2(R[2, 1], R[1, 1]); z = 0.0
    return x, y, z
def mat_xyz(x, y, z):
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz
by_value = {values[f]: f for f in range(N)}
rot, worst = {}, 0
for a in range(1, N + 1):
    for b in range(a + 1, N + 1):
        na, nb = P[by_value[a]], P[by_value[b]]
        k = na + nb
        if np.linalg.norm(k) < 1e-9:
            k = np.cross(na, [1, 0, 0] if abs(na[0]) < 0.9 else [0, 1, 0])
        k /= np.linalg.norm(k)
        R = 2 * np.outer(k, k) - np.eye(3)
        e = euler_xyz(R)
        R2 = mat_xyz(*e)
        worst = max(worst, np.linalg.norm(R2 @ nb - na), np.linalg.norm(R2 @ na - nb))
        rot[f"{a},{b}"] = [round(math.degrees(t), 4) for t in e]
print(f"rotation table entries={len(rot)} max swap error={worst:.2e}")

# 5. Texture atlas: one 10x10 grid tile per face.
TEX, G = 1024, 10
T = TEX / G
img = Image.new("RGB", (TEX, TEX), (201, 204, 210))
draw = ImageDraw.Draw(img)
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(T * 0.36))
rotmap = {"0": "0", "1": "1", "6": "9", "8": "8", "9": "6"}
def ambiguous(s):
    if not all(c in rotmap for c in s): return False
    r = "".join(rotmap[c] for c in reversed(s))
    return r != s and not r.startswith("0") and 1 <= int(r) <= 100
local = []
for f in range(N):
    e1, e2 = bases[f]
    local.append([(verts[k] @ e1, verts[k] @ e2) for k in faces[f]])
rmax = max(math.hypot(u, v) for pts in local for u, v in pts)
scale = 0.47 * T / rmax
uvs = []
for f in range(N):
    cx, cy = (f % G + 0.5) * T, (f // G + 0.5) * T
    s = str(values[f])
    draw.text((cx, cy), s, font=font, fill=(255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=(25, 25, 30))
    if ambiguous(s):
        bb = draw.textbbox((cx, cy), s, font=font, anchor="mm")
        draw.rectangle([bb[0], bb[3] + 3, bb[2], bb[3] + 7], fill=(255, 255, 255), outline=(25, 25, 30))
    uvs.append([((cx + u * scale) / TEX, (cy - v * scale) / TEX) for u, v in local[f]])
png = io.BytesIO(); img.save(png, "PNG"); png = png.getvalue()
img.save(OUT + "/models/zocchihedron-atlas-preview.png")

# 6. Mesh: flat-shaded, per-face vertices, triangle fans, same face order.
pos, nor, tex, idx = [], [], [], []
for f in range(N):
    base = len(pos)
    for j, k in enumerate(faces[f]):
        pos.append(verts[k]); nor.append(P[f]); tex.append(uvs[f][j])
    for j in range(1, len(faces[f]) - 1):
        idx += [base, base + j, base + j + 1]
pos = np.array(pos, np.float32); nor = np.array(nor, np.float32)
tex = np.array(tex, np.float32); idx = np.array(idx, np.uint16)

blobs, views = b"", []
def add(data, target=None):
    global blobs
    while len(blobs) % 4: blobs += b"\0"
    v = {"buffer": 0, "byteOffset": len(blobs), "byteLength": len(data)}
    if target: v["target"] = target
    views.append(v); blobs += data
    return len(views) - 1
vp, vn, vt, vi = add(pos.tobytes(), 34962), add(nor.tobytes(), 34962), add(tex.tobytes(), 34962), add(idx.tobytes(), 34963)
vimg = add(png)
gltf = {
  "asset": {"version": "2.0", "generator": "gmj-dice build_zocchi.py"},
  "scene": 0, "scenes": [{"nodes": [0]}],
  "nodes": [{"mesh": 0, "name": "zocchihedron"}],
  "meshes": [{"name": "zocchihedron", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0}]}],
  "materials": [{"name": "silver", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.7, "roughnessFactor": 0.3}}],
  "textures": [{"source": 0, "sampler": 0}],
  "samplers": [{"magFilter": 9729, "minFilter": 9987}],
  "images": [{"bufferView": vimg, "mimeType": "image/png"}],
  "accessors": [
    {"bufferView": vp, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
    {"bufferView": vn, "componentType": 5126, "count": len(nor), "type": "VEC3"},
    {"bufferView": vt, "componentType": 5126, "count": len(tex), "type": "VEC2"},
    {"bufferView": vi, "componentType": 5123, "count": len(idx), "type": "SCALAR"}],
  "bufferViews": views,
  "buffers": [{"byteLength": len(blobs)}],
}
js = json.dumps(gltf, separators=(",", ":")).encode()
js += b" " * (-len(js) % 4); blobs += b"\0" * (-len(blobs) % 4)
glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blobs))
glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(blobs), 0x004E4942) + blobs
open(OUT + "/models/zocchihedron.glb", "wb").write(glb)

# 7. Dice So Nice! shape bundle.
bundle = {
  "name": "gmj-dice.zocchihedron",
  "type": "ConvexPolyhedron",
  "vertices": [[round(float(c), 5) for c in v] for v in verts],
  "faces": faces,
  "faceValues": values,
  "rotationCombinations": rot,
}
with open(OUT + "/scripts/zocchihedron-shape.js", "w") as fh:
    fh.write("// Generated by tools/build_zocchi.py. Do not edit by hand.\n")
    fh.write("export const ZOCCHI_SHAPE = " + json.dumps(bundle, separators=(",", ":")) + ";\n")
print(f"glb={len(glb)} bytes")
