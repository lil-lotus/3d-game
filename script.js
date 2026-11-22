import * as THREE from 'three';

/* =========================================================================
 * 0. CONFIG
 * ========================================================================= */
const CONFIG = {
  CHUNK_SIZE: 16,
  WORLD_HEIGHT: 64,
  SEA_LEVEL: 32,
  SEED: 1337,
  RADIUS_TABLE: [4, 5, 8],
  PIXEL_RATIO_TABLE: [1.0, 1.5, 2.0],
  MAX_UPLOAD_PER_FRAME: 2,
  CHUNK_UPDATE_INTERVAL: 0.2,
  PLAYER_WIDTH: 0.6,
  PLAYER_HEIGHT: 1.8,
  EYE_HEIGHT: 1.62,
  GRAVITY: 28,
  JUMP_SPEED: 8.6,
  WALK_SPEED: 4.6,
  RUN_SPEED: 7.6,
  FLY_SPEED: 6.5,
  REACH: 6.0,
  FOG_FACTOR: 1.7,
  TOUCH_LOOK_SENS: 0.0042,
  MOUSE_LOOK_SENS: 0.0022,
  LONGPRESS_MS: 250,
  TAP_MOVE_TOL: 12,
  FPS_LOW: 45,
  FPS_HIGH: 56,
  SAVE_INTERVAL: 3.0,
};

/* =========================================================================
 * 1. 纹理图集 (8x8 = 64 slots, using 22)
 * ========================================================================= */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ATLAS_TILE = 16;
const ATLAS_COLS = 8;
let atlasCanvas = null;

function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = ATLAS_COLS * ATLAS_TILE;
  cv.height = ATLAS_COLS * ATLAS_TILE;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const paint = (index, fn) => {
    const col = index % ATLAS_COLS;
    const row = (index / ATLAS_COLS) | 0;
    const img = ctx.createImageData(ATLAS_TILE, ATLAS_TILE);
    const d = img.data;
    for (let y = 0; y < ATLAS_TILE; y++) {
      for (let x = 0; x < ATLAS_TILE; x++) {
        const c = fn(x, y);
        const o = (y * ATLAS_TILE + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
    }
    ctx.putImageData(img, col * ATLAS_TILE, row * ATLAS_TILE);
  };

  const cl = (v) => v < 0 ? 0 : (v > 255 ? 255 : v | 0);

  // 0: grass top
  { const r = mulberry32(101); paint(0, () => { const n = (r() - 0.5) * 40; return [cl(86 + n), cl(158 + n), cl(62 + n), 255]; }); }
  // 1: grass side
  {
    const r = mulberry32(202);
    const edges = new Int32Array(16);
    for (let i = 0; i < 16; i++) edges[i] = 3 + ((r() * 3) | 0);
    const noise = new Float32Array(256);
    for (let i = 0; i < 256; i++) noise[i] = (r() - 0.5) * 34;
    paint(1, (x, y) => {
      const n = noise[y * 16 + x];
      if (y < edges[x]) return [cl(86 + n), cl(158 + n), cl(62 + n), 255];
      return [cl(134 + n), cl(98 + n), cl(68 + n), 255];
    });
  }
  // 2: dirt
  { const r = mulberry32(303); paint(2, () => { const n = (r() - 0.5) * 36; return [cl(134 + n), cl(98 + n), cl(68 + n), 255]; }); }
  // 3: stone
  { const r = mulberry32(404); paint(3, () => { const n = (r() - 0.5) * 42; return [cl(130 + n), cl(130 + n), cl(134 + n), 255]; }); }
  // 4: sand
  { const r = mulberry32(505); paint(4, () => { const n = (r() - 0.5) * 28; return [cl(224 + n), cl(210 + n), cl(154 + n), 255]; }); }
  // 5: log side
  {
    const r = mulberry32(606);
    const noise = new Float32Array(256);
    for (let i = 0; i < 256; i++) noise[i] = (r() - 0.5) * 22;
    paint(5, (x, y) => {
      const n = noise[y * 16 + x];
      const s = (x % 5 === 0 || x % 7 === 3) ? -20 : 0;
      return [cl(112 + n + s), cl(84 + n + s), cl(52 + n + s), 255];
    });
  }
  // 6: log top
  {
    const r = mulberry32(707);
    paint(6, (x, y) => {
      const dx = x - 7.5, dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.sin(dist * 2.4) * 14;
      const n = (r() - 0.5) * 12;
      return [cl(152 + ring + n), cl(116 + ring + n), cl(70 + ring + n), 255];
    });
  }
  // 7: leaves
  {
    const r = mulberry32(808);
    const v = new Float32Array(256);
    for (let i = 0; i < 256; i++) v[i] = r();
    paint(7, (x, y) => {
      const h = v[y * 16 + x];
      if (h < 0.13) return [0, 0, 0, 0];
      const n = (h - 0.5) * 54;
      return [cl(56 + n), cl(122 + n), cl(46 + n), 255];
    });
  }
  // 8: water
  { const r = mulberry32(909); paint(8, () => { const n = (r() - 0.5) * 22; return [cl(52 + n), cl(112 + n), cl(204 + n), 178]; }); }
  // 9: plant
  {
    paint(9, (x, y) => {
      const dx = Math.abs(x - 7.5) / 7.5;
      const top = 3 + dx * 9;
      if (y >= top) {
        const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const v = (n - Math.floor(n)) * 34;
        return [cl(70 + v), cl(148 + v), cl(56 + v), 255];
      }
      return [0, 0, 0, 0];
    });
  }

  // 10: brick
  {
    const r = mulberry32(1010);
    paint(10, (x, y) => {
      const brickH = 4, brickW = 8;
      const row = Math.floor(y / brickH);
      const offset = (row % 2) * (brickW / 2);
      const bx = Math.floor((x + offset) % brickW);
      const by = y % brickH;
      if (by === 0 || bx === 0) {
        const n = (r() - 0.5) * 16;
        return [cl(180 + n), cl(175 + n), cl(165 + n), 255];
      }
      const n = (r() - 0.5) * 28;
      return [cl(175 + n), cl(75 + n), cl(55 + n), 255];
    });
  }
  // 11: cobblestone
  {
    const r = mulberry32(1111);
    const v = new Float32Array(256);
    for (let i = 0; i < 256; i++) v[i] = r();
    paint(11, (x, y) => {
      const h = v[y * 16 + x];
      const edge = (x % 5 === 0 || y % 5 === 0 || x % 7 === 3 || y % 6 === 2) ? -30 : 0;
      const n = (h - 0.5) * 40 + edge;
      return [cl(125 + n), cl(125 + n), cl(130 + n), 255];
    });
  }
  // 12: glass (transparent)
  {
    paint(12, (x, y) => {
      const isEdge = x === 0 || x === 15 || y === 0 || y === 15;
      const isFrame = x === 7 || x === 8 || y === 7 || y === 8;
      if (isEdge || isFrame) {
        return [cl(200), cl(220), cl(240), 200];
      }
      return [cl(210), cl(235), cl(255), 55];
    });
  }
  // 13: door
  {
    const r = mulberry32(1313);
    paint(13, (x, y) => {
      const isEdge = x === 0 || x === 15 || y === 0 || y === 15;
      if (isEdge) return [cl(90), cl(65), cl(40), 255];
      const n = (r() - 0.5) * 18;
      const panel = (x >= 3 && x <= 12 && ((y >= 2 && y <= 6) || (y >= 9 && y <= 13)));
      if (panel) return [cl(110 + n), cl(80 + n), cl(50 + n), 255];
      return [cl(130 + n), cl(95 + n), cl(60 + n), 255];
    });
  }
  // 14: candle (cross billboard)
  {
    paint(14, (x, y) => {
      const cx = 7.5, cy = 7.5;
      const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
      // Flame
      if (y < 5 && dx < 2.5 - y * 0.3) {
        const n = Math.sin(x * 3.7 + y * 5.1) * 30;
        return [cl(255), cl(200 + n), cl(60), 255];
      }
      // Wick
      if (x >= 7 && x <= 8 && y >= 4 && y <= 6) return [cl(50), cl(50), cl(50), 255];
      // Candle body
      if (x >= 6 && x <= 9 && y >= 6 && y <= 14) {
        const n = Math.sin(x * 2.3) * 15;
        return [cl(240 + n), cl(235 + n), cl(210 + n), 255];
      }
      return [0, 0, 0, 0];
    });
  }
  // 15: planks
  {
    const r = mulberry32(1515);
    paint(15, (x, y) => {
      const plankH = 4;
      const py = y % plankH;
      const n = (r() - 0.5) * 20;
      if (py === 0) return [cl(100 + n), cl(75 + n), cl(45 + n), 255];
      const grain = Math.sin(x * 1.8 + y * 0.3) * 8;
      return [cl(170 + n + grain), cl(130 + n + grain), cl(80 + n + grain), 255];
    });
  }
  // 16: iron block
  {
    const r = mulberry32(1616);
    paint(16, (x, y) => {
      const n = (r() - 0.5) * 22;
      const shine = (x === 7 && y === 7) ? 40 : 0;
      return [cl(200 + n + shine), cl(200 + n + shine), cl(205 + n + shine), 255];
    });
  }
  // 17: gold block
  {
    const r = mulberry32(1717);
    paint(17, (x, y) => {
      const n = (r() - 0.5) * 22;
      const shine = (x === 7 && y === 7) ? 40 : 0;
      return [cl(240 + n + shine), cl(210 + n + shine), cl(60 + n + shine), 255];
    });
  }
  // 18: diamond block
  {
    const r = mulberry32(1818);
    paint(18, (x, y) => {
      const n = (r() - 0.5) * 24;
      const sparkle = ((x + y) % 5 === 0) ? 30 : 0;
      return [cl(90 + n + sparkle), cl(230 + n + sparkle), cl(235 + n + sparkle), 255];
    });
  }
  // 19: coal ore
  {
    const r = mulberry32(1919);
    const v = new Float32Array(256);
    for (let i = 0; i < 256; i++) v[i] = r();
    paint(19, (x, y) => {
      const h = v[y * 16 + x];
      if (h < 0.25) {
        return [cl(35), cl(35), cl(40), 255];
      }
      const n = (r() - 0.5) * 35;
      return [cl(130 + n), cl(130 + n), cl(134 + n), 255];
    });
  }
  // 20: snow
  {
    const r = mulberry32(2020);
    paint(20, () => {
      const n = (r() - 0.5) * 18;
      return [cl(245 + n), cl(250 + n), cl(255), 255];
    });
  }
  // 21: lava
  {
    const r = mulberry32(2121);
    paint(21, (x, y) => {
      const n = (r() - 0.5) * 40;
      const wave = Math.sin(x * 0.8 + y * 0.6) * 25;
      return [cl(255), cl(120 + n + wave), cl(20 + n * 0.5), 255];
    });
  }

  return cv;
}

/* =========================================================================
 * 2. Shaders (8 columns atlas)
 * ========================================================================= */
const VERT_SHADER = `
  attribute float aTile;
  attribute vec3 aColor;
  varying vec2 vUv;
  varying float vTile;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vTile = aTile;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG_SHADER = `
  precision mediump float;
  uniform sampler2D uAtlas;
  uniform vec3  uFogColor;
  uniform float uFogDensity;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vTile;
  varying vec3 vColor;
  varying float vFogDepth;
  void main() {
    float col = mod(vTile, 8.0);
    float row = floor(vTile / 8.0);
    vec2 t = fract(vUv);
    float tx = (col + t.x) * 0.125;
    float ty = 1.0 - (row + 1.0 - t.y) * 0.125;
    vec4 tex = texture2D(uAtlas, vec2(tx, ty));
    if (tex.a < 0.06) discard;
    vec3 c = tex.rgb * vColor;
    float f = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    c = mix(c, uFogColor, clamp(f, 0.0, 1.0));
    gl_FragColor = vec4(c, tex.a * uOpacity);
  }
`;

/* =========================================================================
 * 3. Web Worker
 * ========================================================================= */
const WORKER_SRC = String.raw`
'use strict';
const CS = 16, CH = 64, SEA = 32;
const SEED = 1337;
const AIR = 0, GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5, LEAVES = 6, WATER = 7, PLANT = 8;
const BRICK = 9, COBBLE = 10, GLASS = 11, DOOR = 12, CANDLE = 13;
const PLANKS = 14, IRON = 15, GOLD = 16, DIAMOND = 17, COAL = 18, SNOW = 19, LAVA = 20;

const OPAQUE = new Uint8Array(32);
OPAQUE[GRASS] = 1; OPAQUE[DIRT] = 1; OPAQUE[STONE] = 1; OPAQUE[SAND] = 1; OPAQUE[LOG] = 1;
OPAQUE[BRICK] = 1; OPAQUE[COBBLE] = 1; OPAQUE[DOOR] = 1; OPAQUE[PLANKS] = 1;
OPAQUE[IRON] = 1; OPAQUE[GOLD] = 1; OPAQUE[DIAMOND] = 1; OPAQUE[COAL] = 1;
OPAQUE[SNOW] = 1; OPAQUE[LAVA] = 1;

// face: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
const TILE_TABLE = [
  null,
  [1, 1, 0, 2, 1, 1],   // GRASS
  [2, 2, 2, 2, 2, 2],   // DIRT
  [3, 3, 3, 3, 3, 3],   // STONE
  [4, 4, 4, 4, 4, 4],   // SAND
  [5, 5, 6, 6, 5, 5],   // LOG
  [7, 7, 7, 7, 7, 7],   // LEAVES
  [8, 8, 8, 8, 8, 8],   // WATER
  [9, 9, 9, 9, 9, 9],   // PLANT
  [10,10,10,10,10,10],  // BRICK
  [11,11,11,11,11,11],  // COBBLE
  [12,12,12,12,12,12],  // GLASS
  [13,13,13,13,13,13],  // DOOR
  [14,14,14,14,14,14],  // CANDLE
  [15,15,15,15,15,15],  // PLANKS
  [16,16,16,16,16,16],  // IRON
  [17,17,17,17,17,17],  // GOLD
  [18,18,18,18,18,18],  // DIAMOND
  [19,19,19,19,19,19],  // COAL
  [20,20,20,2,20,20],   // SNOW (bottom=dirt)
  [21,21,21,21,21,21],  // LAVA
];

function hash2i(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function hash3i(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)
         + Math.imul(z | 0, 2147483629) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function sm(t) { return t * t * (3 - 2 * t); }
function noise2(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = sm(xf), v = sm(yf);
  const a = hash2i(xi, yi, s),     b = hash2i(xi + 1, yi, s);
  const c = hash2i(xi, yi + 1, s), d = hash2i(xi + 1, yi + 1, s);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}
function noise3(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = sm(xf), v = sm(yf), w = sm(zf);
  const c000 = hash3i(xi, yi, zi, s),         c100 = hash3i(xi + 1, yi, zi, s);
  const c010 = hash3i(xi, yi + 1, zi, s),     c110 = hash3i(xi + 1, yi + 1, zi, s);
  const c001 = hash3i(xi, yi, zi + 1, s),     c101 = hash3i(xi + 1, yi, zi + 1, s);
  const c011 = hash3i(xi, yi + 1, zi + 1, s), c111 = hash3i(xi + 1, yi + 1, zi + 1, s);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm2(x, y, oct, s) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise2(x * f, y * f, s + i * 1013);
    norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm;
}
function fbm3(x, y, z, oct, s) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise3(x * f, y * f, z * f, s + i * 1013);
    norm += a; a *= 0.5; f *= 2;
  }
  return sum / norm;
}

const cache = new Map();
function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > 700) {
    const it = cache.keys();
    const oldest = it.next().value;
    if (oldest !== k) cache.delete(oldest);
  }
}
function getChunkData(cx, cz) {
  const k = cx + ',' + cz;
  let d = cache.get(k);
  if (d) return d;
  d = generateChunk(cx, cz);
  cacheSet(k, d);
  return d;
}
function generateChunk(cx, cz) {
  const data = new Uint8Array(CS * CS * CH);
  const bx0 = cx * CS, bz0 = cz * CS;
  const hmap = new Int32Array(CS * CS);

  for (let z = 0; z < CS; z++) {
    for (let x = 0; x < CS; x++) {
      const wx = bx0 + x, wz = bz0 + z;
      const cont = fbm2(wx * 0.0045, wz * 0.0045, 4, 1000 + SEED);
      const hill = fbm2(wx * 0.0190, wz * 0.0190, 4, 2000 + SEED);
      const mt   = fbm2(wx * 0.0072, wz * 0.0072, 3, 3000 + SEED);
      let h;
      if (cont < 0.44) {
        h = SEA - 3 - (0.44 - cont) * 55;
      } else {
        const t = (cont - 0.44) / 0.56;
        h = SEA + t * 3 + hill * 7 * (0.35 + t * 0.65);
        const m = Math.max(0, mt - 0.55) / 0.45;
        h += m * m * 24;
      }
      h = Math.round(h);
      if (h < 2) h = 2;
      if (h > CH - 2) h = CH - 2;
      hmap[z * CS + x] = h;
    }
  }

  const GS = 4;
  const GX = CS / GS + 1;
  const GY = CH / GS + 1;
  const GZ = CS / GS + 1;
  const cave = new Float32Array(GX * GY * GZ);
  for (let iy = 0; iy < GY; iy++) {
    for (let iz = 0; iz < GZ; iz++) {
      for (let ix = 0; ix < GX; ix++) {
        cave[(iy * GZ + iz) * GX + ix] = fbm3(
          (bx0 + ix * GS) * 0.075, (iy * GS) * 0.120, (bz0 + iz * GS) * 0.075, 3, 7000 + SEED
        );
      }
    }
  }

  for (let z = 0; z < CS; z++) {
    for (let x = 0; x < CS; x++) {
      const h = hmap[z * CS + x];
      let surf, sub;
      if (h <= SEA + 1)      { surf = SAND;  sub = SAND; }
      else if (h > SEA + 16) { surf = STONE; sub = STONE; }
      else                   { surf = GRASS; sub = DIRT; }

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0)         id = STONE;
        else if (y === h)    id = surf;
        else if (y > h - 4)  id = sub;
        else                 id = STONE;
        data[(y * CS + z) * CS + x] = id;
      }

      for (let y = 1; y < h - 1; y++) {
        const fx = x / GS, fy = y / GS, fz = z / GS;
        let ix = fx | 0, iy = fy | 0, iz = fz | 0;
        if (ix > GX - 2) ix = GX - 2;
        if (iy > GY - 2) iy = GY - 2;
        if (iz > GZ - 2) iz = GZ - 2;
        const tx = fx - ix, ty = fy - iy, tz = fz - iz;
        const i0 = (iy * GZ + iz) * GX + ix;
        const i1 = i0 + GX;
        const i2 = i0 + GX * GZ;
        const i3 = i2 + GX;
        const c00 = cave[i0] + (cave[i0 + 1] - cave[i0]) * tx;
        const c10 = cave[i1] + (cave[i1 + 1] - cave[i1]) * tx;
        const c01 = cave[i2] + (cave[i2 + 1] - cave[i2]) * tx;
        const c11 = cave[i3] + (cave[i3 + 1] - cave[i3]) * tx;
        const c0 = c00 + (c10 - c00) * tz;
        const c1 = c01 + (c11 - c01) * tz;
        const val = c0 + (c1 - c0) * ty;
        if (val > 0.635) data[(y * CS + z) * CS + x] = 0;
      }

      for (let y = h + 1; y <= SEA; y++) {
        data[(y * CS + z) * CS + x] = WATER;
      }
    }
  }

  let rs = (Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ SEED) | 0;
  const rnd = () => {
    rs = (rs + 0x6D2B79F5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let z = 3; z < CS - 3; z++) {
    for (let x = 3; x < CS - 3; x++) {
      const h = hmap[z * CS + x];
      if (h <= SEA + 1) { rnd(); continue; }
      const r = rnd();
      if (r < 0.013) {
        const th = 4 + ((rnd() * 3) | 0);
        const top = h + th;
        if (top + 2 >= CH) continue;
        for (let ty = h + 1; ty <= top; ty++) {
          data[(ty * CS + z) * CS + x] = LOG;
        }
        for (let dy = -2; dy <= 1; dy++) {
          const rad = dy === 1 ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) {
            for (let dx = -rad; dx <= rad; dx++) {
              if (dx * dx + dz * dz > rad * rad + (rad === 2 ? 1 : 0)) continue;
              const lx = x + dx, ly = top + dy, lz = z + dz;
              if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= CH) continue;
              const idx = (ly * CS + lz) * CS + lx;
              if (data[idx] === 0) data[idx] = LEAVES;
            }
          }
        }
      } else if (r < 0.07) {
        if (h + 1 < CH && data[(h * CS + z) * CS + x] === GRASS) {
          const idx = ((h + 1) * CS + z) * CS + x;
          if (data[idx] === 0) data[idx] = PLANT;
        }
      }
    }
  }
  return data;
}

const FACES = [
  { d: 0, dir:  1, n: [ 1, 0, 0], corners: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]], light: 0.80 },
  { d: 0, dir: -1, n: [-1, 0, 0], corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]], light: 0.80 },
  { d: 1, dir:  1, n: [ 0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], light: 1.00 },
  { d: 1, dir: -1, n: [ 0,-1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]], light: 0.50 },
  { d: 2, dir:  1, n: [ 0, 0, 1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], light: 0.68 },
  { d: 2, dir: -1, n: [ 0, 0,-1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], light: 0.68 },
];
const AO_LIGHT = [0.48, 0.68, 0.85, 1.0];
const DIMS = [CS, CH, CS];

function newBuf() {
  return { pos: [], nor: [], uv: [], tile: [], col: [], idx: [] };
}

function emitCross(buf, x, y, z, tileIdx) {
  const quads = [
    [[0,0,0],[1,0,1],[1,1,1],[0,1,0]],
    [[1,0,0],[0,0,1],[0,1,1],[1,1,0]],
  ];
  const uvq = [[0,0],[1,0],[1,1],[0,1]];
  for (let qi = 0; qi < 2; qi++) {
    const q = quads[qi];
    const base = buf.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      buf.pos.push(x + q[i][0], y + q[i][1], z + q[i][2]);
      buf.nor.push(0, 1, 0);
      buf.uv.push(uvq[i][0], uvq[i][1]);
      buf.tile.push(tileIdx);
      buf.col.push(1.0, 1.0, 1.0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function buildMesh(cx, cz) {
  const nb = new Array(9);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      nb[(dz + 1) * 3 + (dx + 1)] = getChunkData(cx + dx, cz + dz);
    }
  }
  const center = nb[4];

  function gb(lx, ly, lz) {
    if (ly < 0 || ly >= CH) return 0;
    let dx = 0, dz = 0;
    if (lx < 0) dx = -1; else if (lx >= CS) dx = 1;
    if (lz < 0) dz = -1; else if (lz >= CS) dz = 1;
    const cd = nb[(dz + 1) * 3 + (dx + 1)];
    if (!cd) return 0;
    return cd[(ly * CS + (lz - dz * CS)) * CS + (lx - dx * CS)];
  }

  const opaque = newBuf();
  const trans = newBuf();
  const mask = new Int32Array(CS * CH);

  for (let fi = 0; fi < 6; fi++) {
    const F = FACES[fi];
    const d = F.d, dir = F.dir;
    let uA, vA;
    if (d === 0) { uA = 2; vA = 1; }
    else { uA = (d + 1) % 3; vA = (d + 2) % 3; }
    const sizeU = DIMS[uA];
    const sizeV = DIMS[vA];
    const sizeD = DIMS[d];
    const nx = F.n[0], ny = F.n[1], nz = F.n[2];
    const light = F.light;

    const cuArr = new Int32Array(4), cvArr = new Int32Array(4);
    const ouArr = new Int32Array(4), ovArr = new Int32Array(4);
    for (let i = 0; i < 4; i++) {
      const c = F.corners[i];
      cuArr[i] = c[uA];
      cvArr[i] = c[vA];
      ouArr[i] = c[uA] === 0 ? -1 : 1;
      ovArr[i] = c[vA] === 0 ? -1 : 1;
    }

    const maskLen = sizeU * sizeV;
    for (let s = 0; s < sizeD; s++) {
      mask.fill(-1, 0, maskLen);
      let any = false;
      for (let vv = 0; vv < sizeV; vv++) {
        for (let uu = 0; uu < sizeU; uu++) {
          let px, py, pz;
          if (d === 0)      { px = s;  py = vv; pz = uu; }
          else if (d === 1) { py = s;  pz = uu; px = vv; }
          else              { pz = s;  px = uu; py = vv; }

          const id = gb(px, py, pz);
          if (id === 0 || id === PLANT || id === CANDLE) continue;

          const qx = px + nx, qy = py + ny, qz = pz + nz;
          const nid = gb(qx, qy, qz);

          let vis;
          if (nid === 0) vis = true;
          else if (OPAQUE[nid]) vis = false;
          else if (id === nid) vis = false;
          else vis = true;

          if (!vis) continue;

          const bu = (id === WATER || id === GLASS || id === LAVA) ? 0 : 1;
          const ux = uA === 0 ? 1 : 0, uy = uA === 1 ? 1 : 0, uz = uA === 2 ? 1 : 0;
          const vx = vA === 0 ? 1 : 0, vy = vA === 1 ? 1 : 0, vz = vA === 2 ? 1 : 0;
          let packed = TILE_TABLE[id][fi];
          for (let i = 0; i < 4; i++) {
            let ao = 3;
            if (bu) {
              const ou = ouArr[i], ov = ovArr[i];
              const s1 = OPAQUE[gb(qx + ux * ou, qy + uy * ou, qz + uz * ou)] ? 1 : 0;
              const s2 = OPAQUE[gb(qx + vx * ov, qy + vy * ov, qz + vz * ov)] ? 1 : 0;
              const cc = OPAQUE[gb(qx + ux * ou + vx * ov, qy + uy * ou + vy * ov, qz + uz * ou + vz * ov)] ? 1 : 0;
              ao = (s1 && s2) ? 0 : (3 - (s1 + s2 + cc));
            }
            packed |= (ao & 3) << (8 + i * 2);
          }
          mask[vv * sizeU + uu] = packed;
          any = true;
        }
      }
      if (!any) continue;

      for (let vv = 0; vv < sizeV; vv++) {
        for (let uu = 0; uu < sizeU; uu++) {
          const mi = vv * sizeU + uu;
          const m = mask[mi];
          if (m === -1) continue;

          let w = 1;
          while (uu + w < sizeU && mask[mi + w] === m) w++;
          let h = 1;
          outer:
          while (vv + h < sizeV) {
            const rowBase = (vv + h) * sizeU + uu;
            for (let k = 0; k < w; k++) {
              if (mask[rowBase + k] !== m) break outer;
            }
            h++;
          }
          for (let dv = 0; dv < h; dv++) {
            const rowBase = (vv + dv) * sizeU + uu;
            for (let du = 0; du < w; du++) mask[rowBase + du] = -1;
          }

          const tileIdx = m & 255;
          const id = (() => {
            for (let b = 1; b <= 20; b++) {
              if (TILE_TABLE[b] && TILE_TABLE[b][fi] === tileIdx) {
                if (b === GRASS && (fi === 2 || fi === 3)) continue;
                if (b === LOG && (fi === 2 || fi === 3)) continue;
                if (b === SNOW && fi === 3) continue;
                return b;
              }
            }
            return STONE;
          })();
          const isTrans = (id === WATER || id === GLASS || id === LAVA);
          const buf = isTrans ? trans : opaque;

          const coordD = dir === 1 ? s + 1 : s;
          const base = buf.pos.length / 3;
          for (let i = 0; i < 4; i++) {
            const cu = cuArr[i], cv = cvArr[i];
            const uCoord = uu + cu * w;
            const vCoord = vv + cv * h;
            let ax, ay, az;
            if (d === 0)      { ax = coordD; ay = vCoord; az = uCoord; }
            else if (d === 1) { ay = coordD; az = uCoord; ax = vCoord; }
            else              { az = coordD; ax = uCoord; ay = vCoord; }

            const ao = (m >> (8 + i * 2)) & 3;
            let g = light * AO_LIGHT[ao];
            if (id === LAVA) g = Math.min(1.3, g * 1.5);
            buf.pos.push(ax, ay, az);
            buf.nor.push(nx, ny, nz);
            buf.uv.push(cu * w, cv * h);
            buf.tile.push(tileIdx);
            buf.col.push(g, g, g);
          }
          buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }

  for (let y = 1; y < CH; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const bid = center[(y * CS + z) * CS + x];
        if (bid === PLANT) emitCross(trans, x, y, z, 9);
        else if (bid === CANDLE) emitCross(trans, x, y, z, 14);
      }
    }
  }

  return { opaque, trans };
}

function packBuf(buf) {
  if (buf.idx.length === 0) return null;
  return {
    pos: new Float32Array(buf.pos).buffer,
    nor: new Float32Array(buf.nor).buffer,
    uv: new Float32Array(buf.uv).buffer,
    tile: new Float32Array(buf.tile).buffer,
    col: new Float32Array(buf.col).buffer,
    idx: new Uint32Array(buf.idx).buffer,
    vcount: buf.pos.length / 3,
  };
}

function sendMesh(cx, cz, includeData) {
  const { opaque, trans } = buildMesh(cx, cz);
  const op = packBuf(opaque);
  const tr = packBuf(trans);
  const transfers = [];
  if (op) transfers.push(op.pos, op.nor, op.uv, op.tile, op.col, op.idx);
  if (tr) transfers.push(tr.pos, tr.nor, tr.uv, tr.tile, tr.col, tr.idx);

  const msg = { type: 'mesh', cx, cz, opaque: op, trans: tr };
  if (includeData) {
    const cd = getChunkData(cx, cz);
    const copy = cd.slice();
    msg.data = copy.buffer;
    transfers.push(copy.buffer);
  }
  self.postMessage(msg, transfers);
}

self.onmessage = function (e) {
  const msg = e.data;
  if (msg.type === 'gen') {
    getChunkData(msg.cx, msg.cz);
    sendMesh(msg.cx, msg.cz, true);
  }
  else if (msg.type === 'rebuild') {
    sendMesh(msg.cx, msg.cz, false);
  }
  else if (msg.type === 'setdata') {
    const k = msg.cx + ',' + msg.cz;
    cache.set(k, new Uint8Array(msg.data));
  }
  else if (msg.type === 'edit') {
    const k = msg.cx + ',' + msg.cz;
    const cd = cache.get(k);
    if (cd) {
      const idx = (msg.y * CS + msg.z) * CS + msg.x;
      if (idx >= 0 && idx < cd.length) cd[idx] = msg.id;
    }
    const rebuild = new Set();
    rebuild.add(msg.cx + ',' + msg.cz);
    if (msg.x === 0)          rebuild.add((msg.cx - 1) + ',' + msg.cz);
    if (msg.x === CS - 1)     rebuild.add((msg.cx + 1) + ',' + msg.cz);
    if (msg.z === 0)          rebuild.add(msg.cx + ',' + (msg.cz - 1));
    if (msg.z === CS - 1)     rebuild.add(msg.cx + ',' + (msg.cz + 1));
    rebuild.forEach((key) => {
      const parts = key.split(',');
      const rcx = parseInt(parts[0], 10);
      const rcz = parseInt(parts[1], 10);
      if (cache.has(rcx + ',' + rcz)) sendMesh(rcx, rcz, false);
    });
  }
  else if (msg.type === 'drop') {
    cache.delete(msg.cx + ',' + msg.cz);
  }
};
`;

/* =========================================================================
 * 4. Main Thread: Renderer / Scene / Material
 * ========================================================================= */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true,
});
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const SKY_COLOR = new THREE.Color(0x9ec9ff);
scene.background = SKY_COLOR;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

atlasCanvas = buildAtlas();
const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
atlasTexture.magFilter = THREE.NearestFilter;
atlasTexture.minFilter = THREE.NearestFilter;
atlasTexture.generateMipmaps = false;
atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
atlasTexture.flipY = true;
atlasTexture.needsUpdate = true;

function makeMaterial(isTransparent) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAtlas: { value: atlasTexture },
      uFogColor: { value: new THREE.Color(0x9ec9ff) },
      uFogDensity: { value: 0.02 },
      uOpacity: { value: 1.0 },
    },
    vertexShader: VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent: isTransparent,
    side: isTransparent ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !isTransparent,
    depthTest: true,
  });
}
const matOpaque = makeMaterial(false);
const matTrans = makeMaterial(true);

function setFogDensity(r) {
  const d = CONFIG.FOG_FACTOR / (r * CONFIG.CHUNK_SIZE);
  matOpaque.uniforms.uFogDensity.value = d;
  matTrans.uniforms.uFogDensity.value = d;
}

/* =========================================================================
 * 5. IndexedDB Save System
 * ========================================================================= */
const DB_NAME = 'VoxelCraftWorld';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function saveChunkToDB(key, data) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(data, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = (e) => { db.close(); reject(e.target.error); };
    });
  } catch (e) {
    console.warn('IndexedDB save failed:', e);
  }
}

async function loadAllFromDB() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const result = new Map();
      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          result.set(cursor.key, new Uint8Array(cursor.value));
          cursor.continue();
        } else {
          db.close();
          resolve(result);
        }
      };
      tx.onerror = () => { db.close(); resolve(new Map()); };
    });
  } catch (e) {
    console.warn('IndexedDB load failed:', e);
    return new Map();
  }
}

async function clearDB() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); showToast('存档已清除'); };
  } catch (e) {
    showToast('清除失败');
  }
}

/* =========================================================================
 * 6. World Management
 * ========================================================================= */
const CS = CONFIG.CHUNK_SIZE;
const CH = CONFIG.WORLD_HEIGHT;
const chunks = new Map();
const uploadQueue = [];
let worker = null;
let workerReady = false;

const savedChunks = new Map();
const dirtyChunks = new Set();
let saveTimer = 0;

function chunkKey(cx, cz) { return cx + ',' + cz; }

function initWorker() {
  const blob = new Blob([WORKER_SRC], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  worker = new Worker(url);
  worker.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === 'mesh') {
      uploadQueue.push(msg);
    }
  };
  worker.onerror = (err) => {
    console.error('[Worker Error]', err.message, err.filename, err.lineno);
  };
  workerReady = true;
}

function disposeChunkMesh(c) {
  if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  if (c.tmesh) { scene.remove(c.tmesh); c.tmesh.geometry.dispose(); c.tmesh = null; }
}

function disposeChunk(c) {
  disposeChunkMesh(c);
  c.data = null;
}

function applyMeshMessage(msg) {
  const key = chunkKey(msg.cx, msg.cz);
  const c = chunks.get(key);
  if (!c) return;

  if (msg.data && !c.data) {
    const saved = savedChunks.get(key);
    if (saved) {
      c.data = saved;
      const copy = saved.slice();
      worker.postMessage({ type: 'setdata', cx: msg.cx, cz: msg.cz, data: copy.buffer }, [copy.buffer]);
      worker.postMessage({ type: 'rebuild', cx: msg.cx, cz: msg.cz });
      return;
    }
    c.data = new Uint8Array(msg.data);
  }

  disposeChunkMesh(c);

  const buildGeometry = (packed) => {
    if (!packed) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(packed.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(packed.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(packed.uv), 2));
    g.setAttribute('aTile', new THREE.BufferAttribute(new Float32Array(packed.tile), 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(packed.col), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(packed.idx), 1));
    g.computeBoundingSphere();
    return g;
  };

  const og = buildGeometry(msg.opaque);
  if (og) {
    const m = new THREE.Mesh(og, matOpaque);
    m.position.set(msg.cx * CS, 0, msg.cz * CS);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.frustumCulled = true;
    scene.add(m);
    c.mesh = m;
  }

  const tg = buildGeometry(msg.trans);
  if (tg) {
    const m = new THREE.Mesh(tg, matTrans);
    m.position.set(msg.cx * CS, 0, msg.cz * CS);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.frustumCulled = true;
    m.renderOrder = 1;
    scene.add(m);
    c.tmesh = m;
  }
}

async function saveDirtyChunks() {
  if (dirtyChunks.size === 0) return;
  const toSave = [...dirtyChunks];
  dirtyChunks.clear();
  for (const key of toSave) {
    const c = chunks.get(key);
    if (c && c.data) {
      await saveChunkToDB(key, c.data.slice().buffer);
    }
  }
}

/* =========================================================================
 * 7. Player / Physics / Raycast
 * ========================================================================= */
const player = {
  pos: new THREE.Vector3(8.5, 80, 8.5),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0, pitch: 0,
  onGround: false, spawned: false,
};
const PW = CONFIG.PLAYER_WIDTH;
const PH = CONFIG.PLAYER_HEIGHT;
const HALF_W = PW * 0.5;

function getBlockAt(x, y, z) {
  if (y < 0 || y >= CH) return 0;
  const cx = Math.floor(x / CS);
  const cz = Math.floor(z / CS);
  const c = chunks.get(chunkKey(cx, cz));
  if (!c || !c.data) return 0;
  const lx = x - cx * CS;
  const lz = z - cz * CS;
  return c.data[(y * CS + lz) * CS + lx];
}

function isSolidId(id) {
  return id !== 0 && id !== 7 && id !== 8 && id !== 13 && id !== 20;
}

function collidesAt(px, py, pz) {
  const x0 = Math.floor(px - HALF_W);
  const x1 = Math.ceil(px + HALF_W) - 1;
  const y0 = Math.floor(py);
  const y1 = Math.ceil(py + PH) - 1;
  const z0 = Math.floor(pz - HALF_W);
  const z1 = Math.ceil(pz + HALF_W) - 1;
  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (isSolidId(getBlockAt(x, y, z))) return true;
      }
    }
  }
  return false;
}

const _tmpV = new THREE.Vector3();
function moveWithCollision(dx, dy, dz) {
  const p = player.pos;
  const total = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  const steps = Math.max(1, Math.ceil(total / 0.18));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) { p.x += sx; if (collidesAt(p.x, p.y, p.z)) { p.x -= sx; player.vel.x = 0; } }
    if (sz !== 0) { p.z += sz; if (collidesAt(p.x, p.y, p.z)) { p.z -= sz; player.vel.z = 0; } }
    if (sy !== 0) {
      p.y += sy;
      if (collidesAt(p.x, p.y, p.z)) {
        p.y -= sy;
        if (sy < 0) player.onGround = true;
        player.vel.y = 0;
      } else if (sy < 0) {
        player.onGround = false;
      }
    }
  }
}

const rayHit = { hit: { x: 0, y: 0, z: 0, id: 0, valid: false }, prev: { x: 0, y: 0, z: 0 } };

function updateRaycast() {
  rayHit.hit.valid = false;
  camera.getWorldDirection(_tmpV);
  const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
  const dx = _tmpV.x, dy = _tmpV.y, dz = _tmpV.z;
  const step = 0.04;
  const maxDist = CONFIG.REACH;
  let lastX = Math.floor(ox), lastY = Math.floor(oy), lastZ = Math.floor(oz);
  for (let t = 0; t < maxDist; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (bx === lastX && by === lastY && bz === lastZ) continue;
    const id = getBlockAt(bx, by, bz);
    if (id !== 0 && id !== 7 && id !== 20) {
      rayHit.hit.x = bx; rayHit.hit.y = by; rayHit.hit.z = bz;
      rayHit.hit.id = id; rayHit.hit.valid = true;
      rayHit.prev.x = lastX; rayHit.prev.y = lastY; rayHit.prev.z = lastZ;
      return;
    }
    lastX = bx; lastY = by; lastZ = bz;
  }
}

function setBlock(wx, wy, wz, id) {
  if (wy < 0 || wy >= CH) return;
  const cx = Math.floor(wx / CS);
  const cz = Math.floor(wz / CS);
  const c = chunks.get(chunkKey(cx, cz));
  if (!c || !c.data) return;
  const lx = wx - cx * CS;
  const lz = wz - cz * CS;
  c.data[(wy * CS + lz) * CS + lx] = id;
  dirtyChunks.add(chunkKey(cx, cz));
  worker.postMessage({ type: 'edit', cx, cz, x: lx, y: wy, z: lz, id });
}

function breakBlock() {
  if (!rayHit.hit.valid) return;
  const h = rayHit.hit;
  setBlock(h.x, h.y, h.z, 0);
  rayHit.hit.valid = false;
}

function placeBlock() {
  if (!rayHit.hit.valid) return;
  const p = rayHit.prev;
  if (p.y < 0 || p.y >= CH) return;
  const cur = getBlockAt(p.x, p.y, p.z);
  if (cur !== 0 && cur !== 7 && cur !== 8 && cur !== 13 && cur !== 20) return;
  const pp = player.pos;
  if (p.x + 1 > pp.x - HALF_W && p.x < pp.x + HALF_W &&
      p.y + 1 > pp.y && p.y < pp.y + PH &&
      p.z + 1 > pp.z - HALF_W && p.z < pp.z + HALF_W) return;
  setBlock(p.x, p.y, p.z, selectedBlockId);
  rayHit.hit.valid = false;
}

function doLandInstant() {
  const px = player.pos.x, pz = player.pos.z;
  let topY = 0;
  const corners = [
    [px - HALF_W + 0.02, pz - HALF_W + 0.02], [px + HALF_W - 0.02, pz - HALF_W + 0.02],
    [px - HALF_W + 0.02, pz + HALF_W - 0.02], [px + HALF_W - 0.02, pz + HALF_W - 0.02],
  ];
  for (let i = 0; i < 4; i++) {
    const cx = Math.floor(corners[i][0]), cz = Math.floor(corners[i][1]);
    const startY = Math.min(CH - 1, Math.floor(player.pos.y));
    for (let y = startY; y >= 0; y--) {
      if (isSolidId(getBlockAt(cx, y, cz))) { if (y + 1 > topY) topY = y + 1; break; }
    }
  }
  player.pos.y = topY + 0.01; player.vel.y = 0; player.onGround = true;
}

/* =========================================================================
 * 8. Chunk Scheduling
 * ========================================================================= */
let currentRadius = CONFIG.RADIUS_TABLE[1];
let chunkScanTimer = 0;
let userRadiusOverride = -1;

function scanChunks() {
  const pcx = Math.floor(player.pos.x / CS);
  const pcz = Math.floor(player.pos.z / CS);
  const R = currentRadius;
  const R2 = (R + 0.5) * (R + 0.5);
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > R2) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const k = chunkKey(cx, cz);
      if (!chunks.has(k)) {
        const c = { cx, cz, data: null, mesh: null, tmesh: null, requested: true };
        chunks.set(k, c);
        worker.postMessage({ type: 'gen', cx, cz });
      }
    }
  }
  const unloadR = R + 3;
  const toDelete = [];
  chunks.forEach((c, k) => {
    if (Math.abs(c.cx - pcx) > unloadR || Math.abs(c.cz - pcz) > unloadR) toDelete.push(k);
  });
  for (let i = 0; i < toDelete.length; i++) {
    const k = toDelete[i];
    const c = chunks.get(k);
    if (!c) continue;
    disposeChunk(c);
    chunks.delete(k);
    worker.postMessage({ type: 'drop', cx: c.cx, cz: c.cz });
  }
}

/* =========================================================================
 * 9. Input
 * ========================================================================= */
const input = { moveX: 0, moveZ: 0, jump: false, run: false, flyUp: false, flyDown: false, lookDX: 0, lookDY: 0 };
const settings = { speedMul: 1.0, jumpMul: 1.0, flyMode: false };
const joy = { active: false, id: -1, ox: 0, oy: 0, cx: 0, cy: 0 };
const joyBaseEl = document.getElementById('joyBase');
const joyStickEl = document.getElementById('joyStick');
const JOY_R = 56;
const look = { active: false, id: -1, lx: 0, ly: 0, moved: 0, startT: 0, didAction: false, timer: 0 };
const jumpBtnEl = document.getElementById('jumpBtn');
const flyUpBtn = document.getElementById('flyUpBtn');
const flyDownBtn = document.getElementById('flyDownBtn');
const landBtn = document.getElementById('landBtn');
let jumpBtnTouchId = -1, flyUpTouchId = -1, flyDownTouchId = -1;
const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

function showToast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}

function onTouchStart(e) {
  if (!running || settingsOpen) return;
  e.preventDefault();
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (settings.flyMode) {
      const fu = flyUpBtn.getBoundingClientRect();
      if (t.clientX >= fu.left - 8 && t.clientX <= fu.right + 8 && t.clientY >= fu.top - 8 && t.clientY <= fu.bottom + 8) { flyUpTouchId = t.identifier; input.flyUp = true; continue; }
      const fd = flyDownBtn.getBoundingClientRect();
      if (t.clientX >= fd.left - 8 && t.clientX <= fd.right + 8 && t.clientY >= fd.top - 8 && t.clientY <= fd.bottom + 8) { flyDownTouchId = t.identifier; input.flyDown = true; continue; }
      const lb = landBtn.getBoundingClientRect();
      if (t.clientX >= lb.left - 8 && t.clientX <= lb.right + 8 && t.clientY >= lb.top - 8 && t.clientY <= lb.bottom + 8) { doLandInstant(); continue; }
    }
    const jb = jumpBtnEl.getBoundingClientRect();
    if (jumpBtnEl.style.display !== 'none' && t.clientX >= jb.left - 10 && t.clientX <= jb.right + 10 && t.clientY >= jb.top - 10 && t.clientY <= jb.bottom + 10) { jumpBtnTouchId = t.identifier; input.jump = true; continue; }
    const hb = document.getElementById('hotbar').getBoundingClientRect();
    if (t.clientY >= hb.top - 6 && t.clientY <= hb.bottom + 6 && t.clientX >= hb.left - 6 && t.clientX <= hb.right + 6) continue;
    if (!joy.active && t.clientX < W * 0.48 && t.clientY > H * 0.42) {
      joy.active = true; joy.id = t.identifier; joy.ox = t.clientX; joy.oy = t.clientY; joy.cx = t.clientX; joy.cy = t.clientY;
      joyBaseEl.style.display = 'block'; joyStickEl.style.display = 'block';
      joyBaseEl.style.left = t.clientX + 'px'; joyBaseEl.style.top = t.clientY + 'px';
      joyStickEl.style.left = t.clientX + 'px'; joyStickEl.style.top = t.clientY + 'px';
      continue;
    }
    if (!look.active) {
      look.active = true; look.id = t.identifier; look.lx = t.clientX; look.ly = t.clientY; look.moved = 0; look.startT = performance.now(); look.didAction = false;
      clearTimeout(look.timer);
      look.timer = setTimeout(() => { if (look.active && look.moved < CONFIG.TAP_MOVE_TOL && !look.didAction) { placeBlock(); look.didAction = true; } }, CONFIG.LONGPRESS_MS);
    }
  }
}

function onTouchMove(e) {
  if (!running || settingsOpen) return;
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (joy.active && t.identifier === joy.id) {
      let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
      const len = Math.hypot(dx, dy);
      if (len > JOY_R) { dx = dx / len * JOY_R; dy = dy / len * JOY_R; }
      joy.cx = joy.ox + dx; joy.cy = joy.oy + dy;
      joyStickEl.style.left = joy.cx + 'px'; joyStickEl.style.top = joy.cy + 'px';
      input.moveX = dx / JOY_R; input.moveZ = -dy / JOY_R;
      continue;
    }
    if (look.active && t.identifier === look.id) {
      const dx = t.clientX - look.lx, dy = t.clientY - look.ly;
      look.lx = t.clientX; look.ly = t.clientY; look.moved += Math.abs(dx) + Math.abs(dy);
      if (look.moved > CONFIG.TAP_MOVE_TOL) clearTimeout(look.timer);
      player.yaw -= dx * CONFIG.TOUCH_LOOK_SENS;
      player.pitch -= dy * CONFIG.TOUCH_LOOK_SENS;
      const lim = Math.PI / 2 - 0.017;
      if (player.pitch > lim) player.pitch = lim;
      if (player.pitch < -lim) player.pitch = -lim;
      continue;
    }
  }
}

function onTouchEnd(e) {
  if (!running || settingsOpen) return;
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === jumpBtnTouchId) { jumpBtnTouchId = -1; input.jump = false; continue; }
    if (t.identifier === flyUpTouchId) { flyUpTouchId = -1; input.flyUp = false; continue; }
    if (t.identifier === flyDownTouchId) { flyDownTouchId = -1; input.flyDown = false; continue; }
    if (joy.active && t.identifier === joy.id) {
      joy.active = false; joy.id = -1; input.moveX = 0; input.moveZ = 0;
      joyBaseEl.style.display = 'none'; joyStickEl.style.display = 'none';
      continue;
    }
    if (look.active && t.identifier === look.id) {
      clearTimeout(look.timer);
      const dur = performance.now() - look.startT;
      if (!look.didAction && look.moved < CONFIG.TAP_MOVE_TOL && dur < CONFIG.LONGPRESS_MS) breakBlock();
      look.active = false; look.id = -1; look.didAction = false;
      continue;
    }
  }
}

function onTouchCancel(e) { onTouchEnd(e); }

const keys = Object.create(null);
function onKeyDown(e) {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); input.jump = true; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
  if (e.code >= 'Digit1' && e.code <= 'Digit9') selectHotbar(parseInt(e.code.slice(5), 10) - 1);
  if (e.code === 'Digit0') selectHotbar(9);
}
function onKeyUp(e) {
  keys[e.code] = false;
  if (e.code === 'Space') input.jump = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
}

let pointerLocked = false;
function onMouseMove(e) {
  if (!pointerLocked || settingsOpen) return;
  player.yaw -= e.movementX * CONFIG.MOUSE_LOOK_SENS;
  player.pitch -= e.movementY * CONFIG.MOUSE_LOOK_SENS;
  const lim = Math.PI / 2 - 0.017;
  if (player.pitch > lim) player.pitch = lim;
  if (player.pitch < -lim) player.pitch = -lim;
}
function onMouseDown(e) {
  if (!pointerLocked) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
}
function onPointerLockChange() { pointerLocked = (document.pointerLockElement === canvas); }

/* =========================================================================
 * 10. Hotbar (20 blocks)
 * ========================================================================= */
const HOTBAR_BLOCKS = [
  { id: 1,  tile: 1,  name: '草' },
  { id: 2,  tile: 2,  name: '土' },
  { id: 3,  tile: 3,  name: '石' },
  { id: 4,  tile: 4,  name: '沙' },
  { id: 5,  tile: 5,  name: '木' },
  { id: 6,  tile: 7,  name: '叶' },
  { id: 7,  tile: 8,  name: '水' },
  { id: 8,  tile: 9,  name: '草簇' },
  { id: 9,  tile: 10, name: '砖' },
  { id: 10, tile: 11, name: '圆石' },
  { id: 11, tile: 12, name: '玻璃' },
  { id: 12, tile: 13, name: '门' },
  { id: 13, tile: 14, name: '蜡烛' },
  { id: 14, tile: 15, name: '木板' },
  { id: 15, tile: 16, name: '铁块' },
  { id: 16, tile: 17, name: '金块' },
  { id: 17, tile: 18, name: '钻块' },
  { id: 18, tile: 19, name: '煤矿' },
  { id: 19, tile: 20, name: '雪' },
  { id: 20, tile: 21, name: '岩浆' },
];
let selectedBlockId = 1;
let selectedIndex = 0;

function makeIconCanvas(tileIndex) {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 32;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const col = tileIndex % ATLAS_COLS;
  const row = (tileIndex / ATLAS_COLS) | 0;
  ctx.drawImage(atlasCanvas, col * 16, row * 16, 16, 16, 0, 0, 32, 32);
  return cv;
}

function buildHotbar() {
  const bar = document.getElementById('hotbar');
  bar.innerHTML = '';
  HOTBAR_BLOCKS.forEach((b, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (i === 0 ? ' sel' : '');
    el.dataset.index = String(i);
    el.appendChild(makeIconCanvas(b.tile));
    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = String((i + 1) % 10);
    el.appendChild(num);
    el.addEventListener('touchstart', (ev) => { ev.preventDefault(); ev.stopPropagation(); selectHotbar(i); }, { passive: false });
    el.addEventListener('mousedown', (ev) => { ev.preventDefault(); ev.stopPropagation(); selectHotbar(i); });
    bar.appendChild(el);
  });
}

function selectHotbar(i) {
  if (i < 0 || i >= HOTBAR_BLOCKS.length) return;
  selectedIndex = i;
  selectedBlockId = HOTBAR_BLOCKS[i].id;
  const slots = document.querySelectorAll('#hotbar .slot');
  slots.forEach((s, k) => s.classList.toggle('sel', k === i));
  showToast(HOTBAR_BLOCKS[i].name);
}

/* =========================================================================
 * 11. Quality Adaptation
 * ========================================================================= */
const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent);
let qualityLevel = isMobile ? 1 : 2;
let fpsSamples = [];
let fpsAvg = 60;
let lowFpsTime = 0;
let highFpsTime = 0;

function applyQuality(level) {
  qualityLevel = Math.max(0, Math.min(2, level));
  const pr = Math.min(window.devicePixelRatio || 1, CONFIG.PIXEL_RATIO_TABLE[qualityLevel]);
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (userRadiusOverride < 0) currentRadius = CONFIG.RADIUS_TABLE[qualityLevel];
  setFogDensity(currentRadius);
  chunkScanTimer = 0;
}

function updateAdaptiveQuality(dt) {
  fpsSamples.push(dt);
  if (fpsSamples.length > 30) fpsSamples.shift();
  let sum = 0;
  for (let i = 0; i < fpsSamples.length; i++) sum += fpsSamples[i];
  fpsAvg = fpsSamples.length / Math.max(sum, 0.0001);
  if (fpsAvg < CONFIG.FPS_LOW) { lowFpsTime += dt; highFpsTime = 0; }
  else if (fpsAvg > CONFIG.FPS_HIGH) { highFpsTime += dt; lowFpsTime = 0; }
  else { lowFpsTime = Math.max(0, lowFpsTime - dt * 0.5); highFpsTime = Math.max(0, highFpsTime - dt * 0.5); }
  if (lowFpsTime > 2.0 && qualityLevel > 0) { applyQuality(qualityLevel - 1); lowFpsTime = 0; showToast('画质自动降低'); }
  else if (highFpsTime > 6.0 && qualityLevel < 2) { applyQuality(qualityLevel + 1); highFpsTime = 0; }
}

/* =========================================================================
 * 12. Main Loop
 * ========================================================================= */
let running = false;
let rafId = 0;
let lastTime = 0;
let hudTimer = 0;
const hudEls = {
  fps: document.getElementById('hFps'), pos: document.getElementById('hPos'),
  chunk: document.getElementById('hChunk'), loaded: document.getElementById('hLoaded'),
  tris: document.getElementById('hTris'), queue: document.getElementById('hQueue'),
};

function updatePlayer(dt) {
  if (!player.spawned) {
    const c = chunks.get('0,0');
    if (c && c.data) {
      let h = 40;
      for (let y = CH - 2; y > 0; y--) {
        const b = c.data[(y * CS + 8) * CS + 8];
        if (b !== 0 && b !== 7 && b !== 8 && b !== 13 && b !== 20) { h = y; break; }
      }
      player.pos.set(8.5, h + 1.05, 8.5);
      player.vel.set(0, 0, 0);
      player.spawned = true;
    }
    return;
  }
  const yaw = player.yaw;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  let ix = 0, iz = 0, mz = input.moveZ, mx = input.moveX;
  if (keys['KeyW']) mz += 1;
  if (keys['KeyS']) mz -= 1;
  if (keys['KeyD']) mx += 1;
  if (keys['KeyA']) mx -= 1;
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1) { mx /= mlen; mz /= mlen; }
  if (mx !== 0 || mz !== 0) {
    ix = fx * mz + rx * mx; iz = fz * mz + rz * mx;
    const l = Math.hypot(ix, iz);
    if (l > 0) { ix /= l; iz /= l; }
  }
  const baseSpeed = settings.flyMode ? CONFIG.FLY_SPEED : (input.run ? CONFIG.RUN_SPEED : CONFIG.WALK_SPEED);
  const speed = baseSpeed * settings.speedMul;
  const targetVX = ix * speed, targetVZ = iz * speed;
  const accel = (settings.flyMode || player.onGround) ? 14 : 4;
  const k = Math.min(1, accel * dt);
  player.vel.x += (targetVX - player.vel.x) * k;
  player.vel.z += (targetVZ - player.vel.z) * k;
  if (settings.flyMode) {
    const vFly = CONFIG.FLY_SPEED * settings.speedMul;
    if (input.flyUp) player.vel.y = vFly;
    else if (input.flyDown) player.vel.y = -vFly;
    else { player.vel.y *= Math.max(0, 1 - 14 * dt); if (Math.abs(player.vel.y) < 0.05) player.vel.y = 0; }
  } else {
    player.vel.y -= CONFIG.GRAVITY * dt;
    if (player.vel.y < -55) player.vel.y = -55;
    if (input.jump && player.onGround) {
      player.vel.y = CONFIG.JUMP_SPEED * Math.sqrt(Math.max(0.01, settings.jumpMul));
      player.onGround = false; input.jump = false;
    }
  }
  moveWithCollision(player.vel.x * dt, player.vel.y * dt, player.vel.z * dt);
  if (player.pos.y < -10) { player.pos.set(player.pos.x, 70, player.pos.z); player.vel.set(0, 0, 0); showToast('重生'); }
  camera.position.set(player.pos.x, player.pos.y + CONFIG.EYE_HEIGHT, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
}

function loop(now) {
  if (!running) return;
  rafId = requestAnimationFrame(loop);
  const dtRaw = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(dtRaw, 0.1);
  updatePlayer(dt);
  updateRaycast();
  chunkScanTimer -= dt;
  if (chunkScanTimer <= 0) { chunkScanTimer = CONFIG.CHUNK_UPDATE_INTERVAL; scanChunks(); }
  
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = CONFIG.SAVE_INTERVAL; saveDirtyChunks(); }
  
  let uploads = 0;
  while (uploadQueue.length > 0 && uploads < CONFIG.MAX_UPLOAD_PER_FRAME) { applyMeshMessage(uploadQueue.shift()); uploads++; }
  renderer.render(scene, camera);
  updateAdaptiveQuality(dtRaw);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    hudEls.fps.textContent = 'FPS ' + fpsAvg.toFixed(0);
    hudEls.pos.textContent = 'XYZ ' + player.pos.x.toFixed(1) + ' ' + player.pos.y.toFixed(1) + ' ' + player.pos.z.toFixed(1);
    hudEls.chunk.textContent = 'Chunk ' + Math.floor(player.pos.x / CS) + ',' + Math.floor(player.pos.z / CS);
    hudEls.loaded.textContent = 'Chunks ' + chunks.size;
    hudEls.tris.textContent = 'Tris ' + renderer.info.render.triangles;
    hudEls.queue.textContent = 'Queue ' + uploadQueue.length;
  }
}

/* =========================================================================
 * 13. Startup & Events
 * ========================================================================= */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function onVisibilityChange() {
  if (document.hidden) { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } }
  else { if (running && !rafId) { lastTime = performance.now(); rafId = requestAnimationFrame(loop); } }
}

function startGame() {
  const overlay = document.getElementById('overlay');
  overlay.style.opacity = '0';
  setTimeout(() => { overlay.style.display = 'none'; }, 400);
  if (isTouchDevice) { joyBaseEl.style.display = 'none'; joyStickEl.style.display = 'none'; jumpBtnEl.style.display = 'flex'; }
  updateFlyButtons();
  running = true; lastTime = performance.now(); rafId = requestAnimationFrame(loop);
}

function updateFlyButtons() {
  const show = settings.flyMode && isTouchDevice && running;
  const disp = show ? 'flex' : 'none';
  flyUpBtn.style.display = disp; flyDownBtn.style.display = disp; landBtn.style.display = disp;
}

let settingsOpen = false;
const settingsBtnEl = document.getElementById('settingsBtn');
const settingsPanelEl = document.getElementById('settingsPanel');
const spCloseEl = document.getElementById('spClose');
const spSpeed = document.getElementById('spSpeed');
const spSpeedVal = document.getElementById('spSpeedVal');
const spJump = document.getElementById('spJump');
const spJumpVal = document.getElementById('spJumpVal');
const spRadius = document.getElementById('spRadius');
const spRadiusVal = document.getElementById('spRadiusVal');
const spFly = document.getElementById('spFly');

function toggleSettings(force) {
  settingsOpen = (typeof force === 'boolean') ? force : !settingsOpen;
  settingsPanelEl.classList.toggle('open', settingsOpen);
  if (settingsOpen) {
    if (joy.active) { joy.active = false; joy.id = -1; input.moveX = 0; input.moveZ = 0; joyBaseEl.style.display = 'none'; joyStickEl.style.display = 'none'; }
    if (look.active) { look.active = false; look.id = -1; clearTimeout(look.timer); }
    if (jumpBtnTouchId >= 0) { jumpBtnTouchId = -1; input.jump = false; }
    if (flyUpTouchId >= 0) { flyUpTouchId = -1; input.flyUp = false; }
    if (flyDownTouchId >= 0) { flyDownTouchId = -1; input.flyDown = false; }
  }
}

settingsBtnEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
settingsBtnEl.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); toggleSettings(); }, { passive: false });
settingsBtnEl.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); toggleSettings(); });
spCloseEl.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
spCloseEl.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); toggleSettings(false); }, { passive: false });
spCloseEl.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); toggleSettings(false); });
settingsPanelEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
settingsPanelEl.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
settingsPanelEl.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
settingsPanelEl.addEventListener('mousedown', (e) => e.stopPropagation());
settingsPanelEl.addEventListener('click', (e) => e.stopPropagation());

function onSpeedInput() { settings.speedMul = parseFloat(spSpeed.value); spSpeedVal.textContent = settings.speedMul.toFixed(1) + '×'; }
spSpeed.addEventListener('input', onSpeedInput); spSpeed.addEventListener('change', onSpeedInput);
function onJumpInput() { settings.jumpMul = parseFloat(spJump.value); spJumpVal.textContent = settings.jumpMul.toFixed(1) + '×'; }
spJump.addEventListener('input', onJumpInput); spJump.addEventListener('change', onJumpInput);
function onRadiusInput() { const r = parseInt(spRadius.value, 10); userRadiusOverride = r; currentRadius = r; setFogDensity(r); chunkScanTimer = 0; spRadiusVal.textContent = String(r); }
spRadius.addEventListener('input', onRadiusInput); spRadius.addEventListener('change', onRadiusInput);
function onFlyToggle() {
  settings.flyMode = spFly.checked; updateFlyButtons();
  if (!settings.flyMode) { input.flyUp = false; input.flyDown = false; flyUpTouchId = -1; flyDownTouchId = -1; }
  else { if (player.vel.y < 0) player.vel.y = 0; }
}
spFly.addEventListener('change', onFlyToggle);

document.getElementById('clearSaveBtn').addEventListener('click', async () => {
  await clearDB();
  savedChunks.clear();
});

async function init() {
  // Load saved chunks from IndexedDB first
  const dbData = await loadAllFromDB();
  dbData.forEach((data, key) => { savedChunks.set(key, data); });
  if (savedChunks.size > 0) {
    console.log(`Loaded ${savedChunks.size} saved chunks from IndexedDB`);
  }

  buildHotbar();
  initWorker();
  applyQuality(qualityLevel);
  spRadius.value = String(currentRadius);
  spRadiusVal.textContent = String(currentRadius);
  spSpeedVal.textContent = settings.speedMul.toFixed(1) + '×';
  spJumpVal.textContent = settings.jumpMul.toFixed(1) + '×';
  scanChunks();
  chunkScanTimer = CONFIG.CHUNK_UPDATE_INTERVAL;
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: false });
  window.addEventListener('touchcancel', onTouchCancel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('click', () => { if (!isTouchDevice && !pointerLocked && running && !settingsOpen) canvas.requestPointerLock(); });
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('selectstart', (e) => e.preventDefault());
  const hudBody = document.getElementById('hudBody');
  const hudToggle = document.getElementById('hudToggle');
  hudToggle.addEventListener('click', () => { hudBody.classList.toggle('collapsed'); hudToggle.textContent = hudBody.classList.contains('collapsed') ? 'SHOW' : 'HIDE'; });
  const startBtn = document.getElementById('startBtn');
  let started = false;
  const doStart = (ev) => { if (started) return; started = true; if (ev) { ev.preventDefault(); ev.stopPropagation(); } startGame(); };
  startBtn.addEventListener('click', doStart);
  startBtn.addEventListener('touchend', doStart, { passive: false });
  startBtn.addEventListener('touchstart', (ev) => { ev.stopPropagation(); }, { passive: true });
  const loadingEl = document.getElementById('loading');
  let dots = 0;
  const tick = setInterval(() => { dots = (dots + 1) % 4; loadingEl.textContent = '正在初始化' + '.'.repeat(dots); }, 400);
  setTimeout(() => {
    clearInterval(tick);
    loadingEl.textContent = savedChunks.size > 0 ? `准备就绪 (已加载 ${savedChunks.size} 个存档区块)` : '准备就绪';
  }, 1600);
  window.addEventListener('touchmove', (e) => { if (!running || settingsOpen) return; if (e.cancelable) e.preventDefault(); }, { passive: false });
}

init();
