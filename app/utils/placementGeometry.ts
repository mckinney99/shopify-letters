// Geometry for the preview placement editor (SL-114).
//
// A placement box is stored in PERCENT of the container (x,y,w,h) plus a CSS
// `rotate(rotation deg)` about its center. CSS rotation happens in *pixel*
// space, and x/w are % of width while y/h are % of height — so all rotation
// math must be done in pixels (converting %→px→%), otherwise a non-square
// container shears the box.
//
// The seamless resize technique (Figma / Canva / react-moveable): move the
// dragged corner to the pointer while keeping the OPPOSITE corner fixed, by
// working in the box's local (un-rotated) frame. See
// https://shihn.ca/posts/2020/resizing-rotated-elements/

export type PlacementBox = { x: number; y: number; w: number; h: number; rotation: number };
export type Corner = "nw" | "ne" | "sw" | "se";

const CORNER_SIGN: Record<Corner, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  sw: [-1, 1],
  se: [1, 1],
};

const OPPOSITE: Record<Corner, Corner> = { nw: "se", ne: "sw", sw: "ne", se: "nw" };

function rot(x: number, y: number, rad: number): [number, number] {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [x * c - y * s, x * s + y * c];
}

/** Screen-pixel position of a box corner, accounting for rotation about center. */
export function cornerPx(box: PlacementBox, rectW: number, rectH: number, corner: Corner): { x: number; y: number } {
  const rad = (box.rotation * Math.PI) / 180;
  const cx = ((box.x + box.w / 2) / 100) * rectW;
  const cy = ((box.y + box.h / 2) / 100) * rectH;
  const wpx = (box.w / 100) * rectW;
  const hpx = (box.h / 100) * rectH;
  const [sx, sy] = CORNER_SIGN[corner];
  const [ox, oy] = rot((sx * wpx) / 2, (sy * hpx) / 2, rad);
  return { x: cx + ox, y: cy + oy };
}

/**
 * Resize a (possibly rotated) box by dragging `corner` to `pointer` (both in
 * container pixels), keeping the opposite corner fixed. `grabOffset` is the
 * pixel gap between the pointer and the corner at grab time, so there is no
 * jump on the first move. Sizes are clamped to min %; the box may extend past
 * the image edge (matches how design tools behave — no snapping).
 */
export function resizeRotatedBox(
  start: PlacementBox,
  corner: Corner,
  pointerX: number,
  pointerY: number,
  rectW: number,
  rectH: number,
  grabOffsetX = 0,
  grabOffsetY = 0,
  minW = 10,
  minH = 5,
): PlacementBox {
  const rad = (start.rotation * Math.PI) / 180;
  const anchor = cornerPx(start, rectW, rectH, OPPOSITE[corner]);

  // Vector anchor→(dragged corner), expressed in the box's local frame.
  const tx = pointerX - grabOffsetX - anchor.x;
  const ty = pointerY - grabOffsetY - anchor.y;
  let [lw, lh] = rot(tx, ty, -rad); // local axes: +x toward `corner`.x, +y toward corner.y

  // Corner sign tells us which local direction is "growing"; keep magnitudes
  // positive and clamp to the minimum size (in px).
  const [sx, sy] = CORNER_SIGN[corner];
  const minWpx = (minW / 100) * rectW;
  const minHpx = (minH / 100) * rectH;
  let wpx = Math.max(minWpx, lw * sx);
  let hpx = Math.max(minHpx, lh * sy);

  // New center = anchor + half-diagonal (toward the dragged corner) rotated back.
  const [hx, hy] = rot((sx * wpx) / 2, (sy * hpx) / 2, rad);
  const cx = anchor.x + hx;
  const cy = anchor.y + hy;

  return {
    x: ((cx - wpx / 2) / rectW) * 100,
    y: ((cy - hpx / 2) / rectH) * 100,
    w: (wpx / rectW) * 100,
    h: (hpx / rectH) * 100,
    rotation: start.rotation,
  };
}

/**
 * Move a box by a percent delta, keeping its CENTER on the image ([0,100]).
 * Edges may overflow — translation is rotation-invariant, so no rotation math
 * is needed and there is no axis-aligned-bounds snapping.
 */
export function moveBox(start: PlacementBox, dxPct: number, dyPct: number): PlacementBox {
  const cx = Math.max(0, Math.min(100, start.x + start.w / 2 + dxPct));
  const cy = Math.max(0, Math.min(100, start.y + start.h / 2 + dyPct));
  return { ...start, x: cx - start.w / 2, y: cy - start.h / 2 };
}
