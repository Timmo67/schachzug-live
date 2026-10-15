// Renders the app icons and splash screens for iOS and Android from public/icon-maskable.svg.
// Run after changing the logo: `node scripts/build-app-icons.mjs` (uses Playwright's Chromium;
// set PW_CHROMIUM_PATH in sandboxes). The PNGs are committed.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const GOLD = '#dba24a';
const BG = '#eceff2';
// The knight from the maskable icon (800×800 viewBox), without its background.
const knight = readFileSync('public/icon-maskable.svg', 'utf8').match(/<svg x[^>]*viewBox="0 0 800 800">([\s\S]*?)<\/svg><\/svg>/)[1];
const knightSvg = (size) => `<svg viewBox="0 0 800 800" width="${size}" height="${size}">${knight}</svg>`;

const RES = 'android/app/src/main/res';
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SPLASH = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
};

/** Full icon: gold square with the knight (iOS rounds the corners itself). */
const square = (s) => `<div style="width:${s}px;height:${s}px;background:${GOLD};display:flex;align-items:center;justify-content:center">${knightSvg(s * 0.62)}</div>`;
const round = (s) => `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${GOLD};display:flex;align-items:center;justify-content:center">${knightSvg(s * 0.58)}</div>`;
/** Adaptive icon foreground: knight inside the 66/108 safe zone on a transparent layer. */
const foreground = (s) => `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center">${knightSvg(s * 0.44)}</div>`;
const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.28);
  return `<div style="width:${w}px;height:${h}px;background:${BG};display:flex;align-items:center;justify-content:center">
    <div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:${GOLD};display:flex;align-items:center;justify-content:center">${knightSvg(s * 0.66)}</div></div>`;
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
async function render(html, w, h, path, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  await page.screenshot({ path, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(path);
}

for (const [d, f] of Object.entries(DENSITY)) {
  await render(square(48 * f), 48 * f, 48 * f, `${RES}/mipmap-${d}/ic_launcher.png`);
  await render(round(48 * f), 48 * f, 48 * f, `${RES}/mipmap-${d}/ic_launcher_round.png`, true);
  await render(foreground(108 * f), 108 * f, 108 * f, `${RES}/mipmap-${d}/ic_launcher_foreground.png`, true);
}
for (const [dir, [w, h]] of Object.entries(SPLASH)) await render(splash(w, h), w, h, `${RES}/${dir}/splash.png`);

const IOS = 'ios/App/App/Assets.xcassets';
await render(square(1024), 1024, 1024, `${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`);
for (const n of ['', '-1', '-2']) await render(splash(2732, 2732), 2732, 2732, `${IOS}/Splash.imageset/splash-2732x2732${n}.png`);

await browser.close();
