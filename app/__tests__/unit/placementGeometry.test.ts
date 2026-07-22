import { describe, it, expect } from "vitest";
import { resizeRotatedBox, cornerPx, moveBox, type PlacementBox } from "~/utils/placementGeometry";

// Non-square container to catch %↔px conversion bugs.
const RW = 800;
const RH = 400;

function near(a: number, b: number, eps = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe("resizeRotatedBox — anchor (opposite corner) stays fixed", () => {
  const cases: Array<{ rotation: number }> = [{ rotation: 0 }, { rotation: 30 }, { rotation: 90 }, { rotation: 217 }, { rotation: -45 }];
  for (const { rotation } of cases) {
    it(`keeps NW fixed while dragging SE at ${rotation}°`, () => {
      const start: PlacementBox = { x: 30, y: 25, w: 20, h: 30, rotation };
      const nw0 = cornerPx(start, RW, RH, "nw");
      // Drag SE to an arbitrary pointer position.
      const out = resizeRotatedBox(start, "se", 620, 310, RW, RH);
      const nw1 = cornerPx(out, RW, RH, "nw");
      near(nw0.x, nw1.x, 1e-4);
      near(nw0.y, nw1.y, 1e-4);
    });
  }
});

describe("resizeRotatedBox — dragged corner lands under the pointer", () => {
  it("SE corner tracks the pointer (no grab offset)", () => {
    const start: PlacementBox = { x: 40, y: 40, w: 15, h: 15, rotation: 40 };
    const se0 = cornerPx(start, RW, RH, "se");
    const rad = (start.rotation * Math.PI) / 180;
    // Push the pointer outward along the box's own +x/+y (local) axes so the
    // resize is a genuine enlargement (never hits the min-size clamp).
    const px = se0.x + (120 * Math.cos(rad) - 90 * Math.sin(rad));
    const py = se0.y + (120 * Math.sin(rad) + 90 * Math.cos(rad));
    const out = resizeRotatedBox(start, "se", px, py, RW, RH);
    const se = cornerPx(out, RW, RH, "se");
    near(se.x, px, 1e-4);
    near(se.y, py, 1e-4);
  });

  it("accounts for grab offset so there is no first-move jump", () => {
    const start: PlacementBox = { x: 40, y: 40, w: 15, h: 15, rotation: 40 };
    const se0 = cornerPx(start, RW, RH, "se");
    const offX = 5, offY = -3; // pointer grabbed 5px right / 3px above the corner
    // Pointer at the corner + offset with that same offset → box unchanged.
    const out = resizeRotatedBox(start, "se", se0.x + offX, se0.y + offY, RW, RH, offX, offY);
    near(out.w, start.w, 1e-4);
    near(out.h, start.h, 1e-4);
    near(out.x, start.x, 1e-4);
    near(out.y, start.y, 1e-4);
  });
});

describe("resizeRotatedBox — clamps to minimum size", () => {
  it("does not shrink below min when pointer crosses the anchor", () => {
    const start: PlacementBox = { x: 40, y: 40, w: 20, h: 20, rotation: 15 };
    const nw = cornerPx(start, RW, RH, "nw");
    // Drag SE past the NW anchor → would invert; expect clamped min.
    const out = resizeRotatedBox(start, "se", nw.x - 100, nw.y - 100, RW, RH, 0, 0, 10, 5);
    expect(out.w).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(out.h).toBeGreaterThanOrEqual(5 - 1e-9);
  });
});

describe("moveBox", () => {
  it("translates by percent and keeps center on the image", () => {
    const start: PlacementBox = { x: 10, y: 10, w: 20, h: 20, rotation: 33 };
    const out = moveBox(start, 5, -4);
    near(out.x, 15);
    near(out.y, 6);
    near(out.rotation, 33);
  });
  it("clamps the center into [0,100]", () => {
    const start: PlacementBox = { x: 90, y: 90, w: 20, h: 20, rotation: 0 };
    const out = moveBox(start, 50, 50); // center would go to 150
    near(out.x + out.w / 2, 100); // center pinned at 100
  });
});
