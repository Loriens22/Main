import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { realtime } from './socket';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

let hapticsOn = true;
export function setHapticsEnabled(v: boolean): void {
  hapticsOn = v;
}

export const haptic = {
  tap(): void {
    if (!hapticsOn) return;
    if (isNative) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
    else navigator.vibrate?.(8);
  },
  medium(): void {
    if (!hapticsOn) return;
    if (isNative) void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => undefined);
    else navigator.vibrate?.(14);
  },
  success(): void {
    if (!hapticsOn) return;
    if (isNative) void Haptics.notification({ type: NotificationType.Success }).catch(() => undefined);
  },
  error(): void {
    if (!hapticsOn) return;
    if (isNative) void Haptics.notification({ type: NotificationType.Error }).catch(() => undefined);
  },
};

export async function applyStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    if (platform === 'android') await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch {
    /* plugin unavailable */
  }
}

/** Wires Android back button, app resume and keyboard height into the app. */
export function initPlatform(onBack: () => boolean): () => void {
  const subs: Array<Promise<{ remove: () => Promise<void> }>> = [];
  if (isNative) {
    subs.push(
      App.addListener('backButton', () => {
        if (!onBack()) void App.minimizeApp();
      }),
    );
    subs.push(
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) realtime.nudge();
      }),
    );
    if (platform === 'ios') {
      subs.push(Keyboard.addListener('keyboardWillShow', (i) => document.documentElement.style.setProperty('--kb', `${i.keyboardHeight}px`)));
      subs.push(Keyboard.addListener('keyboardWillHide', () => document.documentElement.style.setProperty('--kb', '0px')));
    }
  } else {
    const onVis = () => document.visibilityState === 'visible' && realtime.nudge();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', () => realtime.nudge());
    const onPop = () => {
      onBack();
      history.pushState(null, '', location.href);
    };
    history.pushState(null, '', location.href);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('popstate', onPop);
    };
  }
  return () => {
    for (const s of subs) void s.then((h) => h.remove());
  };
}
