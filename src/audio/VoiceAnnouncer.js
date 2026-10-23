// Bulgarian stop announcements: chime + female Bulgarian voice.
//
// Voice sources, in priority order:
//   1. Pre-recorded / pre-generated clips embedded at build time
//      (assets/voice/*.mp3 produced by tools/generate_announcements.py with a
//      licensed TTS service, e.g. Azure bg-BG-KalinaNeural or Google bg-BG).
//   2. The device's own Bulgarian speech voice via the Web Speech API,
//      preferring female voices (iOS/macOS "Daria", Edge "Kalina Online
//      (Natural)", Android Google Bulgarian).
//   3. No Bulgarian voice available: chime + on-screen text only — the game
//      never substitutes an English voice reading Bulgarian text.
import voiceClips from '../data/voice-clips.json';
import { L } from '../ui/i18n.js';

const FEMALE_HINTS = /kalina|калина|daria|дария|female|жен|google|natural/i;
const MALE_HINTS = /ivan|иван|male(?!.*female)/i;

export class VoiceAnnouncer {
  constructor(audio, settings) {
    this.audio = audio;
    this.settings = settings;
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.voice = null;
    this.voices = [];
    this.clips = voiceClips || {};
    this.onSubtitle = () => {};
    this.status = 'pending';
    this.primed = false;
    // iOS Safari ignores speak() until one call was made inside a user gesture: the AudioManager runs this in the first tap
    if (audio.gestureHooks) audio.gestureHooks.push(() => this.prime());
    if (this.synth) {
      const load = () => this.pickVoice();
      load();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', load);
      else this.synth.onvoiceschanged = load;
    }
  }

  /** Warm up speechSynthesis inside a user gesture (silent, empty utterance). */
  prime() {
    if (this.primed || !this.synth) return;
    this.primed = true;
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      this.synth.speak(u);
    } catch (e) {
      /* no speech on this device */
    }
  }

  /** All Bulgarian voices on this device. */
  bulgarianVoices() {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => /^bg(-|_|$)/i.test(v.lang) || /bulgar|българ/i.test(v.name));
  }

  pickVoice() {
    const bg = this.bulgarianVoices();
    this.voices = bg;
    const wanted = this.settings.voiceName;
    let v = bg.find((x) => x.name === wanted);
    if (!v) v = bg.find((x) => FEMALE_HINTS.test(x.name) && !MALE_HINTS.test(x.name));
    if (!v) v = bg[0] || null;
    this.voice = v;
    this.voiceIsFemale = !!(v && FEMALE_HINTS.test(v.name) && !MALE_HINTS.test(v.name));
    this.status = Object.keys(this.clips).length ? 'clips' : v ? (this.voiceIsFemale ? 'device-female' : 'device-other') : 'none';
    return v;
  }

  describe() {
    if (this.status === 'clips') return L('Вградени записи (bg-BG)', 'Embedded recordings (bg-BG)');
    if (this.voice) return `${this.voice.name} (${this.voice.lang})${this.voiceIsFemale ? '' : L(' — не е женски глас', ' — not a female voice')}`;
    return L('Няма инсталиран български глас — само текст', 'No Bulgarian voice installed — text only');
  }

  /**
   * Plays one announcement message {text, display, kind}. Calls done() when
   * finished. volume 0..1 depends on where the listener is.
   */
  play(msg, volume, done0) {
    const chimeDur = this.audio.chime();
    this.audio.announcementDuck(true); // the engine drops 3 dB while the chime and the voice play
    let ended = false;
    const done = () => {
      if (ended) return;
      ended = true;
      this.audio.announcementDuck(false);
      done0();
    };
    this.onSubtitle(msg);
    const after = (ms, fn) => setTimeout(fn, ms);
    after(chimeDur * 1000, () => {
      const clip = this.clips[msg.text];
      if (clip && this.audio.ctx) {
        this.playClip(clip, volume, done);
        return;
      }
      if (this.synth && this.voice && volume > 0.02) {
        try {
          this.synth.cancel();
          const u = new SpeechSynthesisUtterance(msg.text);
          u.voice = this.voice;
          u.lang = this.voice.lang || 'bg-BG';
          u.rate = this.settings.voiceRate ?? 0.93;
          u.pitch = this.voiceIsFemale ? 1.0 : 1.12;
          u.volume = Math.min(1, volume * (this.settings.volVoice ?? 1));
          let finished = false;
          const end = () => {
            if (finished) return;
            finished = true;
            done();
          };
          u.onend = end;
          u.onerror = end;
          this.synth.speak(u);
          // safety net: some engines never fire onend
          after(Math.max(2500, msg.text.length * 110), end);
          return;
        } catch (e) {
          /* fall through to text only */
        }
      }
      after(Math.max(1600, msg.text.length * 70), done);
    });
  }

  async playClip(dataUrl, volume, done) {
    const ctx = this.audio.ctx;
    try {
      if (!this._cache) this._cache = new Map();
      let buf = this._cache.get(dataUrl);
      if (!buf) {
        const bin = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
        buf = await ctx.decodeAudioData(bin.buffer);
        this._cache.set(dataUrl, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = volume * (this.settings.volVoice ?? 1);
      src.connect(g);
      g.connect(this.audio.voiceBus);
      g.connect(this.audio.reverb);
      src.onended = done;
      src.start();
    } catch (e) {
      done();
    }
  }
}
