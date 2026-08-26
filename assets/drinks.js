/* The menu and its animated cup renderer, shared by index.html and board.html.
   Plain globals on purpose: neither page has a build step. */

/* Placeholder menu copy — swap for real product details when they land. */
const DRINKS = [
  {
    name: "Coconut Matcha Cloud",
    art: "",
    badge: "By Janet AI",
    tags: ["Contains Dairy"],
    desc: "Matcha cold foam atop coconut water, butterfly pea tea, and a squeeze of lime",
    // [band class, share of the liquid column], poured top to bottom
    layers: [["c-a", 0.34], ["c-b", 0.16], ["c-clear", 0.5]],
  },
  {
    name: "Yuzu Passionfruit Tonic",
    art: "art-yuzu",
    badge: "By Dedalus Labs",
    tags: ["Caffeine Free"],
    desc: "Two fruit cheongs mixed with sparkling water and butterfly pea tea",
    layers: [["c-a", 0.26], ["c-clear", 0.36], ["c-c", 0.2], ["c-d", 0.18]],
  },
];

/* Editable cup mockup: pure inline SVG, so layer colours come from the
   --cup-* custom properties and every shape can be nudged in place. */
/* Animated cup render. Every shape is derived from the same tapered-vessel
   geometry, so the liquid bands, meniscus ellipses and outline always agree.
   Tune the constants below to reshape the glass. */
function cupArt(id, artClass, layers) {
  const clip = "cupClip" + id;

  const RIM_Y = 40;      // mouth of the glass
  const BASE_Y = 152;    // inside of the base
  const RIM_HW = 38;     // half-width at the rim
  const BASE_HW = 23;    // half-width at the base
  const CORNER = 10;     // base fillet
  const CX = 60;
  const RIM_RY = 5.4;    // how open the mouth reads (ellipse minor radius)

  const hw = (y) => RIM_HW + ((y - RIM_Y) / (BASE_Y - RIM_Y)) * (BASE_HW - RIM_HW);
  const left = (y) => CX - hw(y);
  const right = (y) => CX + hw(y);
  const r2 = (n) => Math.round(n * 100) / 100;

  // Walk CORNER back up each wall so the base fillets stay tangent.
  const run = RIM_HW - BASE_HW;
  const rise = BASE_Y - RIM_Y;
  const wallLen = Math.hypot(run, rise);
  const backX = (run / wallLen) * CORNER;
  const backY = (rise / wallLen) * CORNER;

  // Walls + filleted base. Left open at the top so the mouth reads as an
  // opening rather than a capped line.
  const walls =
    "M" + r2(left(RIM_Y)) + " " + RIM_Y +
    " L" + r2(left(BASE_Y) - backX) + " " + r2(BASE_Y - backY) +
    " Q" + r2(left(BASE_Y)) + " " + BASE_Y + " " + r2(left(BASE_Y) + CORNER) + " " + BASE_Y +
    " L" + r2(right(BASE_Y) - CORNER) + " " + BASE_Y +
    " Q" + r2(right(BASE_Y)) + " " + BASE_Y + " " + r2(right(BASE_Y) + backX) + " " + r2(BASE_Y - backY) +
    " L" + r2(right(RIM_Y)) + " " + RIM_Y;

  const shell = walls + " Z";

  const SAG = RIM_RY * 1.7;   // how far the meniscus front dips

  // A band spans surface -> next surface, both edges using the same meniscus
  // curve so neighbours nest exactly. Bands are discrete rather than flooded
  // to the base, so a translucent fill shows the glass instead of the layer
  // above it. Each one overhangs its bottom edge slightly to hide the seam.
  function band(top, bottom) {
    const lt = left(top) - 3;
    const rt = right(top) + 3;
    const lb = left(bottom) - 3;
    const rb = right(bottom) + 3;
    return (
      "M" + r2(lt) + " " + r2(top) +
      " Q" + CX + " " + r2(top + SAG) + " " + r2(rt) + " " + r2(top) +
      " L" + r2(rb) + " " + r2(bottom) +
      " Q" + CX + " " + r2(bottom + SAG) + " " + r2(lb) + " " + r2(bottom) +
      " Z"
    );
  }

  function meniscus(y) {
    return (
      '<ellipse class="c-surface c-swell" cx="' + CX + '" cy="' + r2(y) +
      '" rx="' + r2(hw(y)) + '" ry="' + r2(RIM_RY * 0.72) + '" />'
    );
  }

  const LIQ_Y = 52;      // where the top layer sits below the rim
  const column = BASE_Y - LIQ_Y;

  let cursor = LIQ_Y;
  const spec = layers || [["c-a", 0.34], ["c-b", 0.16], ["c-clear", 0.5]];
  const bands = spec.map(([cls, share], i) => {
    const surface = cursor;
    cursor += share * column;
    const last = i === spec.length - 1;
    return { cls, surface, bottom: last ? BASE_Y + 8 : cursor + 4 };
  });

  const bubbles = [
    [48, 1.9],
    [70, 1.4],
    [82, 2.1],
    [62, 1.2],
  ];

  return (
    '<svg class="drink-art ' + artClass + '" viewBox="0 0 120 170" aria-hidden="true">' +
    '<defs><clipPath id="' + clip + '"><path d="' + shell + '" /></clipPath></defs>' +
    '<path class="c-glass" d="' + shell + '" />' +
    '<g clip-path="url(#' + clip + ')">' +
    '<g class="c-fill">' +
    // painted bottom-up so each band's overhang hides the seam below it
    bands
      .slice()
      .reverse()
      .map((b) => '<path class="' + b.cls + '" d="' + band(b.surface, b.bottom) + '" />')
      .join("") +
    bands.map((b) => meniscus(b.surface)).join("") +
    "</g>" +
    bubbles
      .map(
        ([x, r]) =>
          '<circle class="c-bubble" cx="' + x + '" cy="' + (BASE_Y - 12) + '" r="' + r + '" />'
      )
      .join("") +
    // curved wall shading reads as glass thickness
    '<path class="c-sheen" d="M' + r2(left(56) + 4) + ' 56 Q' + r2(left(104) + 3) + ' 104 ' +
    r2(left(BASE_Y - 14) + 6) + ' ' + (BASE_Y - 14) + ' L' + r2(left(BASE_Y - 14) + 11) +
    ' ' + (BASE_Y - 14) + ' Q' + r2(left(104) + 9) + ' 104 ' + r2(left(56) + 10) + ' 56 Z" />' +
    '<path class="c-shade" d="M' + r2(right(46)) + ' 46 L' + r2(right(BASE_Y)) + ' ' + BASE_Y +
    ' L' + r2(right(BASE_Y) - 7) + ' ' + BASE_Y + ' L' + r2(right(46) - 6) + ' 46 Z" />' +
    "</g>" +
    '<path class="c-edge" d="' + walls + '" />' +
    '<ellipse class="c-rim" cx="' + CX + '" cy="' + RIM_Y + '" rx="' + RIM_HW + '" ry="' + RIM_RY + '" />' +
    "</svg>"
  );
}
