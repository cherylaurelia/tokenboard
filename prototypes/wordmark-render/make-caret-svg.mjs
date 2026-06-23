// Source of truth for the README caret mark. Emits a crisp pixel ">_" as an SVG of unit rects
// (shape-rendering="crispEdges" → never anti-aliased/blurred at any display size, unlike a PNG).
// Regenerate: `node prototypes/wordmark-render/make-caret-svg.mjs > web/public/brand/caret.svg`.
// Matrix: 1 = coral block.
const C = "#cc785c";
const U = 12;       // px per pixel-block at 1x (display width scales it)
const m = [
  [1,1,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,0,0,0,0,0,0,0,0],
  [0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,1,1,0,0,0,0,0,0,0,0,0,0],
  [1,1,0,0,0,0,0,0,1,1,1,1,1],
];
const rows = m.length, cols = m[0].length;
let rects = "";
for (let y=0;y<rows;y++) for (let x=0;x<cols;x++) if (m[y][x])
  rects += `<rect x="${x*U}" y="${y*U}" width="${U}" height="${U}"/>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols*U}" height="${rows*U}" viewBox="0 0 ${cols*U} ${rows*U}" shape-rendering="crispEdges"><g fill="${C}">${rects}</g></svg>\n`;
process.stdout.write(svg);
