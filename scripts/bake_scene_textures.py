"""Bake the surfaces the room SCENES are built from — floor, walls, concrete, rug.

Sibling of `bake_tabletop_textures.py`, not an extension of it. That script's
whole vocabulary is BOARDS: a face and an end-grain edge, veneer stacks, a
thickness axis. A wall is one plane with no edge; forcing it through `Species`
would put an `edgeTileMm` on a plaster wall and make both tables worse. What is
shared is the part that must never be reimplemented — the wrap-aware noise — and
that is imported from it directly (its `main()` is behind a `__main__` guard, so
importing it bakes nothing).

Run by hand, like the tabletop bake:

    ..\\maycad_extract\\Scripts\\python.exe scripts/bake_scene_textures.py

Writes `public/textures/<id>_color.png` + `<id>_rough.png` and regenerates
`src/materials/sceneTextures.ts`.

--------------------------------------------------------------------------------
THE TILING CONTRACT (the same one, because it is the same noise)

Every scene surface is mapped by authoring UVs in TILE UNITS — the geometry's
position in millimetres divided by the tile size — with `texture.repeat` left at
1. So each surface is tiled hundreds of times across the room, and every one of
those repeats is a chance to show a seam:

  · every noise lattice has an INTEGER cell count on both axes;
  · the board widths of the floor sum to the tile exactly, and the butt joints
    are indexed modulo the tile;
  · the rug's thread count is a whole number, and its per-thread tone table is
    indexed modulo that count;
  · anything indexed by ring/thread is a precomputed array of exactly that
    length.

--------------------------------------------------------------------------------
WHAT IS NOT BAKED HERE, ON PURPOSE

  · The dark scene reads today's flat `#2b2a37` / `#3c3a44`. It is the one
    scene that is a faithful record of how the page looked before scenes
    existed, so giving it a nice texture would be removing the reference.
  · The seamless studio backdrop is a flat colour too: a cyclorama IS a
    featureless sweep. Its realism comes from the curve and the light, not
    from a map.

Cost: one 1024^2 pair (the floor — the largest surface in the brightest scene,
where a repeat would show worst) plus three 512^2 pairs. About 2 MB, and `emit`
below fails the bake if a file outgrows its budget, which is how a stray alpha
channel or a dithered gradient gets caught here rather than in a screenshot.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bake_tabletop_textures import (  # noqa: E402  — path is set just above
    OAK,
    OUT,
    ROOT,
    colorize,
    fbm,
    grain_field,
    periodic_tones,
    roughness_from,
    value_noise,
    write_png,
)

SCENE_TS = ROOT / "src" / "materials" / "sceneTextures.ts"

# --- the floor: 1024^2 over 1.6 m, the one hero surface in this set ----------
FLOOR_PX = 1024
FLOOR_TILE_MM = 1600.0
# Board widths in millimetres. Unequal, as sawn boards are, and summing to the
# tile exactly (190+210+180+205+195+215+185+220 = 1600) so the pattern closes.
FLOOR_WIDTHS_MM = (190, 210, 180, 205, 195, 215, 185, 220)

# A floor board is not a tabletop board, so it is not the same `Species`.
# Flooring is cut from a different part of the log and finished differently, and
# two numbers carry that: the rings are wider (24 mm against the tabletop's 17),
# which is what a 200 mm-wide plank actually shows — the tabletop's 17 mm rings
# squeezed into a 190 mm board come out at nine lines and read as corduroy — and
# the sealed surface holds less open pore. Same wood, same colour; a different
# product. `replace` rather than a second literal so the colours cannot drift.
FLOOR_OAK = replace(OAK, ring_mm=24.0, line_k=5.2, contrast=0.72,
                    pore=0.30, streak=0.50, rough=0.66)

# --- the rest: 512^2 is plenty for a non-hero surface ------------------------
WALL_PX = 512
WALL_TILE_MM = 1200.0
CONCRETE_PX = 512
CONCRETE_TILE_MM = 1200.0
RUG_PX = 512
RUG_TILE_MM = 500.0
# 8 mm of wool per thread — chunky, which is what reads as a rug at room
# distance, and whole, so the weave closes through the tile.
RUG_THREADS = 64

# Bytes: a 1024^2 RGB PNG of this kind of noise lands near 0.9 MB, a 512^2 near
# 0.25 MB, and the greyscale roughness a fifth of that. The ceilings are ~30 %
# above that so ordinary seed-to-seed variation never trips them, and a change
# that adds an alpha channel or dithering always does.
SIZE_LIMIT_KB = {512: 420, 1024: 1300}


def iso_cells(tile_mm: float, wavelength_mm: float) -> tuple[int, int]:
    """Integer cell counts for an ISOTROPIC feature of `wavelength_mm` on a
    square tile. Same rounding, and the same reason, as `grain_cells`: a cell
    count cannot be a fraction, and the pitch has to be a physical length or the
    texture stops describing the thing it is a picture of."""
    n = max(1, round(tile_mm / wavelength_mm))
    return n, n


# ---------------------------------------------------------------------------
# 木地板 — boards with butt joints, staggered
# ---------------------------------------------------------------------------

def floor_field(h: int, w: int, sp, rng, widths_mm=FLOOR_WIDTHS_MM,
                tile_mm=FLOOR_TILE_MM):
    """Boards running along the image's X, stacked down V, with END joints.

    `plank_field` in the tabletop bake is the same construction minus the end
    joints: it glues boards edge to edge, which is a panel. A floor is a
    running bond — every board is cut to length and butted against the next one
    along its own run, and the cuts are staggered from row to row. That
    stagger is most of what says "floor" rather than "worktop".

    Returns (tone, joint). Both are in the BOARD frame, grain along X; the
    caller transposes them once at the end.
    """
    mm_per_px = tile_mm / h
    px = [max(2, round(mm / mm_per_px)) for mm in widths_mm]
    px[-1] += h - sum(px)          # the last board absorbs the rounding

    tone = np.zeros((h, w))
    butt = np.zeros((h, w))
    y = 0
    for r, sh in enumerate(px):
        sub_mm = sh * mm_per_px
        # One cut per board, at a staggered fraction of the tile — so the joints
        # in neighbouring rows never line up. u = 0 is a cut in EVERY row: the
        # texture's own edge is the one place a seam could show, and this hides
        # it under a joint. The fraction is irrational-ish (golden-ratio step)
        # so the stagger does not fall into a short cycle.
        frac = 0.28 + 0.44 * ((r * 0.618) % 1.0)
        jx = int(round(frac * w)) % w
        cuts = ((0, jx), (jx, w)) if jx else ((0, w),)
        for x0, x1 in cuts:
            if x1 - x0 < 2:
                continue
            # Each cut piece is its own board: its own grain phase, ring table,
            # level and contrast. This is why the grain restarts at a butt joint
            # — which is exactly what a butt joint is.
            seg = grain_field(sh, x1 - x0, sp, rng, phase=rng.random() * 4.0,
                              tile_mm=sub_mm)
            level = 0.82 + 0.34 * rng.random()
            span = 0.90 + 0.20 * rng.random()
            tone[y:y + sh, x0:x1] = np.clip(
                level * (0.5 + (seg - 0.5) * span), 0, 1)
        if jx:
            # 3 px of shadow with a 1 px lit chamfer on the near side. At
            # 1.56 mm/px this reads as the shadow line of a joint, not as a gap
            # — which is honest: a floor joint is closed, what you see is the
            # chamfer and the dirt in it.
            butt[y:y + sh, (jx - 2) % w] = 1.0
            butt[y:y + sh, (jx - 1) % w] = 1.0
            butt[y:y + sh, jx % w] = 1.0
            butt[y:y + sh, (jx - 3) % w] = -0.6
        y += sh

    # The long seams, between boards, edge to edge.
    seam = np.zeros((h, w))
    y = 0
    for sh in px[:-1]:
        y += sh
        seam[max(0, y - 2):y + 1, :] = 1.0
        seam[max(0, y - 3):y - 2, :] = -0.6

    # A dead-straight joint reads as a rule drawn across the surface, so both
    # families come and go along their own length. The cell counts are the
    # point: the long seams vary ALONG X (30 cells, ~53 mm) and barely across
    # it (2); the butt joints are the transpose of that. Varying only across a
    # joint gives a smooth gradient down a line that is still perfectly
    # straight, and it still reads as drawn.
    seam *= 0.50 + 0.50 * value_noise(h, w, 30, 2, rng)
    butt *= 0.50 + 0.50 * value_noise(h, w, 2, 30, rng)

    joint = seam + butt
    shadow = np.clip(joint, 0, 1)
    lit = np.clip(-joint, 0, 1)
    return np.clip(tone * (1.0 - 0.55 * shadow) + 0.12 * lit, 0, 1), shadow


def floor_entry(rng) -> dict:
    tone, joint = floor_field(FLOOR_PX, FLOOR_PX, FLOOR_OAK, rng)
    # Shade in the BOARD frame. `colorize` and `roughness_from` reach for
    # `grain_cells`, whose pore term is deliberately anisotropic — 8 mm along
    # the grain against 3 mm across it. Rotating first and shading after would
    # turn every pore across the grain, and the whole floor would come out
    # comby. Transposing after shading rotates the finished image instead,
    # which costs nothing: both axes are periodic.
    color = colorize(tone, FLOOR_OAK, rng, tile_mm=FLOOR_TILE_MM)
    rough = roughness_from(tone, FLOOR_OAK, rng, smooth=joint,
                           tile_mm=FLOOR_TILE_MM)
    # A quarter turn, so the boards run along V — on the floor plane that is
    # away from the camera rather than across the frame.
    return {
        "id": "floor_oak",
        "tile_mm": FLOOR_TILE_MM,
        "swatch": "#a8814f",
        "color": np.transpose(color, (1, 0, 2)).astype(np.uint8),
        "rough": np.transpose(rough).astype(np.uint8),
    }


# ---------------------------------------------------------------------------
# 墙面涂料 — one colour with a trowel sweep, and no feature that would repeat
# ---------------------------------------------------------------------------

def plaster_entry(rng) -> dict:
    h = w = WALL_PX
    broad = fbm(h, w, *iso_cells(WALL_TILE_MM, 300), 4, rng)   # the sweep
    fine = fbm(h, w, *iso_cells(WALL_TILE_MM, 22), 3, rng)     # orange peel
    tooth = rng.random((h, w))                                 # film texture

    # Deviations in 0..255 units, added to the base. Kept small: a painted wall
    # that shows its texture from across the room has the wrong texture. What
    # this has to do is stop the wall reading as a plane of one number.
    d = 255.0 * (0.055 * (broad - 0.5) + 0.022 * (fine - 0.5)
                 + 0.010 * (tooth - 0.5))
    base = np.array((241.0, 237.0, 229.0))
    # Paint greys down over plaster rather than changing hue, so the spread is
    # applied warm-biased and the hue stays in the base.
    rgb = base[None, None, :] + d[:, :, None] * np.array((1.0, 0.96, 0.88))

    r = np.clip((0.90 + 0.05 * (fine - 0.5)) * 255, 0, 255).astype(np.uint8)
    return {
        "id": "wall_plaster",
        "tile_mm": WALL_TILE_MM,
        "swatch": "#ded9cf",
        "color": np.clip(rgb, 0, 255).astype(np.uint8),
        "rough": r,
    }


# ---------------------------------------------------------------------------
# 水泥 — cast concrete: broad blotches, aggregate, and air holes
# ---------------------------------------------------------------------------

def concrete_entry(rng) -> dict:
    h = w = CONCRETE_PX
    blotch = fbm(h, w, *iso_cells(CONCRETE_TILE_MM, 320), 4, rng)
    mid = fbm(h, w, *iso_cells(CONCRETE_TILE_MM, 70), 3, rng)
    pits = fbm(h, w, *iso_cells(CONCRETE_TILE_MM, 26), 2, rng)
    speck = rng.random((h, w))

    d = 255.0 * (0.075 * (blotch - 0.5) + 0.045 * (mid - 0.5)
                 + 0.025 * (speck - 0.5))
    base = np.array((150.0, 149.0, 145.0))
    rgb = base[None, None, :] + d[:, :, None]

    # Air holes are the one feature you can name in a photograph of concrete.
    # Sparse, by threshold rather than by amplitude, so most of the surface
    # stays flat.
    hole = np.clip((pits - 0.74) / 0.26, 0, 1)
    rgb = rgb * (1.0 - 0.30 * hole)[:, :, None]

    # A little noise keeps it from reading as a flat number; not much, because
    # per-pixel variation here is incompressible in the PNG and, being smaller
    # than a pixel on screen, has nothing to show for itself either.
    r = np.clip((0.72 + 0.06 * (mid - 0.5) + 0.04 * (speck - 0.5)) * 255,
                0, 255).astype(np.uint8)
    return {
        "id": "floor_concrete",
        "tile_mm": CONCRETE_TILE_MM,
        "swatch": "#8c8b87",
        "color": np.clip(rgb, 0, 255).astype(np.uint8),
        "rough": r,
    }


# ---------------------------------------------------------------------------
# 地毯 — plain weave
# ---------------------------------------------------------------------------

def rug_entry(rng) -> dict:
    h = w = RUG_PX
    n = RUG_THREADS

    xi = np.arange(w, dtype=float) / w * n
    yi = np.arange(h, dtype=float) / h * n
    fx, ix = xi - np.floor(xi), np.floor(xi).astype(int) % n
    fy, iy = yi - np.floor(yi), np.floor(yi).astype(int) % n

    # Two per-thread tables of exactly `n` entries, indexed modulo n — the same
    # device the wood uses for its rings. Yarn from two cones is never the same
    # colour, and tables that wrap are the only way to vary it without a seam.
    # Kept narrow: a wide spread turns each thread into a stripe and the weave
    # into a grid of them.
    warp = periodic_tones(n, rng, lo=0.90, hi=1.02)
    weft = periodic_tones(n, rng, lo=0.90, hi=1.02)

    # A thread is round: lit along its middle, shaded at both edges, where the
    # one it crosses goes over or under it.
    prof_x = 0.72 + 0.28 * np.cos(2 * np.pi * fx)
    prof_y = 0.72 + 0.28 * np.cos(2 * np.pi * fy)

    # Plain weave: over one, under the next, alternating along BOTH threads, so
    # the checkerboard falls out of the parity of the two indices.
    over = ((iy[:, None] + ix[None, :]) % 2) == 0
    top = np.where(over, warp[ix][None, :], weft[iy][:, None])
    prof_top = np.where(over, prof_x[None, :], prof_y[:, None])
    prof_under = np.where(over, prof_y[:, None], prof_x[None, :])

    tone = top * (0.55 + 0.45 * prof_top) * (0.93 + 0.07 * prof_under)
    # Pile: the nap is never evenly lit, and without this the weave reads as
    # printed cloth.
    tone = tone * (0.95 + 0.10 * fbm(h, w, *iso_cells(RUG_TILE_MM, 60), 3, rng))

    rgb = np.array((198.0, 187.0, 171.0))[None, None, :] * tone[:, :, None]
    r = np.clip((0.92 + 0.05 * (fbm(h, w, *iso_cells(RUG_TILE_MM, 35), 2, rng)
                                - 0.5)) * 255, 0, 255).astype(np.uint8)
    return {
        "id": "rug_weave",
        "tile_mm": RUG_TILE_MM,
        "swatch": "#b3a894",
        "color": np.clip(rgb, 0, 255).astype(np.uint8),
        "rough": r,
    }


# ---------------------------------------------------------------------------

def render_ts(entries) -> str:
    """The table the app reads. Written here, beside the pixels it describes, so
    a tile size can never drift away from the image it belongs to."""
    out = [
        "// GENERATED by scripts/bake_scene_textures.py — do not edit by hand.",
        "// Re-run that script instead; it writes both the PNGs and this table.",
        "",
        "export interface SceneTexture {",
        "  id: string;",
        "  /** sRGB — a colour map, read as colour. */",
        "  colorUrl: string;",
        "  /** LINEAR data (three: NoColorSpace). Never read a roughness map as sRGB. */",
        "  roughUrl: string;",
        "  /** Millimetres of surface the tile covers, both ways. The scene's UVs are",
        "   *  authored in these units (millimetres / tileMm) with `texture.repeat`",
        "   *  left alone, so the tile size has to live beside the image it describes. */",
        "  tileMm: number;",
        "  /** What is drawn while the PNG loads, and if it never arrives at all. */",
        "  color: string;",
        "}",
        "",
        "export const SCENE_TEXTURES: SceneTexture[] = [",
    ]
    for e in entries:
        out += [
            "  {",
            "    id: %s," % json.dumps(e["id"]),
            "    colorUrl: %s," % json.dumps("/textures/" + e["id"] + "_color.png"),
            "    roughUrl: %s," % json.dumps("/textures/" + e["id"] + "_rough.png"),
            "    tileMm: %g," % e["tile_mm"],
            "    color: %s," % json.dumps(e["swatch"]),
            "  },",
        ]
    out += [
        "];",
        "",
        "export function sceneTextureById(id: string): SceneTexture | undefined {",
        "  return SCENE_TEXTURES.find((t) => t.id === id);",
        "}",
        "",
    ]
    return "\n".join(out)


def emit(entry: dict, tag: str) -> dict:
    print(tag)
    for name in ("color", "rough"):
        arr = entry[name]
        path = OUT / ("%s_%s.png" % (entry["id"], name))
        write_png(arr, path)
        limit = SIZE_LIMIT_KB[max(arr.shape[:2])]
        kb = path.stat().st_size / 1024
        if kb > limit:
            raise SystemExit(
                "%s is %.0f KB, over its %d KB budget — an alpha channel, or a "
                "gradient that picked up dithering?" % (path.name, kb, limit))
    return entry


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20261009,
                    help="same seed -> same files")
    ap.add_argument("--no-ts", action="store_true",
                    help="skip the generated TS table")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    entries = []

    entries.append(emit(floor_entry(np.random.default_rng(args.seed + 11)),
                        "木地板 (floor_oak) — %d boards, %g–%g mm, one butt joint "
                        "each, staggered"
                        % (len(FLOOR_WIDTHS_MM), min(FLOOR_WIDTHS_MM),
                           max(FLOOR_WIDTHS_MM))))
    entries.append(emit(plaster_entry(np.random.default_rng(args.seed + 22)),
                        "墙面涂料 (wall_plaster) — one colour, 300 mm trowel "
                        "sweep over %.0f mm" % WALL_TILE_MM))
    entries.append(emit(concrete_entry(np.random.default_rng(args.seed + 33)),
                        "水泥 (floor_concrete) — blotches, aggregate, air holes; "
                        "floors the workshop and, tinted, walls it"))
    entries.append(emit(rug_entry(np.random.default_rng(args.seed + 44)),
                        "地毯 (rug_weave) — plain weave, %d threads of %g mm"
                        % (RUG_THREADS, RUG_TILE_MM / RUG_THREADS)))

    total = sum((OUT / ("%s_%s.png" % (e["id"], n))).stat().st_size
                for e in entries for n in ("color", "rough"))
    print("\n%d textures, %.3f MB total" % (len(entries) * 2, total / 1024 / 1024))

    if not args.no_ts:
        SCENE_TS.parent.mkdir(parents=True, exist_ok=True)
        SCENE_TS.write_text(render_ts(entries), encoding="utf-8")
        print("generated " + SCENE_TS.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
