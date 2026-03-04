import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DormitoryCode } from './domain';

export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';

export const STORAGE_KEYS = {
  selectedDormitory: '@hoseolife/selected-dormitory',
  themePreference: '@hoseolife/theme-preference',
  favoriteNoticeKeys: '@hoseolife/favorite-notice-keys',
} as const;

let inMemorySelectedDormitory: DormitoryCode | null = null;
let inMemoryThemePreference: ThemePreference = 'SYSTEM';
let inMemoryFavoriteNoticeKeys: string[] = [];
const VALID_DORMITORY_CODES: DormitoryCode[] = [
  'ASAN_HAPPY',
  'ASAN_DIRECT',
  'CHEONAN_HAPPY',
  'CHEONAN_DIRECT',
  'UNDECIDED',
];
const VALID_THEME_PREFERENCES: ThemePreference[] = ['SYSTEM', 'LIGHT', 'DARK'];

export async function getStoredDormitory() {
  if (typeof AsyncStorage?.getItem !== 'function') {
    return inMemorySelectedDormitory;
  }

  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.selectedDormitory);

    if (value && VALID_DORMITORY_CODES.includes(value as DormitoryCode)) {
      const typedValue = value as DormitoryCode;
      inMemorySelectedDormitory = typedValue;
      return typedValue;
    }
  } catch (error) {
    console.warn('selected dormitory load failed', error);
  }

  return inMemorySelectedDormitory;
}

export async function setStoredDormitory(value: DormitoryCode) {
  inMemorySelectedDormitory = value;

  if (typeof AsyncStorage?.setItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.selectedDormitory, value);
    return true;
  } catch (error) {
    console.warn('selected dormitory save failed', error);
    return false;
  }
}

export async function clearStoredDormitory() {
  inMemorySelectedDormitory = null;

  if (typeof AsyncStorage?.removeItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.selectedDormitory);
    return true;
  } catch (error) {
    console.warn('selected dormitory clear failed', error);
    return false;
  }
}

export async function getStoredThemePreference() {
  if (typeof AsyncStorage?.getItem !== 'function') {
    return inMemoryThemePreference;
  }

  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.themePreference);

    if (value && VALID_THEME_PREFERENCES.includes(value as ThemePreference)) {
      const typedValue = value as ThemePreference;
      inMemoryThemePreference = typedValue;
      return typedValue;
    }
  } catch (error) {
    console.warn('theme preference load failed', error);
  }

  return inMemoryThemePreference;
}

export async function setStoredThemePreference(value: ThemePreference) {
  inMemoryThemePreference = value;

  if (typeof AsyncStorage?.setItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.themePreference, value);
    return true;
  } catch (error) {
    console.warn('theme preference save failed', error);
    return false;
  }
}

function sanitizeFavoriteNoticeKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0),
    ),
  );
}

export async function getStoredFavoriteNoticeKeys() {
  if (typeof AsyncStorage?.getItem !== 'function') {
    return [...inMemoryFavoriteNoticeKeys];
  }

  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.favoriteNoticeKeys);
    if (!value) {
      return [...inMemoryFavoriteNoticeKeys];
    }

    const parsed = JSON.parse(value) as unknown;
    const sanitized = sanitizeFavoriteNoticeKeys(parsed);
    inMemoryFavoriteNoticeKeys = sanitized;
    return [...sanitized];
  } catch (error) {
    console.warn('favorite notice keys load failed', error);
    return [...inMemoryFavoriteNoticeKeys];
  }
}

export async function setStoredFavoriteNoticeKeys(value: string[]) {
  const sanitized = sanitizeFavoriteNoticeKeys(value);
  inMemoryFavoriteNoticeKeys = sanitized;

  if (typeof AsyncStorage?.setItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.setItem(STORAGE_KEYS.favoriteNoticeKeys, JSON.stringify(sanitized));
    return true;
  } catch (error) {
    console.warn('favorite notice keys save failed', error);
    return false;
  }
}
