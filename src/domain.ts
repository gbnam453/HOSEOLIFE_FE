export type DormitoryCode =
  | 'ASAN_HAPPY'
  | 'ASAN_DIRECT'
  | 'CHEONAN_HAPPY'
  | 'CHEONAN_DIRECT'
  | 'UNDECIDED';

export type DormitoryStatus = 'ACTIVE' | 'COMING_SOON' | 'UNDECIDED';

export interface DormitoryOption {
  code: DormitoryCode;
  label: string;
  campus: string;
  summary: string;
  status: DormitoryStatus;
}

export interface NoticeItem {
  id: string;
  title: string;
  date: string;
  body: string;
  bodyHtml?: string;
  attachments: string[];
  contentImages?: string[];
  isPinned?: boolean;
  sourceUrl?: string;
  sourceName?: string;
  actionCode?: string;
}

export interface MealItem {
  title: string;
  description: string;
  updatedAt: string;
  imageUri: string;
  sourceUrl?: string;
  sections?: Array<{
    id: 'BREAKFAST' | 'DINNER' | 'EXTRA';
    label: string;
    content: string;
  }>;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  type: 'WEBVIEW' | 'EXTERNAL' | 'INFO';
  url?: string;
  loginRequired?: boolean;
  official?: boolean;
}

export const dormitoryOptions: DormitoryOption[] = [
  {
    code: 'ASAN_HAPPY',
    label: '아산 행복기숙사',
    campus: '아산캠퍼스',
    summary: '공지, 식단, 웹뷰 기능, 세탁실 결제',
    status: 'ACTIVE',
  },
  {
    code: 'ASAN_DIRECT',
    label: '아산 직영기숙사',
    campus: '아산캠퍼스',
    summary: '공지, 식단, 웹뷰 기능',
    status: 'ACTIVE',
  },
  {
    code: 'CHEONAN_HAPPY',
    label: '천안 행복기숙사',
    campus: '천안캠퍼스',
    summary: '서비스 준비중',
    status: 'COMING_SOON',
  },
  {
    code: 'CHEONAN_DIRECT',
    label: '천안 직영기숙사',
    campus: '천안캠퍼스',
    summary: '서비스 준비중',
    status: 'COMING_SOON',
  },
  {
    code: 'UNDECIDED',
    label: '아직 입사 전 / 미정',
    campus: '선택 전',
    summary: '중립 홈 제공, 이후 변경 가능',
    status: 'UNDECIDED',
  },
];

export const quickActionsByDormitory: Record<DormitoryCode, QuickAction[]> = {
  ASAN_HAPPY: [
    {
      id: 'merit',
      label: '상벌점 확인',
      description: '공식 사이트에서 확인',
      type: 'WEBVIEW',
      url: 'https://happydorm.hoseo.ac.kr/login',
      loginRequired: true,
      official: true,
    },
    {
      id: 'outing',
      label: '외출·외박 신청',
      description: '공식 사이트에서 신청',
      type: 'WEBVIEW',
      url: 'https://happydorm.hoseo.ac.kr/login',
      loginRequired: true,
      official: true,
    },
    {
      id: 'laundry',
      label: '세탁실 결제',
      description: '메타클럽 앱 실행',
      type: 'EXTERNAL',
      official: true,
    },
    {
      id: 'rules',
      label: '생활수칙',
      description: '기숙사 생활 안내',
      type: 'INFO',
      url: 'https://happydorm.hoseo.ac.kr/page/about7',
      official: true,
    },
  ],
  ASAN_DIRECT: [
    {
      id: 'merit',
      label: '상벌점 확인',
      description: '공식 사이트에서 확인',
      type: 'WEBVIEW',
      url: 'https://mintranet.hsu.ac.kr/index.do',
      loginRequired: true,
      official: true,
    },
    {
      id: 'outing',
      label: '외출·외박 신청',
      description: '공식 사이트에서 신청',
      type: 'WEBVIEW',
      url: 'https://mintranet.hsu.ac.kr/index.do',
      loginRequired: true,
      official: true,
    },
    {
      id: 'phone',
      label: '전화번호',
      description: '생활관 연락처 확인',
      type: 'INFO',
      url: 'https://hoseoin.hoseo.ac.kr/Home/Contents.mbz?action=MAPP_2104261706',
      official: true,
    },
    {
      id: 'rules',
      label: '관생수칙',
      description: '생활관 안내 확인',
      type: 'INFO',
      url: 'https://hoseoin.hoseo.ac.kr/Home/Contents.mbz?action=MAPP_2104261720',
      official: true,
    },
  ],
  CHEONAN_HAPPY: [],
  CHEONAN_DIRECT: [],
  UNDECIDED: [],
};

export const getDormitoryOption = (code: DormitoryCode | null) =>
  dormitoryOptions.find(option => option.code === code) ?? null;

export function isActiveDormitory(
  code: DormitoryCode | null,
): code is 'ASAN_HAPPY' | 'ASAN_DIRECT' {
  return code === 'ASAN_HAPPY' || code === 'ASAN_DIRECT';
}

export function isComingSoonDormitory(
  code: DormitoryCode | null,
): code is 'CHEONAN_HAPPY' | 'CHEONAN_DIRECT' {
  return code === 'CHEONAN_HAPPY' || code === 'CHEONAN_DIRECT';
}

export function isUndecidedDormitory(code: DormitoryCode | null): code is 'UNDECIDED' {
  return code === 'UNDECIDED';
}
