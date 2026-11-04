import * as THREE from 'three';
import { Post, applyGrade, Grade } from './post';
import { T, sstep, lin, clamp } from './util';
import type { Assets } from './assets';

export interface FilmScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(t: number): void;
  grade(t: number): Grade;
}

export interface SceneSet {
  manor?: FilmScene;
  tv?: FilmScene;
  botanical?: FilmScene;
  fold?: FilmScene;
  cosmos?: FilmScene;
}

const WHITE = new THREE.Color(0.985, 0.98, 0.965);
const BLACK = new THREE.Color(0, 0, 0);

/** Decides which world is on screen at time t and layers the scripted
 *  transitions (fades, CRT snow, white-outs) on top.  render(t) is a pure
 *  function of t, so playback, scrubbing and frame export all agree. */
export class Director {
  post: Post;
  constructor(public renderer: THREE.WebGLRenderer, public S: SceneSet, A: Assets, public w: number, public h: number) {
    const q = new URLSearchParams(location.search);
    this.post = new Post(renderer, w, h, A.tex.paperGrain, q.has('msaa') ? +q.get('msaa')! : 4);
  }

  setSize(w: number, h: number) {
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    for (const k of Object.values(this.S)) if (k) { k.camera.aspect = w / h; k.camera.updateProjectionMatrix(); }
  }

  pick(t: number): FilmScene | undefined {
    const S = this.S;
    if (t < T.manor.glassCross) return S.manor;
    if (t < T.interference[1]) return S.tv;
    if (t < T.botanical.whiteout) return S.botanical;
    if (t < T.cosmos.start) return S.fold;
    return S.cosmos;
  }

  render(t: number) {
    const sc = this.pick(t);
    const u = this.post.u;
    u.uTime.value = t;
    u.uStatic.value = 0; u.uStaticBase.value = 0; u.uWarp.value = 0; u.uScan.value = 0; u.uFade.value = 0;
    if (!sc) { this.renderer.setClearColor(0x000000); this.renderer.clear(); return; }
    sc.camera.aspect = this.w / this.h;
    sc.update(t);
    sc.camera.updateProjectionMatrix();
    applyGrade(this.post, sc.grade(t));
    const m = T.manor;
    // ---- Act I: fade in, dive into the tube
    if (t < m.fadeIn[1]) { u.uFadeColor.value.copy(BLACK); u.uFade.value = 1 - sstep(t, m.fadeIn[0], m.fadeIn[1]); }
    if (t > m.pushStart + 1.5 && t < m.glassCross) {
      const k = sstep(t, m.pushStart + 1.5, m.glassCross);
      u.uWarp.value = k * k * 0.9;
      u.uScan.value = k * 0.6;
      u.uScanScale.value = 1 + k * 6;
    }
    // ---- inside the TV: logo dissolve, then exactly 4 s of snow over white
    if (t >= m.glassCross && t < T.interference[1]) {
      const k = lin(t, m.glassCross, m.glassCross + 0.8);
      u.uWarp.value = 0.8 * (1 - k);
      u.uScan.value = 0.6 * (1 - k);
      u.uScanScale.value = 7 + k * 10;
      if (t >= T.interference[0]) { u.uStatic.value = 0.9; u.uStaticBase.value = 1.0; }
    }
    // ---- Act II: the painted world emerges from white, ends in a white bloom
    const b = T.botanical;
    if (t >= b.start && t < b.start + 1.4) { u.uFadeColor.value.copy(WHITE); u.uFade.value = 1 - sstep(t, b.start, b.start + 1.4); }
    if (t >= b.whiteout - 0.35 && t < b.whiteout) {
      u.uFadeColor.value.copy(WHITE); u.uFade.value = sstep(t, b.whiteout - 0.35, b.whiteout - 0.02);
      this.post.bloom.strength += 2.0 * u.uFade.value;
    }
    // ---- Act III -> IV: white fades into deep black space
    const c = T.cosmos;
    if (t >= c.blackFade[0] && t < c.blackFade[1]) {
      const k = lin(t, c.blackFade[0], c.blackFade[0] + 0.7);
      u.uFadeColor.value.copy(WHITE).lerp(BLACK, sstep(k, 0, 1));
      u.uFade.value = 1 - sstep(t, c.blackFade[0] + 0.7, c.blackFade[1]);
    }
    if (t > c.end - 1.2) { u.uFadeColor.value.copy(BLACK); u.uFade.value = sstep(t, c.end - 1.2, c.end); }
    this.post.render(sc.scene, sc.camera);
  }
}
