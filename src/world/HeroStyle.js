// Look of the hero buildings' named materials (see HeroBuildings.js and tools/blender/hero/herolib.py):
// curtain-wall presets (curtainTexture specs plus the glass response), night-glow colours and the signs drawn
// on canvas. Brand names appear as plain lettering of the shops photographed on site, no logos.

/** cw:<preset> — window grid texture (metres) and the glass: metal / rough / env (reflection) / tint. */
export const HERO_CURTAINS = {
  // Bulgaria Mall: blue reflective office glass, its darker bays, the white-framed entrance box, the dark
  // glazing behind the podium colonnade
  mallBlue: { tex: { bayW: 1.5, floorH: 3.6, bays: 8, floors: 4, ppm: 28, glass: '#6e93c0', glass2: '#c6daef', mullion: '#7f8fa1', spandrel: '#5d7da3', sp: 1.0, lit: 0.5, seed: 81 }, metal: 0.35, rough: 0.08, env: 1.25 },
  mallBlueDark: { tex: { bayW: 1.5, floorH: 3.6, bays: 8, floors: 4, ppm: 28, glass: '#1d2c40', glass2: '#4d6584', mullion: '#33404f', spandrel: '#1a2636', sp: 1.0, lit: 0.35, seed: 82 }, metal: 0.8, rough: 0.05, env: 1.3 },
  mallBox: { tex: { bayW: 1.5, floorH: 2.4, bays: 8, floors: 5, ppm: 28, glass: '#c4d6d4', glass2: '#eef5f4', mullion: '#f4f6f6', spandrel: '#d5e2e0', sp: 0.25, lit: 0.7, seed: 83 }, metal: 0.35, rough: 0.08, env: 1.2 },
  // Millennium Center: deep blue hotel glass, the dark band behind the zig-zag frame, the sky bar, the base
  millBlue: { tex: { bayW: 1.5, floorH: 3.37, bays: 8, floors: 4, ppm: 28, glass: '#2f5fa8', glass2: '#8fb4e6', mullion: '#5b6f8a', spandrel: '#2a4f8a', sp: 0.9, lit: 0.55, seed: 85 }, metal: 0.35, rough: 0.06, env: 1.3 },
  millBlueDark: { tex: { bayW: 1.5, floorH: 3.37, bays: 8, floors: 4, ppm: 28, glass: '#15284a', glass2: '#3d5a86', mullion: '#2a3548', spandrel: '#13213c', sp: 0.9, lit: 0.4, seed: 86 }, metal: 0.5, rough: 0.05, env: 1.3 },
  millSky: { tex: { bayW: 2.4, floorH: 3.5, bays: 6, floors: 2, ppm: 28, glass: '#3e5d80', glass2: '#9cb6d0', mullion: '#e8eaea', spandrel: '#cfd6dc', sp: 0.2, lit: 0.95, seed: 87 }, metal: 0.3, rough: 0.05, env: 1.2 },
  millPodium: { tex: { bayW: 1.8, floorH: 3.9, bays: 6, floors: 3, ppm: 28, glass: '#2a5592', glass2: '#7fa5d8', mullion: '#55657a', spandrel: '#284a7c', sp: 0.6, lit: 0.6, seed: 88 }, metal: 0.35, rough: 0.07, env: 1.2 },
  // NDK: dark bronze glass between the stone towers, the ground-floor lobby, the upper storey, the annexes' ribbons
  ndkBronze: { tex: { bayW: 1.8, floorH: 4.6, bays: 6, floors: 3, ppm: 26, glass: '#3a3027', glass2: '#7a6a58', mullion: '#2a221b', spandrel: '#30271f', sp: 0.5, lit: 0.55, seed: 93 }, metal: 0.45, rough: 0.07, env: 1.2 },
  ndkLobby: { tex: { bayW: 2.4, floorH: 3.5, bays: 5, floors: 2, ppm: 26, glass: '#3d3428', glass2: '#80705c', mullion: '#221c16', spandrel: '#221c16', sp: 0.1, lit: 0.95, seed: 94 }, metal: 0.35, rough: 0.07, env: 1.1 },
  ndkDrum: { tex: { bayW: 1.6, floorH: 4.0, bays: 8, floors: 1, ppm: 26, glass: '#2e2720', glass2: '#6a5d4e', mullion: '#1f1a15', spandrel: '#1f1a15', sp: 0.0, lit: 0.9, seed: 95 }, metal: 0.4, rough: 0.06, env: 1.2 },
  ndkRibbon: { tex: { bayW: 1.5, floorH: 2.0, bays: 8, floors: 1, ppm: 26, glass: '#2f2a24', glass2: '#6a5f52', mullion: '#1c1916', spandrel: '#1c1916', sp: 0.0, lit: 0.5, seed: 96 }, metal: 0.3, rough: 0.1, env: 1.0 },
  // the bTV tower's ribbon windows
  btvRibbon: { tex: { bayW: 1.25, floorH: 1.8, bays: 8, floors: 2, ppm: 32, glass: '#4a5a64', glass2: '#9eb1bc', mullion: '#9aa0a5', spandrel: '#4a5a64', sp: 0.0, lit: 0.5, seed: 89 }, metal: 0.25, rough: 0.12, env: 1.0 },
  mallPodium: { tex: { bayW: 2.0, floorH: 3.4, bays: 6, floors: 2, ppm: 28, glass: '#26323a', glass2: '#55697a', mullion: '#20272c', spandrel: '#2b343a', sp: 0.4, lit: 0.75, seed: 84 }, metal: 0.6, rough: 0.1, env: 1.1 },
};

/** pn:<preset> — panel cladding (panelTexture specs, metres). */
export const HERO_PANELS = {
  // BILLA: silver-grey horizontal sandwich panels
  ndkStone: { tex: { w: 3, h: 3, ppm: 30, base: '#e4e0d6', joint: 'rgba(90,84,74,0.32)', cols: 2, rows: 2, noise: 0.06, seed: 97, stain: 0.05 }, rough: 0.7 },
  millRib: { tex: { w: 4, h: 4, ppm: 32, base: '#d9dbda', joint: 'rgba(90,95,100,0.45)', cols: 1, rows: 16, noise: 0.03, seed: 92 }, rough: 0.5, metal: 0.1 },
  billaClad: { tex: { w: 6, h: 6, ppm: 32, base: '#b7bcc0', joint: 'rgba(55,60,66,0.55)', cols: 1, rows: 6, noise: 0.05, seed: 91 }, rough: 0.45, metal: 0.45, env: 1.1 },
};

/** glow:<id> — emissive colour, intensity at night and by day (lit interiors, LED letters). */
export const HERO_GLOW = {
  red: { color: 0xff2a1a, night: 2.0, day: 0.12 },
  yellow: { color: 0xffc81a, night: 2.0, day: 0.12 },
  white: { color: 0xffffff, night: 1.6, day: 0.05 },
  steel: { color: 0xdfeeff, night: 1.1, day: 0 },
  shopLight: { color: 0xfff4e0, night: 2.4, day: 1.3 },
  pendant: { color: 0xffd8a0, night: 2.4, day: 1.0 },
  screen: { color: 0x9fd0ff, night: 1.4, day: 0.7 },
  millBlue: { color: 0x3a6dff, night: 1.8, day: 0.15 },
  gold: { color: 0xffc870, night: 1.6, day: 0.1 },
  btvNavy: { color: 0x5a86ff, night: 1.4, day: 0.0 },
  jet: { color: 0xd8fff0, night: 2.6, day: 0.0 },
  globe: { color: 0xffb060, night: 3.0, day: 0.0 },
  uplight: { color: 0xfff6e8, night: 2.6, day: 0.0 },
  led: { color: 0xfff0d0, night: 2.2, day: 0.0 },
};

/** Interior surfaces behind shop glass: lit evenly day and night (no AO), emissive fraction of their colour. */
export const HERO_INTERIOR = { day: 0.32, night: 0.55 };

/** sign:<id> — canvas signs, UV 0..1 over the face (signMat specs). */
export const HERO_SIGNS = {
  // the red banner over the BILLA entrance (photographed August 2024)
  billaCard: {
    w: 1024, h: 96, bg: '#d81e25', nightI: 1.0,
    lines: [{ text: 'Спестявайте с', size: 58, color: '#ffffff', y: 50, weight: 700, align: 'left', x: 200, family: 'Georgia, "DejaVu Serif", serif' }],
    draw: (g, w, h) => {
      // the card: yellow with red lettering
      g.fillStyle = '#ffd200';
      g.beginPath();
      g.roundRect ? g.roundRect(620, 12, 220, h - 24, 10) : g.rect(620, 12, 220, h - 24);
      g.fill();
      g.fillStyle = '#d81e25';
      g.font = '900 44px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('BILLA', 690, h / 2 + 2);
      g.font = 'italic 700 30px Arial, sans-serif';
      g.fillText('Card', 790, h / 2 + 2);
    },
  },
  // a seasonal poster beside it (generic artwork)
  billaAd: {
    w: 512, h: 224, bg: '#ffd200', nightI: 0.9,
    lines: [{ text: 'Свежо всеки ден', size: 40, color: '#d81e25', y: 186, weight: 800 }],
    draw: (g, w) => {
      const fruit = [['#e53b2a', 70, 80, 46], ['#f39a1e', 160, 70, 40], ['#7cc242', 245, 88, 44], ['#e53b2a', 330, 72, 38], ['#ffef7a', 410, 84, 42], ['#5aa02c', 470, 60, 26]];
      for (const [c, x, y, r] of fruit) {
        g.fillStyle = c;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#d81e25';
      g.fillRect(0, 140, w, 6);
    },
  },
  // the tenants of the store on the pylon
  pylonTenants: {
    w: 512, h: 512, bg: '#a9adb1', nightI: 0.9,
    lines: [
      { text: 'ОПТИКА', size: 64, color: '#1f4f9c', y: 86, weight: 800 },
      { text: 'SOpharmacy', size: 58, color: '#0f7a3c', y: 256, weight: 800 },
    ],
    draw: (g, w) => {
      g.fillStyle = '#d0202a';
      g.fillRect(40, 380, w - 80, 92);
      g.fillStyle = '#ffffff';
      g.font = '800 66px Roboto, Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('speedy', w / 2, 428);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 3;
      for (const y of [170, 340]) { g.beginPath(); g.moveTo(20, y); g.lineTo(w - 20, y); g.stroke(); }
    },
  },
  // Grand Hotel Millennium: the round M mark beside the doors, the flags, the rooftop helipad
  millLogo: {
    w: 256, h: 256, nightI: 1.0,
    lines: [],
    draw: (g, w) => {
      g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#1f3c9c'; g.lineWidth = 14; g.beginPath(); g.arc(w / 2, w / 2, w * 0.42, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#1f3c9c'; g.font = '700 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', w / 2, w / 2 + 8);
    },
  },
  flagBG: { w: 192, h: 128, glow: false, lines: [], draw: (g, w, h) => { const c = ['#ffffff', '#00966e', '#d62612']; c.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); }); } },
  flagEU: {
    w: 192, h: 128, glow: false, bg: '#003399', lines: [],
    draw: (g, w, h) => { g.fillStyle = '#ffcc00'; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 38, h / 2 + Math.sin(a) * 38, 6, 0, Math.PI * 2); g.fill(); } },
  },
  flagMill: { w: 192, h: 128, glow: false, bg: '#5b2a86', lines: [{ text: 'M', size: 80, color: '#e8d6a6', y: 68, weight: 700, family: 'Georgia, serif' }] },
  helipad: {
    w: 256, h: 256, glow: false, bg: '#3d4245', lines: [],
    draw: (g, w) => {
      g.strokeStyle = '#f2f2f2'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f2f2f2'; g.font = '900 130px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', w / 2, w / 2 + 6);
      g.strokeStyle = '#e8c21a'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, w - 16);
    },
  },
  flagSofia: { w: 192, h: 128, glow: false, lines: [], draw: (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#0a7a3a'; g.fillRect(0, h * 0.62, w, h * 0.38); g.fillStyle = '#e8c21a'; g.fillRect(0, h * 0.5, w, h * 0.12); g.fillStyle = '#c4161c'; g.beginPath(); g.arc(w * 0.3, h * 0.33, h * 0.18, 0, Math.PI * 2); g.fill(); } },
  ndkScreen: {
    w: 512, h: 288, bg: '#101418', nightI: 1.4,
    lines: [{ text: 'НДК', size: 96, color: '#ffffff', y: 110, weight: 800 }, { text: 'Национален дворец на културата', size: 30, color: '#e8c060', y: 200, weight: 600 }],
    draw: (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(200,40,60,0.5)'); gr.addColorStop(1, 'rgba(40,80,200,0.4)'); g.fillStyle = gr; g.fillRect(0, h - 40, w, 40); },
  },
  mallScreen: {
    w: 512, h: 256, bg: '#1a1f4a', nightI: 1.4,
    lines: [{ text: 'BULGARIA MALL', size: 52, color: '#ffffff', y: 92, weight: 800 }, { text: 'Магазини • Кино • Ресторанти', size: 30, color: '#ffd84a', y: 170, weight: 600 }],
    draw: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, 'rgba(230,40,120,0.55)');
      gr.addColorStop(1, 'rgba(40,120,255,0.0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    },
  },
};
