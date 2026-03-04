import { Image, type ImageURISource } from 'react-native';

type ImageSize = {
  width: number;
  height: number;
};

const prefetchedUrls = new Set<string>();
const pendingPrefetches = new Map<string, Promise<void>>();
const imageSizeCache = new Map<string, ImageSize>();
const pendingSizeLoads = new Map<string, Promise<ImageSize | null>>();

function isRemoteHttpUrl(uri: string) {
  return /^https?:\/\//i.test(uri);
}

function normalizeUri(uri?: string) {
  return uri?.trim();
}

export function hasWarmedImage(uri?: string): boolean {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri) {
    return false;
  }

  return prefetchedUrls.has(normalizedUri);
}

async function hasNativeImageCache(uri: string) {
  try {
    const cacheState = await Image.queryCache([uri]);
    return Boolean(cacheState?.[uri]);
  } catch {
    return false;
  }
}

export function getCachedImageSource(
  uri?: string,
  cacheMode: 'AUTO' | 'CACHE_ONLY' = 'AUTO',
): ImageURISource | undefined {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri) {
    return undefined;
  }

  if (cacheMode === 'CACHE_ONLY') {
    return {
      uri: normalizedUri,
      cache: 'only-if-cached',
    };
  }

  return {
    uri: normalizedUri,
    cache: 'force-cache',
  };
}

export function getImageSizeFromCache(uri?: string): ImageSize | undefined {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri) {
    return undefined;
  }
  return imageSizeCache.get(normalizedUri);
}

export async function warmImageCache(uri?: string): Promise<void> {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri || !isRemoteHttpUrl(normalizedUri)) {
    return;
  }

  if (prefetchedUrls.has(normalizedUri)) {
    return;
  }

  const pending = pendingPrefetches.get(normalizedUri);
  if (pending) {
    await pending;
    return;
  }

  const task = (async () => {
    const hasCache = await hasNativeImageCache(normalizedUri);
    if (hasCache) {
      prefetchedUrls.add(normalizedUri);
      return;
    }

    const prefetchSucceeded = await Image.prefetch(normalizedUri).catch(() => false);
    if (prefetchSucceeded) {
      prefetchedUrls.add(normalizedUri);
      return;
    }

    const hasCacheAfterPrefetch = await hasNativeImageCache(normalizedUri);
    if (hasCacheAfterPrefetch) {
      prefetchedUrls.add(normalizedUri);
    }
  })()
    .finally(() => {
      pendingPrefetches.delete(normalizedUri);
    });

  pendingPrefetches.set(normalizedUri, task);
  await task;
}

export async function warmImageCacheBatch(uris: string[]): Promise<void> {
  const deduped = Array.from(
    new Set(uris.map(uri => normalizeUri(uri)).filter((uri): uri is string => Boolean(uri))),
  );
  if (deduped.length === 0) {
    return;
  }

  await Promise.allSettled(deduped.map(uri => warmImageCache(uri)));
}

export async function getCachedImageSize(uri?: string): Promise<ImageSize | null> {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri) {
    return null;
  }

  const cached = imageSizeCache.get(normalizedUri);
  if (cached) {
    return cached;
  }

  const pending = pendingSizeLoads.get(normalizedUri);
  if (pending) {
    return pending;
  }

  const task = new Promise<ImageSize | null>(resolve => {
    Image.getSize(
      normalizedUri,
      (width, height) => {
        if (width > 0 && height > 0) {
          const size = { width, height };
          imageSizeCache.set(normalizedUri, size);
          resolve(size);
          return;
        }
        resolve(null);
      },
      () => resolve(null),
    );
  }).finally(() => {
    pendingSizeLoads.delete(normalizedUri);
  });

  pendingSizeLoads.set(normalizedUri, task);
  return task;
}
