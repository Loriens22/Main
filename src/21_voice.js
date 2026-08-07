/* =====================================================================
 * 21_voice.js — SG.voice : spoken dialogue.
 *
 * Uses the browser's own speech synthesis. No network, no API key, no
 * third-party service — the voices are whatever the device already has,
 * shaped per character by pitch and rate.
 *
 * The fallback matters as much as the happy path. iOS silently drops
 * utterances, Chrome truncates long ones, some devices report voices that
 * never speak, and a user can turn the whole thing off. In every one of
 * those cases the game must stay comprehensible and stay in sync, so we
 * fall back to a pitched blip per syllable and resolve on the same clock
 * the subtitles use.
 * ===================================================================== */
(function (SG) {
  'use strict';

  var V = SG.voice;
  var util = SG.util;

  var synth = (typeof window !== 'undefined' && window.speechSynthesis) || null;
  var Utter = (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) || null;

  var ready = false;          /* init() has run */
  var unlocked = false;       /* a gesture has happened (iOS requires it) */
  var voices = [];            /* SpeechSynthesisVoice[] */
  var assigned = {};          /* speaker -> voice */
  var enabled = true;
  var speaking = null;        /* the live utterance record */
  var seq = 0;
  var boundaryCbs = [];
  var resumeTimer = null;

  V.level = 0;                /* 0..1 pseudo-amplitude for jaw animation */

  /* ------------------------------------------------------------------ */
  /* Character voices                                                    */
  /* ------------------------------------------------------------------ */

  V.profiles = {
    steve: { pitch: 0.95, rate: 0.98, gender: 'male', rank: 0, blip: 'steve' },
    oleg: { pitch: 0.62, rate: 0.84, gender: 'male', rank: 1, blip: 'oleg' },
    ellis: { pitch: 1.45, rate: 0.80, gender: 'female', rank: 0, blip: 'ellis' },
    guard: { pitch: 0.85, rate: 1.05, gender: 'male', rank: 2, blip: 'guard' },
    concierge: { pitch: 1.10, rate: 1.00, gender: 'female', rank: 1, blip: 'concierge' },
    halcyon: { pitch: 0.45, rate: 1.20, gender: 'male', rank: 3, blip: 'halcyon', filtered: 'core' },
    pa: { pitch: 1.20, rate: 0.95, gender: 'female', rank: 2, blip: 'pa', filtered: 'tannoy' },
    phone: { pitch: 0.90, rate: 1.02, gender: 'male', rank: 4, blip: 'phone', filtered: 'phone' },
    brandt: { pitch: 0.72, rate: 0.92, gender: 'male', rank: 5, blip: 'oleg' },
    duck: { pitch: 1.8, rate: 1.15, gender: 'female', rank: 3, blip: 'ellis' },
    cat: { pitch: 1.9, rate: 1.3, gender: 'female', rank: 4, blip: 'ellis' }
  };

  /* Emotion nudges pitch and rate a little. Not acting — just colour. */
  var EMOTION = {
    calm: { p: 1.00, r: 1.00 },
    warm: { p: 1.04, r: 0.97 },
    wary: { p: 0.96, r: 0.94 },
    urgent: { p: 1.08, r: 1.16 },
    flat: { p: 0.97, r: 0.96 },
    tired: { p: 0.94, r: 0.90 }
  };

  function profileOf(speaker) {
    return V.profiles[speaker] || V.profiles.steve;
  }

  /* ------------------------------------------------------------------ */
  /* Voice selection                                                     */
  /* ------------------------------------------------------------------ */

  var NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|junior|organ|superstar|trinoids|whisper|wobble|zarvox|hysterical|pipe organ|princess|ralph|fred|kathy|bruce/i;
  var FEMALE = /female|samantha|victoria|karen|moira|tessa|fiona|serena|allison|ava|susan|zira|hazel|catherine|linda|heather|amelie|anna|google uk english female|google us english/i;
  var MALE = /male|alex|daniel|fred|tom|oliver|arthur|george|david|mark|james|guy|ryan|thomas|aaron|nathan|google uk english male/i;

  function loadVoices() {
    if (!synth) return false;
    var list = [];
    try { list = synth.getVoices() || []; } catch (e) { list = []; }
    if (!list.length) return false;
    voices = list;
    assignVoices();
    return true;
  }

  /* Score every available voice, then hand different voices to different
   * characters so Steve and Oleg are not the same person at two pitches. */
  function assignVoices() {
    if (!voices.length) return;

    var lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    var base = lang.split('-')[0].toLowerCase();

    function score(v, want) {
      var s = 0;
      var name = (v.name || '') + ' ' + (v.voiceURI || '');
      var vl = (v.lang || '').toLowerCase();
      if (vl === lang.toLowerCase()) s += 40;
      else if (vl.indexOf(base) === 0) s += 26;
      else if (vl.indexOf('en') === 0) s += 10;
      if (NOVELTY.test(name)) s -= 60;
      if (v.localService) s += 6;
      if (/natural|neural|premium|enhanced/i.test(name)) s += 14;
      if (want === 'female' && FEMALE.test(name)) s += 22;
      if (want === 'male' && MALE.test(name)) s += 22;
      if (want === 'female' && MALE.test(name)) s -= 14;
      if (want === 'male' && FEMALE.test(name)) s -= 14;
      if (/compact|eloquence/i.test(name)) s -= 8;
      return s;
    }

    var used = {};
    var speakers = Object.keys(V.profiles).sort(function (a, b) {
      return V.profiles[a].rank - V.profiles[b].rank;
    });

    speakers.forEach(function (sp) {
      var want = V.profiles[sp].gender;
      var best = null, bestScore = -1e9, bestFresh = null, bestFreshScore = -1e9;
      for (var i = 0; i < voices.length; i++) {
        var s = score(voices[i], want);
        if (s > bestScore) { bestScore = s; best = voices[i]; }
        if (!used[voices[i].name] && s > bestFreshScore) {
          bestFreshScore = s; bestFresh = voices[i];
        }
      }
      /* Prefer an unused voice, but never take a bad one just to be unique. */
      var pick = (bestFresh && bestFreshScore > bestScore - 18) ? bestFresh : best;
      assigned[sp] = pick;
      if (pick) used[pick.name] = 1;
    });
  }

  V.voiceFor = function (speaker) { return assigned[speaker] || null; };

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  V.init = function () {
    if (ready) return;
    ready = true;
    if (!synth || !Utter) return;
    loadVoices();
    try {
      /* Chrome and Safari populate getVoices() asynchronously. */
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', loadVoices);
      } else {
        synth.onvoiceschanged = loadVoices;
      }
    } catch (e) { /* older engines */ }
    /* Some engines need a nudge before the list appears at all. */
    setTimeout(loadVoices, 250);
    setTimeout(loadVoices, 1200);
  };

  /* iOS will not speak unless the first utterance came from a gesture. */
  V.unlock = function () {
    if (unlocked || !synth || !Utter) return;
    unlocked = true;
    try {
      var u = new Utter(' ');
      u.volume = 0;
      u.rate = 2;
      synth.speak(u);
    } catch (e) { /* not fatal */ }
    loadVoices();
  };

  V.setEnabled = function (on) {
    enabled = !!on;
    if (!enabled) V.cancel();
  };

  V.isSpeaking = function () { return !!speaking; };

  V.onBoundary = function (cb) {
    if (typeof cb === 'function') boundaryCbs.push(cb);
  };

  V.cancel = function () {
    if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
    var rec = speaking;
    speaking = null;
    V.level = 0;
    if (rec) {
      if (rec.timer) clearTimeout(rec.timer);
      if (rec.blipTimer) clearInterval(rec.blipTimer);
      if (rec.levelTimer) clearInterval(rec.levelTimer);
      SG.bus.emit('voice:end', { speaker: rec.speaker, cancelled: true });
      if (rec.resolve) rec.resolve(false);
    }
    if (synth) { try { synth.cancel(); } catch (e) { /* noop */ } }
  };

  /* ------------------------------------------------------------------ */
  /* Duration model — shared with the subtitle clock in 90_main.js       */
  /* ------------------------------------------------------------------ */

  function estimate(text, rate) {
    var base = Math.max(1.1, Math.min(11, text.length * 0.052 + 0.85));
    return base / (rate || 1);
  }
  V.estimate = estimate;

  function syllables(text) {
    /* Good enough to time a blip track to: vowel groups, floor of one. */
    var m = String(text).toLowerCase().match(/[aeiouy]+/g);
    return Math.max(1, m ? m.length : Math.ceil(text.length / 3));
  }

  /* ------------------------------------------------------------------ */
  /* Saying things                                                       */
  /* ------------------------------------------------------------------ */

  V.say = function (line) {
    if (typeof line === 'string') {
      line = (SG.script.lines && SG.script.lines[line]) || { speaker: 'steve', text: line };
    }
    line = line || {};
    var speaker = line.speaker || 'steve';
    var text = String(line.text || '');
    var prof = profileOf(speaker);
    var emo = EMOTION[line.emotion] || EMOTION.calm;
    var rate = prof.rate * emo.r;
    var dur = estimate(text, rate);

    V.cancel();

    if (!text) return Promise.resolve(true);

    var settingsOn = !SG.state || !SG.state.settings ||
      SG.state.settings.voiceEnabled !== false;

    if (!enabled || !settingsOn || !synth || !Utter) {
      return blipTrack(speaker, text, prof, dur);
    }

    return new Promise(function (resolve) {
      var id = ++seq;
      var rec = {
        id: id, speaker: speaker, resolve: resolve,
        started: false, finished: false,
        timer: null, blipTimer: null, levelTimer: null
      };
      speaking = rec;

      var t0 = util.now();

      function finish(ok) {
        if (rec.finished) return;
        /* Some engines (and every headless browser) "speak" a line
         * instantly. Hold the promise to most of the estimated duration so
         * cutscene beats and subtitles never race ahead of the reader. */
        var elapsed = util.now() - t0;
        var floor = dur * 0.7;
        if (elapsed < floor) {
          setTimeout(function () { finish(ok); }, (floor - elapsed) * 1000);
          return;
        }
        rec.finished = true;
        if (rec.timer) clearTimeout(rec.timer);
        if (rec.levelTimer) clearInterval(rec.levelTimer);
        if (resumeTimer) { clearInterval(resumeTimer); resumeTimer = null; }
        if (speaking === rec) { speaking = null; V.level = 0; }
        SG.bus.emit('voice:end', { speaker: speaker });
        resolve(ok);
      }

      var u;
      try {
        u = new Utter(text);
      } catch (e) {
        speaking = null;
        blipTrack(speaker, text, prof, dur).then(function () { resolve(true); });
        return;
      }

      var v = assigned[speaker];
      if (!v && voices.length) { assignVoices(); v = assigned[speaker]; }
      if (v) { u.voice = v; u.lang = v.lang; }
      u.pitch = Math.max(0, Math.min(2, prof.pitch * emo.p));
      u.rate = Math.max(0.1, Math.min(2, rate));
      u.volume = clampVol();

      u.onstart = function () {
        rec.started = true;
        SG.bus.emit('voice:start', { speaker: speaker, text: text });
        startFilter(prof, dur);
        /* Pseudo-amplitude so rigs have a jaw to drive even though the
         * synth gives us no signal to measure. */
        rec.levelTimer = setInterval(function () {
          V.level = 0.35 + Math.random() * 0.55;
        }, 70);
        /* Chrome stops speaking after ~15 s unless poked. */
        if (resumeTimer) clearInterval(resumeTimer);
        resumeTimer = setInterval(function () {
          if (!speaking) { clearInterval(resumeTimer); resumeTimer = null; return; }
          try { synth.pause(); synth.resume(); } catch (e) { /* noop */ }
        }, 9000);
      };

      u.onboundary = function (ev) {
        SG.bus.emit('voice:word', { speaker: speaker, index: ev && ev.charIndex });
        for (var i = 0; i < boundaryCbs.length; i++) {
          try { boundaryCbs[i](ev, speaker); } catch (e) { /* noop */ }
        }
      };

      u.onend = function () { finish(true); };
      u.onerror = function () {
        /* A refused utterance still has to carry the scene. */
        if (!rec.started) {
          speaking = null;
          blipTrack(speaker, text, prof, dur).then(function () { finish(true); });
        } else {
          finish(true);
        }
      };

      try {
        synth.speak(u);
      } catch (e) {
        speaking = null;
        blipTrack(speaker, text, prof, dur).then(function () { resolve(true); });
        return;
      }

      /* Watchdog 1: nothing started — the engine took the utterance and
       * dropped it, which iOS does constantly. Switch to blips. */
      setTimeout(function () {
        if (rec.finished || rec.started) return;
        try { synth.cancel(); } catch (e2) { /* noop */ }
        speaking = null;
        blipTrack(speaker, text, prof, dur).then(function () { finish(true); });
      }, 700);

      /* Watchdog 2: started but onend never came. Never hang a cutscene. */
      rec.timer = setTimeout(function () { finish(true); }, (dur + 4.5) * 1000);
    });
  };

  function clampVol() {
    var s = (SG.state && SG.state.settings) || {};
    var m = s.master === undefined ? 0.85 : s.master;
    var vv = s.voice === undefined ? 1 : s.voice;
    return Math.max(0, Math.min(1, m * vv));
  }

  /* ------------------------------------------------------------------ */
  /* The fallback: one pitched blip per syllable                         */
  /* ------------------------------------------------------------------ */

  function blipTrack(speaker, text, prof, dur) {
    return new Promise(function (resolve) {
      var id = ++seq;
      var n = Math.min(48, syllables(text));
      var gap = Math.max(0.055, dur / Math.max(1, n));
      var i = 0;
      var rec = { id: id, speaker: speaker, resolve: resolve, finished: false };
      speaking = rec;

      SG.bus.emit('voice:start', { speaker: speaker, text: text });

      var canBlip = SG.audio && typeof SG.audio.blip === 'function' &&
        (!SG.state || !SG.state.settings || SG.state.settings.voiceEnabled !== false);

      rec.blipTimer = setInterval(function () {
        if (rec.finished) return;
        i++;
        if (canBlip) {
          SG.safe('voice.blip', function () {
            SG.audio.blip(prof.blip || 'steve', {
              pitch: 0.94 + Math.random() * 0.14,
              vol: 0.42
            });
          });
        }
        V.level = 0.4 + Math.random() * 0.5;
        SG.bus.emit('voice:word', { speaker: speaker, index: i });
        if (i >= n) {
          clearInterval(rec.blipTimer);
          rec.blipTimer = null;
        }
      }, gap * 1000);

      rec.timer = setTimeout(function () {
        if (rec.finished) return;
        rec.finished = true;
        if (rec.blipTimer) clearInterval(rec.blipTimer);
        if (speaking === rec) { speaking = null; V.level = 0; }
        SG.bus.emit('voice:end', { speaker: speaker });
        resolve(true);
      }, dur * 1000);
    });
  }

  /* ------------------------------------------------------------------ */
  /* "Over a speaker" treatment                                          */
  /* ------------------------------------------------------------------ */

  /* speechSynthesis output cannot be routed through Web Audio, so a voice
   * that is meant to be coming out of a PA or a server cabinet gets a thin
   * bed of hiss and a start click layered underneath it instead. The ear
   * accepts the whole thing as processed. */
  function startFilter(prof, dur) {
    if (!prof.filtered || !SG.audio || !SG.audio.sfx) return;
    SG.safe('voice.filter', function () {
      if (prof.filtered === 'tannoy') {
        SG.audio.sfx('relayClick', { vol: 0.28 });
        SG.audio.sfx('radioStatic', { vol: 0.1, len: dur });
      } else if (prof.filtered === 'core') {
        SG.audio.sfx('relayClick', { vol: 0.2, rate: 0.6 });
        SG.audio.sfx('radioStatic', { vol: 0.07, len: dur });
      } else if (prof.filtered === 'phone') {
        SG.audio.sfx('radioStatic', { vol: 0.06, len: dur });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Housekeeping                                                        */
  /* ------------------------------------------------------------------ */

  V.available = function () {
    return !!(synth && Utter && voices.length);
  };

  V.describe = function () {
    var out = {};
    for (var k in V.profiles) {
      if (!Object.prototype.hasOwnProperty.call(V.profiles, k)) continue;
      out[k] = assigned[k] ? (assigned[k].name + ' [' + assigned[k].lang + ']') : '(blips)';
    }
    return out;
  };

  /* Never leave a line half-spoken across a scene change. */
  SG.bus.on('level:done', function () { V.cancel(); });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', function () { V.cancel(); });
  }

})(window.SG);
