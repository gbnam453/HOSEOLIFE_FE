import {
  type DormitoryCode,
  type MealItem,
  type NoticeItem,
} from '../domain';

const HAPPY_BASE = 'https://happydorm.hoseo.ac.kr';
const DIRECT_BASE = 'https://hoseoin.hoseo.ac.kr';
const DIRECT_MAIN = `${DIRECT_BASE}/Home/Main.mbz`;
const DIRECT_MEAL_ACTION = 'MAPP_2104261729';
const HAPPY_NOTICE_PAGE_GUARD = 200;
const DIRECT_NOTICE_PAGE_GUARD = 200;
const DIRECT_THUMBNAIL_PRINT_PATH_PATTERN = /\/ThumbnailPrint\.do/i;

const DIRECT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: DIRECT_MAIN,
} as const;

export interface DormitoryContent {
  notices: NoticeItem[];
  meal: MealItem | null;
}

type FetchDormitoryContentOptions = {
  includeMeal?: boolean;
};

export async function fetchDormitoryContent(
  dormitoryCode: DormitoryCode,
  options: FetchDormitoryContentOptions = {},
): Promise<DormitoryContent> {
  const includeMeal = options.includeMeal !== false;

  if (dormitoryCode === 'ASAN_HAPPY') {
    const [noticesResult, mealResult] = await Promise.allSettled([
      fetchHappyNotices(),
      includeMeal ? fetchHappyMeal() : Promise.resolve(null),
    ]);
    const notices = noticesResult.status === 'fulfilled' ? noticesResult.value : [];
    const meal = mealResult.status === 'fulfilled' ? mealResult.value : null;
    if (noticesResult.status === 'rejected' && mealResult.status === 'rejected') {
      throw new Error('happy dormitory content fetch failed');
    }
    return { notices, meal };
  }

  if (dormitoryCode === 'ASAN_DIRECT') {
    const [noticesResult, mealResult] = await Promise.allSettled([
      fetchDirectNotices(),
      includeMeal ? fetchDirectMeal() : Promise.resolve(null),
    ]);
    const notices = noticesResult.status === 'fulfilled' ? noticesResult.value : [];
    const meal = mealResult.status === 'fulfilled' ? mealResult.value : null;
    if (noticesResult.status === 'rejected' && mealResult.status === 'rejected') {
      throw new Error('direct dormitory content fetch failed');
    }
    return { notices, meal };
  }

  return {
    notices: [],
    meal: null,
  };
}

export async function fetchNoticeDetail(
  dormitoryCode: DormitoryCode,
  notice: NoticeItem,
): Promise<NoticeItem> {
  try {
    if (
      dormitoryCode === 'ASAN_HAPPY' &&
      notice.sourceUrl &&
      isHappyNoticeDetailUrl(notice.sourceUrl)
    ) {
      return fetchHappyNoticeDetail(notice);
    }

    if (
      dormitoryCode === 'ASAN_DIRECT' &&
      notice.sourceUrl &&
      isDirectNoticeDetailUrl(notice.sourceUrl)
    ) {
      return fetchDirectNoticeDetail(notice);
    }
  } catch {
    return notice;
  }

  return notice;
}

async function fetchHappyNotices(): Promise<NoticeItem[]> {
  const firstPageUrl = `${HAPPY_BASE}/board/notice/list?page=1`;
  const firstPageResponse = await fetch(firstPageUrl);
  const firstPageHtml = await firstPageResponse.text();

  const mergedItems: NoticeItem[] = [...parseHappyNoticeList(firstPageHtml)];
  const seenIds = new Set(mergedItems.map(item => item.id));
  const detectedLastPage = extractHappyNoticeLastPage(firstPageHtml);
  const lastPage = detectedLastPage > 1 ? detectedLastPage : HAPPY_NOTICE_PAGE_GUARD;

  if (lastPage <= 1) {
    return sortNoticesByPinnedAndDate(mergedItems);
  }

  for (let page = 2; page <= lastPage; page += 1) {
    const pageUrl = `${HAPPY_BASE}/board/notice/list?page=${page}`;
    const pageResponse = await fetch(pageUrl);
    const pageHtml = await pageResponse.text();
    const pageItems = parseHappyNoticeList(pageHtml);
    if (pageItems.length === 0) {
      break;
    }

    let appendedCount = 0;
    pageItems.forEach(item => {
      if (seenIds.has(item.id)) {
        return;
      }

      seenIds.add(item.id);
      mergedItems.push(item);
      appendedCount += 1;
    });

    if (appendedCount === 0) {
      break;
    }
  }

  return sortNoticesByPinnedAndDate(mergedItems);
}

async function fetchHappyNoticeDetail(notice: NoticeItem): Promise<NoticeItem> {
  const response = await fetch(notice.sourceUrl!);
  const html = await response.text();

  const title = cleanText(
    matchFirst(html, /<div class="board-top-tit">\s*([\s\S]*?)<ul class="board-top-info">/i),
  );
  const date = normalizeDate(matchFirst(html, /icofont-calendar[^>]*><\/i>\s*([0-9-]{10})/i));
  const bodyHtml =
    extractDivByClass(html, 'board-content') ??
    matchFirst(html, /<div class="board-content">([\s\S]*?)<\/div>/i);

  const attachments = extractAttachmentLinks(html, HAPPY_BASE);

  const parsedBody = stripHtml(bodyHtml ?? '');
  const bodyImages = extractImageUrlsFromHtml(bodyHtml ?? '', HAPPY_BASE);
  const attachmentImages = attachments.filter(isLikelyImageUrl);
  const contentImages = uniqueStrings([...bodyImages, ...attachmentImages]);

  return {
    ...notice,
    title: title || notice.title,
    date: date || notice.date,
    body: parsedBody || notice.body,
    bodyHtml: bodyHtml?.trim() || notice.bodyHtml,
    attachments,
    contentImages: contentImages.length > 0 ? contentImages : undefined,
  };
}

async function fetchHappyMeal(): Promise<MealItem | null> {
  try {
    const mainMeal = await fetchHappyMealFromMain();
    if (mainMeal) {
      const isMainMealImageReachable = await isHappyMealImageReachable(mainMeal.imageUri);
      if (isMainMealImageReachable) {
        return mainMeal;
      }
    }
  } catch {
    // Fallback to board nutrition detail when main meal card cannot be loaded.
  }

  return fetchHappyMealFromNutritionDetail();
}

async function fetchHappyMealFromMain(): Promise<MealItem | null> {
  const response = await fetch(HAPPY_BASE);
  const html = await response.text();
  const mealHeadingIndex = html.search(/<h4[^>]*>\s*식단표/i);
  if (mealHeadingIndex < 0) {
    return null;
  }

  const sectionSnippet = html.slice(mealHeadingIndex, mealHeadingIndex + 2600);
  const mealLinkPath = matchFirst(sectionSnippet, /<a[^>]*href="([^"]+)"/i);
  const mealImagePath = matchFirst(sectionSnippet, /<img[^>]*src="([^"]+)"/i);
  if (!mealImagePath) {
    return null;
  }

  const mealTitle =
    cleanText(matchFirst(sectionSnippet, /<img[^>]*title="([^"]+)"/i)) ||
    cleanText(matchFirst(sectionSnippet, /<img[^>]*alt="([^"]+)"/i)) ||
    '아산 행복기숙사 식단표';
  const resolvedSourceUrl = mealLinkPath
    ? absoluteUrl(HAPPY_BASE, decodeHtmlEntities(mealLinkPath))
    : `${HAPPY_BASE}/board/nutrition/list`;

  return {
    title: mealTitle || '아산 행복기숙사 식단표',
    description: '식단 이미지를 확대해서 볼 수 있습니다.',
    updatedAt: '',
    imageUri: absoluteUrl(HAPPY_BASE, decodeHtmlEntities(mealImagePath)),
    sourceUrl: resolvedSourceUrl,
  };
}

async function fetchHappyMealFromNutritionDetail(): Promise<MealItem | null> {
  const response = await fetch(`${HAPPY_BASE}/board/nutrition`);
  const html = await response.text();

  const detailHrefs = uniqueStrings(
    matchAll(
      html,
      /href=(['"])([^'"]*\/board\/nutrition\/view\?idx=\d+[^'"]*)\1/gi,
    )
      .map(([, , href]) => decodeHtmlEntities(href ?? '').trim())
      .filter(Boolean),
  );

  const topDetailHref = detailHrefs[0];
  if (!topDetailHref) {
    return null;
  }

  try {
    const detailUrl = absoluteUrl(HAPPY_BASE, topDetailHref);
    const detailResponse = await fetch(detailUrl);
    const detailHtml = await detailResponse.text();

    const title = cleanText(
      matchFirst(detailHtml, /<div class="board-top-tit">\s*([\s\S]*?)<ul class="board-top-info">/i) ??
        matchFirst(detailHtml, /<div class="board-top-tit">\s*([\s\S]*?)<\/div>/i),
    );
    const updatedAt = normalizeDate(
      matchFirst(detailHtml, /icofont-calendar[^>]*><\/i>\s*([0-9]{4}[.-][0-9]{2}[.-][0-9]{2})/i),
    );
    const bodyHtml =
      extractDivByClass(detailHtml, 'board-content') ??
      matchFirst(detailHtml, /<div class="board-content">([\s\S]*?)<\/div>/i);
    const imageUri = extractImageUrlsFromHtml(bodyHtml ?? '', HAPPY_BASE)[0];

    if (!imageUri) {
      return null;
    }

    return {
      title: title || '아산 행복기숙사 식단표',
      description: '식단 이미지를 확대해서 볼 수 있습니다.',
      updatedAt: updatedAt || '',
      imageUri,
      sourceUrl: detailUrl,
    };
  } catch {
    return null;
  }
}

async function isHappyMealImageReachable(imageUri: string): Promise<boolean> {
  if (!imageUri) {
    return false;
  }

  try {
    const response = await fetch(imageUri, {
      headers: {
        Referer: HAPPY_BASE,
      },
    });

    if ('ok' in response && response.ok === false) {
      return false;
    }

    const contentType =
      typeof response.headers?.get === 'function' ? response.headers.get('Content-Type') : null;
    if (contentType && !/^image\//i.test(contentType.trim())) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function fetchDirectNotices(): Promise<NoticeItem[]> {
  const [moveInResult, generalResult] = await Promise.allSettled([
    fetchDirectNoticeBoardPages('MAPP_2104261723'),
    fetchDirectNoticeBoardPages('MAPP_2104261724'),
  ]);
  const moveInItems = moveInResult.status === 'fulfilled' ? moveInResult.value : [];
  const generalItems = generalResult.status === 'fulfilled' ? generalResult.value : [];

  const boardItems = [...moveInItems, ...generalItems];
  if (boardItems.length > 0) {
    return sortNoticesByPinnedAndDate(boardItems);
  }

  const mainHtml = await fetchTextWithHeaders(DIRECT_MAIN, DIRECT_HEADERS);
  const previewItems = [
    ...parseDirectNoticePreviewFromMain(mainHtml, 'MAPP_2104261723'),
    ...parseDirectNoticePreviewFromMain(mainHtml, 'MAPP_2104261724'),
  ];
  const dedupedItems = Array.from(
    new Map(previewItems.map(item => [item.id, item])).values(),
  );
  const sortedItems = dedupedItems
    .sort((left, right) => right.date.localeCompare(left.date));

  return sortedItems;
}

function sortNoticesByPinnedAndDate(items: NoticeItem[]) {
  return [...items].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return left.isPinned ? -1 : 1;
    }

    const dateOrder = right.date.localeCompare(left.date);
    if (dateOrder !== 0) {
      return dateOrder;
    }

    return right.id.localeCompare(left.id);
  });
}

async function fetchDirectNoticeBoardPages(actionCode: string): Promise<NoticeItem[]> {
  const firstHtml = await fetchDirectBoardPageHtml(actionCode, 1);
  if (!firstHtml) {
    return [];
  }

  const mergedItems: NoticeItem[] = [...parseDirectNoticeList(firstHtml, actionCode)];
  const seenIds = new Set(mergedItems.map(item => item.id));
  for (let pageIndex = 2; pageIndex <= DIRECT_NOTICE_PAGE_GUARD; pageIndex += 1) {
    const pageHtml = await fetchDirectBoardPageHtml(actionCode, pageIndex);
    if (!pageHtml) {
      break;
    }

    const pageItems = parseDirectNoticeList(pageHtml, actionCode);
    if (pageItems.length === 0) {
      break;
    }

    let appendedCount = 0;
    pageItems.forEach(item => {
      if (seenIds.has(item.id)) {
        return;
      }

      seenIds.add(item.id);
      mergedItems.push(item);
      appendedCount += 1;
    });

    if (appendedCount === 0) {
      break;
    }
  }

  return mergedItems;
}

async function fetchDirectBoardPageHtml(actionCode: string, pageIndex: number) {
  const pageUrl = `${DIRECT_BASE}/Home/BBSList.mbz?action=${actionCode}&pageIndex=${pageIndex}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const html = await fetchTextWithHeaders(pageUrl, DIRECT_HEADERS);
    if (!isDirectErrorPage(html)) {
      return html;
    }

    if (attempt < 2) {
      await waitFor(120 * (attempt + 1));
    }
  }

  return '';
}

async function fetchDirectNoticeDetail(notice: NoticeItem): Promise<NoticeItem> {
  const html = await fetchTextWithHeaders(notice.sourceUrl!, DIRECT_HEADERS);

  const title = cleanText(
    matchFirst(html, /<h5 class="ui-title">([\s\S]*?)<\/h5>/i) ??
      matchFirst(html, /<div class="ui-bd-tit">\s*<h3>([\s\S]*?)<\/h3>/i),
  );
  const date = normalizeDate(
    matchFirst(html, /<strong>\s*등록일자\s*<\/strong>\s*([0-9-]{10})/i) ??
      matchFirst(html, /([0-9]{4}-[0-9]{2}-[0-9]{2})/i),
  );
  const bodyHtml =
    extractDivByClass(html, 'ui-view-content') ??
    extractDivById(html, 'board_item_list') ??
    matchFirst(
      html,
      /<div id="board_item_list">([\s\S]*?)<\/div>\s*<div class="txt-right">/i,
    ) ??
    matchFirst(html, /<div class="ui-view-content">([\s\S]*?)<\/div>/i);
  const parsedBody = stripHtml(bodyHtml ?? '')
    .replace(/^\s*내용\s*/i, '')
    .trim();
  const attachments = extractAttachmentLinks(html, DIRECT_BASE);
  const bodyImages = extractImageUrlsFromHtml(bodyHtml ?? '', DIRECT_BASE);
  const attachmentImages = attachments.filter(isLikelyImageUrl);
  const contentImages = uniqueStrings([...bodyImages, ...attachmentImages]);

  return {
    ...notice,
    title: title || notice.title,
    date: date || notice.date,
    body: parsedBody || notice.body,
    bodyHtml: bodyHtml?.trim() || notice.bodyHtml,
    attachments,
    contentImages: contentImages.length > 0 ? contentImages : undefined,
  };
}

async function fetchDirectMeal(): Promise<MealItem | null> {
  const boardMeal = await fetchDirectMealFromBoard();
  if (boardMeal) {
    return boardMeal;
  }

  const response = await fetch(`${DIRECT_BASE}/RestaurantMenuView.mbz`, {
    method: 'POST',
    headers: {
      ...DIRECT_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: 'mode=one_day',
  });
  const html = await response.text();

  const imagePath = matchFirst(html, /<img[^>]*src="([^"]+)"/i);
  if (!imagePath) {
    return null;
  }

  const updatedAt = normalizeDate(matchFirst(html, /([0-9]{4}[.-][0-9]{2}[.-][0-9]{2})/i));
  const resolvedImageUri = await resolveDirectMealImageUri(
    absoluteUrl(DIRECT_BASE, decodeHtmlEntities(imagePath)),
  );
  return {
    title: '아산 직영기숙사 식단표',
    description: '식단 이미지를 확대해서 볼 수 있습니다.',
    updatedAt,
    imageUri: resolvedImageUri,
    sourceUrl: `${DIRECT_BASE}/RestaurantMenuView.mbz`,
  };
}

function parseDirectNoticeList(
  html: string,
  actionCode: string,
) {
  const body = matchFirst(html, /<tbody>([\s\S]*?)<\/tbody>/i);
  if (!body) {
    return [];
  }

  // Direct dormitory board markup often omits closing </tr> tags,
  // so rows are parsed by the next <tr> boundary as a fallback.
  return matchAll(body, /<tr\b[^>]*>[\s\S]*?(?:<\/tr>|(?=<tr\b|$))/gi)
    .map(match => {
      const rowHtml = match[0];
      const idx = matchFirst(rowHtml, /fn_viewData\('(\d+)'\)/i);
      const isPinned = /\bboard_new\b/i.test(rowHtml);
      const title = cleanText(
        matchFirst(
          rowHtml,
          /<a[^>]*href=(?:['"])javascript:fn_viewData\('\d+'\);(?:['"])[^>]*>([\s\S]*?)<\/a>/i,
        ),
      );
      const cells = matchAll(rowHtml, /<td[^>]*>([\s\S]*?)<\/td>/gi).map(([, cell]) =>
        cleanText(cell ?? ''),
      );
      const date = cells.find(cell => /[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(cell)) ?? '';

      if (!idx || !title) {
        return null;
      }

      const item: NoticeItem = {
        id: `${actionCode}-${idx}`,
        title,
        date: normalizeDate(date),
        body: '',
        attachments: [],
        isPinned,
        sourceUrl: `${DIRECT_BASE}/Home/BBSView.mbz?action=${actionCode}&schIdx=${idx}`,
        sourceName: '호서대학교 생활관',
        actionCode,
      };

      return item;
    })
    .filter(isNotNull);
}

function parseHappyNoticeList(html: string) {
  const listBlock = matchFirst(html, /<ul class="lineList-ul">([\s\S]*?)<\/ul>/i);
  if (!listBlock) {
    return [];
  }

  return matchAll(listBlock, /<li[\s\S]*?<\/li>/gi)
    .map(match => {
      const itemHtml = match[0];
      const href = matchFirst(itemHtml, /href="([^"]*\/board\/notice\/view\?idx=\d+[^"]*)"/i);
      const title = cleanText(
        matchFirst(itemHtml, /<a class="tit-link"[\s\S]*?>([\s\S]*?)<\/a>/i),
      );
      const date = normalizeDate(
        matchFirst(itemHtml, /<span class="date">[\s\S]*?([0-9]{4}-[0-9]{2}-[0-9]{2})/i),
      );
      const idx = getQueryParam(href ?? '', 'idx');

      if (!href || !title || !idx) {
        return null;
      }

      const item: NoticeItem = {
        id: idx,
        title,
        date,
        body: '',
        attachments: [],
        isPinned: /<span class="num">공지<\/span>/i.test(itemHtml),
        sourceUrl: absoluteUrl(HAPPY_BASE, href),
        sourceName: '호서대학교 행복기숙사',
      };

      return item;
    })
    .filter(isNotNull);
}

function extractHappyNoticeLastPage(html: string) {
  const pageLinks = matchAll(
    html,
    /href="([^"]*\/board\/notice\/list\?[^"]*page=(\d+)[^"]*)"/gi,
  );
  const pageNumbers = pageLinks
    .map(([, , page]) => Number(page))
    .filter(page => Number.isFinite(page) && page > 0);

  if (pageNumbers.length === 0) {
    return 1;
  }

  return Math.max(1, ...pageNumbers);
}

function parseDirectNoticePreviewFromMain(
  html: string,
  actionCode: string,
) {
  const actionPattern = escapeRegExp(actionCode);
  const anchorRegex = new RegExp(
    `<a href="([^"]*\\/Home\\/BBSView\\.mbz\\?action=${actionPattern}(?:&|&amp;)schIdx=(\\d+)[^"]*)"[\\s\\S]*?>[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>[\\s\\S]*?<span>([\\s\\S]*?)<\\/span>[\\s\\S]*?<\\/a>`,
    'gi',
  );

  return matchAll(html, anchorRegex)
    .map(match => {
      const href = decodeHtmlEntities(match[1] ?? '');
      const idx = match[2] ?? '';
      const title = cleanText(match[3] ?? '');
      const date = normalizeDate(cleanText(match[4] ?? ''));

      if (!href || !idx || !title) {
        return null;
      }

      const item: NoticeItem = {
        id: `${actionCode}-${idx}`,
        title,
        date,
        body: '',
        attachments: [],
        isPinned: false,
        sourceUrl: absoluteUrl(DIRECT_BASE, href),
        sourceName: '호서대학교 생활관',
        actionCode,
      };

      return item;
    })
    .filter(isNotNull);
}

function waitFor(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

function isDirectErrorPage(html: string) {
  return /Exception\s*오류/i.test(html);
}

async function fetchDirectMealFromBoard(): Promise<MealItem | null> {
  const boardUrl = `${DIRECT_BASE}/Home/BBSList.mbz?action=${DIRECT_MEAL_ACTION}`;
  const listHtml = await fetchTextWithHeaders(boardUrl, DIRECT_HEADERS);

  const mealPost = findLatestAsanMealPost(listHtml);
  if (!mealPost) {
    return null;
  }

  const detailUrl = `${DIRECT_BASE}/Home/BBSView.mbz?action=${DIRECT_MEAL_ACTION}&schIdx=${mealPost.id}`;
  const detailHtml = await fetchTextWithHeaders(detailUrl, DIRECT_HEADERS);

  const detailTitle = cleanText(matchFirst(detailHtml, /<h5 class="ui-title">([\s\S]*?)<\/h5>/i));
  const detailDate = normalizeDate(
    matchFirst(detailHtml, /<strong>\s*등록일자\s*<\/strong>\s*([0-9-]{10})/i),
  );

  const boardContent = matchFirst(
    detailHtml,
    /<div id="board_item_list">([\s\S]*?)<\/div>\s*<div class="txt-right">/i,
  );
  const bodyImagePath = matchFirst(boardContent ?? '', /<img[^>]*src="([^"]+)"/i);
  const attachmentImagePath = extractAttachmentLinks(boardContent ?? '', DIRECT_BASE).find(
    candidate => isLikelyImageUrl(candidate),
  );
  const imagePath = bodyImagePath ?? attachmentImagePath;

  if (!imagePath) {
    return null;
  }

  const resolvedImageUri = await resolveDirectMealImageUri(
    absoluteUrl(DIRECT_BASE, decodeHtmlEntities(imagePath)),
  );

  return {
    title: detailTitle || mealPost.title || '아산 직영기숙사 식단표',
    description: '식단 이미지를 확대해서 볼 수 있습니다.',
    updatedAt: detailDate || mealPost.date,
    imageUri: resolvedImageUri,
    sourceUrl: detailUrl,
  };
}

function findLatestAsanMealPost(html: string) {
  const anchorMatches = matchAll(
    html,
    /<a href="javascript:fn_viewData\('(\d+)'\);">([\s\S]*?)<\/a>/gi,
  );

  for (const match of anchorMatches) {
    const id = match[1];
    const title = cleanText(match[2] ?? '');
    if (!id || !title) {
      continue;
    }

    const isMealTitle = /식단표/.test(title);
    const isAsanTitle = /아산|직영/.test(title);
    const isCheonanOnly = /천안/.test(title) && !isAsanTitle;
    if (!isMealTitle || !isAsanTitle || isCheonanOnly) {
      continue;
    }

    const datePattern = new RegExp(
      `fn_viewData\\('${id}'\\);">[\\s\\S]*?<td class="txt-center pc_view">([0-9-]{10})<\\/td>`,
      'i',
    );
    const date = normalizeDate(matchFirst(html, datePattern));

    return { id, title, date };
  }

  return null;
}

async function resolveDirectMealImageUri(imageUri: string): Promise<string> {
  if (!isDirectThumbnailPrintImageUrl(imageUri)) {
    return imageUri;
  }

  const dataUri = await fetchDirectThumbnailAsDataUri(imageUri);
  return dataUri ?? imageUri;
}

function isDirectThumbnailPrintImageUrl(value: string) {
  if (!value) {
    return false;
  }

  return DIRECT_THUMBNAIL_PRINT_PATH_PATTERN.test(value);
}

async function fetchDirectThumbnailAsDataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: DIRECT_HEADERS });
    if ('ok' in response && response.ok === false) {
      return null;
    }

    if (typeof response.arrayBuffer !== 'function') {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length === 0) {
      return null;
    }

    const base64 = encodeBytesToBase64(bytes);
    if (!base64) {
      return null;
    }

    const mimeType = resolveImageMimeType(
      bytes,
      typeof response.headers?.get === 'function' ? response.headers.get('Content-Type') : null,
      url,
    );

    return `data:${mimeType};base64,${base64}`;
  } catch {
    return null;
  }
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
      // Fall through to btoa.
    }
  }

  if (typeof globalThis.btoa !== 'function') {
    return null;
  }

  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    let chunkBinary = '';
    for (let cursor = 0; cursor < chunk.length; cursor += 1) {
      chunkBinary += String.fromCharCode(chunk[cursor]);
    }
    binary += chunkBinary;
  }

  try {
    return globalThis.btoa(binary);
  } catch {
    return null;
  }
}

function resolveImageMimeType(
  bytes: Uint8Array,
  contentType: string | null,
  imageUrl: string,
) {
  const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (normalizedContentType.startsWith('image/')) {
    return normalizedContentType;
  }

  if (bytes.length >= 4) {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return 'image/png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      return 'image/gif';
    }
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

  const lowerUrl = imageUrl.toLowerCase();
  if (/\.png(?:[?#].*)?$/i.test(lowerUrl)) {
    return 'image/png';
  }
  if (/\.(?:jpe?g)(?:[?#].*)?$/i.test(lowerUrl)) {
    return 'image/jpeg';
  }
  if (/\.gif(?:[?#].*)?$/i.test(lowerUrl)) {
    return 'image/gif';
  }
  if (/\.webp(?:[?#].*)?$/i.test(lowerUrl)) {
    return 'image/webp';
  }

  return 'image/jpeg';
}

function isHappyNoticeDetailUrl(url: string) {
  return /\/board\/notice\/view\?/i.test(url);
}

function isDirectNoticeDetailUrl(url: string) {
  return /\/Home\/BBSView\.mbz\?/i.test(url) && /[?&]schIdx=\d+/i.test(url);
}

function extractDivByClass(html: string, className: string) {
  const classPattern = escapeRegExp(className);
  const openTagRegex = new RegExp(
    `<div[^>]*class=(["'])[^"'<>]*\\b${classPattern}\\b[^"'<>]*\\1[^>]*>`,
    'i',
  );
  const openMatch = openTagRegex.exec(html);
  if (!openMatch) {
    return null;
  }

  const contentStart = (openMatch.index ?? 0) + openMatch[0].length;
  const divTagRegex = /<\/?div\b[^>]*>/gi;
  divTagRegex.lastIndex = contentStart;

  let depth = 1;
  while (depth > 0) {
    const tagMatch = divTagRegex.exec(html);
    if (!tagMatch) {
      return null;
    }

    if (tagMatch[0].startsWith('</')) {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(contentStart, tagMatch.index);
    }
  }

  return null;
}

function extractDivById(html: string, id: string) {
  const idPattern = escapeRegExp(id);
  const openTagRegex = new RegExp(`<div[^>]*id=(["'])${idPattern}\\1[^>]*>`, 'i');
  const openMatch = openTagRegex.exec(html);
  if (!openMatch) {
    return null;
  }

  const contentStart = (openMatch.index ?? 0) + openMatch[0].length;
  const divTagRegex = /<\/?div\b[^>]*>/gi;
  divTagRegex.lastIndex = contentStart;

  let depth = 1;
  while (depth > 0) {
    const tagMatch = divTagRegex.exec(html);
    if (!tagMatch) {
      return null;
    }

    if (tagMatch[0].startsWith('</')) {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(contentStart, tagMatch.index);
    }
  }

  return null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchTextWithHeaders(
  url: string,
  headers: Record<string, string>,
): Promise<string> {
  const response = await fetch(url, { headers });
  return response.text();
}

function extractImageUrlsFromHtml(html: string, base: string) {
  const imageUrls = matchAll(html, /<img[^>]*src=(['"])([^'"]+)\1/gi)
    .map(([, , src]) =>
      src ? absoluteUrl(base, decodeHtmlEntities(src)) : '',
    )
    .filter(Boolean);

  return uniqueStrings(imageUrls);
}

function extractAttachmentLinks(html: string, base: string) {
  const urlAttachments = matchAll(
    html,
    /<a\b[^>]*\bhref=(['"])([^'"]+)\1[^>]*>/gi,
  )
    .map(([, , href]) => decodeHtmlEntities(href ?? '').trim())
    .filter(Boolean)
    .filter(href => {
      if (/^(?:javascript:|mailto:|tel:|#)/i.test(href)) {
        return false;
      }

      const normalizedHref = href.toLowerCase();
      return (
        /filedownload|file\/download(?:\.do)?|download\.do\b|api\/file/i.test(normalizedHref) ||
        /\.(?:pdf|hwpx?|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|png|jpe?g|gif|bmp|webp|svg)(?:[?#].*)?$/i.test(
          normalizedHref,
        )
      );
    })
    .map(href => absoluteUrl(base, href));

  const jsFallbackAttachments = matchAll(
    html,
    /<a\b[^>]*\bhref=(['"])\s*javascript:[\s\S]*?\1[^>]*>([\s\S]*?)<\/a>/gi,
  )
    .map(([, , label]) => cleanText(label ?? ''))
    .filter(label =>
      Boolean(
        label &&
          (/\.(?:pdf|hwpx?|docx?|xlsx?|pptx?|zip|rar|7z|txt|csv|png|jpe?g|gif|bmp|webp|svg)\b/i.test(
            label,
          ) ||
            /(첨부|다운로드)/i.test(label)),
      ),
    );

  return uniqueStrings([...urlAttachments, ...jsFallbackAttachments]);
}

function isLikelyImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (/\.(png|jpe?g|gif|bmp|webp|svg)(?:[?#].*)?$/i.test(lower)) {
    return true;
  }

  return /thumbnailprint\.do|imgdownload|\/api\/image\//i.test(lower);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function absoluteUrl(base: string, value: string) {
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

function matchFirst(text: string, regex: RegExp) {
  const match = regex.exec(text);
  return match?.[1]?.trim() ?? null;
}

function matchAll(text: string, regex: RegExp) {
  return Array.from(text.matchAll(regex));
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

function cleanText(text: string | null) {
  if (!text) {
    return '';
  }

  return decodeHtmlEntities(
    text
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function stripHtml(text: string) {
  return decodeHtmlEntities(
    text
      .replace(
        /<(p|div)[^>]*>\s*(?:&nbsp;|\u00a0|\s|<br\s*\/?>)*<\/\1>/gi,
        '\n',
      )
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|tr|h[1-6])>/gi, '\n')
      .replace(/<li>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
}

function normalizeDate(value: string | null) {
  if (!value) {
    return '';
  }

  return value.replace(/-/g, '.');
}

function getQueryParam(href: string, key: string) {
  const query = href.split('?')[1] ?? '';
  const params = new URLSearchParams(query.replace(/&amp;/g, '&'));
  return params.get(key);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'");
}
