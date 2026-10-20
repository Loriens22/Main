import { apiToken, wsUrl } from '@/lib/api';

/** Mic → 16 kHz mono PCM16 frames (~80 ms) + input level, computed off the main thread. */
const WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0; this.sum = 0; this.n = 0;
    this.buf = new Int16Array(1280); this.len = 0; this.level = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    let energy = 0;
    for (let i = 0; i < ch.length; i++) {
      const s = ch[i];
      energy += s * s;
      this.sum += s; this.n++; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.sum / this.n));
        this.sum = 0; this.n = 0;
        this.buf[this.len++] = v < 0 ? v * 32768 : v * 32767;
        if (this.len === this.buf.length) {
          this.port.postMessage({ pcm: this.buf.buffer, level: this.level }, [this.buf.buffer]);
          this.buf = new Int16Array(1280); this.len = 0;
        }
      }
    }
    this.level = Math.sqrt(energy / ch.length);
    return true;
  }
}
registerProcessor('maverick-capture', Capture);
`;

export type CallState = 'connecting' | 'listening' | 'thinking' | 'working' | 'speaking' | 'ended' | 'error';

export interface CallEvents {
  onState: (s: CallState, detail?: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onAssistant: (text: string) => void;
  onActivity: (a: { kind: string; label: string; ok?: boolean }) => void;
  onChat: (chatId: string) => void;
  onError: (message: string, fatal: boolean) => void;
  onBargeIn: () => void;
}

export class VoiceCallClient {
  private ws: WebSocket | null = null;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private outGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private playing = false;
  private muted = false;
  private micLevel = 0;
  private levelBuf = new Float32Array(512);
  private state: CallState = 'connecting';
  private ended = false;

  constructor(
    private chatId: string,
    private ev: CallEvents,
    private prefs: { voice?: string; speed?: number } = {},
  ) {}

  async start(): Promise<void> {
    this.ev.onState('connecting', 'Starting microphone…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      video: false,
    });
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'maverick-capture');
    this.node.port.onmessage = (e) => {
      this.micLevel = e.data.level;
      if (!this.muted && this.ws?.readyState === WebSocket.OPEN) this.ws.send(e.data.pcm);
    };
    src.connect(this.node);
    // The worklet must be pulled by the graph; route it through a muted gain.
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);

    this.outGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.outGain.connect(this.analyser).connect(this.ctx.destination);

    await this.connect();
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl('/ws/voice'));
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        ws.send(JSON.stringify({ type: 'auth', token: apiToken() }));
        ws.send(JSON.stringify({ type: 'start', chatId: this.chatId, voice: this.prefs.voice, speed: this.prefs.speed }));
        resolve();
      };
      ws.onerror = () => {
        if (!opened) reject(new Error("Couldn't reach the voice service"));
      };
      ws.onclose = () => {
        if (!this.ended) this.ev.onError('Call disconnected', true);
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return this.onAudio(e.data as ArrayBuffer);
        const m = JSON.parse(e.data);
        switch (m.type) {
          case 'state':
            if (m.state !== 'speaking' && this.playing) break;
            this.setState(m.state, m.detail);
            break;
          case 'ready':
            this.setState('listening');
            break;
          case 'partial':
            this.ev.onPartial(m.text);
            break;
          case 'final':
            this.ev.onFinal(m.text);
            this.setState('thinking');
            break;
          case 'assistant':
            this.ev.onAssistant(m.text);
            break;
          case 'barge_in':
            this.stopPlayback();
            this.ev.onBargeIn();
            break;
          case 'activity':
            this.ev.onActivity(m.activity);
            break;
          case 'chat':
            this.chatId = m.chatId;
            this.ev.onChat(m.chatId);
            break;
          case 'error':
            this.ev.onError(m.message, !!m.fatal);
            break;
        }
      };
    });
  }

  private setState(s: CallState, detail?: string): void {
    this.state = s;
    this.ev.onState(s, detail);
  }

  private onAudio(buf: ArrayBuffer): void {
    if (!this.ctx || !this.outGain || buf.byteLength < 7) return;
    const view = new DataView(buf);
    if (view.getUint8(0) !== 1) return;
    const pcm = new Int16Array(buf.slice(5));
    const audio = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = audio.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.outGain);
    const t = Math.max(this.ctx.currentTime + 0.04, this.nextTime);
    src.start(t);
    this.nextTime = t + audio.duration;
    this.sources.add(src);
    if (!this.playing) {
      this.playing = true;
      this.ws?.send(JSON.stringify({ type: 'playback', playing: true }));
      this.setState('speaking');
    }
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0 && this.ctx && this.ctx.currentTime >= this.nextTime - 0.05) {
        this.playing = false;
        this.ws?.send(JSON.stringify({ type: 'playback', playing: false }));
        if (this.state === 'speaking') this.setState('listening');
      }
    };
  }

  stopPlayback(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = 0;
    if (this.playing) {
      this.playing = false;
      this.ws?.send(JSON.stringify({ type: 'playback', playing: false }));
    }
  }

  /** Tap-to-interrupt: silence Maverick immediately. */
  interrupt(): void {
    this.stopPlayback();
    this.ws?.send(JSON.stringify({ type: 'interrupt' }));
    this.setState('listening');
  }

  sendText(text: string): void {
    this.ws?.send(JSON.stringify({ type: 'text', text }));
  }

  setMuted(m: boolean): void {
    this.muted = m;
  }

  setSpeakerVolume(v: number): void {
    if (this.outGain) this.outGain.gain.value = v;
  }

  /** 0..1 levels for mascot animation. */
  levels(): { speaking: number; mic: number } {
    let speaking = 0;
    if (this.analyser && this.playing) {
      this.analyser.getFloatTimeDomainData(this.levelBuf);
      let e = 0;
      for (let i = 0; i < this.levelBuf.length; i++) e += this.levelBuf[i] * this.levelBuf[i];
      speaking = Math.min(1, Math.sqrt(e / this.levelBuf.length) * 5);
    }
    return { speaking, mic: this.muted ? 0 : Math.min(1, this.micLevel * 8) };
  }

  end(): void {
    this.ended = true;
    try {
      this.ws?.send(JSON.stringify({ type: 'end' }));
    } catch {
      /* closing */
    }
    this.ws?.close();
    this.stopPlayback();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.setState('ended');
  }
}
