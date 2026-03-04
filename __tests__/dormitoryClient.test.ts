import { fetchDormitoryContent, fetchNoticeDetail } from '../src/services/dormitoryClient';
import type { NoticeItem } from '../src/domain';

describe('fetchNoticeDetail', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('keeps original notice for direct dormitory when source url is not detail page', async () => {
    const notice: NoticeItem = {
      id: 'direct-fallback-1',
      title: '직영 공지',
      date: '2026.03.01',
      body: '기존 본문 유지',
      attachments: [],
      sourceUrl: 'https://hoseoin.hoseo.ac.kr/Home/BBSList.mbz?action=MAPP_2104261724',
      sourceName: '호서대학교 생활관',
      actionCode: 'MAPP_2104261724',
    };

    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_DIRECT', notice);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.body).toBe('기존 본문 유지');
    expect(result).toEqual(notice);
  });

  test('extracts happy dormitory body text even when trailing marker is missing', async () => {
    const notice: NoticeItem = {
      id: '729',
      title: '원본 제목',
      date: '2026.01.01',
      body: '',
      attachments: [],
      sourceUrl: 'https://happydorm.hoseo.ac.kr/board/notice/view?idx=729&category=',
      sourceName: '호서대학교 행복기숙사',
    };

    const html = `
      <div class="board-top-tit">테스트 제목<ul class="board-top-info"></ul></div>
      <div class="board-content">
        <p>첫 번째 문장</p>
        <p>두 번째 문장</p>
        <figure class="image"><img src="/api/image/test.png" /></figure>
      </div>
      <section class="something-else"></section>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_HAPPY', notice);

    expect(result.title).toBe('테스트 제목');
    expect(result.body).toContain('첫 번째 문장');
    expect(result.body).toContain('두 번째 문장');
    expect(result.contentImages).toEqual(['https://happydorm.hoseo.ac.kr/api/image/test.png']);
  });

  test('normalizes excessive blank lines in happy dormitory notice body', async () => {
    const notice: NoticeItem = {
      id: '730',
      title: '원본 제목',
      date: '2026.01.01',
      body: '',
      attachments: [],
      sourceUrl: 'https://happydorm.hoseo.ac.kr/board/notice/view?idx=730&category=',
      sourceName: '호서대학교 행복기숙사',
    };

    const html = `
      <div class="board-top-tit">테스트 제목<ul class="board-top-info"></ul></div>
      <div class="board-content">
        <p>첫 줄</p>
        <p>&nbsp;</p>
        <div>&nbsp;</div>
        <p>둘째 줄<br /><br />셋째 줄</p>
      </div>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_HAPPY', notice);

    expect(result.body).toContain('첫 줄');
    expect(result.body).toContain('둘째 줄');
    expect(result.body).toContain('셋째 줄');
    expect(result.body).not.toMatch(/\n{3,}/);
  });

  test('keeps original body when direct detail parser cannot find content block', async () => {
    const notice: NoticeItem = {
      id: 'MAPP_2104261724-101',
      title: '직영 공지',
      date: '2026.03.01',
      body: '기존 직영 본문',
      attachments: [],
      sourceUrl: 'https://hoseoin.hoseo.ac.kr/Home/BBSView.mbz?action=MAPP_2104261724&schIdx=101',
      sourceName: '호서대학교 생활관',
      actionCode: 'MAPP_2104261724',
    };

    const html = `
      <div class="ui-bd-tit"><h3>직영 상세 제목</h3></div>
      <div class="other-content">본문 파싱 영역 없음</div>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_DIRECT', notice);

    expect(result.title).toBe('직영 상세 제목');
    expect(result.body).toBe('기존 직영 본문');
  });

  test('extracts direct dormitory body text from board_item_list markup', async () => {
    const notice: NoticeItem = {
      id: 'MAPP_2104261724-84555',
      title: '목록 제목',
      date: '2024.11.02',
      body: '',
      attachments: [],
      sourceUrl: 'https://hoseoin.hoseo.ac.kr/Home/BBSView.mbz?action=MAPP_2104261724&schIdx=84555',
      sourceName: '호서대학교 생활관',
      actionCode: 'MAPP_2104261724',
    };

    const html = `
      <div id="ui-print-view" class="ui-view">
        <h5 class="ui-title">HOSEO VILLAGE TOUR(기숙사 투어 프로그램)</h5>
        <p class="date"><strong>등록일자</strong> 2024-11-02</p>
        <div id="board_item_list">
          <dl class="both">
            <dt class="no-print">내용</dt>
            <dd>
              <p><img src="/ThumbnailPrint.do?dir=editor&amp;savename=a&amp;realname=a" /></p>
              <p>* 기숙사 투어 신청 문의: 041-540-9802 (9:00~17:00)</p>
              <p>* 위 내용은 변동될 수 있습니다.</p>
            </dd>
          </dl>
        </div>
      </div>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_DIRECT', notice);

    expect(result.title).toBe('HOSEO VILLAGE TOUR(기숙사 투어 프로그램)');
    expect(result.date).toBe('2024.11.02');
    expect(result.body).toContain('기숙사 투어 신청 문의');
    expect(result.body).toContain('위 내용은 변동될 수 있습니다');
    expect(result.contentImages).toEqual([
      'https://hoseoin.hoseo.ac.kr/ThumbnailPrint.do?dir=editor&savename=a&realname=a',
    ]);
  });

  test('extracts happy dormitory attachments with single-quoted href and nested markup', async () => {
    const notice: NoticeItem = {
      id: '741',
      title: '행복 공지',
      date: '2026.03.02',
      body: '',
      attachments: [],
      sourceUrl: 'https://happydorm.hoseo.ac.kr/board/notice/view?idx=741&category=',
      sourceName: '호서대학교 행복기숙사',
    };

    const html = `
      <div class="board-top-tit">행복 상세 제목<ul class="board-top-info"></ul></div>
      <div class="board-content"><p>본문입니다.</p></div>
      <div class="board-file">
        <a class="download" href='/api/filedownload?hash=abc123&amp;idx=12'><span>공지사항_안내.pdf</span></a>
      </div>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_HAPPY', notice);

    expect(result.attachments).toEqual([
      'https://happydorm.hoseo.ac.kr/api/filedownload?hash=abc123&idx=12',
    ]);
  });

  test('extracts direct dormitory attachments with single-quoted href and keeps javascript fallback label', async () => {
    const notice: NoticeItem = {
      id: 'MAPP_2104261724-95504',
      title: '직영 공지',
      date: '2026.03.02',
      body: '',
      attachments: [],
      sourceUrl: 'https://hoseoin.hoseo.ac.kr/Home/BBSView.mbz?action=MAPP_2104261724&schIdx=95504',
      sourceName: '호서대학교 생활관',
      actionCode: 'MAPP_2104261724',
    };

    const html = `
      <div class="ui-bd-tit"><h3>직영 상세 제목</h3></div>
      <div id="board_item_list"><dl><dd><p>본문입니다.</p></dd></dl></div>
      <div class="file-area">
        <a href='/Home/File/Download.do?fileSeq=22&amp;atchFileId=88'><span>신청서.hwp</span></a>
        <a href="javascript:fn_fileDown('77');"><span>첨부파일 다운로드</span></a>
      </div>
    `;

    global.fetch = jest.fn(async () => ({
      text: async () => html,
    })) as unknown as typeof fetch;

    const result = await fetchNoticeDetail('ASAN_DIRECT', notice);

    expect(result.attachments).toEqual([
      'https://hoseoin.hoseo.ac.kr/Home/File/Download.do?fileSeq=22&atchFileId=88',
      '첨부파일 다운로드',
    ]);
  });
});

describe('fetchDormitoryContent', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test('uses main-page preview notices for ASAN_DIRECT when BBS list pages return exception markup', async () => {
    const exceptionHtml = '<h2>Exception 오류</h2><div class="ui-box error"></div>';
    const mainHtml = `
      <div class="noti-box r-noti">
        <ul>
          <li>
            <a href="/Home/BBSView.mbz?action=MAPP_2104261723&amp;schIdx=95616">
              <p>2026학년도 1학기 룸메이트 및 방배정 명단</p>
              <span>2026.02.24</span>
            </a>
          </li>
        </ul>
      </div>
      <div class="noti-box g-noti">
        <ul>
          <li>
            <a href="/Home/BBSView.mbz?action=MAPP_2104261724&amp;schIdx=95504">
              <p>생활관 부사감(대학원 근로장학생) 모집 안내</p>
              <span>2026.02.10</span>
            </a>
          </li>
        </ul>
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723')) {
        return { text: async () => exceptionHtml } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724')) {
        return { text: async () => exceptionHtml } as Response;
      }
      if (url.includes('/Home/Main.mbz')) {
        return { text: async () => mainHtml } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids).toContain('MAPP_2104261723-95616');
    expect(ids).toContain('MAPP_2104261724-95504');
    expect(result.notices[0].title).toBe('2026학년도 1학기 룸메이트 및 방배정 명단');
    expect(result.notices[0].actionCode).toBe('MAPP_2104261723');
  });

  test('fetches paginated ASAN_DIRECT board notices beyond the first list page', async () => {
    const buildListHtml = (rows: Array<{ idx: string; title: string; date: string }>, lastPage: number, pageIndex: number) => `
      <table>
        <tbody>
          ${rows
            .map(
              row => `
                <tr>
                  <td>번호</td>
                  <td><a href="javascript:fn_viewData('${row.idx}');">${row.title}</a></td>
                  <td>생활관</td>
                  <td>${row.date}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
      <div class="txt-center pageNavi">
        <a href="#" onclick="fn_postPage(1); return false;">[처음]</a>
        <a href="#" onclick="fn_postPage(${lastPage}); return false;">[마지막]</a>
        <input id="pageIndex" name="pageIndex" type="hidden" value="${pageIndex}" />
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '1001', title: '입관 공지 1', date: '2026-03-02' }],
              2,
              1,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=2')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '1002', title: '입관 공지 2', date: '2026-03-01' }],
              2,
              2,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '2001', title: '일반 공지 1', date: '2026-02-28' }],
              2,
              1,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=2')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '2002', title: '일반 공지 2', date: '2026-02-27' }],
              2,
              2,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'MAPP_2104261723-1001',
        'MAPP_2104261723-1002',
        'MAPP_2104261724-2001',
        'MAPP_2104261724-2002',
      ]),
    );
    expect(ids.length).toBe(4);
  });

  test('marks ASAN_DIRECT pinned notices only when row has board_new class', async () => {
    const buildListHtml = (
      rows: Array<{ idx: string; title: string; date: string; pinned?: boolean }>,
    ) => `
      <table>
        <tbody>
          ${rows
            .map(
              row => `
                <tr ${row.pinned ? 'class="board_new"' : ''}>
                  <td>번호</td>
                  <td><a href="javascript:fn_viewData('${row.idx}');">${row.title}</a></td>
                  <td>생활관</td>
                  <td>${row.date}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml([
              { idx: '3101', title: '입관 고정 공지', date: '2026-03-02', pinned: true },
              { idx: '3102', title: '입관 일반 공지', date: '2026-03-01' },
            ]),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=2')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml([
              { idx: '3201', title: '일반 고정 공지', date: '2026-02-28', pinned: true },
              { idx: '3202', title: '일반 일반 공지', date: '2026-02-27' },
            ]),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=2')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const pinnedMap = new Map(result.notices.map(item => [item.id, item.isPinned]));

    expect(pinnedMap.get('MAPP_2104261723-3101')).toBe(true);
    expect(pinnedMap.get('MAPP_2104261723-3102')).toBe(false);
    expect(pinnedMap.get('MAPP_2104261724-3201')).toBe(true);
    expect(pinnedMap.get('MAPP_2104261724-3202')).toBe(false);
  });

  test('sorts ASAN_DIRECT pinned notices before newer non-pinned notices', async () => {
    const buildListHtml = (
      rows: Array<{ idx: string; title: string; date: string; pinned?: boolean }>,
    ) => `
      <table>
        <tbody>
          ${rows
            .map(
              row => `
                <tr ${row.pinned ? 'class="board_new"' : ''}>
                  <td>번호</td>
                  <td><a href="javascript:fn_viewData('${row.idx}');">${row.title}</a></td>
                  <td>생활관</td>
                  <td>${row.date}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml([
              { idx: '4101', title: '입관 고정(오래된 날짜)', date: '2024-01-01', pinned: true },
              { idx: '4102', title: '입관 일반(최신 날짜)', date: '2026-03-02' },
            ]),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=2')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml([
              { idx: '4201', title: '일반 고정(오래된 날짜)', date: '2024-02-01', pinned: true },
              { idx: '4202', title: '일반 일반(최신 날짜)', date: '2026-03-01' },
            ]),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=2')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids.slice(0, 2)).toEqual(
      expect.arrayContaining(['MAPP_2104261723-4101', 'MAPP_2104261724-4201']),
    );
  });

  test('continues probing ASAN_DIRECT pages even when first-page pagination max is low', async () => {
    const buildListHtml = (
      rows: Array<{ idx: string; title: string; date: string }>,
      lastPage: number,
      pageIndex: number,
    ) => `
      <table>
        <tbody>
          ${rows
            .map(
              row => `
                <tr>
                  <td>번호</td>
                  <td><a href="javascript:fn_viewData('${row.idx}');">${row.title}</a></td>
                  <td>생활관</td>
                  <td>${row.date}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
      <div class="txt-center pageNavi">
        <a href="#" onclick="fn_postPage(1); return false;">[처음]</a>
        <a href="#" onclick="fn_postPage(${lastPage}); return false;">[마지막]</a>
        <input id="pageIndex" name="pageIndex" type="hidden" value="${pageIndex}" />
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '1101', title: '입관 공지 1', date: '2026-03-02' }],
              2,
              1,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=2')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '1102', title: '입관 공지 2', date: '2026-03-01' }],
              2,
              2,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=3')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '1103', title: '입관 공지 3', date: '2026-02-28' }],
              2,
              3,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=4')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'MAPP_2104261723-1101',
        'MAPP_2104261723-1102',
        'MAPP_2104261723-1103',
      ]),
    );
  });

  test('parses ASAN_DIRECT notice rows when list markup omits closing tr tags', async () => {
    const malformedListHtml = `
      <table>
        <tbody>
          <tr>
            <td>번호</td>
            <td><a href="javascript:fn_viewData('95111');">직영 공지 A</a></td>
            <td>생활관</td>
            <td>2026-03-02</td>
          <tr>
            <td>번호</td>
            <td><a href="javascript:fn_viewData('95110');">직영 공지 B</a></td>
            <td>생활관</td>
            <td>2026-03-01</td>
        </tbody>
      </table>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return { text: async () => malformedListHtml } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=2')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(
      expect.arrayContaining(['MAPP_2104261723-95111', 'MAPP_2104261723-95110']),
    );
  });

  test('keeps ASAN_DIRECT notices from one board when the other board list fails', async () => {
    const exceptionHtml = '<h2>Exception 오류</h2><div class="ui-box error"></div>';
    const buildListHtml = (
      rows: Array<{ idx: string; title: string; date: string }>,
      pageIndex: number,
    ) => `
      <table>
        <tbody>
          ${rows
            .map(
              row => `
                <tr>
                  <td>번호</td>
                  <td><a href="javascript:fn_viewData('${row.idx}');">${row.title}</a></td>
                  <td>생활관</td>
                  <td>${row.date}</td>
                </tr>
              `,
            )
            .join('')}
        </tbody>
      </table>
      <div class="txt-center pageNavi">
        <a href="#" onclick="fn_postPage(1); return false;">[처음]</a>
        <input id="pageIndex" name="pageIndex" type="hidden" value="${pageIndex}" />
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723&pageIndex=1')) {
        return { text: async () => exceptionHtml } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=1')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '301', title: '일반 공지 A', date: '2026-03-02' }],
              1,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=2')) {
        return {
          text: async () =>
            buildListHtml(
              [{ idx: '300', title: '일반 공지 B', date: '2026-03-01' }],
              2,
            ),
        } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724&pageIndex=3')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(expect.arrayContaining(['MAPP_2104261724-301', 'MAPP_2104261724-300']));
    expect(ids).not.toContain('MAPP_2104261723-1001');
  });

  test('converts ASAN_DIRECT ThumbnailPrint meal image url into data uri', async () => {
    const mealListHtml = `
      <table>
        <tbody>
          <tr>
            <td class="txt-center">1</td>
            <td><a href="javascript:fn_viewData('94690');">[아산] 생활관 식단표입니다.</a></td>
            <td class="txt-center pc_view">2026-03-02</td>
          </tr>
        </tbody>
      </table>
    `;
    const mealDetailHtml = `
      <div id="board_item_list">
        <p><img src="/ThumbnailPrint.do?dir=editor&amp;savename=test123&amp;realname=test123" /></p>
      </div>
      <div class="txt-right"></div>
    `;
    const pngBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d,
    ]);

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('BBSList.mbz?action=MAPP_2104261723')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261724')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url.includes('BBSList.mbz?action=MAPP_2104261729')) {
        return { text: async () => mealListHtml } as Response;
      }
      if (url.includes('BBSView.mbz?action=MAPP_2104261729&schIdx=94690')) {
        return { text: async () => mealDetailHtml } as Response;
      }
      if (url.includes('/ThumbnailPrint.do?')) {
        return {
          ok: true,
          arrayBuffer: async () => pngBytes.buffer,
          headers: {
            get: () => null,
          },
        } as unknown as Response;
      }
      if (url.includes('RestaurantMenuView.mbz')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_DIRECT');

    expect(result.meal?.sourceUrl).toContain('MAPP_2104261729');
    expect(result.meal?.imageUri.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('fetches paginated ASAN_HAPPY notices beyond the first list page', async () => {
    const buildHappyListHtml = (
      rows: Array<{ idx: string; title: string; date: string; pinned?: boolean }>,
      pages: number[],
    ) => `
      <div class="table-notice mb-4">
        <ul class="lineList-ul">
          ${rows
            .map(
              row => `
                <li>
                  <span class="num">${row.pinned ? '공지' : row.idx}</span>
                  <div class="tit-txt text-left">
                    <a class="tit-link" href="/board/notice/view?idx=${row.idx}&category=">${row.title}</a>
                  </div>
                  <div class="tit-info">
                    <span class="date"><i class="icofont-calendar"></i>${row.date}</span>
                  </div>
                </li>
              `,
            )
            .join('')}
        </ul>
      </div>
      <nav class="pageArea">
        <ul class="pagination">
          ${pages
            .map(
              page => `
                <li class="page-item">
                  <a class="page-link" href="/board/notice/list?page=${page}&perPageNum=16&contest_idx=0&sort_id=idx">${page}</a>
                </li>
              `,
            )
            .join('')}
        </ul>
      </nav>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/board/notice/list?page=1')) {
        return {
          text: async () =>
            buildHappyListHtml(
              [{ idx: '901', title: '행복 공지 1', date: '2026-03-02', pinned: true }],
              [1, 2],
            ),
        } as Response;
      }
      if (url.includes('/board/notice/list?page=2')) {
        return {
          text: async () =>
            buildHappyListHtml(
              [{ idx: '900', title: '행복 공지 2', date: '2026-03-01' }],
              [1, 2],
            ),
        } as Response;
      }
      if (url.includes('/board/nutrition/list')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_HAPPY');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(expect.arrayContaining(['901', '900']));
    expect(ids.length).toBe(2);
  });

  test('sorts ASAN_HAPPY pinned notices before newer non-pinned notices', async () => {
    const buildHappyListHtml = (rows: Array<{ idx: string; title: string; date: string; pinned?: boolean }>) => `
      <div class="table-notice mb-4">
        <ul class="lineList-ul">
          ${rows
            .map(
              row => `
                <li>
                  <span class="num">${row.pinned ? '공지' : row.idx}</span>
                  <div class="tit-txt text-left">
                    <a class="tit-link" href="/board/notice/view?idx=${row.idx}&category=">${row.title}</a>
                  </div>
                  <div class="tit-info">
                    <span class="date"><i class="icofont-calendar"></i>${row.date}</span>
                  </div>
                </li>
              `,
            )
            .join('')}
        </ul>
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/board/notice/list?page=1')) {
        return {
          text: async () =>
            buildHappyListHtml([
              { idx: '930', title: '행복 고정(오래된 날짜)', date: '2024-01-01', pinned: true },
              { idx: '931', title: '행복 일반(최신 날짜)', date: '2026-03-02' },
            ]),
        } as Response;
      }
      if (url.includes('/board/notice/list?page=2')) {
        return { text: async () => buildHappyListHtml([]) } as Response;
      }
      if (url.includes('/board/nutrition/list')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_HAPPY');
    const ids = result.notices.map(item => item.id);

    expect(ids[0]).toBe('930');
    expect(ids).toEqual(expect.arrayContaining(['930', '931']));
  });

  test('scans additional ASAN_HAPPY pages when pagination links are missing on page 1', async () => {
    const buildHappyListHtml = (rows: Array<{ idx: string; title: string; date: string }>) => `
      <div class="table-notice mb-4">
        <ul class="lineList-ul">
          ${rows
            .map(
              row => `
                <li>
                  <span class="num">${row.idx}</span>
                  <div class="tit-txt text-left">
                    <a class="tit-link" href="/board/notice/view?idx=${row.idx}&category=">${row.title}</a>
                  </div>
                  <div class="tit-info">
                    <span class="date"><i class="icofont-calendar"></i>${row.date}</span>
                  </div>
                </li>
              `,
            )
            .join('')}
        </ul>
      </div>
    `;

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/board/notice/list?page=1')) {
        return {
          text: async () =>
            buildHappyListHtml([
              { idx: '911', title: '행복 공지 A', date: '2026-03-02' },
            ]),
        } as Response;
      }
      if (url.includes('/board/notice/list?page=2')) {
        return {
          text: async () =>
            buildHappyListHtml([
              { idx: '910', title: '행복 공지 B', date: '2026-03-01' },
            ]),
        } as Response;
      }
      if (url.includes('/board/notice/list?page=3')) {
        return {
          text: async () => buildHappyListHtml([]),
        } as Response;
      }
      if (url.includes('/board/nutrition/list')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    }) as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_HAPPY');
    const ids = result.notices.map(item => item.id);

    expect(ids).toEqual(expect.arrayContaining(['911', '910']));
    expect(ids.length).toBe(2);
  });

  test('prefers ASAN_HAPPY meal image from main page before nutrition fallback', async () => {
    const mainHtml = `
      <div class="content notice-slide">
        <h4 style="cursor: pointer;" onclick="location.href='/board/notice/list';">식단표<span>+</span></h4>
        <div style="text-align: center">
          <a href="https://happydorm.hoseo.ac.kr/board/nutrition/view?idx=745&amp;category=">
            <img src="/filedownload?hash=main-meal-hash&amp;size=medium" alt="식단표" title="식단표" />
          </a>
        </div>
      </div>
    `;

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/board/notice/list?page=1')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url === 'https://happydorm.hoseo.ac.kr' || url === 'https://happydorm.hoseo.ac.kr/') {
        return { text: async () => mainHtml } as Response;
      }
      if (url.includes('/board/nutrition/list')) {
        return { text: async () => '<html></html>' } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_HAPPY');
    const requestedUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input.toString(),
    );

    expect(result.meal?.imageUri).toBe(
      'https://happydorm.hoseo.ac.kr/filedownload?hash=main-meal-hash&size=medium',
    );
    expect(result.meal?.sourceUrl).toBe(
      'https://happydorm.hoseo.ac.kr/board/nutrition/view?idx=745&category=',
    );
    expect(requestedUrls.some(url => url.includes('/board/nutrition/list'))).toBe(false);
  });

  test('falls back to ASAN_HAPPY nutrition detail meal when main page meal block is missing', async () => {
    const nutritionListHtml = `
      <div class="table-notice">
        <a href="/board/nutrition/view?idx=744&amp;category=">최신 식단</a>
      </div>
    `;
    const nutritionDetailHtml = `
      <div class="board-top-tit">행복 식단 상세<ul class="board-top-info"></ul></div>
      <span class="date"><i class="icofont-calendar"></i>2026-03-03</span>
      <div class="board-content">
        <img src="/filedownload?hash=fallback-meal-hash" />
      </div>
    `;

    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/board/notice/list?page=1')) {
        return { text: async () => '<html></html>' } as Response;
      }
      if (url === 'https://happydorm.hoseo.ac.kr' || url === 'https://happydorm.hoseo.ac.kr/') {
        return { text: async () => '<html><div>메인 식단 없음</div></html>' } as Response;
      }
      if (url.includes('/board/nutrition/list')) {
        return { text: async () => nutritionListHtml } as Response;
      }
      if (url.includes('/board/nutrition/view?idx=744')) {
        return { text: async () => nutritionDetailHtml } as Response;
      }
      return { text: async () => '<html></html>' } as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchDormitoryContent('ASAN_HAPPY');
    const requestedUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input.toString(),
    );

    expect(result.meal?.title).toBe('행복 식단 상세');
    expect(result.meal?.updatedAt).toBe('2026.03.03');
    expect(result.meal?.imageUri).toBe('https://happydorm.hoseo.ac.kr/filedownload?hash=fallback-meal-hash');
    expect(result.meal?.sourceUrl).toBe('https://happydorm.hoseo.ac.kr/board/nutrition/view?idx=744&category=');
    expect(requestedUrls.some(url => url.includes('/board/nutrition/list'))).toBe(true);
  });
});
