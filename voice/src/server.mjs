// Maverick voice engine: streaming speech recognition + Kokoro-82M speech synthesis, both via sherpa-onnx.
// The core gateway is the only client; it connects over Railway's private network with a shared secret.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const sherpa = require('sherpa-onnx-node');

const PORT = Number(process.env.PORT || 8090);
const SECRET = process.env.VOICE_SECRET || '';
const MODELS = process.env.MODELS_DIR || '/models';
const TTS_THREADS = Number(process.env.TTS_THREADS || 2);
const ASR_THREADS = Number(process.env.ASR_THREADS || 1);

const log = (...a) => console.log(new Date().toISOString(), '[voice]', ...a);

// Curated English voices (speaker ids from the Kokoro v1.0 model metadata).
export const VOICES = [
  { id: 'af_heart', sid: 3, name: 'Heart', accent: 'American', gender: 'female', grade: 'A' },
  { id: 'af_bella', sid: 2, name: 'Bella', accent: 'American', gender: 'female', grade: 'A-' },
  { id: 'af_nicole', sid: 6, name: 'Nicole', accent: 'American', gender: 'female', grade: 'B-' },
  { id: 'af_aoede', sid: 1, name: 'Aoede', accent: 'American', gender: 'female', grade: 'C+' },
  { id: 'af_kore', sid: 5, name: 'Kore', accent: 'American', gender: 'female', grade: 'C+' },
  { id: 'af_sarah', sid: 9, name: 'Sarah', accent: 'American', gender: 'female', grade: 'C+' },
  { id: 'af_nova', sid: 7, name: 'Nova', accent: 'American', gender: 'female', grade: 'C' },
  { id: 'af_sky', sid: 10, name: 'Sky', accent: 'American', gender: 'female', grade: 'C-' },
  { id: 'am_michael', sid: 16, name: 'Michael', accent: 'American', gender: 'male', grade: 'C+' },
  { id: 'am_fenrir', sid: 14, name: 'Fenrir', accent: 'American', gender: 'male', grade: 'C+' },
  { id: 'am_puck', sid: 18, name: 'Puck', accent: 'American', gender: 'male', grade: 'C+' },
  { id: 'am_echo', sid: 12, name: 'Echo', accent: 'American', gender: 'male', grade: 'D' },
  { id: 'am_eric', sid: 13, name: 'Eric', accent: 'American', gender: 'male', grade: 'D' },
  { id: 'am_liam', sid: 15, name: 'Liam', accent: 'American', gender: 'male', grade: 'D' },
  { id: 'am_onyx', sid: 17, name: 'Onyx', accent: 'American', gender: 'male', grade: 'D' },
  { id: 'am_adam', sid: 11, name: 'Adam', accent: 'American', gender: 'male', grade: 'F+' },
  { id: 'bf_emma', sid: 21, name: 'Emma', accent: 'British', gender: 'female', grade: 'B-' },
  { id: 'bf_isabella', sid: 22, name: 'Isabella', accent: 'British', gender: 'female', grade: 'C' },
  { id: 'bm_george', sid: 26, name: 'George', accent: 'British', gender: 'male', grade: 'C' },
  { id: 'bm_fable', sid: 25, name: 'Fable', accent: 'British', gender: 'male', grade: 'C' },
];
const voiceSid = (id) => VOICES.find((v) => v.id === id)?.sid ?? 3;

// ---------- model loading ----------
const t0 = Date.now();
const asrDir = `${MODELS}/nemo-asr`;
const recognizer = new sherpa.OnlineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: { encoder: `${asrDir}/encoder.int8.onnx`, decoder: `${asrDir}/decoder.int8.onnx`, joiner: `${asrDir}/joiner.int8.onnx` },
    tokens: `${asrDir}/tokens.txt`,
    numThreads: ASR_THREADS,
    provider: 'cpu',
    debug: 0,
  },
  decodingMethod: 'greedy_search',
  enableEndpoint: true,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 0.7,
  rule3MinUtteranceLength: 25,
});
const ttsDir = `${MODELS}/kokoro`;
const tts = await sherpa.OfflineTts.createAsync({
  model: {
    kokoro: {
      model: `${ttsDir}/model.onnx`,
      voices: `${ttsDir}/voices.bin`,
      tokens: `${ttsDir}/tokens.txt`,
      dataDir: `${ttsDir}/espeak-ng-data`,
      lexicon: `${ttsDir}/lexicon-us-en.txt`,
      lang: 'en-us',
    },
    numThreads: TTS_THREADS,
    provider: 'cpu',
    debug: false,
  },
  maxNumSentences: 1,
});
// Warm up so the first real sentence is fast.
await tts.generateAsync({ text: 'Ready.', sid: 3, speed: 1.0 });
const loadedMs = Date.now() - t0;
log(`models loaded in ${loadedMs} ms, tts ${tts.sampleRate} Hz, rss ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);

// ---------- helpers ----------
function pcm16ToFloat(buf, offset) {
  const n = (buf.length - offset) >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(offset + i * 2) / 32768;
  return out;
}

function floatToPcm16(samples) {
  const out = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(s < 0 ? s * 32768 : s * 32767, i * 2);
  }
  return out;
}

function authorized(req) {
  if (!SECRET) return true;
  const given = Buffer.from(String(req.headers['x-voice-secret'] || ''));
  const want = Buffer.from(SECRET);
  return given.length === want.length && timingSafeEqual(given, want);
}

function wav(samples, sampleRate) {
  const pcm = floatToPcm16(samples);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Synthesis is serialized across connections (single CPU budget); each job can be cancelled mid-way.
let ttsChain = Promise.resolve();

// ---------- HTTP ----------
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, loadedMs, sampleRate: tts.sampleRate, rssMB: Math.round(process.memoryUsage().rss / 1e6) }));
  }
  if (!authorized(req)) {
    res.writeHead(401);
    return res.end('unauthorized');
  }
  if (url.pathname === '/voices') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ voices: VOICES }));
  }
  if (url.pathname === '/tts' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    try {
      const { text, voice, speed } = JSON.parse(body || '{}');
      const clean = String(text || '').slice(0, 500);
      if (!clean.trim()) throw new Error('text required');
      const audio = await (ttsChain = ttsChain.then(() => tts.generateAsync({ text: clean, sid: voiceSid(voice), speed: Number(speed) || 1.0 })));
      res.writeHead(200, { 'content-type': 'audio/wav' });
      return res.end(wav(audio.samples, audio.sampleRate));
    } catch (e) {
      res.writeHead(400, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  }
  if (url.pathname === '/asr' && req.method === 'POST') {
    // One-shot transcription of raw PCM16 mono 16 kHz (used by self-tests).
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const samples = pcm16ToFloat(Buffer.concat(chunks), 0);
    const s = recognizer.createStream();
    const texts = [];
    const step = 1600;
    for (let i = 0; i < samples.length; i += step) {
      s.acceptWaveform({ samples: samples.subarray(i, i + step), sampleRate: 16000 });
      while (recognizer.isReady(s)) recognizer.decode(s);
      if (recognizer.isEndpoint(s)) {
        const t = recognizer.getResult(s).text.trim();
        if (t) texts.push(t);
        recognizer.reset(s);
      }
    }
    s.acceptWaveform({ samples: new Float32Array(16000), sampleRate: 16000 });
    s.inputFinished();
    while (recognizer.isReady(s)) recognizer.decode(s);
    const last = recognizer.getResult(s).text.trim();
    if (last) texts.push(last);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ text: texts.join(' ') }));
  }
  res.writeHead(404);
  res.end('not found');
});

// ---------- streaming WebSocket ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://x').pathname !== '/stream' || !authorized(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => onStream(ws));
});

function onStream(ws) {
  let stream = recognizer.createStream();
  let lastPartial = '';
  let closed = false;
  // TTS state for this connection
  let cancelGen = 0; // incremented to cancel everything queued or running
  const send = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

  const decode = () => {
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    const text = recognizer.getResult(stream).text.trim();
    if (text !== lastPartial) {
      lastPartial = text;
      if (text) send({ type: 'asr.partial', text });
    }
    if (recognizer.isEndpoint(stream)) {
      if (text) send({ type: 'asr.final', text });
      recognizer.reset(stream);
      lastPartial = '';
    }
  };

  const speak = (job) => {
    const myGen = cancelGen;
    ttsChain = ttsChain.then(async () => {
      if (closed || myGen !== cancelGen) return;
      const started = Date.now();
      let first = true;
      try {
        await tts.generateAsync({
          text: job.text,
          sid: voiceSid(job.voice),
          speed: Number(job.speed) || 1.0,
          onProgress: ({ samples }) => {
            if (closed || myGen !== cancelGen) return 0; // stop generating
            if (samples?.length) {
              const head = Buffer.alloc(5);
              head.writeUInt8(2, 0);
              head.writeUInt32LE(job.seq >>> 0, 1);
              ws.send(Buffer.concat([head, floatToPcm16(samples)]));
              if (first) {
                first = false;
                send({ type: 'tts.first', seq: job.seq, ms: Date.now() - started });
              }
            }
            return 1;
          },
        });
      } catch (e) {
        send({ type: 'tts.error', seq: job.seq, message: String(e.message || e) });
      }
      if (!closed && myGen === cancelGen) send({ type: 'tts.done', seq: job.seq, ms: Date.now() - started });
    });
  };

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (buf.length < 3 || buf.readUInt8(0) !== 1) return;
      stream.acceptWaveform({ samples: pcm16ToFloat(buf, 1), sampleRate: 16000 });
      decode();
      return;
    }
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    switch (msg.type) {
      case 'asr.reset':
        recognizer.reset(stream);
        lastPartial = '';
        break;
      case 'tts':
        if (typeof msg.text === 'string' && msg.text.trim()) speak({ seq: msg.seq ?? 0, text: msg.text.slice(0, 800), voice: msg.voice, speed: msg.speed });
        break;
      case 'tts.cancel':
        cancelGen++;
        send({ type: 'tts.cancelled' });
        break;
      case 'ping':
        send({ type: 'pong', t: msg.t });
        break;
    }
  });
  ws.on('close', () => {
    closed = true;
    cancelGen++;
    stream = null;
  });
  send({ type: 'ready', sampleRate: tts.sampleRate, voices: VOICES });
}

// Prefer dual-stack (Railway private networking is IPv6); fall back to IPv4-only hosts.
server.once('error', (e) => {
  if (e.code !== 'EAFNOSUPPORT') throw e;
  server.listen(PORT, '0.0.0.0');
});
server.on('listening', () => log(`listening on ${JSON.stringify(server.address())}`));
server.listen(PORT, '::');
