import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const svgPath = new URL("../public/icon.svg", import.meta.url);
const svg = readFileSync(svgPath, "utf8");

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: {
      loadSystemFonts: true,
    },
  });
  return resvg.render().asPng();
}

const outputs = [
  { size: 512, path: new URL("../public/icon-512x512.png", import.meta.url) },
  { size: 192, path: new URL("../public/icon-192x192.png", import.meta.url) },
  { size: 180, path: new URL("../public/apple-touch-icon.png", import.meta.url) },
  { size: 512, path: new URL("../public/apple-icon.png", import.meta.url) },
  { size: 512, path: new URL("../app/icon.png", import.meta.url) },
  { size: 512, path: new URL("../app/apple-icon.png", import.meta.url) },
];

for (const { size, path } of outputs) {
  writeFileSync(path, renderPng(size));
  console.log(`wrote ${path.pathname} (${size}px)`);
}
