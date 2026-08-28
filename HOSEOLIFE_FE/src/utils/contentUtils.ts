const NOTICE_BODY_LINK_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
const NOTICE_BODY_TRAILING_LINK_PATTERN = /[.,!?;:)\]]+$/;

export function isSvgDataUri(uri: string) {
  return uri.startsWith('data:image/svg+xml');
}

function decodeSvgFromBase64(value: string) {
  if (typeof globalThis.atob !== 'function') {
    return null;
  }

  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
}

export function getSvgAspectRatioFromDataUri(uri: string) {
  try {
    const commaIndex = uri.indexOf(',');
    if (commaIndex < 0) {
      return null;
    }

    const metadata = uri.slice(0, commaIndex);
    const encodedSvg = uri.slice(commaIndex + 1);
    const svgMarkup = metadata.includes(';base64')
      ? decodeSvgFromBase64(encodedSvg)
      : decodeURIComponent(encodedSvg);
    if (!svgMarkup) {
      return null;
    }

    const viewBox = svgMarkup.match(/viewBox=['"]([^'"]+)['"]/i)?.[1];
    if (viewBox) {
      const values = viewBox.split(/\s+/).map(Number);
      const viewWidth = values[2];
      const viewHeight = values[3];
      if (viewWidth > 0 && viewHeight > 0) {
        return viewWidth / viewHeight;
      }
    }

    const widthMatch = svgMarkup.match(/width=['"]([\d.]+)(?:px)?['"]/i);
    const heightMatch = svgMarkup.match(/height=['"]([\d.]+)(?:px)?['"]/i);
    if (widthMatch && heightMatch) {
      const width = Number(widthMatch[1]);
      const height = Number(heightMatch[1]);
      if (width > 0 && height > 0) {
        return width / height;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export type NoticeBodySegment =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'link';
      value: string;
      url: string;
    };

export type NoticeBodyTableRow = {
  cells: string[];
  isHeader: boolean;
};

export type NoticeBodyTable = {
  rows: NoticeBodyTableRow[];
  columnCount: number;
};

export type NoticeBodyBlock =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'table';
      value: NoticeBodyTable;
    };

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return isLikelyUrl(trimmed) ? trimmed : `https://${trimmed}`;
}

function splitNoticeLinkTrailingText(value: string) {
  const match = value.match(NOTICE_BODY_TRAILING_LINK_PATTERN);
  if (!match) {
    return {
      linkText: value,
      trailingText: '',
    };
  }

  const linkText = value.slice(0, -match[0].length);
  if (!linkText) {
    return {
      linkText: value,
      trailingText: '',
    };
  }

  return {
    linkText,
    trailingText: match[0],
  };
}

function decodeNoticeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripNoticeHtmlToText(html: string) {
  return decodeNoticeHtmlEntities(
    html
      .replace(/<(br|\/p|\/div|\/li)\b[^>]*>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

function parseNoticeTableFromHtml(tableHtml: string): NoticeBodyTable | null {
  const parsedRows = Array.from(
    tableHtml.matchAll(/<tr\b[^>]*>[\s\S]*?(?:<\/tr>|(?=<tr\b|<\/table>|$))/gi),
  )
    .map(rowMatch => {
      const rowHtml = rowMatch[0];
      const rawCells = Array.from(rowHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi));
      if (rawCells.length === 0) {
        return null;
      }

      const cells = rawCells.map(([, , cellHtml]) =>
        stripNoticeHtmlToText(cellHtml ?? '').replace(/\n+/g, ' ').trim(),
      );
      const isHeader = rawCells.some(([, tagName]) => String(tagName).toLowerCase() === 'th');

      return {
        cells,
        isHeader,
      };
    })
    .filter((row): row is NoticeBodyTableRow => row !== null);

  if (parsedRows.length === 0) {
    return null;
  }

  const columnCount = Math.max(1, ...parsedRows.map(row => row.cells.length));
  const normalizedRows = parsedRows.map(row => ({
    ...row,
    cells: row.cells.concat(Array.from({ length: Math.max(0, columnCount - row.cells.length) }, () => '')),
  }));

  return {
    rows: normalizedRows,
    columnCount,
  };
}

export function parseNoticeBodyBlocksFromHtml(bodyHtml: string | undefined, fallbackBodyText: string) {
  const blocks: NoticeBodyBlock[] = [];

  if (!bodyHtml || !/<table\b/i.test(bodyHtml)) {
    const trimmedFallback = fallbackBodyText.trim();
    if (!trimmedFallback) {
      return blocks;
    }

    blocks.push({
      type: 'text',
      value: trimmedFallback,
    });
    return blocks;
  }

  const tableRegex = /<table\b[\s\S]*?<\/table>/gi;
  let lastIndex = 0;
  for (const match of bodyHtml.matchAll(tableRegex)) {
    const tableHtml = match[0];
    const startIndex = match.index ?? -1;

    if (!tableHtml || startIndex < 0) {
      continue;
    }

    if (startIndex > lastIndex) {
      const textBlock = stripNoticeHtmlToText(bodyHtml.slice(lastIndex, startIndex));
      if (textBlock) {
        blocks.push({
          type: 'text',
          value: textBlock,
        });
      }
    }

    const parsedTable = parseNoticeTableFromHtml(tableHtml);
    if (parsedTable) {
      blocks.push({
        type: 'table',
        value: parsedTable,
      });
    }

    lastIndex = startIndex + tableHtml.length;
  }

  if (lastIndex < bodyHtml.length) {
    const tailText = stripNoticeHtmlToText(bodyHtml.slice(lastIndex));
    if (tailText) {
      blocks.push({
        type: 'text',
        value: tailText,
      });
    }
  }

  if (blocks.length === 0 && fallbackBodyText.trim()) {
    blocks.push({
      type: 'text',
      value: fallbackBodyText.trim(),
    });
  }

  return blocks;
}

export function parseNoticeBodyWithLinks(content: string): NoticeBodySegment[] {
  const segments: NoticeBodySegment[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(NOTICE_BODY_LINK_PATTERN)) {
    const matchValue = match[0];
    const startIndex = match.index ?? -1;

    if (!matchValue || startIndex < 0) {
      continue;
    }

    if (startIndex > lastIndex) {
      segments.push({
        type: 'text',
        value: content.slice(lastIndex, startIndex),
      });
    }

    const { linkText, trailingText } = splitNoticeLinkTrailingText(matchValue);
    const normalizedUrl = normalizeExternalUrl(linkText);

    if (normalizedUrl) {
      segments.push({
        type: 'link',
        value: linkText,
        url: normalizedUrl,
      });
    } else {
      segments.push({
        type: 'text',
        value: matchValue,
      });
    }

    if (trailingText) {
      segments.push({
        type: 'text',
        value: trailingText,
      });
    }

    lastIndex = startIndex + matchValue.length;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      value: content.slice(lastIndex),
    });
  }

  if (segments.length === 0) {
    segments.push({
      type: 'text',
      value: content,
    });
  }

  return segments;
}

export function isLikelyImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (/\.(png|jpe?g|gif|bmp|webp|svg)(?:[?#].*)?$/i.test(lower)) {
    return true;
  }

  return /thumbnailprint\.do|imgdownload|\/api\/image\//i.test(lower);
}

export function normalizeListPreviewText(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
