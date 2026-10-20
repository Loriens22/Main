import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/** Device token lives in the Android Keystore / iOS Keychain on native, localStorage on web. */
export const secure = {
  async get(key: string): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const v = await SecureStorage.get(key);
        return typeof v === 'string' ? v : v == null ? null : JSON.stringify(v);
      } catch {
        return null;
      }
    }
    try {
      return localStorage.getItem(`secure:${key}`);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string | null): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      if (value === null) await SecureStorage.remove(key).catch(() => undefined);
      else await SecureStorage.set(key, value);
      return;
    }
    try {
      if (value === null) localStorage.removeItem(`secure:${key}`);
      else localStorage.setItem(`secure:${key}`, value);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Non-secret preferences (theme, glass quality, cached lists). */
export const prefs = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const { value } = await Preferences.get({ key });
      return value == null ? fallback : (JSON.parse(value) as T);
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await Preferences.set({ key, value: JSON.stringify(value) });
    } catch {
      /* ignore */
    }
  },
};
