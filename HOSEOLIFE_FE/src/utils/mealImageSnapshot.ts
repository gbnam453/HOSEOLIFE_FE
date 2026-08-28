import { isRemoteHttpUrl } from './imageCache';

const MAX_SNAPSHOT_BINARY_BYTES = 1_600_000;
const MAX_SNAPSHOT_DATA_URI_LENGTH = 2_500_000;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const pendingSnapshots = new Map<string, Promise<string | null>>();

function normalizeUri(uri?: string) {
  return uri?.trim();
}

function buildSnapshotRequestInit(uri: string): RequestInit | undefined {
  const normalizedUri = uri.toLowerCase();
  if (normalizedUri.includes('happydorm.hoseo.ac.kr')) {
    return {
      headers: {
        Referer: 'https://happydorm.hoseo.ac.kr',
      },
    };
  }
  if (normalizedUri.includes('hoseoin.hoseo.ac.kr')) {
    return {
      headers: {
        Referer: 'https://hoseoin.hoseo.ac.kr/Home/Main.mbz',
      },
    };
  }

  return undefined;
}

function normalizeContentType(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const raw = value.split(';')[0]?.trim().toLowerCase();
  if (!raw || !raw.startsWith('image/')) {
    return null;
  }

  return raw;
}

function inferMimeTypeFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 8) {
    const pngHeader = [0x89, 0x50, 0x4e, 0x47];
    const isPng = pngHeader.every((value, index) => bytes[index] === value);
    if (isPng) {
      return 'image/png';
    }
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  return null;
}

function inferMimeTypeFromUri(uri: string) {
  const normalized = uri.toLowerCase();
  if (normalized.includes('.png')) {
    return 'image/png';
  }
  if (normalized.includes('.jpg') || normalized.includes('.jpeg')) {
    return 'image/jpeg';
  }
  if (normalized.includes('.gif')) {
    return 'image/gif';
  }
  if (normalized.includes('.webp')) {
    return 'image/webp';
  }
  if (normalized.includes('.bmp')) {
    return 'image/bmp';
  }

  return null;
}

function resolveSnapshotMimeType(
  bytes: Uint8Array,
  contentType: string | null | undefined,
  sourceUri: string,
) {
  return (
    normalizeContentType(contentType) ??
    inferMimeTypeFromBytes(bytes) ??
    inferMimeTypeFromUri(sourceUri) ??
    'image/jpeg'
  );
}

function encodeBytesToBase64(bytes: Uint8Array): string | null {
  const maybeBuffer = (
    globalThis as {
      Buffer?: {
        from: (value: Uint8Array) => { toString: (encoding: string) => string };
      };
    }
  ).Buffer;

  if (maybeBuffer) {
    try {
      return maybeBuffer.from(bytes).toString('base64');
    } catch {
      // Fall through to btoa branch.
    }
  }

  const maybeBtoa = (
    globalThis as {
      btoa?: (value: string) => string;
    }
  ).btoa;
  if (typeof maybeBtoa !== 'function') {
    return encodeBytesToBase64Manually(bytes);
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  try {
    return maybeBtoa(binary);
  } catch {
    return encodeBytesToBase64Manually(bytes);
  }
}

function encodeBytesToBase64Manually(bytes: Uint8Array): string {
  let output = '';
  let index = 0;

  while (index + 2 < bytes.length) {
    const triple = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    output += BASE64_ALPHABET[(triple >> 6) & 0x3f];
    output += BASE64_ALPHABET[triple & 0x3f];
    index += 3;
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const value = bytes[index];
    output += BASE64_ALPHABET[(value >> 2) & 0x3f];
    output += BASE64_ALPHABET[(value & 0x03) << 4];
    output += '==';
  } else if (remaining === 2) {
    const value = (bytes[index] << 8) | bytes[index + 1];
    output += BASE64_ALPHABET[(value >> 10) & 0x3f];
    output += BASE64_ALPHABET[(value >> 4) & 0x3f];
    output += BASE64_ALPHABET[(value & 0x0f) << 2];
    output += '=';
  }

  return output;
}

async function readBlobAsDataUri(blob: Blob): Promise<string | null> {
  const FileReaderCtor = (
    globalThis as {
      FileReader?: {
        new (): {
          onloadend: (() => void) | null;
          onerror: (() => void) | null;
          result: string | ArrayBuffer | null;
          readAsDataURL: (value: Blob) => void;
        };
      };
    }
  ).FileReader;
  if (typeof FileReaderCtor !== 'function') {
    return null;
  }

  return new Promise(resolve => {
    try {
      const reader = new FileReaderCtor();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

export async function createRemoteImageDataUriSnapshot(uri?: string): Promise<string | null> {
  const normalizedUri = normalizeUri(uri);
  if (!normalizedUri || !isRemoteHttpUrl(normalizedUri)) {
    return null;
  }

  const pending = pendingSnapshots.get(normalizedUri);
  if (pending) {
    return pending;
  }

  const task = (async () => {
    try {
      const response = await fetch(normalizedUri, buildSnapshotRequestInit(normalizedUri));
      if ('ok' in response && response.ok === false) {
        return null;
      }

      if (typeof response.arrayBuffer !== 'function') {
        if (typeof response.blob === 'function') {
          const blob = await response.blob();
          if (typeof blob.size === 'number' && (blob.size <= 0 || blob.size > MAX_SNAPSHOT_BINARY_BYTES)) {
            return null;
          }

          const dataUriFromBlob = await readBlobAsDataUri(blob);
          if (!dataUriFromBlob || dataUriFromBlob.length > MAX_SNAPSHOT_DATA_URI_LENGTH) {
            return null;
          }

          return dataUriFromBlob;
        }

        return null;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_SNAPSHOT_BINARY_BYTES) {
        return null;
      }

      const base64 = encodeBytesToBase64(bytes);
      if (!base64) {
        return null;
      }

      const mimeType = resolveSnapshotMimeType(
        bytes,
        typeof response.headers?.get === 'function' ? response.headers.get('Content-Type') : null,
        normalizedUri,
      );
      const dataUri = `data:${mimeType};base64,${base64}`;

      if (dataUri.length > MAX_SNAPSHOT_DATA_URI_LENGTH) {
        return null;
      }

      return dataUri;
    } catch {
      return null;
    }
  })().finally(() => {
    pendingSnapshots.delete(normalizedUri);
  });

  pendingSnapshots.set(normalizedUri, task);
  return task;
}

export async function convertRemoteMealImageToDataUri(uri?: string): Promise<string | null> {
  return createRemoteImageDataUriSnapshot(uri);
}
