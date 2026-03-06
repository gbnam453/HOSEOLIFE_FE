import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DormitoryCode, MealItem, NoticeItem } from './domain';

export type ThemePreference = 'SYSTEM' | 'LIGHT' | 'DARK';

export const STORAGE_KEYS = {
  selectedDormitory: '@hoseolife/selected-dormitory',
  themePreference: '@hoseolife/theme-preference',
  favoriteNoticeKeys: '@hoseolife/favorite-notice-keys',
  dormitoryNoticeCachePrefix: '@hoseolife/dormitory-notice-cache',
  dormitoryMealCachePrefix: '@hoseolife/dormitory-meal-cache',
} as const;

let inMemorySelectedDormitory: DormitoryCode | null = null;
let inMemoryThemePreference: ThemePreference = 'SYSTEM';
let inMemoryFavoriteNoticeKeys: string[] = [];
const inMemoryDormitoryNoticeCache = new Map<DormitoryCode, StoredDormitoryNoticeCachePayload>();
const inMemoryDormitoryMealCache = new Map<DormitoryCode, StoredDormitoryMealCachePayload>();
const VALID_DORMITORY_CODES: DormitoryCode[] = [
  'ASAN_HAPPY',
  'ASAN_DIRECT',
  'CHEONAN_HAPPY',
  'CHEONAN_DIRECT',
  'UNDECIDED',
];
const VALID_THEME_PREFERENCES: ThemePreference[] = ['SYSTEM', 'LIGHT', 'DARK'];
type StoredDormitoryNoticeCachePayload = {
  cachedAt: number;
  notices: NoticeItem[];
};
type StoredDormitoryMealCachePayload = {
  cachedAt: number;
  meal: MealItem | null;
};

function sanitizeNoticeStringArray(value: unknown) {
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

function sanitizeNoticeItem(value: unknown): NoticeItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title : '';
  const date = typeof record.date === 'string' ? record.date : '';
  const body = typeof record.body === 'string' ? record.body : '';
  const attachments = sanitizeNoticeStringArray(record.attachments);

  const item: NoticeItem = {
    id,
    title,
    date,
    body,
    attachments,
  };

  if (typeof record.bodyHtml === 'string' && record.bodyHtml.trim().length > 0) {
    item.bodyHtml = record.bodyHtml;
  }

  const contentImages = sanitizeNoticeStringArray(record.contentImages);
  if (contentImages.length > 0) {
    item.contentImages = contentImages;
  }

  if (typeof record.isPinned === 'boolean') {
    item.isPinned = record.isPinned;
  }

  if (typeof record.sourceUrl === 'string' && record.sourceUrl.trim().length > 0) {
    item.sourceUrl = record.sourceUrl;
  }

  if (typeof record.sourceName === 'string' && record.sourceName.trim().length > 0) {
    item.sourceName = record.sourceName;
  }

  if (typeof record.actionCode === 'string' && record.actionCode.trim().length > 0) {
    item.actionCode = record.actionCode;
  }

  return item;
}

function sanitizeNoticeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, NoticeItem>();
  value.forEach(item => {
    const sanitized = sanitizeNoticeItem(item);
    if (!sanitized) {
      return;
    }

    deduped.set(sanitized.id, sanitized);
  });

  return Array.from(deduped.values());
}

function sanitizeMealSection(value: unknown): NonNullable<MealItem['sections']>[number] | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (id !== 'BREAKFAST' && id !== 'DINNER' && id !== 'EXTRA') {
    return null;
  }

  return {
    id,
    label: typeof record.label === 'string' ? record.label : '',
    content: typeof record.content === 'string' ? record.content : '',
  };
}

function sanitizeMealSections(value: unknown): MealItem['sections'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const deduped = new Map<
    NonNullable<MealItem['sections']>[number]['id'],
    NonNullable<MealItem['sections']>[number]
  >();
  value.forEach(section => {
    const sanitized = sanitizeMealSection(section);
    if (!sanitized) {
      return;
    }

    deduped.set(sanitized.id, sanitized);
  });

  const sections = Array.from(deduped.values());
  return sections.length > 0 ? sections : undefined;
}

function sanitizeMealItem(value: unknown): MealItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const imageUri = typeof record.imageUri === 'string' ? record.imageUri.trim() : '';
  if (!imageUri) {
    return null;
  }

  const meal: MealItem = {
    title: typeof record.title === 'string' ? record.title : '',
    description: typeof record.description === 'string' ? record.description : '',
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    imageUri,
  };

  if (typeof record.sourceUrl === 'string' && record.sourceUrl.trim().length > 0) {
    meal.sourceUrl = record.sourceUrl;
  }

  const sections = sanitizeMealSections(record.sections);
  if (sections) {
    meal.sections = sections;
  }

  return meal;
}

function getDormitoryNoticeCacheStorageKey(dormitoryCode: DormitoryCode) {
  return `${STORAGE_KEYS.dormitoryNoticeCachePrefix}:${dormitoryCode}`;
}

function getDormitoryMealCacheStorageKey(dormitoryCode: DormitoryCode) {
  return `${STORAGE_KEYS.dormitoryMealCachePrefix}:${dormitoryCode}`;
}

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

export async function getStoredDormitoryNoticeCache(
  dormitoryCode: DormitoryCode,
): Promise<StoredDormitoryNoticeCachePayload | null> {
  const inMemoryCached = inMemoryDormitoryNoticeCache.get(dormitoryCode);
  if (inMemoryCached) {
    return {
      cachedAt: inMemoryCached.cachedAt,
      notices: [...inMemoryCached.notices],
    };
  }

  if (typeof AsyncStorage?.getItem !== 'function') {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(getDormitoryNoticeCacheStorageKey(dormitoryCode));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      cachedAt?: unknown;
      notices?: unknown;
    };
    const notices = sanitizeNoticeItems(parsed?.notices);
    const cachedAt =
      typeof parsed?.cachedAt === 'number' && Number.isFinite(parsed.cachedAt)
        ? parsed.cachedAt
        : Date.now();

    const payload = {
      cachedAt,
      notices,
    };
    inMemoryDormitoryNoticeCache.set(dormitoryCode, payload);
    return {
      cachedAt: payload.cachedAt,
      notices: [...payload.notices],
    };
  } catch (error) {
    console.warn('dormitory notice cache load failed', error);
    return null;
  }
}

export async function setStoredDormitoryNoticeCache(
  dormitoryCode: DormitoryCode,
  notices: NoticeItem[],
) {
  const sanitized = sanitizeNoticeItems(notices);
  const payload: StoredDormitoryNoticeCachePayload = {
    cachedAt: Date.now(),
    notices: sanitized,
  };

  inMemoryDormitoryNoticeCache.set(dormitoryCode, payload);

  if (typeof AsyncStorage?.setItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.setItem(
      getDormitoryNoticeCacheStorageKey(dormitoryCode),
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    console.warn('dormitory notice cache save failed', error);
    return false;
  }
}

export async function getStoredDormitoryMealCache(
  dormitoryCode: DormitoryCode,
): Promise<StoredDormitoryMealCachePayload | null> {
  const inMemoryCached = inMemoryDormitoryMealCache.get(dormitoryCode);
  if (inMemoryCached) {
    return {
      cachedAt: inMemoryCached.cachedAt,
      meal: inMemoryCached.meal,
    };
  }

  if (typeof AsyncStorage?.getItem !== 'function') {
    return null;
  }

  try {
    const raw = await AsyncStorage.getItem(getDormitoryMealCacheStorageKey(dormitoryCode));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as {
      cachedAt?: unknown;
      meal?: unknown;
    };
    const cachedAt =
      typeof parsed?.cachedAt === 'number' && Number.isFinite(parsed.cachedAt)
        ? parsed.cachedAt
        : Date.now();
    const meal = sanitizeMealItem(parsed?.meal);

    const payload = {
      cachedAt,
      meal,
    };
    inMemoryDormitoryMealCache.set(dormitoryCode, payload);
    return {
      cachedAt: payload.cachedAt,
      meal: payload.meal,
    };
  } catch (error) {
    console.warn('dormitory meal cache load failed', error);
    return null;
  }
}

export async function setStoredDormitoryMealCache(
  dormitoryCode: DormitoryCode,
  meal: MealItem | null,
) {
  const payload: StoredDormitoryMealCachePayload = {
    cachedAt: Date.now(),
    meal: sanitizeMealItem(meal),
  };

  inMemoryDormitoryMealCache.set(dormitoryCode, payload);

  if (typeof AsyncStorage?.setItem !== 'function') {
    return true;
  }

  try {
    await AsyncStorage.setItem(
      getDormitoryMealCacheStorageKey(dormitoryCode),
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    console.warn('dormitory meal cache save failed', error);
    return false;
  }
}
