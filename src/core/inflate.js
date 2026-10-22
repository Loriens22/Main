// Minimal gzip / DEFLATE (RFC 1951/1952) decoder, used only on browsers that
// lack DecompressionStream (Safari before 16.4, old Android WebViews).
// Follows the classic "tinf" design: canonical Huffman tables built as
// symbol-count + sorted-symbol arrays, decoded bit by bit.

class Tree {
  constructor() {
    this.counts = new Uint16Array(16);
    this.symbols = new Uint16Array(288);
  }
}

const LEN_BASE = new Uint16Array(30), LEN_BITS = new Uint8Array(30);
const DIST_BASE = new Uint16Array(30), DIST_BITS = new Uint8Array(30);
const CL_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function baseTable(bits, base, delta, first) {
  for (let i = 0; i < delta; i++) bits[i] = 0;
  for (let i = 0; i < 30 - delta; i++) bits[i + delta] = (i / delta) | 0;
  for (let sum = first, i = 0; i < 30; i++) {
    base[i] = sum;
    sum += 1 << bits[i];
  }
}
baseTable(LEN_BITS, LEN_BASE, 4, 3);
baseTable(DIST_BITS, DIST_BASE, 2, 1);
// length code 285 is special: base 258, no extra bits
LEN_BITS[28] = 0;
LEN_BASE[28] = 258;

function build(t, lengths, off, num) {
  t.counts.fill(0);
  for (let i = 0; i < num; i++) t.counts[lengths[off + i]]++;
  t.counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let sum = 0, i = 0; i < 16; i++) {
    offs[i] = sum;
    sum += t.counts[i];
  }
  for (let i = 0; i < num; i++) if (lengths[off + i]) t.symbols[offs[lengths[off + i]]++] = i;
}

const FIXED_L = new Tree(), FIXED_D = new Tree();
{
  const l = new Uint8Array(288);
  l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
  build(FIXED_L, l, 0, 288);
  build(FIXED_D, new Uint8Array(30).fill(5), 0, 30);
}

class Reader {
  constructor(src, pos) {
    this.src = src;
    this.pos = pos;
    this.tag = 0;
    this.n = 0;
  }
  bit() {
    if (!this.n--) {
      if (this.pos >= this.src.length) throw new Error('inflate: unexpected end of data');
      this.tag = this.src[this.pos++];
      this.n = 7;
    }
    const b = this.tag & 1;
    this.tag >>>= 1;
    return b;
  }
  bits(num, base = 0) {
    let v = 0;
    for (let i = 0; i < num; i++) v |= this.bit() << i;
    return v + base;
  }
  sym(t) {
    let sum = 0, cur = 0, len = 0;
    do {
      cur = 2 * cur + this.bit();
      len++;
      sum += t.counts[len];
      cur -= t.counts[len];
    } while (cur >= 0);
    return t.symbols[sum + cur];
  }
}

class Output {
  constructor(size) {
    this.buf = new Uint8Array(size || 1 << 16);
    this.len = 0;
  }
  grow(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap);
    b.set(this.buf.subarray(0, this.len));
    this.buf = b;
  }
  push(v) {
    this.grow(1);
    this.buf[this.len++] = v;
  }
}

function dynamicTrees(r, lt, dt) {
  const hlit = r.bits(5, 257), hdist = r.bits(5, 1), hclen = r.bits(4, 4);
  const lengths = new Uint8Array(288 + 32);
  for (let i = 0; i < hclen; i++) lengths[CL_ORDER[i]] = r.bits(3);
  const ct = new Tree();
  build(ct, lengths, 0, 19);
  lengths.fill(0, 0, 19);
  for (let n = 0; n < hlit + hdist;) {
    const s = r.sym(ct);
    if (s < 16) { lengths[n++] = s; continue; }
    let len = 0, rep;
    if (s === 16) { if (!n) throw new Error('inflate: bad repeat'); len = lengths[n - 1]; rep = r.bits(2, 3); }
    else if (s === 17) rep = r.bits(3, 3);
    else rep = r.bits(7, 11);
    while (rep--) lengths[n++] = len;
  }
  build(lt, lengths, 0, hlit);
  build(dt, lengths, hlit, hdist);
}

function block(r, out, lt, dt) {
  for (;;) {
    const s = r.sym(lt);
    if (s === 256) return;
    if (s < 256) { out.push(s); continue; }
    const li = s - 257;
    const len = r.bits(LEN_BITS[li], LEN_BASE[li]);
    const di = r.sym(dt);
    const dist = r.bits(DIST_BITS[di], DIST_BASE[di]);
    if (dist > out.len) throw new Error('inflate: bad distance');
    out.grow(len);
    const b = out.buf;
    for (let i = 0, p = out.len - dist; i < len; i++) b[out.len++] = b[p + i];
  }
}

/** Inflate a raw DEFLATE stream starting at byte offset `pos`. */
export function inflateRaw(src, pos = 0, sizeHint = 0) {
  const r = new Reader(src, pos);
  const out = new Output(sizeHint);
  let last;
  do {
    last = r.bit();
    const type = r.bits(2);
    if (type === 0) {
      // stored block: byte-align, LEN, NLEN, raw bytes
      r.n = 0;
      const len = src[r.pos] | (src[r.pos + 1] << 8);
      r.pos += 4;
      out.grow(len);
      out.buf.set(src.subarray(r.pos, r.pos + len), out.len);
      out.len += len;
      r.pos += len;
    } else if (type === 1) block(r, out, FIXED_L, FIXED_D);
    else if (type === 2) {
      const lt = new Tree(), dt = new Tree();
      dynamicTrees(r, lt, dt);
      block(r, out, lt, dt);
    } else throw new Error('inflate: bad block type');
  } while (!last);
  return out.buf.subarray(0, out.len);
}

/** Decode a gzip member (RFC 1952). */
export function gunzip(src) {
  if (src[0] !== 0x1f || src[1] !== 0x8b || src[2] !== 8) throw new Error('gunzip: not a gzip stream');
  const flg = src[3];
  let p = 10;
  if (flg & 4) p += 2 + (src[p] | (src[p + 1] << 8)); // FEXTRA
  if (flg & 8) while (src[p++]); // FNAME
  if (flg & 16) while (src[p++]); // FCOMMENT
  if (flg & 2) p += 2; // FHCRC
  const n = src.length;
  const isize = (src[n - 4] | (src[n - 3] << 8) | (src[n - 2] << 16) | (src[n - 1] << 24)) >>> 0;
  return inflateRaw(src, p, isize);
}
