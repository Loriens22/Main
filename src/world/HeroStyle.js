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
  // Sofia Airport Terminal 2: the pale turquoise hall glazing (3 m bays, transoms), the green-blue panes of the
  // glass prow, the pier's gate lounges, the dark tower cab and the ribbon windows of the service blocks
  t2Glass: { tex: { bayW: 3.0, floorH: 2.7, bays: 6, floors: 4, ppm: 26, glass: '#7aa6aa', glass2: '#d3e9e8', mullion: '#c9cfd2', spandrel: '#a8c6c7', sp: 0.12, lit: 0.85, seed: 141 }, metal: 0.35, rough: 0.06, env: 1.3 },
  t2Vault: { tex: { bayW: 1.5, floorH: 1.9, bays: 8, floors: 4, ppm: 28, glass: '#3d7c84', glass2: '#a6d8d3', mullion: '#d7dcdc', spandrel: '#4d8b90', sp: 0.0, lit: 0.6, seed: 142 }, metal: 0.45, rough: 0.05, env: 1.35 },
  t2Pier: { tex: { bayW: 3.0, floorH: 5.8, bays: 6, floors: 2, ppm: 24, glass: '#4d6f7c', glass2: '#a3c0cc', mullion: '#c0c6c9', spandrel: '#7d96a0', sp: 0.3, lit: 0.6, seed: 143 }, metal: 0.4, rough: 0.06, env: 1.2 },
  t2Cab: { tex: { bayW: 2.0, floorH: 3.8, bays: 6, floors: 1, ppm: 28, glass: '#1d2a33', glass2: '#5b7484', mullion: '#cfd4d6', spandrel: '#1d2a33', sp: 0.0, lit: 0.7, seed: 144 }, metal: 0.5, rough: 0.05, env: 1.3 },
  // the CCB tower (ex Hotel Pliska): deep blue reflective glass in the grey frame, the darker recessed first floor
  // and penthouse, the podium's ribbon and shop glazing
  ccbBlue: { tex: { bayW: 1.5, floorH: 3.2, bays: 8, floors: 4, ppm: 28, glass: '#2d5b9e', glass2: '#9cc0ec', mullion: '#3f5269', spandrel: '#2d5b9e', sp: 0.0, lit: 0.45, seed: 151 }, metal: 0.55, rough: 0.05, env: 1.35 },
  ccbDark: { tex: { bayW: 1.5, floorH: 3.2, bays: 8, floors: 2, ppm: 28, glass: '#14253f', glass2: '#4d6d95', mullion: '#2b3647', spandrel: '#14253f', sp: 0.0, lit: 0.5, seed: 152 }, metal: 0.6, rough: 0.05, env: 1.3 },
  ccbPodium: { tex: { bayW: 1.5, floorH: 2.1, bays: 8, floors: 2, ppm: 28, glass: '#1f3d66', glass2: '#7393bf', mullion: '#2b3647', spandrel: '#1f3d66', sp: 0.0, lit: 0.7, seed: 153 }, metal: 0.5, rough: 0.06, env: 1.25 },
  // the Ministry of Foreign Affairs: two-pane windows between the fins (2.35 m bays), the courtyard windows, the
  // dark lobby glazing under the canopy
  mfaWin: { tex: { bayW: 2.35, floorH: 1.9, bays: 6, floors: 2, ppm: 28, glass: '#2d3a44', glass2: '#7d93a3', mullion: '#d9d5cb', spandrel: '#2d3a44', sp: 0.0, lit: 0.55, seed: 156 }, metal: 0.4, rough: 0.08, env: 1.1 },
  mfaInner: { tex: { bayW: 2.35, floorH: 1.9, bays: 6, floors: 2, ppm: 26, glass: '#3a464f', glass2: '#8a9ca8', mullion: '#d9d5cb', spandrel: '#3a464f', sp: 0.0, lit: 0.45, seed: 157 }, metal: 0.3, rough: 0.1, env: 1.0 },
  mfaLobby: { tex: { bayW: 2.4, floorH: 4.2, bays: 6, floors: 2, ppm: 24, glass: '#1f2a31', glass2: '#5e7381', mullion: '#2a2d30', spandrel: '#1f2a31', sp: 0.0, lit: 0.9, seed: 158 }, metal: 0.5, rough: 0.06, env: 1.2 },
  // The Mall (Цариградско шосе): dark shop glazing, the entrance hall's clear glass, the terrace floor, the blue
  // and blue-green office towers
  themallShop: { tex: { bayW: 2.5, floorH: 4.2, bays: 6, floors: 1, ppm: 26, glass: '#26343e', glass2: '#6b8597', mullion: '#2c3034', spandrel: '#26343e', sp: 0.0, lit: 0.95, seed: 160 }, metal: 0.4, rough: 0.06, env: 1.2 },
  themallHall: { tex: { bayW: 2.4, floorH: 2.9, bays: 6, floors: 3, ppm: 26, glass: '#3e5a6c', glass2: '#a8c4d4', mullion: '#9aa3aa', spandrel: '#3e5a6c', sp: 0.0, lit: 0.9, seed: 161 }, metal: 0.4, rough: 0.05, env: 1.3 },
  themallTerrace: { tex: { bayW: 1.8, floorH: 2.7, bays: 6, floors: 2, ppm: 26, glass: '#2f3d47', glass2: '#7d93a3', mullion: '#3a3f44', spandrel: '#2f3d47', sp: 0.0, lit: 0.85, seed: 162 }, metal: 0.4, rough: 0.07, env: 1.2 },
  themallTower: { tex: { bayW: 1.5, floorH: 3.6, bays: 8, floors: 4, ppm: 26, glass: '#2c5a9a', glass2: '#9bc2ee', mullion: '#5b6f86', spandrel: '#2c5a9a', sp: 0.0, lit: 0.45, seed: 163 }, metal: 0.55, rough: 0.05, env: 1.35 },
  themallTower2: { tex: { bayW: 1.5, floorH: 3.6, bays: 8, floors: 4, ppm: 26, glass: '#2c5f74', glass2: '#9ccad8', mullion: '#5b7480', spandrel: '#2c5f74', sp: 0.0, lit: 0.45, seed: 164 }, metal: 0.55, rough: 0.05, env: 1.3 },
  t2Band: { tex: { bayW: 1.8, floorH: 3.0, bays: 8, floors: 2, ppm: 26, glass: '#33454f', glass2: '#7d95a3', mullion: '#c8cdd0', spandrel: '#56666f', sp: 0.2, lit: 0.5, seed: 145 }, metal: 0.4, rough: 0.08, env: 1.1 },
};

/** pn:<preset> — panel cladding (panelTexture specs, metres). */
export const HERO_PANELS = {
  // BILLA: silver-grey horizontal sandwich panels
  ndkStone: { tex: { w: 3, h: 3, ppm: 30, base: '#e4e0d6', joint: 'rgba(90,84,74,0.32)', cols: 2, rows: 2, noise: 0.06, seed: 97, stain: 0.05 }, rough: 0.7 },
  millRib: { tex: { w: 4, h: 4, ppm: 32, base: '#d9dbda', joint: 'rgba(90,95,100,0.45)', cols: 1, rows: 16, noise: 0.03, seed: 92 }, rough: 0.5, metal: 0.1 },
  billaClad: { tex: { w: 6, h: 6, ppm: 32, base: '#b7bcc0', joint: 'rgba(55,60,66,0.55)', cols: 1, rows: 6, noise: 0.05, seed: 91 }, rough: 0.45, metal: 0.45, env: 1.1 },
  // Sofia Airport Terminal 2: standing-seam roofs (0.5 m seams), white square cladding, the striped canopy soffit,
  // the grey louvred block behind the glass prow, granite paving under the canopies
  // the CCB tower: grey aluminium cladding (horizontal panels), grey granite on the podium
  ccbGrey: { tex: { w: 4.8, h: 3.2, ppm: 28, base: '#9ea3a8', joint: 'rgba(60,64,70,0.5)', cols: 3, rows: 4, noise: 0.03, seed: 154 }, rough: 0.4, metal: 0.35, env: 1.1 },
  ccbStone: { tex: { w: 3.6, h: 3.6, ppm: 28, base: '#8b8d90', joint: 'rgba(40,42,45,0.45)', cols: 3, rows: 4, noise: 0.08, seed: 155 }, rough: 0.6 },
  // the Ministry of Foreign Affairs plaza: light granite slabs
  mfaPaving: { tex: { w: 3, h: 3, ppm: 30, base: '#c9c7c2', joint: 'rgba(80,80,78,0.35)', cols: 3, rows: 2, noise: 0.06, seed: 159 }, rough: 0.75 },
  // The Mall: dark grey cladding panels and the lighter grey bands
  mallGrey: { tex: { w: 4.8, h: 3.2, ppm: 26, base: '#4c5056', joint: 'rgba(25,27,30,0.55)', cols: 3, rows: 2, noise: 0.04, seed: 165 }, rough: 0.45, metal: 0.35, env: 1.0 },
  mallGreyLight: { tex: { w: 4.8, h: 1.6, ppm: 26, base: '#8a8f95', joint: 'rgba(40,42,46,0.5)', cols: 3, rows: 1, noise: 0.03, seed: 166 }, rough: 0.4, metal: 0.35 },
  t2Seam: { tex: { w: 6, h: 6, ppm: 24, base: '#a3a8ac', joint: 'rgba(70,75,80,0.5)', cols: 12, rows: 1, noise: 0.03, seed: 146 }, rough: 0.42, metal: 0.45, env: 1.1 },
  t2Panel: { tex: { w: 3.6, h: 3.6, ppm: 30, base: '#e4e7e8', joint: 'rgba(80,85,90,0.42)', cols: 3, rows: 3, noise: 0.03, seed: 147 }, rough: 0.35, metal: 0.15 },
  t2Soffit: { tex: { w: 4, h: 4, ppm: 30, base: '#eceeed', joint: 'rgba(90,95,100,0.32)', cols: 20, rows: 1, noise: 0.02, seed: 148 }, rough: 0.5 },
  t2Louvre: { tex: { w: 3, h: 3, ppm: 32, base: '#8f969b', joint: 'rgba(38,42,46,0.65)', cols: 1, rows: 15, noise: 0.04, seed: 149 }, rough: 0.45, metal: 0.4 },
  paving: { tex: { w: 3, h: 3, ppm: 30, base: '#b9b5ac', joint: 'rgba(70,68,62,0.45)', cols: 5, rows: 5, noise: 0.08, seed: 150 }, rough: 0.85 },
};

/** glow:<id> — emissive colour, intensity at night and by day (lit interiors, LED letters). */
export const HERO_GLOW = {
  red: { color: 0xff2a1a, night: 2.0, day: 0.12 },
  yellow: { color: 0xffc81a, night: 2.0, day: 0.12 },
  white: { color: 0xffffff, night: 1.6, day: 0.05 },
  orange: { color: 0xff8a1a, night: 2.0, day: 0.15 },
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
  // lit:<id> (HeroBuildings.js): the NDK's floodlit fins, the fountains' floors lit from under the water
  fin: { color: 0xfff3e2, night: 0.85 },
  pool: { color: 0x7fffd8, night: 1.4 },
  // Alexander Nevsky Cathedral: warm floodlighting on the walls, the gilded domes glowing
  nevsky: { color: 0xffe2b8, night: 0.5 },
  nevskyTrim: { color: 0xfff0d8, night: 0.55 },
  nevskyGold: { color: 0xffc46a, night: 0.75 },
  // the navy letters over the Terminal 2 entrance, lit white-blue at night
  t2Navy: { color: 0x9cc0ff, night: 1.3, day: 0.0 },
  ccbNavy: { color: 0x9cc0ff, night: 1.4, day: 0.0 },
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
  // the plain navy plaque at the corner of the Terminal 2 entrance block (initials in a generic typeface)
  t2Emblem: {
    w: 256, h: 256, nightI: 1.0, lines: [],
    draw: (g, w) => {
      g.fillStyle = '#1b2a6e';
      g.beginPath(); g.roundRect ? g.roundRect(6, 6, w - 12, w - 12, 34) : g.rect(6, 6, w - 12, w - 12); g.fill();
      g.strokeStyle = '#e8eef8'; g.lineWidth = 8;
      g.beginPath(); g.roundRect ? g.roundRect(22, 22, w - 44, w - 44, 26) : g.rect(22, 22, w - 44, w - 44); g.stroke();
      g.fillStyle = '#ffffff'; g.font = '800 120px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('SA', w / 2, w / 2 + 6);
    },
  },
  // the round emblem before the bank's name on the CCB tower (plain mark, not the bank's logo)
  ccbEmblem: {
    w: 256, h: 256, nightI: 1.0, lines: [],
    draw: (g, w) => {
      g.clearRect(0, 0, w, w);
      g.fillStyle = '#9ea3a8'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#1d2f78'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.46, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 12; g.beginPath(); g.arc(w / 2, w / 2, w * 0.3, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, w / 2, w * 0.1, 0, Math.PI * 2); g.fill();
    },
  },
  // the state arms over the Ministry of Foreign Affairs entrance (cast bronze relief, drawn plainly: crowned shield
  // with a rampant lion)
  mfaArms: {
    w: 256, h: 230, glow: false, lines: [],
    draw: (g, w, h) => {
      g.fillStyle = '#e4dfd3'; g.fillRect(0, 0, w, h);
      const br = '#7a5a2c', hi = '#b48a4a';
      g.fillStyle = br;
      // crown
      g.beginPath(); g.moveTo(78, 52); g.lineTo(90, 18); g.lineTo(108, 40); g.lineTo(128, 8); g.lineTo(148, 40); g.lineTo(166, 18); g.lineTo(178, 52); g.closePath(); g.fill();
      // shield
      g.beginPath(); g.moveTo(70, 62); g.lineTo(186, 62); g.lineTo(186, 140); g.quadraticCurveTo(186, 200, 128, 222); g.quadraticCurveTo(70, 200, 70, 140); g.closePath(); g.fill();
      g.fillStyle = hi;
      g.beginPath(); g.moveTo(80, 72); g.lineTo(176, 72); g.lineTo(176, 138); g.quadraticCurveTo(176, 190, 128, 210); g.quadraticCurveTo(80, 190, 80, 138); g.closePath(); g.fill();
      // the lion (a simple rampant silhouette)
      g.fillStyle = br;
      g.beginPath(); g.ellipse(128, 140, 22, 36, -0.35, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(142, 100, 15, 0, Math.PI * 2); g.fill();
      g.fillRect(104, 160, 10, 34); g.fillRect(130, 166, 10, 30); g.fillRect(146, 112, 26, 8); g.fillRect(150, 128, 22, 7);
      g.beginPath(); g.moveTo(104, 150); g.quadraticCurveTo(84, 140, 92, 112); g.lineTo(98, 114); g.quadraticCurveTo(94, 136, 108, 144); g.fill();
      // supporters' hint: two lions' manes at the sides
      g.fillStyle = br; g.beginPath(); g.arc(40, 130, 22, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(216, 130, 22, 0, Math.PI * 2); g.fill();
    },
  },
  flagNATO: {
    w: 192, h: 128, glow: false, bg: '#004990', lines: [],
    draw: (g, w, h) => {
      const cx = w / 2, cy = h / 2;
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.stroke();
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { g.beginPath(); g.moveTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); g.lineTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); g.stroke(); }
      g.fillStyle = '#ffffff';
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.35) * 12, cy + Math.sin(a - 0.35) * 12); g.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); g.closePath(); g.fill();
      }
    },
  },
  // the Academy of Sciences pediment: the arms in white stucco relief on the ochre tympanum (drawn plainly: a
  // cartouche with a shield between two figures' scrolls)
  basRelief: {
    w: 256, h: 240, glow: false, lines: [],
    draw: (g, w, h) => {
      g.fillStyle = '#e6c97c'; g.fillRect(0, 0, w, h);
      const wh = '#f4efe2', sh = 'rgba(120,90,40,0.35)';
      const blob = (x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
      g.fillStyle = sh; blob(131, 126, 70, 96); blob(70, 150, 34, 60, 0.4); blob(192, 150, 34, 60, -0.4);
      g.fillStyle = wh; blob(128, 122, 68, 94); blob(66, 146, 32, 58, 0.4); blob(190, 146, 32, 58, -0.4);
      blob(128, 30, 30, 18); blob(100, 214, 28, 14); blob(156, 214, 28, 14);
      g.strokeStyle = sh; g.lineWidth = 4;
      g.beginPath(); g.moveTo(98, 70); g.lineTo(158, 70); g.lineTo(158, 140); g.quadraticCurveTo(158, 180, 128, 192); g.quadraticCurveTo(98, 180, 98, 140); g.closePath(); g.stroke();
      g.beginPath(); g.ellipse(128, 128, 18, 30, 0, 0, Math.PI * 2); g.stroke();
      for (const [x, y] of [[60, 110], [196, 110], [70, 190], [186, 190]]) { g.beginPath(); g.arc(x, y, 12, 0.5, 5.5); g.stroke(); }
    },
  },
  // The Mall: the stripe bar under the name (colour blocks drawn here), the tenants' names beside the entrance
  // hall and on its front as plain lettering (generic typefaces, no logos), two posters with generic artwork
  themallBar: {
    w: 512, h: 48, nightI: 1.2, lines: [],
    draw: (g, w, h) => {
      const cols = ['#e5332a', '#f28c1c', '#f7c51c', '#8cc63f', '#20a9a0', '#1f7ac2', '#5a4fa2', '#b0388f', '#e04c8c', '#f28c1c', '#20a9a0', '#1f7ac2'];
      let x = 0, k = 0;
      while (x < w) { const bw = 14 + ((k * 37) % 23); g.fillStyle = cols[k % cols.length]; g.fillRect(x, 0, bw - 3, h); x += bw; k++; }
    },
  },
  themallSignsL: {
    w: 512, h: 512, bg: '#4c5056', nightI: 1.1, lines: [],
    draw: (g, w) => {
      const box = (x, y, bw, bh, bg) => { g.fillStyle = bg; g.fillRect(x, y, bw, bh); };
      const txt = (t, x, y, size, col, weight = 800, family = 'Arial, sans-serif', align = 'center') => { g.font = `${weight} ${size}px ${family}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(t, x, y); };
      txt('H&M', 330, 60, 64, '#e2231a', 900, 'Georgia, serif');
      txt('Peek&Cloppenburg', 256, 150, 44, '#ffffff', 800);
      box(40, 200, 200, 60, '#ffffff'); txt('ZARA', 140, 231, 46, '#111111', 700, 'Georgia, serif');
      box(260, 205, 200, 50, '#1b1b1b'); txt('Massimo Dutti', 360, 231, 24, '#ffffff', 600, 'Georgia, serif');
      txt('house', 150, 300, 40, '#ffffff', 900);
      txt('ESPRIT', 360, 300, 40, '#e3342f', 700);
      txt('HUMANIC', 150, 360, 34, '#ffffff', 800);
      txt('terranova', 360, 360, 34, '#ffffff', 600);
      box(60, 410, 390, 60, '#2a2d31'); txt('RESERVED', 255, 441, 40, '#ffffff', 600);
    },
  },
  themallSignsR: {
    w: 512, h: 512, bg: '#4c5056', nightI: 1.1, lines: [],
    draw: (g, w) => {
      const box = (x, y, bw, bh, bg) => { g.fillStyle = bg; g.fillRect(x, y, bw, bh); };
      const txt = (t, x, y, size, col, weight = 800, family = 'Arial, sans-serif') => { g.font = `${weight} ${size}px ${family}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); };
      box(20, 30, 472, 70, '#ffffff'); txt('TECHNOPOLIS', 256, 66, 50, '#e2231a', 900);
      box(20, 120, 230, 60, '#d71920'); txt('NEW YORKER', 135, 151, 30, '#ffffff', 900);
      box(262, 120, 230, 60, '#ffffff'); txt('PLAYGROUND', 377, 151, 30, '#222222', 900);
      box(20, 200, 230, 60, '#111111'); txt('MOHITO', 135, 231, 34, '#ffffff', 600);
      box(262, 200, 230, 60, '#ffffff'); txt('INTERSPORT', 377, 231, 30, '#0a4ea2', 900);
      box(20, 280, 230, 70, '#111111'); txt('CCC', 135, 316, 44, '#f39200', 900);
      box(262, 280, 230, 70, '#009a44'); txt('DEICHMANN', 377, 316, 30, '#ffffff', 800);
      box(20, 370, 472, 60, '#ffffff'); txt('LC WAIKIKI', 256, 401, 40, '#1d4f9c', 900);
      box(20, 450, 472, 50, '#e6007e'); txt('dm', 256, 476, 38, '#ffffff', 900);
    },
  },
  themallHallSigns: {
    w: 1024, h: 64, bg: '#2b3036', nightI: 1.1, lines: [],
    draw: (g, w, h) => {
      const txt = (t, x, size, col, weight = 800, family = 'Arial, sans-serif') => { g.font = `${weight} ${size}px ${family}`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, h / 2 + 2); };
      g.fillStyle = '#ffffff'; g.fillRect(40, 10, 250, 44);
      txt('TOMMY HILFIGER', 165, 26, '#14284b', 800);
      txt('MANGO', 450, 40, '#ffffff', 300, 'Georgia, serif');
      txt('Хиполенд', 700, 36, '#f7c51c', 900);
      txt('dm', 900, 38, '#e6007e', 900);
    },
  },
  themallPoster1: {
    w: 256, h: 220, nightI: 1.0, bg: '#2f6db5', lines: [{ text: 'Нова колекция', size: 26, color: '#ffffff', y: 190, weight: 800 }],
    draw: (g) => { g.fillStyle = '#f2b8a0'; g.beginPath(); g.arc(90, 90, 46, 0, Math.PI * 2); g.fill(); g.fillStyle = '#e8536b'; g.fillRect(40, 120, 100, 50); g.fillStyle = '#ffd34d'; g.beginPath(); g.arc(190, 70, 30, 0, Math.PI * 2); g.fill(); },
  },
  themallPoster2: {
    w: 256, h: 220, nightI: 1.0, bg: '#1f2a44', lines: [{ text: 'Кино • Ресторанти', size: 24, color: '#ffd34d', y: 190, weight: 800 }],
    draw: (g) => { g.fillStyle = '#e8a33d'; g.beginPath(); g.ellipse(128, 95, 80, 55, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#7a3e1d'; g.fillRect(56, 98, 144, 14); g.fillStyle = '#5fae3b'; g.fillRect(56, 84, 144, 10); },
  },
  // the paved roof plaza of the car park in front of Terminal 2: a large cross-stitch embroidery motif (шевица) in
  // terracotta and pale green squares (pattern drawn here in the style of the photographed one)
  shevitsa: {
    w: 1024, h: 1024, glow: false, bg: '#b9b5ac', lines: [],
    draw: (g, w) => {
      const N = 33, c = 16, cell = w / N;
      const red = '#d0603f', green = '#bcd7a0';
      const put = (i, j, col) => { g.fillStyle = col; g.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2); };
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = Math.abs(i - c), dy = Math.abs(j - c), m = dx + dy;
        let col = null;
        if (m <= 3) col = red; // the central star
        else if (m === 5 && (dx === 0 || dy === 0 || dx === dy || Math.abs(dx - dy) === 1)) col = green;
        else if ((dx === 0 && dy <= 15) || (dy === 0 && dx <= 15)) col = green; // the cross through the middle
        else if (Math.abs(dx - 9) + Math.abs(dy - 9) <= 2) col = red; // four diamonds
        else if (Math.abs(dx - 9) + Math.abs(dy - 9) === 4) col = red; // their outlines
        else if ((dx === dy) && dx >= 4 && dx <= 6) col = green; // diagonal stitches
        else if ((dx === 13 && dy <= 6 && dy % 2 === 0) || (dy === 13 && dx <= 6 && dx % 2 === 0)) col = red; // border hooks
        else if (dx >= 13 && dy >= 13 && (dx + dy) % 2 === 0 && dx <= 15 && dy <= 15) col = green; // corner rosettes
        if (col) put(i, j, col);
      }
    },
  },
  // the Sofia metro station mark: a red letter M on white
  metroM: { w: 128, h: 128, nightI: 1.0, bg: '#ffffff', lines: [{ text: 'M', size: 104, color: '#d0151c', y: 66, weight: 900 }] },
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
