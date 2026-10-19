// Sürüm 1: kayıtlar tarayıcıda (localStorage). Sürüm 3'te Supabase'e taşınacak.
import { PlanetSettings, sanitize } from './settings';

export interface SavedPlanet {
  id: string;
  name: string;
  date: number;
  score: number;
  thumbnail: string;
  settings: PlanetSettings;
}

const ALBUM_KEY = 'gezegen-atolyesi:album';
const CURRENT_KEY = 'gezegen-atolyesi:current';
const PREFS_KEY = 'gezegen-atolyesi:prefs';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadAlbum(): SavedPlanet[] {
  const list = read<unknown[]>(ALBUM_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is SavedPlanet => !!p && typeof p === 'object' && 'id' in p)
    .map((p) => ({ ...p, settings: sanitize(p.settings) }));
}

export function saveToAlbum(entry: Omit<SavedPlanet, 'id' | 'date'>): boolean {
  const album = loadAlbum();
  album.unshift({ ...entry, id: crypto.randomUUID?.() ?? String(Date.now()), date: Date.now() });
  return write(ALBUM_KEY, album);
}

export function deleteFromAlbum(id: string) {
  write(
    ALBUM_KEY,
    loadAlbum().filter((p) => p.id !== id),
  );
}

/** Son üzerinde çalışılan gezegen: sayfa yenilenince kaldığı yerden devam */
export function loadCurrent(): PlanetSettings | null {
  const raw = read<unknown>(CURRENT_KEY, null);
  return raw ? sanitize(raw) : null;
}

export function saveCurrent(s: PlanetSettings) {
  write(CURRENT_KEY, s);
}

export interface Prefs {
  quality: 'auto' | 'low' | 'medium' | 'high';
  batterySaver: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  theme: 'dark' | 'light';
}

export function loadPrefs(): Prefs {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const d: Prefs = { quality: 'auto', batterySaver: false, reduceMotion: reduce, largeText: false, theme: 'dark' };
  return { ...d, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function savePrefs(p: Prefs) {
  write(PREFS_KEY, p);
}
