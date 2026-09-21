#!/usr/bin/env python
"""Bake the tabletop surface textures into public/textures/ + a TS table.

Run with the workspace venv (PIL + numpy live there, not on PATH):

    ..\\maycad_extract\\Scripts\\python.exe scripts\\bake_tabletop_textures.py

WHY BAKED FILES RATHER THAN A CANVAS AT RUNTIME

The pattern is per-pixel, and for the panel constructions it depends on a lattice
of strips and glue lines whose width has to stay constant in MILLIMETRES. Doing
that in the browser means shipping the same maths in JS and re-deriving it on
every load, and it cannot be reviewed: a seam or a wrong tile size only shows up
once it is mapped onto a board. Baked PNGs can be looked at one file at a time,
at size, before any of it reaches three.js — and the numbers that matter at
runtime (tile size in mm, whether a map is colour or data) are written into the
generated table beside each file, so the shader-side code never guesses them.

TILING — the one rule everything here obeys

The board repeats this tile 2-4x across its 1200 mm width, so a seam is a bug,
not a trade-off. Three consequences, all load-bearing:

  * every noise lattice has an INTEGER cell count on both axes, so it wraps;
  * the ring count and the ply layer count are whole numbers, so the pattern
    closes onto itself; and
  * anything indexed by ring or layer number is a precomputed array of exactly
    that length, indexed modulo it.

Anything added here has to keep all three. A "nicer" non-integer ring count
re-introduces a visible line down the middle of every board.

WHY THE NOISE IS BUILT AT FULL RESOLUTION

An anisotropic noise made by generating a squashed buffer and upscaling it looks
like corrugated cardboard: bicubic interpolation of a 1-in-6 vertical squash
leaves a ripple at the source pixel pitch, which is exactly the frequency the eye
reads as "made by a machine". Every `fbm` call here therefore names its cell
count per axis directly — a small `cx` and a large `cy` IS the anisotropy, and
costs nothing. The first version of this file did it the other way and the
contact sheet is what caught it.

GRAIN PROFILE

A ring is not a sinusoid. It is a broad pale earlywood band with a thin dark
latewood line at its edge, so the line is drawn as a Gaussian spike at t=0 with
the rest of the ring left light (`line_k` sets its width). Ring darkness also
varies ring to ring from a periodic table — evenly spaced, evenly dark rings are
the other half of what makes procedural wood look printed.

EDGES

The solid-wood boards do NOT get a second bake: an edge is the same material
seen end-on, so the face image is reused, and at 600 mm of tile the ~20 mm of
thickness samples about one ring — which is what a real edge shows. Plywood is
the exception and the only one: its edge is a stack of veneers, a different
pattern at a different scale, and it is the one thing that makes a ply edge
recognisable.

COLOUR SPACE

`*_color.png` is sRGB albedo (three: SRGBColorSpace). `*_rough.png` is LINEAR
data (three: NoColorSpace) — reading it as sRGB silently bends every highlight.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "textures"
TABLE_TS = ROOT / "src" / "materials" / "tabletopTextures.ts"

FACE = 1024                 # face tile resolution
FACE_TILE_MM = 600.0        # how much board the face tile covers, both ways
MM_PER_PX = FACE_TILE_MM / FACE
PLY_EDGE_W, PLY_EDGE_H = 512, 256
PLY_EDGE_TILE_MM = (300.0, 20.0)  # [along the edge, through the thickness]


# ---------------------------------------------------------------------------
# Noise — every lattice wraps, so any crop of it tiles
# ---------------------------------------------------------------------------

def value_noise(h: int, w: int, cx: int, cy: int, rng: np.random.Generator) -> np.ndarray:
    """Periodic value noise in [0,1): a `cx` x `cy` lattice, smoothstep
    interpolated, wrapping on both axes. `cx` counts cells across the image
    width, `cy` across its height — a small `cx` with a large `cy` is what makes
    a feature read as drawn out along the grain."""
    g = rng.random((cy, cx))
    ys = np.linspace(0, cy, h, endpoint=False)
    xs = np.linspace(0, cx, w, endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    sy = (fy * fy * (3 - 2 * fy))[:, None]
    sx = (fx * fx * (3 - 2 * fx))[None, :]
    g00 = g[np.ix_(y0 % cy, x0 % cx)]
    g01 = g[np.ix_(y0 % cy, (x0 + 1) % cx)]
    g10 = g[np.ix_((y0 + 1) % cy, x0 % cx)]
    g11 = g[np.ix_((y0 + 1) % cy, (x0 + 1) % cx)]
    top = g00 * (1 - sx) + g01 * sx
    bot = g10 * (1 - sx) + g11 * sx
    return top * (1 - sy) + bot * sy


def fbm(h: int, w: int, cx: int, cy: int, octaves: int, rng: np.random.Generator) -> np.ndarray:
    """Octaves of `value_noise`, each doubling the cell count on both axes and
    halving the amplitude; normalised so the result spans [0,1] whatever the
    octave count. Integer cell counts at every octave keep it periodic."""
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for i in range(octaves):
        out += amp * value_noise(h, w, cx * 2**i, cy * 2**i, rng)
        total += amp
        amp *= 0.5
    return out / total


def periodic_tones(n: int, rng, lo: float, hi: float, corr: int = 4) -> np.ndarray:
    """`n` values in [lo,hi] that vary smoothly over about `corr` of them, and
    wrap. Indexed by ring (or layer) number MODULO `n`, which is what lets a
    per-ring property vary without breaking the tile.

    The correlation is in ENTRIES, not in image fractions, and the result is NOT
    rescaled to span the full range. Both matter: normalising a 9-ring plank
    strip to [lo,hi] makes it swing end to end every couple of rings while a
    35-ring face of the same oak barely moves, so the same species comes out
    looking like two different woods.
    """
    m = max(2, int(round(n / max(1, corr))))
    ctrl = rng.random(m) * (hi - lo) + lo
    idx = np.arange(n) * m / n
    i0 = np.floor(idx).astype(int) % m
    f = idx - np.floor(idx)
    f = f * f * (3 - 2 * f)                      # smoothstep, so the joins are soft
    return ctrl[i0] * (1 - f) + ctrl[(i0 + 1) % m] * f


def _cells_x(tile_mm, wavelength_mm):
    return max(1, round(tile_mm / wavelength_mm))


def _cells_y(tile_mm, wavelength_mm):
    return max(1, round(tile_mm / wavelength_mm))


def grain_cells(tile_mm):
    """Cell counts (x, y) for each layer of the grain, from PHYSICAL wavelengths.

    A cell count cannot be a fraction of the image. A 122 mm plank strip and a
    600 mm face are the same number of pixels wide, so "5 cells across" is a
    42 mm wave in one and a 205 mm wave in the other — the strip's rings come out
    five times more contorted than the face's, and the panel reads as a stack of
    smeared bands instead of as four boards of the same oak. Wavelengths in
    millimetres make a strip look like the wood the face is made of.

    BOTH axes take the tile, not just Y. Converting only Y leaves every
    along-grain feature running at 600/tile times its intended wavelength — 3.75x
    too fast inside a 160 mm strip — which is the same defect wearing the other
    axis's clothes.
    """
    return {
        "bow": (2, _cells_y(tile_mm, 200)),          # the cathedral arc
        "drift": (1, _cells_y(tile_mm, 320)),        # rings crowding and opening
        "rough": (_cells_x(tile_mm, 60), _cells_y(tile_mm, 5)),
        "fade": (_cells_x(tile_mm, 140), _cells_y(tile_mm, 140)),
        "streak": (_cells_x(tile_mm, 200), _cells_y(tile_mm, 4)),
        "pore": (_cells_x(tile_mm, 8), _cells_y(tile_mm, 3)),
        "blotch": (_cells_x(tile_mm, 130), _cells_y(tile_mm, 130)),
    }


# ---------------------------------------------------------------------------
# Species
# ---------------------------------------------------------------------------

@dataclass
class Species:
    """A wood, as the numbers a surface needs rather than a colour swatch."""

    id: str
    label: str
    note: str
    ring_mm: float      # distance between two rings, in millimetres of board
    line_k: float       # how narrow the latewood line is within its ring
    warp: float         # cathedral bow, as a PEAK displacement in rings (so ±warp/2)
    contrast: float     # 0..1, how dark the latewood line gets
    light: tuple        # earlywood, the body of the board
    dark: tuple         # latewood, the line
    pore: float = 0.0   # 0..1, open-pore dashes (oak yes, ply no)
    streak: float = 0.0 # 0..1, fine longitudinal streaks
    rough: float = 0.62


OAK = Species(
    id="oak", label="橡木", note="直纹 · 年轮细密，导管孔在光下发暗",
    ring_mm=17.0, line_k=4.8, warp=1.05, contrast=0.85,
    light=(216, 188, 147), dark=(122, 90, 55),
    pore=0.55, streak=0.45, rough=0.60,
)
WALNUT = Species(
    id="walnut", label="黑胡桃", note="直纹 · 色深，年轮宽、明暗对比强",
    ring_mm=26.0, line_k=5.0, warp=1.30, contrast=0.85,
    light=(130, 92, 61), dark=(54, 33, 20),
    pore=0.20, streak=0.55, rough=0.50,
)
PLY = Species(
    id="ply", label="多层板", note="薄面皮 + 侧边一叠胶合层 · 层厚按毫米固定，不随板厚变",
    ring_mm=45.0, line_k=4.0, warp=0.55, contrast=0.46,
    light=(228, 204, 162), dark=(180, 148, 106),
    pore=0.0, streak=0.28, rough=0.55,
)


def rings_in(tile_mm: float, sp: Species) -> int:
    """Rings across `tile_mm`, rounded to a whole number. The rounding is the
    price of tiling: it nudges the pitch by up to half a ring over 600 mm, which
    no one can see, and buys a pattern that joins onto itself exactly."""
    return max(1, round(tile_mm / sp.ring_mm))


def grain_field(h: int, w: int, sp: Species, rng, phase: float = 0.0,
                tile_mm: float = FACE_TILE_MM) -> np.ndarray:
    """The grain tone in [0,1]: 1 is pale earlywood, 0 is the dark latewood line.

    The rings are bands of the ACROSS-grain coordinate, displaced by three terms
    whose sum is measured in RINGS:

      - the cathedral bow, which is long along the grain and short across it;
      - a slow drift that lets the rings crowd and open up the way real ones do;
      - a fine roughening, so no individual line sits on a ruler.

    Every term is a periodic function of the wrapped coordinate, so `u` is a
    function of that coordinate alone — which is what makes the whole thing tile.
    """
    v = np.arange(h, dtype=float)[:, None] * np.ones((1, w))
    n = rings_in(tile_mm, sp)
    c = grain_cells(tile_mm)

    # Cells across X vs Y is the whole trick. The bow and the drift need few X
    # cells and more Y cells: a warp that varied freely ACROSS the rings would
    # dissolve them into noise instead of bending them. The roughening is the
    # other way round — fine in Y, coarse in X — because it acts along a line.
    warp = (fbm(h, w, *c["bow"], 3, rng) - 0.5) * 2 * sp.warp
    warp += (fbm(h, w, *c["drift"], 2, rng) - 0.5) * 1.1
    warp += (fbm(h, w, *c["rough"], 2, rng) - 0.5) * 0.14

    u = v / h * n + warp + phase
    k = np.floor(u)
    t = u - k
    # Per-ring properties from tables of exactly `n` entries, so ring 0 and ring n
    # are the same ring and the tile closes through the grain. Rings vary in how
    # dark they are AND in how wide their latewood band is — evenly spaced, evenly
    # dark rings are most of what makes procedural wood look printed.
    idx = k.astype(int) % n
    depth = periodic_tones(n, rng, lo=0.15, hi=1.05)[idx]
    width = periodic_tones(n, rng, lo=0.60, hi=1.55)[idx]

    tone = 1.0 - sp.contrast * depth * np.exp(-((t * sp.line_k * width) ** 2))
    # And the lines fade along their length — down to nothing in places, so no
    # line runs the full width of the board at one strength. This is what stops a
    # board reading as corrugation: a uniform line every 17 mm, all of them the
    # same darkness end to end, is a rib. The floor is low on purpose; a term that
    # can only take a line to 35 % still leaves every rib visible.
    tone = 1.0 - (1.0 - tone) * (0.10 + 0.90 * fbm(h, w, *c["fade"], 2, rng))

    if sp.streak:
        s = fbm(h, w, *c["streak"], 2, rng)
        tone *= 1.0 - sp.streak * 0.30 * np.clip((s - 0.55) / 0.45, 0, 1)
    if sp.pore:
        # Open pores: short dashes along the grain, a few mm long, not streaks.
        p = fbm(h, w, *c["pore"], 2, rng)
        tone *= 1.0 - sp.pore * 0.5 * np.clip((p - 0.68) / 0.32, 0, 1)
    return np.clip(tone, 0.0, 1.0)


def colorize(tone: np.ndarray, sp: Species, rng, tile_mm=FACE_TILE_MM) -> np.ndarray:
    """Tone -> RGB against a broad blotch, which is what keeps a procedural board
    from reading as a printout."""
    light = np.array(sp.light, dtype=float)
    dark = np.array(sp.dark, dtype=float)
    rgb = dark + (light - dark) * tone[:, :, None]
    rgb *= (0.95 + 0.10 * fbm(*tone.shape, *grain_cells(tile_mm)["blotch"], 3, rng))[:, :, None]
    rgb *= (0.985 + 0.03 * rng.random(tone.shape))[:, :, None]
    return np.clip(rgb, 0, 255)


def roughness_from(tone: np.ndarray, sp: Species, rng, smooth=None,
                   smooth_to=0.40, tile_mm=FACE_TILE_MM) -> np.ndarray:
    """Open grain and latewood are rougher than the polished earlywood. A little
    noise keeps it from reading as a flat number. `smooth` is an optional 0..1
    mask of areas that are not wood at all — glue, which is smoother."""
    r = sp.rough * (1.0 - 0.20 * (1.0 - tone))
    r += 0.03 * fbm(*tone.shape, *grain_cells(tile_mm)["pore"], 2, rng)
    if smooth is not None:
        r = r * (1 - smooth) + smooth_to * smooth
    return np.clip(r * 255, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Panel constructions
# ---------------------------------------------------------------------------

def plank_field(h: int, w: int, sp: Species, rng, strips_mm=(160, 122, 175, 143)):
    """胶合拼板: boards of unequal width, glued edge to edge.

    The strips run ALONG the grain — in this image, that means they are stacked
    down the V axis and the seams are horizontal. Stacking them across U instead
    would put every seam at right angles to the grain, which is not a thing
    anyone has ever built. Each strip gets its own grain phase and tone; the
    widths are forced to sum to the tile so the panel still tiles.
    """
    px = [max(2, round(mm / MM_PER_PX)) for mm in strips_mm]
    px[-1] += h - sum(px)

    tone = np.zeros((h, w))
    y = 0
    for sh in px:
        sub_mm = sh * MM_PER_PX
        sub = grain_field(sh, w, sp, rng, phase=rng.random() * 4.0, tile_mm=sub_mm)
        # Boards out of the same pack are never the same colour, and a strip that
        # matches its neighbour is the giveaway. Both the level and the contrast
        # move, so the boards differ in more than brightness.
        level = 0.82 + 0.34 * rng.random()
        span = 0.90 + 0.20 * rng.random()
        tone[y:y + sh] = np.clip(level * (0.5 + (sub - 0.5) * span), 0, 1)
        y += sh

    # The joint: 3 px of shadow with a 1 px highlight on the near side, where the
    # chamfer catches the light. A dead-straight wound reads as a printed line —
    # a rule drawn across the panel — so the joint has to come and go along its
    # length. That variation is in X, ACROSS the joint, not in Y along it: a
    # 2-cell noise varies over 300 mm, which is a smooth gradient down a line that
    # is still perfectly straight, and it still reads as drawn.
    seam = np.zeros((h, w))
    y = 0
    for sh in px[:-1]:
        y += sh
        seam[max(0, y - 2):y + 1, :] = 1.0
        seam[max(0, y - 3):y - 2, :] = -0.6
    seam = seam * (0.50 + 0.50 * value_noise(h, w, 26, 14, rng))
    shadow = np.clip(seam, 0, 1)
    lit = np.clip(-seam, 0, 1)
    return np.clip(tone * (1.0 - 0.55 * shadow) + 0.12 * lit, 0, 1), shadow


def ply_face_field(h: int, w: int, sp: Species, rng) -> np.ndarray:
    """多层板的正面：一层很薄的面皮，纹很淡，还常留一点旋切的宽弧。

    Faint, but not blank. Compressing to 0.55..1 of the grain field halves an
    already low contrast, and the result stops reading as a wood face at all —
    it comes out as an unpainted sheet, which is worse than a slightly loud one.
    """
    return np.clip(0.35 + 0.65 * grain_field(h, w, sp, rng), 0, 1)


def ply_edge_field(h, w, rng, layers, veneer, glue, tile_mm) -> np.ndarray:
    """多层板的侧边：一叠面皮 + 胶线。这是唯一能一眼认出多层板的地方。

    The stack is a function of the THICKNESS axis (plus a wobble along the
    length, which is how a saw actually cuts), so the layer pitch is the same in
    millimetres whatever the board's thickness — the pitch belongs to the
    material, not the board. `layers` is an integer so the tile closes through
    the thickness, and the per-layer tone is indexed modulo it.
    """
    v = np.arange(h, dtype=float)[:, None] * np.ones((1, w))
    # Periodic in v with period h, so the wobble joins at the tile boundary.
    wobble = (fbm(h, w, 4, 1, 2, rng) - 0.5) * (h * 0.02)
    pitch = veneer + glue
    u = (v + wobble) / h * tile_mm / pitch
    k = np.floor(u)
    t = u - k

    band = glue / pitch
    # The glue line: dark, soft-edged, wider on the loose side of the knife.
    line = np.exp(-((t / band) ** 2) * 1.6)
    # Veneers are peeled from different logs and never match; the face veneers
    # are a touch paler than the core.
    tone = periodic_tones(layers, rng, lo=0.80, hi=1.02)[k.astype(int) % layers]
    field = tone * (1.0 - 0.92 * line)
    field *= 0.94 + 0.12 * fbm(h, w, 3, 24, 2, rng)
    return np.clip(field, 0, 1)


# ---------------------------------------------------------------------------

def write_png(arr: np.ndarray, path: Path) -> None:
    """PNG, no palette, no dithering — a dithered smooth gradient shows up as a
    stipple once it is mapped at 1.5x across a board."""
    Image.fromarray(arr.astype(np.uint8), "RGB" if arr.ndim == 3 else "L").save(
        path, optimize=True)
    print(f"  {path.relative_to(ROOT).as_posix():<42} {path.stat().st_size / 1024:7.1f} KB")


def swatch(sp: Species) -> str:
    """The picker's tint: the species' earlywood, darkened, so a board whose
    image has not arrived yet still shows a recognisable chip."""
    return "#%02x%02x%02x" % tuple(int(c * 0.62) for c in sp.light)


def species_entry(sp: Species, rng) -> dict:
    """A solid-wood board. No separate edge bake — see the module docstring."""
    tone = grain_field(FACE, FACE, sp, rng)
    return {
        "id": sp.id, "label": sp.label, "note": sp.note, "color": swatch(sp),
        "face": colorize(tone, sp, rng).astype(np.uint8),
        "face_rough": roughness_from(tone, sp, rng),
        "edge": None, "edge_rough": None,
        "edge_tile_mm": (int(FACE_TILE_MM), int(FACE_TILE_MM)),
    }


def plank_entry(sp: Species, rng) -> dict:
    e = species_entry(sp, rng)
    tone, seam = plank_field(FACE, FACE, sp, rng)
    # Baked at the scale of a whole face: this is what the panel looks like, not
    # what one of its boards looks like.
    e.update(id="plank", label="橡木拼板",
             note="宽窄不一的板条胶拼 · 接缝处的胶线比木头更光",
             face=colorize(tone, sp, rng).astype(np.uint8),
             face_rough=roughness_from(tone, sp, rng, smooth=seam))
    return e


def ply_entry(rng) -> dict:
    sp = PLY
    face = ply_face_field(FACE, FACE, sp, rng)
    tile_mm = PLY_EDGE_TILE_MM[1]
    layers = max(2, round(tile_mm / 1.83))      # integer => the stack closes
    glue = round(0.28, 2)
    veneer = round(tile_mm / layers - glue, 4)
    edge = ply_edge_field(PLY_EDGE_H, PLY_EDGE_W, rng, layers, veneer, glue, tile_mm)

    dark = np.array((118, 80, 44), dtype=float)
    light = np.array((232, 202, 152), dtype=float)
    edge_rgb = dark + (light - dark) * edge[:, :, None]
    # The core veneers are a touch warmer and dirtier than the face veneers.
    edge_rgb *= (0.90 + 0.20 * fbm(PLY_EDGE_H, PLY_EDGE_W, 2, 6, 2, rng))[:, :, None]
    # Glue is smoother than wood, so the roughness map follows the stack.
    edge_rough = np.clip((0.71 - 0.30 * edge) * 255, 0, 255).astype(np.uint8)

    return {
        "id": sp.id, "label": sp.label, "note": sp.note, "color": swatch(sp),
        "face": colorize(face, sp, rng).astype(np.uint8),
        "face_rough": roughness_from(face, sp, rng),
        "edge": np.clip(edge_rgb, 0, 255).astype(np.uint8),
        "edge_rough": edge_rough,
        "edge_tile_mm": (int(PLY_EDGE_TILE_MM[0]), int(PLY_EDGE_TILE_MM[1])),
        "layers": layers,
    }


def render_ts(entries) -> str:
    """The table the app reads. Written here, beside the pixels it describes, so
    a tile size can never drift away from the image it belongs to."""
    def url(stem):
        return "/textures/" + stem + ".png"

    out = [
        "// GENERATED by scripts/bake_tabletop_textures.py — do not edit by hand.",
        "// Re-run that script instead; it writes both the PNGs and this table.",
        "",
        "export interface TabletopTexture {",
        "  id: string;",
        "  label: string;",
        "  /** One line for the picker: what you are looking at. */",
        "  note: string;",
        "  /** Swatch tint, and what is drawn if the PNG never arrives. */",
        "  color: string;",
        "  faceUrl: string;",
        "  /** Millimetres of board `faceUrl` covers, both ways. */",
        "  faceTileMm: number;",
        "  /** The same material seen end-on, and how many mm of it the tile spans:",
        "   *  [along the edge, through the thickness]. */",
        "  edgeUrl: string;",
        "  edgeTileMm: [number, number];",
        "  /** LINEAR data (three: NoColorSpace) — never read a roughness map as sRGB. */",
        "  faceRoughUrl: string;",
        "  edgeRoughUrl: string;",
        "  /** How the tile repeats. Omitted means 'repeat', which is seamless for",
        "   *  everything baked here — the wrap-aware noise above guarantees it. It is",
        "   *  set for UPLOADED boards only: a photograph is not tileable, and mirroring",
        "   *  turns a hard seam into a fold the eye reads as more grain. */",
        "  wrap?: 'repeat' | 'mirror';",
        "}",
        "",
        "export const FACE_TILE_MM = %d;" % FACE_TILE_MM,
        "",
        "export const TABLETOP_TEXTURES: TabletopTexture[] = [",
    ]
    for e in entries:
        stem = e["id"] + "_edge" if e["edge"] is not None else e["id"]
        out += [
            "  {",
            "    id: %s," % json.dumps(e["id"], ensure_ascii=False),
            "    label: %s," % json.dumps(e["label"], ensure_ascii=False),
            "    note: %s," % json.dumps(e["note"], ensure_ascii=False),
            "    color: %s," % json.dumps(e["color"]),
            "    faceUrl: %s," % json.dumps(url(e["id"] + "_color")),
            "    faceRoughUrl: %s," % json.dumps(url(e["id"] + "_rough")),
            "    faceTileMm: %d," % FACE_TILE_MM,
            "    edgeUrl: %s," % json.dumps(url(stem + "_color")),
            "    edgeRoughUrl: %s," % json.dumps(url(stem + "_rough")),
            "    edgeTileMm: [%d, %d]," % e["edge_tile_mm"],
            "  },",
        ]
    out += [
        "];",
        "",
        "export const DEFAULT_TABLETOP_TEXTURE = 'oak';",
        "",
        "// The by-id lookup deliberately does NOT live here. It is not a fact about",
        "// the baked images; it is the one resolution point for the whole pipeline,",
        "// and it has to be able to see boards that exist only at runtime (uploads).",
        "// See src/materials/boardRegistry.ts — boardById().",
        "",
    ]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20260921, help="same seed -> same files")
    ap.add_argument("--no-ts", action="store_true", help="skip the generated TS table")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    entries = []

    def emit(entry, tag):
        print(tag)
        write_png(entry["face"], OUT / (entry["id"] + "_color.png"))
        write_png(entry["face_rough"], OUT / (entry["id"] + "_rough.png"))
        if entry["edge"] is not None:
            write_png(entry["edge"], OUT / (entry["id"] + "_edge_color.png"))
            write_png(entry["edge_rough"], OUT / (entry["id"] + "_edge_rough.png"))
        entries.append(entry)

    for sp in (OAK, WALNUT):
        emit(species_entry(sp, np.random.default_rng(args.seed + sum(map(ord, sp.id)))),
             "%s (%s) — %d rings of %.1f mm across the tile"
             % (sp.label, sp.id, rings_in(FACE_TILE_MM, sp), FACE_TILE_MM / rings_in(FACE_TILE_MM, sp)))

    emit(plank_entry(OAK, np.random.default_rng(args.seed + 101)),
         "橡木拼板 (plank) — 4 boards, 160/122/175/143 mm, seams parallel to the grain")

    e = ply_entry(np.random.default_rng(args.seed + 202))
    emit(e, "多层板 (ply) — %d layers across %g mm of thickness"
         % (e["layers"], PLY_EDGE_TILE_MM[1]))

    if not args.no_ts:
        TABLE_TS.parent.mkdir(parents=True, exist_ok=True)
        TABLE_TS.write_text(render_ts(entries), encoding="utf-8")
        print("\ngenerated " + TABLE_TS.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
