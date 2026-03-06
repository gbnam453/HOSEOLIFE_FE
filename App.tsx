import React, { startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Appearance,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Image,
  type ImageLoadEventData,
  type ImageSourcePropType,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable as RNPressable,
  RefreshControl,
  ScrollView,
  type StyleProp,
  StatusBar,
  StyleSheet,
  Text as RNText,
  ToastAndroid,
  type TextStyle,
  useColorScheme,
  type ViewStyle,
  View,
} from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import ImageViewer from 'react-native-image-zoom-viewer';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { NavigationContainer, StackActions, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { enableScreens } from 'react-native-screens';

import {
  type DormitoryCode,
  dormitoryOptions,
  getDormitoryOption,
  isActiveDormitory,
  isComingSoonDormitory,
  isUndecidedDormitory,
  quickActionsByDormitory,
  type MealItem,
  type NoticeItem,
  type QuickAction,
} from './src/domain';
import {
  type DormitoryContent,
  fetchDormitoryContent,
  fetchNoticeDetail,
} from './src/services/dormitoryClient';
import {
  clearStoredDormitory,
  getStoredDormitoryMealCache,
  getStoredDormitoryNoticeCache,
  getStoredFavoriteNoticeKeys,
  getStoredDormitory,
  getStoredThemePreference,
  setStoredDormitoryMealCache,
  setStoredDormitoryNoticeCache,
  setStoredFavoriteNoticeKeys,
  setStoredDormitory,
  setStoredThemePreference,
  type ThemePreference,
} from './src/storage';
import {
  getCachedImageSize,
  getCachedImageSource,
  getImageSizeFromCache,
  warmImageCache,
  warmImageCacheBatch,
} from './src/utils/imageCache';
import appPackage from './package.json';

type Screen =
  | 'LOADING'
  | 'OFFLINE'
  | 'ONBOARDING'
  | 'HOME'
  | 'NOTICE_LIST'
  | 'NOTICE_DETAIL'
  | 'MEAL'
  | 'LIFE'
  | 'SETTINGS'
  | 'COMING_SOON'
  | 'WEBVIEW';
type NavigationDirection = 'forward' | 'back' | 'none';
type AppStackParamList = {
  LOADING: undefined;
  OFFLINE: undefined;
  ONBOARDING: undefined;
  HOME: undefined;
  NOTICE_LIST: undefined;
  NOTICE_DETAIL: undefined;
  MEAL: undefined;
  LIFE: undefined;
  SETTINGS: undefined;
  COMING_SOON: undefined;
  WEBVIEW: undefined;
};
const AppStack = createNativeStackNavigator<AppStackParamList>();

type NoticeCategoryChip = '전체' | '공지사항' | '일반 공지' | '입관 공지';
type MealTab = 'BREAKFAST' | 'DINNER' | 'EXTRA';
type ActiveDormitoryCode = Extract<DormitoryCode, 'ASAN_HAPPY' | 'ASAN_DIRECT'>;
const ONBOARDING_DORMITORY_CODES: DormitoryCode[] = ['ASAN_HAPPY', 'ASAN_DIRECT'];
const HOME_SWITCHABLE_DORMITORY_CODES: Extract<DormitoryCode, 'ASAN_HAPPY' | 'ASAN_DIRECT'>[] = [
  'ASAN_HAPPY',
  'ASAN_DIRECT',
];
const THEME_PREFERENCE_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
}> = [
  { value: 'SYSTEM', label: '시스템 설정', description: '기기 설정을 따릅니다.' },
  { value: 'LIGHT', label: '라이트', description: '항상 밝은 테마를 사용합니다.' },
  { value: 'DARK', label: '다크', description: '항상 어두운 테마를 사용합니다.' },
];

const APP_VERSION = appPackage.version;
const APP_SUBTITLE = '더 나은 기숙사 생활';
const SPLASH_BACKGROUND_COLOR = '#668EFD';
const SPLASH_BACKGROUND_COLOR_DIRECT = '#3BA86D';
const STARTUP_BOOT_BACKGROUND_COLOR = '#FFFFFF';
const DEFAULT_LOADING_IMAGE_ASPECT_RATIO = 1 / 1.414;
const MEAL_IMAGE_MAX_RETRY_COUNT = 2;
const MEAL_IMAGE_CACHE_ONLY_FALLBACK_MS = 180;
const DORMITORY_TOGGLE_WIDTH = 128;
const DORMITORY_TOGGLE_HEIGHT = 40;
const DORMITORY_TOGGLE_PADDING = 2;
const NOTICE_LIST_PAGE_SIZE = 10;
const DORMITORY_TOGGLE_THUMB_WIDTH =
  (DORMITORY_TOGGLE_WIDTH - DORMITORY_TOGGLE_PADDING * 2) / 2;
const DORMITORY_TOGGLE_DIRECT_THUMB_GAP = 2;
const DORMITORY_TOGGLE_DIRECT_THUMB_TRANSLATE_X = Math.max(
  0,
  DORMITORY_TOGGLE_THUMB_WIDTH - DORMITORY_TOGGLE_DIRECT_THUMB_GAP,
);
const HOME_DOUBLE_BACK_EXIT_WINDOW_MS = 1800;
const DORMITORY_TOGGLE_DIRECT_LABEL_SHIFT_X = -2;
const DORMITORY_TOGGLE_THUMB_HEIGHT = DORMITORY_TOGGLE_HEIGHT - DORMITORY_TOGGLE_PADDING * 2 - 2;
const DORMITORY_TOGGLE_THUMB_TOP =
  Math.max(0, (DORMITORY_TOGGLE_HEIGHT - DORMITORY_TOGGLE_THUMB_HEIGHT) / 2 - 1);
const STARTUP_SPLASH_MIN_VISIBLE_MS = 1000;
const NOTICE_BODY_LINK_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
const NOTICE_BODY_TRAILING_LINK_PATTERN = /[.,!?;:)\]]+$/;
const HAPPY_DORM_HOSTNAME = 'happydorm.hoseo.ac.kr';
const HAPPY_DORM_HOME_PATHS = new Set(['/', '/main', '/main.do', '/index', '/index.do', '/home']);
const HAPPY_DORM_REDIRECT_COOLDOWN_MS = 700;
const KOREAN_WEEKDAY_SHORT_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const ONBOARDING_CARD_VISUALS: Record<
  Extract<DormitoryCode, 'ASAN_HAPPY' | 'ASAN_DIRECT'>,
  {
    imageSource: ImageSourcePropType;
    tag: string;
    metaTitle: string;
    metaSubtitle: string;
  }
> = {
  ASAN_HAPPY: {
    imageSource: require('./src/assets/onboarding/asan-happy.jpeg'),
    tag: 'PREMIUM',
    metaTitle: '행복기숙사',
    metaSubtitle: '한국사학진흥재단 운영',
  },
  ASAN_DIRECT: {
    imageSource: require('./src/assets/onboarding/asan-direct.png'),
    tag: 'STANDARD',
    metaTitle: '직영기숙사',
    metaSubtitle: '호서대학교 직영 운영',
  },
};
const HOME_HEADER_LOGOS: Record<
  Extract<DormitoryCode, 'ASAN_HAPPY' | 'ASAN_DIRECT'>,
  ImageSourcePropType
> = {
  ASAN_HAPPY: require('./src/assets/branding/happy-header.png'),
  ASAN_DIRECT: require('./src/assets/branding/hoseo-header.png'),
};
const HOME_HEADER_IOS_NATIVE_LOGO_URIS: Record<
  Extract<DormitoryCode, 'ASAN_HAPPY' | 'ASAN_DIRECT'>,
  string
> = {
  ASAN_HAPPY: 'header-happy',
  ASAN_DIRECT: 'header-direct',
};
const PRETENDARD_FONTS = {
  thin: 'Pretendard-Thin',
  extraLight: 'Pretendard-ExtraLight',
  light: 'Pretendard-Light',
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semiBold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extraBold: 'Pretendard-ExtraBold',
  black: 'Pretendard-Black',
} as const;
type AppTextProps = React.ComponentProps<typeof RNText>;
function Text({
  style,
  allowFontScaling = false,
  ...rest
}: AppTextProps) {
  return (
    <RNText
      {...rest}
      allowFontScaling={allowFontScaling}
      style={[{ fontFamily: PRETENDARD_FONTS.medium }, style]}
    />
  );
}
const APP_FONT_SIZE_SCALE = 0.93;
const APP_MIN_FONT_SIZE = 10;
const APP_MIN_LINE_HEIGHT = 12;
const HAPTIC_OPTIONS = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
} as const;
const DEFAULT_REFRESH_COLOR = '#668EFD';
const WEBVIEW_REGION_BLOCKED_HTTP_STATUS_CODES = new Set([400]);
// Temporary review-build override: always show region-restricted 안내 화면 in WebView.
const FORCE_WEBVIEW_REGION_BLOCKED_SCREEN = false;

type AppPressableProps = React.ComponentProps<typeof RNPressable>;

function Pressable({ onPress, disabled, ...rest }: AppPressableProps) {
  const handlePress: AppPressableProps['onPress'] = event => {
    if (!disabled && typeof onPress === 'function') {
      ReactNativeHapticFeedback.trigger('impactLight', HAPTIC_OPTIONS);
    }
    onPress?.(event);
  };

  return <RNPressable {...rest} disabled={disabled} onPress={handlePress} />;
}

function resolvePretendardFontFamily(fontWeight?: string | number) {
  let weightValue: number;

  if (typeof fontWeight === 'number') {
    weightValue = fontWeight;
  } else if (typeof fontWeight === 'string') {
    if (fontWeight === 'normal') {
      weightValue = 500;
    } else if (fontWeight === 'bold') {
      weightValue = 700;
    } else {
      const parsedWeight = Number(fontWeight);
      weightValue = Number.isNaN(parsedWeight) ? 500 : parsedWeight;
    }
  } else {
    weightValue = 500;
  }

  if (weightValue >= 900) {
    return PRETENDARD_FONTS.black;
  }
  if (weightValue >= 800) {
    return PRETENDARD_FONTS.extraBold;
  }
  if (weightValue >= 700) {
    return PRETENDARD_FONTS.bold;
  }
  if (weightValue >= 600) {
    return PRETENDARD_FONTS.semiBold;
  }
  if (weightValue >= 400) {
    return PRETENDARD_FONTS.medium;
  }
  if (weightValue >= 300) {
    return PRETENDARD_FONTS.regular;
  }
  if (weightValue >= 200) {
    return PRETENDARD_FONTS.light;
  }
  if (weightValue >= 100) {
    return PRETENDARD_FONTS.extraLight;
  }

  return PRETENDARD_FONTS.thin;
}

function scaleTypographyMetric(value: number, minValue: number) {
  const scaledValue = Math.round(value * APP_FONT_SIZE_SCALE * 100) / 100;
  return Math.max(minValue, scaledValue);
}

function normalizeWebPath(pathname: string) {
  if (pathname === '/') {
    return pathname;
  }
  const trimmedPath = pathname.replace(/\/+$/g, '');
  return trimmedPath.length === 0 ? '/' : trimmedPath;
}

function parseWebUrl(url: string) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isInternetAvailable(state: NetInfoState | null | undefined) {
  if (!state) {
    return false;
  }

  return Boolean(state.isConnected) && state.isInternetReachable !== false;
}

function formatMonthDayWeekday(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = KOREAN_WEEKDAY_SHORT_LABELS[date.getDay()] ?? '';
  return `${month}/${day} (${weekday})`;
}

function isHappyDormHomeUrl(url: string) {
  const parsed = parseWebUrl(url);
  if (!parsed) {
    return false;
  }

  if (parsed.hostname !== HAPPY_DORM_HOSTNAME) {
    return false;
  }

  const pathname = normalizeWebPath((parsed.pathname || '/').toLowerCase());
  if (pathname === '/login') {
    return false;
  }

  return HAPPY_DORM_HOME_PATHS.has(pathname);
}

function resolveHappyDormQuickActionRedirectUrl(actionId: QuickAction['id']) {
  if (actionId === 'merit') {
    return 'https://happydorm.hoseo.ac.kr/mypage/rnp_points/list';
  }
  if (actionId === 'outing') {
    return 'https://happydorm.hoseo.ac.kr/dormitory/view';
  }
  return null;
}

function buildHappyDormQuickActionRedirectScript(actionId: QuickAction['id']) {
  const redirectUrl = resolveHappyDormQuickActionRedirectUrl(actionId);

  if (!redirectUrl) {
    return 'true;';
  }

  return `window.location.replace(${JSON.stringify(redirectUrl)}); true;`;
}

function applyPretendardTypography<T extends Record<string, Record<string, unknown>>>(styleDefinitions: T) {
  const textStyleSignals = ['fontSize', 'lineHeight', 'letterSpacing', 'fontWeight'];
  const iconStyleNamePattern = /(icon|glyph|chevron|arrow)/i;

  for (const [styleName, style] of Object.entries(styleDefinitions)) {
    if (iconStyleNamePattern.test(styleName)) {
      continue;
    }

    const hasSignal = textStyleSignals.some(key => Object.prototype.hasOwnProperty.call(style, key));
    if (!hasSignal) {
      continue;
    }

    const minFontSize = styleName === 'homeDisclosureText' ? 8 : APP_MIN_FONT_SIZE;
    const minLineHeightBase = styleName === 'homeDisclosureText' ? 10 : APP_MIN_LINE_HEIGHT;

    if (typeof style.fontSize === 'number') {
      style.fontSize = scaleTypographyMetric(style.fontSize, minFontSize);
    }

    if (typeof style.lineHeight === 'number') {
      const minLineHeight =
        typeof style.fontSize === 'number'
          ? Math.max(style.fontSize + 2, minLineHeightBase)
          : minLineHeightBase;
      style.lineHeight = scaleTypographyMetric(style.lineHeight, minLineHeight);
    }

    const fontWeight = style.fontWeight as string | number | undefined;
    if (!Object.prototype.hasOwnProperty.call(style, 'fontFamily')) {
      style.fontFamily = resolvePretendardFontFamily(fontWeight);
    }
    if (Object.prototype.hasOwnProperty.call(style, 'fontWeight')) {
      delete style.fontWeight;
    }
  }

  return styleDefinitions;
}

type AppPalette = {
  quickLaunchTones: [
    {
      iconBackground: string;
      iconGlyph: string;
      labelColor: string;
    },
    {
      iconBackground: string;
      iconGlyph: string;
      labelColor: string;
    },
    {
      iconBackground: string;
      iconGlyph: string;
      labelColor: string;
    },
    {
      iconBackground: string;
      iconGlyph: string;
      labelColor: string;
    },
  ];
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceSoft: string;
  border: string;
  borderStrong: string;
  primary: string;
  primary700: string;
  primary500: string;
  primarySoft: string;
  text: string;
  textMuted: string;
  accent: string;
  accent300: string;
  accentSoft: string;
  infoSoft: string;
  danger: string;
  shadow: string;
  orbPrimary: string;
  orbAccent: string;
  lineSoft: string;
  lineSoftAlt: string;
  selectedSoft: string;
  comingSoonBg: string;
  comingSoonText: string;
  bannerBorder: string;
  overlayBg: string;
  overlayText: string;
  badgeMutedBg: string;
  badgeMutedText: string;
  skeleton: string;
  tabGlyphBg: string;
  onPrimary: string;
};

const LIGHT_COLORS: AppPalette = {
  quickLaunchTones: [
    { iconBackground: '#6F8FF7', iconGlyph: '#F7FAFF', labelColor: '#4E67B8' },
    { iconBackground: '#7898F8', iconGlyph: '#F7FAFF', labelColor: '#526AB8' },
    { iconBackground: '#82A2F9', iconGlyph: '#F7FAFF', labelColor: '#566EB9' },
    { iconBackground: '#8BAAF9', iconGlyph: '#F7FAFF', labelColor: '#5B73BA' },
  ],
  background: '#F6F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F4FA',
  surfaceSoft: '#F7FAFF',
  border: '#E2E8F3',
  borderStrong: '#CFDAEE',
  primary: '#668EFD',
  primary700: '#4E73E6',
  primary500: '#7A9FFD',
  primarySoft: 'rgba(102,142,253,0.18)',
  text: '#111827',
  textMuted: '#61718E',
  accent: '#557DEB',
  accent300: '#8BAAFE',
  accentSoft: 'rgba(102,142,253,0.22)',
  infoSoft: '#EDF4FF',
  danger: '#CF3E3E',
  shadow: 'rgba(15, 23, 42, 0.08)',
  orbPrimary: '#E7EEFF',
  orbAccent: '#ECF3FF',
  lineSoft: '#E8EEFA',
  lineSoftAlt: '#EEF3FD',
  selectedSoft: '#E5EEFF',
  comingSoonBg: '#E5EEFF',
  comingSoonText: '#4E73E6',
  bannerBorder: '#C8D8F2',
  overlayBg: 'rgba(10, 19, 38, 0.58)',
  overlayText: '#FFFFFF',
  badgeMutedBg: '#E8EEF8',
  badgeMutedText: '#5C6B84',
  skeleton: '#E6ECF8',
  tabGlyphBg: '#E3ECFA',
  onPrimary: '#FFFFFF',
};

const DARK_COLORS: AppPalette = {
  quickLaunchTones: [
    { iconBackground: 'rgba(102,142,253,0.52)', iconGlyph: '#F2F6FF', labelColor: '#D0DBF4' },
    { iconBackground: 'rgba(112,151,254,0.49)', iconGlyph: '#F2F6FF', labelColor: '#CBD8F3' },
    { iconBackground: 'rgba(122,160,255,0.46)', iconGlyph: '#F2F6FF', labelColor: '#C6D4F1' },
    { iconBackground: 'rgba(132,169,255,0.43)', iconGlyph: '#F2F6FF', labelColor: '#C2D1EF' },
  ],
  background: '#101012',
  surface: '#18181C',
  surfaceMuted: '#141821',
  surfaceSoft: '#1A1F2B',
  border: '#232B3A',
  borderStrong: '#2D3750',
  primary: '#668EFD',
  primary700: '#B9CBFF',
  primary500: '#86A8FF',
  primarySoft: 'rgba(102,142,253,0.26)',
  text: '#F5F7F8',
  textMuted: '#9AA3AC',
  accent: '#9BB4FF',
  accent300: '#B6C9FF',
  accentSoft: 'rgba(155,180,255,0.24)',
  infoSoft: '#1A1F2A',
  danger: '#F17474',
  shadow: 'rgba(0, 0, 0, 0.65)',
  orbPrimary: '#111520',
  orbAccent: '#171D2A',
  lineSoft: '#233047',
  lineSoftAlt: '#2A3954',
  selectedSoft: '#1A2842',
  comingSoonBg: '#172137',
  comingSoonText: '#B6C9FF',
  bannerBorder: '#2B3E5E',
  overlayBg: 'rgba(0, 0, 0, 0.78)',
  overlayText: '#F5F7F8',
  badgeMutedBg: '#222A3A',
  badgeMutedText: '#C0CBE0',
  skeleton: '#232D41',
  tabGlyphBg: '#1F2738',
  onPrimary: '#F5F9FF',
};

let colors: AppPalette = LIGHT_COLORS;

if (process.env.JEST_WORKER_ID == null) {
  enableScreens(true);
}

function isDarkPalette(palette: AppPalette) {
  return palette.background === DARK_COLORS.background;
}

function getDormitoryBrandedPalette(basePalette: AppPalette, dormitoryCode: DormitoryCode | null) {
  if (dormitoryCode !== 'ASAN_DIRECT') {
    return basePalette;
  }

  if (isDarkPalette(basePalette)) {
    return {
      ...basePalette,
      quickLaunchTones: [
        { iconBackground: 'rgba(77,186,129,0.52)', iconGlyph: '#F1FCF6', labelColor: '#CAEFD8' },
        { iconBackground: 'rgba(84,190,133,0.49)', iconGlyph: '#F1FCF6', labelColor: '#C6ECD4' },
        { iconBackground: 'rgba(91,194,137,0.46)', iconGlyph: '#F1FCF6', labelColor: '#C1E9D0' },
        { iconBackground: 'rgba(98,198,141,0.43)', iconGlyph: '#F1FCF6', labelColor: '#BDE6CC' },
      ],
      primary: '#4DBA81',
      primary700: '#8FDFB5',
      primary500: '#6FCF99',
      primarySoft: 'rgba(77,186,129,0.26)',
      accent: '#7BD7A8',
      accent300: '#A2E7C2',
      accentSoft: 'rgba(123,215,168,0.24)',
      infoSoft: '#17241D',
      selectedSoft: '#183126',
      comingSoonBg: '#173127',
      comingSoonText: '#9EE5C0',
      bannerBorder: '#2E5A43',
      tabGlyphBg: '#1A2D23',
    };
  }

  return {
    ...basePalette,
    quickLaunchTones: [
      { iconBackground: '#5BBC87', iconGlyph: '#F4FFF9', labelColor: '#3F8A67' },
      { iconBackground: '#64C28D', iconGlyph: '#F4FFF9', labelColor: '#43906B' },
      { iconBackground: '#6EC893', iconGlyph: '#F4FFF9', labelColor: '#48976F' },
      { iconBackground: '#78CE99', iconGlyph: '#F4FFF9', labelColor: '#4C9D74' },
    ],
    primary: '#3BA86D',
    primary700: '#2F9560',
    primary500: '#4DBA81',
    primarySoft: 'rgba(59,168,109,0.18)',
    accent: '#45B376',
    accent300: '#7DD1A4',
    accentSoft: 'rgba(69,179,118,0.22)',
    infoSoft: '#ECF9F1',
    selectedSoft: '#E3F5EB',
    comingSoonBg: '#E3F5EB',
    comingSoonText: '#2F9560',
    bannerBorder: '#C5E7D4',
    tabGlyphBg: '#DDF2E7',
  };
}

function getCardShadow(palette: AppPalette) {
  return Platform.select({
    ios: {
      shadowColor: palette.shadow,
      shadowOpacity: 0.5,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    android: {
      shadowColor: isDarkPalette(palette) ? 'rgba(0, 0, 0, 0.56)' : 'rgba(120, 146, 196, 0.45)',
      elevation: 0.75,
    },
    default: {},
  });
}

const META_CLUB_ANDROID_PACKAGE = 'com.fingerverse.metapoint';
const META_CLUB_ANDROID_GATE_ACTIVITY = 'com.fingerverse.metapoint.ui.activity.GateActivity';
const META_CLUB_ANDROID_INTENT =
  `intent://#Intent;` +
  `component=${META_CLUB_ANDROID_PACKAGE}/${META_CLUB_ANDROID_GATE_ACTIVITY};` +
  `package=${META_CLUB_ANDROID_PACKAGE};end`;
const META_CLUB_ANDROID_STORE_WEB = `https://play.google.com/store/apps/details?id=${META_CLUB_ANDROID_PACKAGE}`;
const META_CLUB_IOS_URL_SCHEME = 'metaclub://';
const META_CLUB_IOS_STORE =
  'https://apps.apple.com/kr/app/%EB%A9%94%ED%83%80%ED%81%B4%EB%9F%BD/id6444430778';

const SYNC_DELAY_MESSAGE =
  '공식 사이트 연결이 지연되어 실제 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.';
const NOTICE_PREVIEW_PREFETCH_LIMIT = 20;
const NOTICE_DETAIL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildNoticeCacheKey(dormitoryCode: DormitoryCode, noticeId: string) {
  return `${dormitoryCode}:${noticeId}`;
}

function buildFavoriteNoticeStorageKey(dormitoryCode: ActiveDormitoryCode, noticeId: string) {
  return `${dormitoryCode}:${noticeId}`;
}

function warmDormitoryContentMedia(content: DormitoryContent) {
  const mealImageUri = content.meal?.imageUri;
  const noticeImageUris = content.notices.flatMap(item => item.contentImages ?? []);

  if (mealImageUri) {
    void warmImageCache(mealImageUri).finally(() => {
      if (noticeImageUris.length > 0) {
        void warmImageCacheBatch(noticeImageUris);
      }
    });
    return;
  }

  if (noticeImageUris.length > 0) {
    void warmImageCacheBatch(noticeImageUris);
  }
}

function getSplashBackgroundColorByDormitory(dormitoryCode: DormitoryCode | null) {
  if (dormitoryCode === 'ASAN_DIRECT') {
    return SPLASH_BACKGROUND_COLOR_DIRECT;
  }

  return SPLASH_BACKGROUND_COLOR;
}

function getSplashSubtitleByDormitory(dormitoryCode: DormitoryCode | null) {
  if (dormitoryCode === 'ASAN_DIRECT') {
    return '더 나은 직영기숙사 생활';
  }
  if (dormitoryCode === 'ASAN_HAPPY') {
    return '더 나은 행복기숙사 생활';
  }

  return APP_SUBTITLE;
}

function resolveIsDarkModeByPreference(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
) {
  if (preference === 'DARK') {
    return true;
  }
  if (preference === 'LIGHT') {
    return false;
  }
  return systemScheme === 'dark';
}

function App() {
  const colorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState<ThemePreference>('SYSTEM');
  const [themeDormitoryCode, setThemeDormitoryCode] = useState<DormitoryCode | null>(null);
  const [startupStoredDormitoryCode, setStartupStoredDormitoryCode] = useState<DormitoryCode | null>(null);
  const [isStartupDormitoryReady, setIsStartupDormitoryReady] = useState(false);
  const [isIconFontReady, setIsIconFontReady] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    resolveIsDarkModeByPreference('SYSTEM', colorScheme ?? Appearance.getColorScheme()),
  );
  const themeFadeOpacity = useRef(new Animated.Value(1)).current;
  const isThemeTransitioningRef = useRef(false);
  const isDarkModeRef = useRef(isDarkMode);
  const themePreferenceRef = useRef(themePreference);

  useEffect(() => {
    let isMounted = true;

    MaterialCommunityIcon.loadFont()
      .catch(() => undefined)
      .finally(() => {
        if (!isMounted) {
          return;
        }
        setIsIconFontReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const headerLogoUris = [HOME_HEADER_LOGOS.ASAN_HAPPY, HOME_HEADER_LOGOS.ASAN_DIRECT]
      .map(source => Image.resolveAssetSource(source)?.uri)
      .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);

    headerLogoUris.forEach(uri => {
      void Image.prefetch(uri).catch(() => undefined);
    });
  }, []);

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
  }, [isDarkMode]);

  useEffect(() => {
    themePreferenceRef.current = themePreference;
  }, [themePreference]);

  useEffect(() => {
    let mounted = true;

    getStoredDormitory()
      .then(storedDormitory => {
        if (!mounted) {
          return;
        }

        if (isDormitoryCode(storedDormitory)) {
          setThemeDormitoryCode(storedDormitory);
          setStartupStoredDormitoryCode(storedDormitory);
          return;
        }

        setStartupStoredDormitoryCode(null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!mounted) {
          return;
        }
        setIsStartupDormitoryReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    getStoredThemePreference()
      .then(storedPreference => {
        if (!mounted || !storedPreference) {
          return;
        }

        setThemePreference(storedPreference);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isThemeTransitioningRef.current) {
      return;
    }

    const nextDarkMode = resolveIsDarkModeByPreference(
      themePreference,
      colorScheme ?? Appearance.getColorScheme(),
    );
    if (nextDarkMode === isDarkModeRef.current) {
      return;
    }

    isThemeTransitioningRef.current = false;
    themeFadeOpacity.stopAnimation();
    themeFadeOpacity.setValue(1);
    setIsDarkMode(nextDarkMode);
  }, [colorScheme, themeFadeOpacity, themePreference]);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state !== 'active' || themePreferenceRef.current !== 'SYSTEM') {
        return;
      }

      const currentSystemScheme = Appearance.getColorScheme();
      const nextDarkMode = resolveIsDarkModeByPreference('SYSTEM', currentSystemScheme);
      if (nextDarkMode === isDarkModeRef.current) {
        return;
      }

      isThemeTransitioningRef.current = false;
      themeFadeOpacity.stopAnimation();
      themeFadeOpacity.setValue(1);
      setIsDarkMode(nextDarkMode);
    });

    return () => {
      appStateSubscription.remove();
    };
  }, [themeFadeOpacity]);

  const animateThemeTransition = (
    nextDarkMode: boolean,
    nextPreference?: ThemePreference,
  ) => {
    if (isThemeTransitioningRef.current) {
      return;
    }

    if (nextDarkMode === isDarkModeRef.current) {
      if (nextPreference && nextPreference !== themePreferenceRef.current) {
        themePreferenceRef.current = nextPreference;
        setThemePreference(nextPreference);
        void setStoredThemePreference(nextPreference);
      }
      return;
    }

    if (nextPreference && nextPreference !== themePreferenceRef.current) {
      themePreferenceRef.current = nextPreference;
      setThemePreference(nextPreference);
      void setStoredThemePreference(nextPreference);
    }

    isThemeTransitioningRef.current = true;

    Animated.timing(themeFadeOpacity, {
      toValue: 0.76,
      duration: 120,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) {
        isThemeTransitioningRef.current = false;
        themeFadeOpacity.setValue(1);
        return;
      }

      setIsDarkMode(nextDarkMode);

      Animated.timing(themeFadeOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        isThemeTransitioningRef.current = false;
      });
    });
  };

  const handleToggleDarkMode = () => {
    const nextDarkMode = !isDarkModeRef.current;
    const nextPreference: ThemePreference = nextDarkMode ? 'DARK' : 'LIGHT';
    animateThemeTransition(nextDarkMode, nextPreference);
  };

  const handleThemePreferenceChange = (nextPreference: ThemePreference) => {
    if (nextPreference === themePreferenceRef.current) {
      return;
    }

    const nextDarkMode = resolveIsDarkModeByPreference(
      nextPreference,
      colorScheme ?? Appearance.getColorScheme(),
    );
    animateThemeTransition(nextDarkMode, nextPreference);
  };

  colors = getDormitoryBrandedPalette(isDarkMode ? DARK_COLORS : LIGHT_COLORS, themeDormitoryCode);
  styles = createStyles(colors, getCardShadow(colors));
  const themeTransitionStyle = {
    opacity: themeFadeOpacity,
  };
  const startupBackgroundColor = isStartupDormitoryReady
    ? getSplashBackgroundColorByDormitory(themeDormitoryCode)
    : STARTUP_BOOT_BACKGROUND_COLOR;
  const isFirstInstallStartup = isStartupDormitoryReady && startupStoredDormitoryCode === null;
  const isAppContentReady =
    isStartupDormitoryReady && (isIconFontReady || isFirstInstallStartup);
  const isBrandedSplashReady = isStartupDormitoryReady && !isFirstInstallStartup;
  const startupBootPlaceholderStyle = useMemo(
    () => ({ flex: 1, backgroundColor: startupBackgroundColor }),
    [startupBackgroundColor],
  );

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isAppContentReady ? colors.background : startupBackgroundColor}
      />
      <Animated.View
        style={[styles.container, themeTransitionStyle, !isIconFontReady ? { backgroundColor: startupBackgroundColor } : null]}>
        {isAppContentReady ? (
          <AppContent
            isDarkMode={isDarkMode}
            themePreference={themePreference}
            onToggleDarkMode={handleToggleDarkMode}
            onChangeThemePreference={handleThemePreferenceChange}
            initialStoredDormitoryCode={startupStoredDormitoryCode}
            themedDormitoryCode={themeDormitoryCode}
            onDormitoryThemeChange={setThemeDormitoryCode}
          />
        ) : isBrandedSplashReady ? (
          <LoadingScreen backgroundColor={startupBackgroundColor} dormitoryCode={themeDormitoryCode} />
        ) : (
          <View style={startupBootPlaceholderStyle} />
        )}
      </Animated.View>
    </SafeAreaProvider>
  );
}

function AppContent({
  isDarkMode,
  themePreference,
  onToggleDarkMode,
  onChangeThemePreference,
  initialStoredDormitoryCode,
  themedDormitoryCode,
  onDormitoryThemeChange,
}: {
  isDarkMode: boolean;
  themePreference: ThemePreference;
  onToggleDarkMode: () => void;
  onChangeThemePreference: (nextPreference: ThemePreference) => void;
  initialStoredDormitoryCode: DormitoryCode | null;
  themedDormitoryCode: DormitoryCode | null;
  onDormitoryThemeChange: (dormitoryCode: DormitoryCode | null) => void;
}) {
  const initialRouteScreen: Screen = initialStoredDormitoryCode ? 'LOADING' : 'ONBOARDING';
  const navigationRef = useNavigationContainerRef<AppStackParamList>();
  const navigationReadyRef = useRef(false);
  const pendingNavigationRef = useRef<
    { screen: Screen; type: 'push' | 'reset' | 'navigate' } | null
  >(null);
  const [activeScreen, setActiveScreen] = useState<Screen>(initialRouteScreen);
  const activeScreenRef = useRef<Screen>(initialRouteScreen);
  const previousActiveScreenRef = useRef<Screen>(initialRouteScreen);
  const [isInternetConnected, setIsInternetConnected] = useState<boolean | null>(null);
  const [selectedDormitory, setSelectedDormitory] = useState<DormitoryCode | null>(null);
  const [defaultDormitory, setDefaultDormitory] = useState<DormitoryCode | null>(null);
  const [onboardingSelection, setOnboardingSelection] = useState<DormitoryCode | null>(null);
  const [onboardingReturnScreen, setOnboardingReturnScreen] = useState<'SETTINGS' | null>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [meal, setMeal] = useState<MealItem | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [pendingStartupHome, setPendingStartupHome] = useState(false);
  const previousDormitoryRef = useRef<DormitoryCode | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [noticeDetailLoading, setNoticeDetailLoading] = useState(false);
  const [favoriteNoticeKeys, setFavoriteNoticeKeys] = useState<Set<string>>(() => new Set());
  const noticeDetailCacheRef = useRef(
    new Map<string, { value: NoticeItem; expiresAt: number }>(),
  );
  const [homeMealZoomVisible, setHomeMealZoomVisible] = useState(false);
  const [mealTab, setMealTab] = useState<MealTab>('BREAKFAST');
  const [webViewTarget, setWebViewTarget] = useState<{
    title: string;
    url: string;
    returnScreen: Screen;
    sourceActionId?: QuickAction['id'];
  } | null>(null);
  const [dialogState, setDialogState] = useState<{
    visible: boolean;
    title: string;
    message: string;
  }>({
    visible: false,
    title: '',
    message: '',
  });

  const dormitory = getDormitoryOption(selectedDormitory);
  const defaultDormitoryOption = getDormitoryOption(defaultDormitory);
  const isActive = isActiveDormitory(selectedDormitory);
  const isUndecided = isUndecidedDormitory(selectedDormitory);
  const quickActions = selectedDormitory ? quickActionsByDormitory[selectedDormitory] : [];
  const selectedDormitoryRef = useRef<DormitoryCode | null>(selectedDormitory);
  const favoriteNoticeKeysRef = useRef(favoriteNoticeKeys);
  const forceReloadDormitoryRef = useRef<DormitoryCode | null>(null);
  const dormitoryContentCacheRef = useRef(new Map<ActiveDormitoryCode, DormitoryContent>());
  const dormitoryContentRequestRef = useRef(new Map<ActiveDormitoryCode, Promise<DormitoryContent>>());
  const mealFetchInitializedRef = useRef(new Set<ActiveDormitoryCode>());
  const startupMealPrefetchDoneRef = useRef(false);
  const dialogVisibleRef = useRef(dialogState.visible);
  const homeMealZoomVisibleRef = useRef(homeMealZoomVisible);
  const lastHomeBackPressedAtRef = useRef(0);
  const startupRestoredRef = useRef(false);
  const startupSplashStartedAtRef = useRef<number | null>(null);
  const startupHomeTransitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hydrateNoticeDetailCacheFromNotices = (
    dormitoryCode: ActiveDormitoryCode,
    noticeItems: NoticeItem[],
  ) => {
    const expiresAt = Date.now() + NOTICE_DETAIL_CACHE_TTL_MS;
    noticeItems.forEach(noticeItem => {
      const hasDetailedPayload =
        noticeItem.body.trim().length > 0 ||
        Boolean(noticeItem.bodyHtml?.trim().length) ||
        noticeItem.attachments.length > 0 ||
        (noticeItem.contentImages?.length ?? 0) > 0;
      if (!hasDetailedPayload) {
        return;
      }

      const cacheKey = buildNoticeCacheKey(dormitoryCode, noticeItem.id);
      noticeDetailCacheRef.current.set(cacheKey, {
        value: noticeItem,
        expiresAt,
      });
    });
  };

  const mergeNoticesWithDetailCache = (
    dormitoryCode: ActiveDormitoryCode,
    noticeItems: NoticeItem[],
  ) => {
    const now = Date.now();
    return noticeItems.map(noticeItem => {
      const cacheKey = buildNoticeCacheKey(dormitoryCode, noticeItem.id);
      const cachedDetail = noticeDetailCacheRef.current.get(cacheKey);
      if (!cachedDetail || cachedDetail.expiresAt <= now || cachedDetail.value.id !== noticeItem.id) {
        return noticeItem;
      }

      const detailed = cachedDetail.value;
      return {
        ...noticeItem,
        body: detailed.body || noticeItem.body,
        bodyHtml: detailed.bodyHtml ?? noticeItem.bodyHtml,
        attachments: detailed.attachments.length > 0 ? detailed.attachments : noticeItem.attachments,
        contentImages: detailed.contentImages ?? noticeItem.contentImages,
      };
    });
  };

  const syncDormitoryNoticeToCache = (dormitoryCode: ActiveDormitoryCode, updatedNotice: NoticeItem) => {
    const cachedContent = dormitoryContentCacheRef.current.get(dormitoryCode);
    if (!cachedContent) {
      return;
    }

    const nextNotices = cachedContent.notices.map(item => (item.id === updatedNotice.id ? updatedNotice : item));
    dormitoryContentCacheRef.current.set(dormitoryCode, {
      meal: cachedContent.meal,
      notices: nextNotices,
    });
    void setStoredDormitoryNoticeCache(dormitoryCode, nextNotices);
  };

  useLayoutEffect(() => {
    const nextThemeDormitoryCode = selectedDormitory ?? themedDormitoryCode;
    if (nextThemeDormitoryCode === themedDormitoryCode) {
      return;
    }

    onDormitoryThemeChange(nextThemeDormitoryCode);
  }, [onDormitoryThemeChange, selectedDormitory, themedDormitoryCode]);
  useEffect(() => {
    selectedDormitoryRef.current = selectedDormitory;
  }, [selectedDormitory]);
  useEffect(() => {
    favoriteNoticeKeysRef.current = favoriteNoticeKeys;
  }, [favoriteNoticeKeys]);
  useEffect(() => {
    let isMounted = true;

    getStoredFavoriteNoticeKeys()
      .then(storedKeys => {
        if (!isMounted) {
          return;
        }

        const nextKeys = new Set(storedKeys);
        favoriteNoticeKeysRef.current = nextKeys;
        setFavoriteNoticeKeys(nextKeys);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, []);
  useEffect(() => {
    const previousScreen = previousActiveScreenRef.current;
    activeScreenRef.current = activeScreen;

    if (previousScreen === 'WEBVIEW' && activeScreen !== 'WEBVIEW') {
      setWebViewTarget(null);
    }

    previousActiveScreenRef.current = activeScreen;
  }, [activeScreen]);
  useEffect(() => {
    dialogVisibleRef.current = dialogState.visible;
  }, [dialogState.visible]);
  useEffect(() => {
    homeMealZoomVisibleRef.current = homeMealZoomVisible;
  }, [homeMealZoomVisible]);

  useEffect(() => {
    let isMounted = true;

    const updateInternetConnection = (state: NetInfoState) => {
      if (!isMounted) {
        return;
      }
      setIsInternetConnected(isInternetAvailable(state));
    };

    const unsubscribe = NetInfo.addEventListener(updateInternetConnection);

    NetInfo.fetch()
      .then(updateInternetConnection)
      .catch(() => {
        if (isMounted) {
          setIsInternetConnected(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const syncActiveRoute = () => {
    const currentRoute = navigationRef.getCurrentRoute();
    if (!currentRoute) {
      return;
    }

    const routeName = currentRoute.name as Screen;
    activeScreenRef.current = routeName;
    setActiveScreen(routeName);
  };

  const runNavigation = (targetScreen: Screen, type: 'push' | 'reset' | 'navigate') => {
    if (!navigationReadyRef.current || !navigationRef.isReady()) {
      pendingNavigationRef.current = {
        screen: targetScreen,
        type,
      };
      return;
    }

    if (type === 'reset') {
      navigationRef.reset({
        index: 0,
        routes: [{ name: targetScreen }],
      });
      return;
    }

    if (type === 'navigate') {
      navigationRef.navigate(targetScreen);
      return;
    }

    if (activeScreenRef.current === targetScreen) {
      return;
    }

    navigationRef.dispatch(StackActions.push(targetScreen));
  };

  const flushPendingNavigation = () => {
    const pendingNavigation = pendingNavigationRef.current;
    if (!pendingNavigation) {
      return;
    }

    pendingNavigationRef.current = null;
    runNavigation(pendingNavigation.screen, pendingNavigation.type);
  };

  const goBack = (fallbackScreen: Screen = 'HOME') => {
    if (navigationReadyRef.current && navigationRef.isReady() && navigationRef.canGoBack()) {
      navigationRef.goBack();
      return;
    }

    runNavigation(fallbackScreen, 'reset');
  };

  const navigate = (
    nextScreen: Screen,
    options: {
      direction?: NavigationDirection;
    } = {},
  ) => {
    const direction = options.direction ?? 'forward';
    if (direction === 'back') {
      goBack(nextScreen);
      return;
    }

    if (direction === 'none') {
      runNavigation(nextScreen, 'reset');
      return;
    }

    runNavigation(nextScreen, 'push');
  };

  const openDialog = (title: string, message: string) => {
    setDialogState({
      visible: true,
      title,
      message,
    });
  };

  const closeDialog = () => {
    setDialogState(current => ({
      ...current,
      visible: false,
    }));
  };

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const backPressSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dialogVisibleRef.current) {
        setDialogState(current => ({
          ...current,
          visible: false,
        }));
        return true;
      }

      if (homeMealZoomVisibleRef.current) {
        setHomeMealZoomVisible(false);
        return true;
      }

      if (activeScreenRef.current === 'HOME') {
        const now = Date.now();
        const isSecondPress =
          now - lastHomeBackPressedAtRef.current <= HOME_DOUBLE_BACK_EXIT_WINDOW_MS;

        if (isSecondPress) {
          BackHandler.exitApp();
          return true;
        }

        lastHomeBackPressedAtRef.current = now;
        ToastAndroid.show('한 번 더 누르면 앱이 종료됩니다.', ToastAndroid.SHORT);
        return true;
      }

      return false;
    });

    return () => {
      backPressSubscription.remove();
    };
  }, []);

  const resolveEntryScreen = (code: DormitoryCode) => {
    if (isComingSoonDormitory(code)) {
      return 'COMING_SOON' as const;
    }
    return 'HOME' as const;
  };

  useEffect(() => {
    let isMounted = true;

    if (isInternetConnected === null) {
      return () => {
        isMounted = false;
      };
    }

    if (!isInternetConnected) {
      if (!startupRestoredRef.current) {
        setPendingStartupHome(false);
        setContentLoading(false);
        setIsPullRefreshing(false);
        startupSplashStartedAtRef.current = null;
        navigate('OFFLINE', { direction: 'none' });
      }

      return () => {
        isMounted = false;
      };
    }

    if (startupRestoredRef.current) {
      return () => {
        isMounted = false;
      };
    }

    const restoreDormitory = async () => {
      const storedDormitory = await getStoredDormitory();
      if (!isMounted) {
        return;
      }

      if (isDormitoryCode(storedDormitory)) {
        setDefaultDormitory(storedDormitory);
        setSelectedDormitory(storedDormitory);
        setOnboardingSelection(storedDormitory);
        if (isActiveDormitory(storedDormitory)) {
          const startupMealCaches = await Promise.all(
            HOME_SWITCHABLE_DORMITORY_CODES.map(code => getStoredDormitoryMealCache(code).catch(() => null)),
          );
          if (isMounted) {
            startupMealCaches.forEach((mealCache, index) => {
              if (!mealCache?.meal) {
                return;
              }

              const dormitoryCode = HOME_SWITCHABLE_DORMITORY_CODES[index];
              const currentCachedNotices =
                dormitoryContentCacheRef.current.get(dormitoryCode)?.notices ?? [];
              dormitoryContentCacheRef.current.set(dormitoryCode, {
                meal: mealCache.meal,
                notices: currentCachedNotices,
              });
              void warmImageCache(mealCache.meal.imageUri);
            });

            const selectedDormitoryMealCache = startupMealCaches
              .find((_, index) => HOME_SWITCHABLE_DORMITORY_CODES[index] === storedDormitory);
            if (selectedDormitoryMealCache?.meal) {
              setMeal(selectedDormitoryMealCache.meal);
            }
          }

          startupSplashStartedAtRef.current = Date.now();
          setPendingStartupHome(true);
          setContentLoading(true);
          startupRestoredRef.current = true;
          if (activeScreenRef.current !== 'LOADING') {
            navigate('LOADING', { direction: 'none' });
          }
          return;
        }

        setPendingStartupHome(false);
        setContentLoading(false);
        startupRestoredRef.current = true;
        navigate(resolveEntryScreen(storedDormitory), { direction: 'none' });
        return;
      }

      clearStoredDormitory().catch(() => false);
      setDefaultDormitory(null);
      setPendingStartupHome(false);
      setContentLoading(false);
      startupSplashStartedAtRef.current = null;
      startupRestoredRef.current = true;
      navigate('ONBOARDING', { direction: 'none' });
    };

    restoreDormitory().catch(() => {
      if (isMounted) {
        setPendingStartupHome(false);
        setContentLoading(false);
        startupSplashStartedAtRef.current = null;
        startupRestoredRef.current = true;
        navigate('ONBOARDING', { direction: 'none' });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isInternetConnected]);

  useEffect(() => {
    let isMounted = true;

    if (!selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      previousDormitoryRef.current = selectedDormitory;
      setNotices([]);
      setMeal(null);
      setContentLoading(false);
      setIsPullRefreshing(false);
      setContentError(null);
      return () => {
        isMounted = false;
      };
    }

    const activeDormitory = selectedDormitory;
    const shouldForceReload = forceReloadDormitoryRef.current === activeDormitory;
    if (shouldForceReload) {
      forceReloadDormitoryRef.current = null;
    }

    const cachedContent = dormitoryContentCacheRef.current.get(activeDormitory);
    const dormitoryChanged = previousDormitoryRef.current !== activeDormitory;
    previousDormitoryRef.current = activeDormitory;

    if (cachedContent && !shouldForceReload) {
      setNotices(cachedContent.notices);
      setMeal(cachedContent.meal);
      setIsPullRefreshing(false);
      setContentError(null);

      if (cachedContent.meal) {
        setContentLoading(false);
        warmDormitoryContentMedia(cachedContent);
        return () => {
          isMounted = false;
        };
      }

      setContentLoading(true);
    } else if (dormitoryChanged && !cachedContent) {
      // Prevent showing stale data from previous dormitory only when no cache is available.
      setNotices([]);
      setMeal(null);
    }

    const loadContent = async () => {
      setContentError(null);
      let hasHydratedPersistentNotices = false;
      let hasHydratedPersistentMeal = false;

      if (!shouldForceReload) {
        const storedNoticeCachePromise = getStoredDormitoryNoticeCache(activeDormitory).catch(() => null);
        const storedMealCache = await getStoredDormitoryMealCache(activeDormitory).catch(() => null);

        if (isMounted && storedMealCache?.meal) {
          const hydratedMeal = storedMealCache.meal;
          const currentCachedNotices = dormitoryContentCacheRef.current.get(activeDormitory)?.notices ?? [];
          dormitoryContentCacheRef.current.set(activeDormitory, {
            meal: hydratedMeal,
            notices: currentCachedNotices,
          });
          setMeal(hydratedMeal);
          void warmImageCache(hydratedMeal.imageUri);
          hasHydratedPersistentMeal = true;
        }

        if (isMounted && hasHydratedPersistentMeal) {
          setContentLoading(false);
          setIsPullRefreshing(false);
        }
        if (isMounted && !storedMealCache?.meal && dormitoryChanged && !cachedContent) {
          setMeal(null);
        }

        const storedNoticeCache = await storedNoticeCachePromise;
        if (isMounted && storedNoticeCache && storedNoticeCache.notices.length > 0) {
          const hydratedNotices = mergeNoticesWithDetailCache(activeDormitory, storedNoticeCache.notices);
          hydrateNoticeDetailCacheFromNotices(activeDormitory, hydratedNotices);

          const currentCachedMeal = dormitoryContentCacheRef.current.get(activeDormitory)?.meal ?? null;
          dormitoryContentCacheRef.current.set(activeDormitory, {
            meal: currentCachedMeal,
            notices: hydratedNotices,
          });
          setNotices(hydratedNotices);
          void warmImageCacheBatch(hydratedNotices.flatMap(item => item.contentImages ?? []));
          hasHydratedPersistentNotices = true;
        }

        if (isMounted && hasHydratedPersistentNotices) {
          setIsPullRefreshing(false);
        }
      }

      if (!hasHydratedPersistentMeal) {
        setContentLoading(true);
      }

      try {
        let contentRequest = dormitoryContentRequestRef.current.get(activeDormitory);
        if (!contentRequest || shouldForceReload) {
          const shouldIncludeMeal = !mealFetchInitializedRef.current.has(activeDormitory);
          if (shouldIncludeMeal) {
            mealFetchInitializedRef.current.add(activeDormitory);
          }

          contentRequest = fetchDormitoryContent(activeDormitory, {
            includeMeal: shouldIncludeMeal,
          });
          dormitoryContentRequestRef.current.set(activeDormitory, contentRequest);
        }

        const result = await contentRequest.finally(() => {
          if (dormitoryContentRequestRef.current.get(activeDormitory) === contentRequest) {
            dormitoryContentRequestRef.current.delete(activeDormitory);
          }
        });

        if (!isMounted) {
          return;
        }

        const mergedNotices = mergeNoticesWithDetailCache(activeDormitory, result.notices);
        hydrateNoticeDetailCacheFromNotices(activeDormitory, mergedNotices);
        const currentCachedMeal = dormitoryContentCacheRef.current.get(activeDormitory)?.meal ?? null;
        const resolvedMeal = result.meal ?? currentCachedMeal;

        dormitoryContentCacheRef.current.set(activeDormitory, {
          meal: resolvedMeal,
          notices: mergedNotices,
        });
        setNotices(mergedNotices);
        setMeal(resolvedMeal);
        if (resolvedMeal) {
          void setStoredDormitoryMealCache(activeDormitory, resolvedMeal);
        }
        void setStoredDormitoryNoticeCache(activeDormitory, mergedNotices);
        warmDormitoryContentMedia({
          meal: resolvedMeal,
          notices: mergedNotices,
        });

        const previewTargets = mergedNotices
          .filter(item => Boolean(item.sourceUrl) && item.body.trim().length === 0)
          .slice(0, NOTICE_PREVIEW_PREFETCH_LIMIT);

        if (previewTargets.length > 0) {
          Promise.allSettled(
            previewTargets.map(item => fetchNoticeDetail(activeDormitory, item)),
          )
            .then(prefetched => {
              if (!isMounted) {
                return;
              }

              const updates = new Map<string, NoticeItem>();
              prefetched.forEach(entry => {
                if (entry.status !== 'fulfilled') {
                  return;
                }

                const detailed = entry.value;
                if (
                  detailed.body.trim().length > 0 ||
                  detailed.attachments.length > 0 ||
                  detailed.title !== '' ||
                  detailed.date !== ''
                ) {
                  updates.set(detailed.id, detailed);
                  const cacheKey = buildNoticeCacheKey(activeDormitory, detailed.id);
                  noticeDetailCacheRef.current.set(cacheKey, {
                    value: detailed,
                    expiresAt: Date.now() + NOTICE_DETAIL_CACHE_TTL_MS,
                  });
                }
              });

              if (updates.size === 0) {
                return;
              }

              void warmImageCacheBatch(
                Array.from(updates.values()).flatMap(item => item.contentImages ?? []),
              );
              setNotices(current => {
                const nextNotices = current.map(item => updates.get(item.id) ?? item);
                const currentCached = dormitoryContentCacheRef.current.get(activeDormitory);
                dormitoryContentCacheRef.current.set(activeDormitory, {
                  meal: currentCached?.meal ?? resolvedMeal ?? null,
                  notices: nextNotices,
                });
                hydrateNoticeDetailCacheFromNotices(activeDormitory, nextNotices);
                void setStoredDormitoryNoticeCache(activeDormitory, nextNotices);
                return nextNotices;
              });
            })
            .catch(() => undefined);
        }
      } catch {
        if (!isMounted) {
          return;
        }

        const fallbackContent = dormitoryContentCacheRef.current.get(activeDormitory);
        if (fallbackContent) {
          setNotices(fallbackContent.notices);
          setMeal(fallbackContent.meal);
        } else {
          setNotices([]);
          setMeal(null);
        }
        setContentError(SYNC_DELAY_MESSAGE);
      } finally {
        if (isMounted) {
          setContentLoading(false);
          setIsPullRefreshing(false);
        }
      }
    };

    loadContent().catch(() => {
      if (isMounted) {
        setContentLoading(false);
        setIsPullRefreshing(false);
        setContentError(SYNC_DELAY_MESSAGE);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [selectedDormitory, reloadSeq]);

  useEffect(() => {
    const mealImageUri = meal?.imageUri;
    const noticeImageUris = notices.flatMap(item => item.contentImages ?? []);
    let cancelled = false;

    if (mealImageUri) {
      void warmImageCache(mealImageUri).finally(() => {
        if (!cancelled && noticeImageUris.length > 0) {
          void warmImageCacheBatch(noticeImageUris);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (noticeImageUris.length > 0) {
      void warmImageCacheBatch(noticeImageUris);
    }

    return () => {
      cancelled = true;
    };
  }, [meal?.imageUri, notices]);

  useEffect(() => {
    if (!selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      return;
    }

    if (startupMealPrefetchDoneRef.current) {
      return;
    }

    startupMealPrefetchDoneRef.current = true;

    HOME_SWITCHABLE_DORMITORY_CODES.forEach(prefetchTarget => {
      if (mealFetchInitializedRef.current.has(prefetchTarget)) {
        return;
      }

      mealFetchInitializedRef.current.add(prefetchTarget);

      const existingRequest = dormitoryContentRequestRef.current.get(prefetchTarget);
      const prefetchRequest =
        existingRequest ??
        fetchDormitoryContent(prefetchTarget, {
          includeMeal: true,
        });
      if (!existingRequest) {
        dormitoryContentRequestRef.current.set(prefetchTarget, prefetchRequest);
      }

      prefetchRequest
        .then(result => {
          const mergedNotices = mergeNoticesWithDetailCache(prefetchTarget, result.notices);
          hydrateNoticeDetailCacheFromNotices(prefetchTarget, mergedNotices);
          const currentCachedMeal = dormitoryContentCacheRef.current.get(prefetchTarget)?.meal ?? null;
          const resolvedMeal = result.meal ?? currentCachedMeal;
          const mergedContent = {
            meal: resolvedMeal,
            notices: mergedNotices,
          };
          dormitoryContentCacheRef.current.set(prefetchTarget, mergedContent);
          if (resolvedMeal) {
            void setStoredDormitoryMealCache(prefetchTarget, resolvedMeal);
          }
          void setStoredDormitoryNoticeCache(prefetchTarget, mergedNotices);
          warmDormitoryContentMedia(mergedContent);
        })
        .catch(() => undefined)
        .finally(() => {
          if (dormitoryContentRequestRef.current.get(prefetchTarget) === prefetchRequest) {
            dormitoryContentRequestRef.current.delete(prefetchTarget);
          }
        });
    });
  }, [selectedDormitory]);

  useEffect(() => {
    if (startupHomeTransitionTimerRef.current) {
      clearTimeout(startupHomeTransitionTimerRef.current);
      startupHomeTransitionTimerRef.current = null;
    }

    if (!pendingStartupHome) {
      startupSplashStartedAtRef.current = null;
      return;
    }

    if (!selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      startupSplashStartedAtRef.current = null;
      setPendingStartupHome(false);
      return;
    }

    const splashStartedAt = startupSplashStartedAtRef.current ?? Date.now();
    startupSplashStartedAtRef.current = splashStartedAt;
    const elapsedMs = Date.now() - splashStartedAt;
    const waitMs = Math.max(0, STARTUP_SPLASH_MIN_VISIBLE_MS - elapsedMs);

    startupHomeTransitionTimerRef.current = setTimeout(() => {
      startupHomeTransitionTimerRef.current = null;
      startupSplashStartedAtRef.current = null;
      setPendingStartupHome(false);
      navigate('HOME', { direction: 'none' });
    }, waitMs);

    return () => {
      if (startupHomeTransitionTimerRef.current) {
        clearTimeout(startupHomeTransitionTimerRef.current);
        startupHomeTransitionTimerRef.current = null;
      }
    };
  }, [pendingStartupHome, selectedDormitory]);

  const handleContinueOnboarding = async (overrideCode?: DormitoryCode) => {
    const targetCode = overrideCode ?? onboardingSelection;
    if (!targetCode || !ONBOARDING_DORMITORY_CODES.includes(targetCode)) {
      openDialog('선택 안내', '현재는 행복기숙사 또는 직영기숙사만 선택할 수 있습니다.');
      return;
    }

    const storageSaved = await setStoredDormitory(targetCode);
    if (!storageSaved) {
      openDialog('저장 실패', '선택 정보를 저장하지 못했습니다. 다시 시도해주세요.');
      return;
    }

    setDefaultDormitory(targetCode);
    setSelectedDormitory(targetCode);
    setOnboardingSelection(targetCode);
    forceReloadDormitoryRef.current = null;
    setSelectedNotice(null);
    setMealTab('BREAKFAST');
    setPendingStartupHome(false);
    const returnScreen = onboardingReturnScreen;
    setOnboardingReturnScreen(null);
    if (returnScreen === 'SETTINGS') {
      navigate('SETTINGS', { direction: 'back' });
      return;
    }

    navigate(resolveEntryScreen(targetCode), { direction: 'none' });
  };

  const handleChangeDormitory = (returnScreen: 'SETTINGS' | null = null) => {
    const onboardingBaseDormitory =
      returnScreen === 'SETTINGS' ? defaultDormitory : selectedDormitory;

    if (onboardingBaseDormitory && ONBOARDING_DORMITORY_CODES.includes(onboardingBaseDormitory)) {
      setOnboardingSelection(onboardingBaseDormitory);
    } else {
      setOnboardingSelection(null);
    }
    setOnboardingReturnScreen(returnScreen);
    forceReloadDormitoryRef.current = null;
    setIsPullRefreshing(false);
    setPendingStartupHome(false);
    navigate('ONBOARDING', { direction: 'forward' });
  };

  const handleQuickDormitorySwitch = () => {
    const currentSwitchIndex = HOME_SWITCHABLE_DORMITORY_CODES.findIndex(
      code => code === selectedDormitoryRef.current,
    );
    const nextDormitory =
      currentSwitchIndex >= 0
        ? HOME_SWITCHABLE_DORMITORY_CODES[(currentSwitchIndex + 1) % HOME_SWITCHABLE_DORMITORY_CODES.length]
        : HOME_SWITCHABLE_DORMITORY_CODES[0];
    const nextCachedContent = dormitoryContentCacheRef.current.get(nextDormitory);

    selectedDormitoryRef.current = nextDormitory;
    setSelectedDormitory(nextDormitory);
    forceReloadDormitoryRef.current = null;
    setSelectedNotice(null);
    setMealTab('BREAKFAST');
    setPendingStartupHome(false);

    if (nextCachedContent) {
      startTransition(() => {
        setNotices(nextCachedContent.notices);
        setMeal(nextCachedContent.meal);
        setContentLoading(false);
        setContentError(null);
        setIsPullRefreshing(false);
      });
      warmDormitoryContentMedia(nextCachedContent);
    } else {
      const pendingNextRequest = dormitoryContentRequestRef.current.get(nextDormitory);
      if (pendingNextRequest) {
        pendingNextRequest
          .then(result => {
            if (result.meal?.imageUri) {
              void warmImageCache(result.meal.imageUri);
            }
          })
          .catch(() => undefined);
      }
    }
  };

  const isNoticeFavorited = (noticeId: string) => {
    if (!selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      return false;
    }

    const key = buildFavoriteNoticeStorageKey(selectedDormitory, noticeId);
    return favoriteNoticeKeys.has(key);
  };

  const handleToggleFavoriteNotice = (notice: NoticeItem | null) => {
    if (!notice || !selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      return;
    }

    const key = buildFavoriteNoticeStorageKey(selectedDormitory, notice.id);
    const nextKeys = new Set(favoriteNoticeKeysRef.current);

    if (nextKeys.has(key)) {
      nextKeys.delete(key);
    } else {
      nextKeys.add(key);
    }

    favoriteNoticeKeysRef.current = nextKeys;
    setFavoriteNoticeKeys(nextKeys);
    void setStoredFavoriteNoticeKeys(Array.from(nextKeys));
  };

  const handleOpenNotice = async (
    noticeId: string,
    _returnScreen: 'HOME' | 'NOTICE_LIST' = 'NOTICE_LIST',
  ) => {
    if (!isActiveDormitory(selectedDormitory)) {
      openDialog('기숙사 선택 필요', '거주 기숙사를 선택하면 공지를 확인할 수 있습니다.');
      return;
    }

    const notice = notices.find(item => item.id === noticeId);
    if (!notice) {
      return;
    }

    const cacheKey = buildNoticeCacheKey(selectedDormitory, notice.id);
    const cachedDetail = noticeDetailCacheRef.current.get(cacheKey);
    if (cachedDetail && cachedDetail.expiresAt > Date.now()) {
      setSelectedNotice(cachedDetail.value);
      navigate('NOTICE_DETAIL', { direction: 'forward' });
      setNoticeDetailLoading(false);
      void warmImageCacheBatch(cachedDetail.value.contentImages ?? []);

      void fetchNoticeDetail(selectedDormitory, notice)
        .then(refreshedDetail => {
          noticeDetailCacheRef.current.set(cacheKey, {
            value: refreshedDetail,
            expiresAt: Date.now() + NOTICE_DETAIL_CACHE_TTL_MS,
          });
          setNotices(current => current.map(item => (item.id === refreshedDetail.id ? refreshedDetail : item)));
          syncDormitoryNoticeToCache(selectedDormitory, refreshedDetail);
          void warmImageCacheBatch(refreshedDetail.contentImages ?? []);
          setSelectedNotice(current => {
            if (!current || current.id !== refreshedDetail.id) {
              return current;
            }
            return refreshedDetail;
          });
        })
        .catch(() => undefined);

      return;
    }
    noticeDetailCacheRef.current.delete(cacheKey);

    setSelectedNotice(notice);
    navigate('NOTICE_DETAIL', { direction: 'forward' });
    setNoticeDetailLoading(true);

    try {
      const detailedNotice = await fetchNoticeDetail(selectedDormitory, notice);
      setSelectedNotice(detailedNotice);
      noticeDetailCacheRef.current.set(cacheKey, {
        value: detailedNotice,
        expiresAt: Date.now() + NOTICE_DETAIL_CACHE_TTL_MS,
      });
      setNotices(current => current.map(item => (item.id === detailedNotice.id ? detailedNotice : item)));
      syncDormitoryNoticeToCache(selectedDormitory, detailedNotice);
      void warmImageCacheBatch(detailedNotice.contentImages ?? []);
    } catch {
      setSelectedNotice(notice);
    } finally {
      setNoticeDetailLoading(false);
    }
  };

  const handleOpenMeal = () => {
    navigate('MEAL', { direction: 'forward' });
  };

  const handleOpenHomeMealZoom = () => {
    if (!meal?.imageUri) {
      handleOpenMeal();
      return;
    }

    setHomeMealZoomVisible(true);
  };

  const handleOpenWebView = (
    title: string,
    url: string | undefined,
    returnScreen: Screen = activeScreenRef.current,
    sourceActionId?: QuickAction['id'],
  ) => {
    if (!url) {
      openDialog('준비중', '연결할 주소를 아직 확인하지 못했습니다.');
      return;
    }

    setWebViewTarget({ title, url, returnScreen, sourceActionId });
    navigate('WEBVIEW', { direction: 'forward' });
  };

  const resolveQuickActionUrl = (action: QuickAction) => {
    const normalizeUrl = (candidate: string | undefined) => {
      if (typeof candidate !== 'string') {
        return undefined;
      }
      const trimmed = candidate.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const directUrl = normalizeUrl(action.url);
    if (directUrl) {
      return directUrl;
    }

    const lookupDormitories: DormitoryCode[] = [];
    const currentDormitory = selectedDormitoryRef.current;
    if (currentDormitory) {
      lookupDormitories.push(currentDormitory);
    }
    if (defaultDormitory && !lookupDormitories.includes(defaultDormitory)) {
      lookupDormitories.push(defaultDormitory);
    }
    HOME_SWITCHABLE_DORMITORY_CODES.forEach(code => {
      if (!lookupDormitories.includes(code)) {
        lookupDormitories.push(code);
      }
    });

    for (const code of lookupDormitories) {
      const fallbackAction = quickActionsByDormitory[code].find(item => item.id === action.id);
      const fallbackUrl = normalizeUrl(fallbackAction?.url);
      if (fallbackUrl) {
        return fallbackUrl;
      }
    }

    const activeFallbackDormitory =
      isActiveDormitory(selectedDormitoryRef.current)
        ? selectedDormitoryRef.current
        : isActiveDormitory(defaultDormitory)
          ? defaultDormitory
          : 'ASAN_HAPPY';

    if (action.id === 'merit' || action.id === 'outing') {
      return activeFallbackDormitory === 'ASAN_DIRECT'
        ? 'https://mintranet.hsu.ac.kr/index.do'
        : 'https://happydorm.hoseo.ac.kr/login';
    }

    if (action.id === 'phone') {
      return 'https://hoseoin.hoseo.ac.kr/Home/Contents.mbz?action=MAPP_2104261706';
    }

    if (action.id === 'rules') {
      return activeFallbackDormitory === 'ASAN_DIRECT'
        ? 'https://hoseoin.hoseo.ac.kr/Home/Contents.mbz?action=MAPP_2104261720'
        : 'https://happydorm.hoseo.ac.kr/page/about7';
    }

    return undefined;
  };

  const handleOpenAttachment = (attachment: string) => {
    if (isLikelyUrl(attachment)) {
      Linking.openURL(attachment).catch(() => {
        openDialog('첨부파일 안내', '첨부파일을 열 수 없습니다. 원문에서 다시 시도해주세요.');
      });
      return;
    }

    openDialog('첨부파일 안내', '첨부파일 상세 링크는 원문 보기에서 확인해주세요.');
  };

  const handleQuickAction = async (action: QuickAction, returnScreen: Screen) => {
    if (action.id === 'meal-large') {
      handleOpenMeal();
      return;
    }

    if (action.type === 'WEBVIEW' || action.type === 'INFO') {
      const resolvedActionUrl = resolveQuickActionUrl(action);
      handleOpenWebView(action.label, resolvedActionUrl, returnScreen, action.id);
      return;
    }

    try {
      await openMetaClubApp();
    } catch {
      openDialog('세탁실 앱 안내', '앱 실행이 실패했습니다. 스토어에서 설치 여부를 확인해주세요.');
    }
  };

  const handleRetryInternetConnection = () => {
    NetInfo.fetch()
      .then(state => {
        setIsInternetConnected(isInternetAvailable(state));
      })
      .catch(() => {
        setIsInternetConnected(false);
      });
  };

  const handleRefreshContent = () => {
    if (contentLoading || !selectedDormitory || !isActiveDormitory(selectedDormitory)) {
      return;
    }

    setIsPullRefreshing(true);
    forceReloadDormitoryRef.current = selectedDormitory;
    startTransition(() => {
      setReloadSeq(current => current + 1);
    });
  };

  const splashDormitoryCode = selectedDormitory ?? themedDormitoryCode;
  const splashBackgroundColor = getSplashBackgroundColorByDormitory(splashDormitoryCode);
  const safeAreaBackgroundColor = activeScreen === 'LOADING' ? splashBackgroundColor : colors.background;
  const safeAreaContentStyle = {
    backgroundColor: safeAreaBackgroundColor,
  };

  return (
    <View style={[styles.safeArea, safeAreaContentStyle]}>
      <View style={styles.container}>
        <NavigationContainer
          ref={navigationRef}
          onReady={() => {
            navigationReadyRef.current = true;
            syncActiveRoute();
            flushPendingNavigation();
          }}
          onStateChange={syncActiveRoute}>
          <AppStack.Navigator
            initialRouteName={initialRouteScreen}
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              contentStyle: { backgroundColor: colors.background },
            }}>
            <AppStack.Screen name="LOADING">
              {() => (
                <LoadingScreen
                  backgroundColor={splashBackgroundColor}
                  dormitoryCode={splashDormitoryCode}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="OFFLINE">
              {() => <OfflineConnectionScreen onRetry={handleRetryInternetConnection} />}
            </AppStack.Screen>
            <AppStack.Screen name="ONBOARDING">
              {() => (
                <OnboardingScreen
                  selectedCode={onboardingSelection}
                  onSelect={setOnboardingSelection}
                  onContinue={code => {
                    handleContinueOnboarding(code).catch(() => undefined);
                  }}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="HOME">
              {() => (
                <HomeScreen
                  dormitory={dormitory}
                  headerDormitoryCode={themedDormitoryCode}
                  isNeutral={isUndecided}
                  notices={notices}
                  meal={meal}
                  quickActions={quickActions}
                  contentLoading={contentLoading}
                  contentError={contentError}
                  onOpenNoticeList={() => navigate('NOTICE_LIST', { direction: 'forward' })}
                  onOpenMealZoom={handleOpenHomeMealZoom}
                  onOpenLife={() => navigate('LIFE', { direction: 'forward' })}
                  onToggleDormitory={handleQuickDormitorySwitch}
                  onOpenSettings={() => navigate('SETTINGS', { direction: 'forward' })}
                  onChangeDormitory={handleChangeDormitory}
                  onPressNotice={noticeId => {
                    void handleOpenNotice(noticeId, 'HOME');
                  }}
                  onPressQuickAction={action => handleQuickAction(action, 'HOME')}
                  refreshing={isPullRefreshing}
                  onRefresh={handleRefreshContent}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="COMING_SOON">
              {() => (
                <ComingSoonScreen
                  dormitoryLabel={dormitory?.label ?? '준비중'}
                  onChangeDormitory={handleChangeDormitory}
                  isDarkMode={isDarkMode}
                  onToggleDarkMode={onToggleDarkMode}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="NOTICE_LIST">
              {() => (
                <NoticeListScreen
                  notices={notices}
                  isActive={isActive}
                  contentLoading={contentLoading}
                  refreshing={isPullRefreshing}
                  onRefresh={handleRefreshContent}
                  onBack={() => navigate('HOME', { direction: 'back' })}
                  onOpenNotice={noticeId => {
                    void handleOpenNotice(noticeId, 'NOTICE_LIST');
                  }}
                  onSelectDormitory={handleChangeDormitory}
                  isNoticeFavorited={isNoticeFavorited}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="NOTICE_DETAIL">
              {() => (
                <NoticeDetailScreen
                  notice={selectedNotice}
                  loading={noticeDetailLoading}
                  onBack={() => navigate('HOME', { direction: 'back' })}
                  onOpenSource={() =>
                    handleOpenWebView(
                      '공지사항',
                      selectedNotice?.sourceUrl,
                      'NOTICE_DETAIL',
                    )
                  }
                  onOpenAttachment={handleOpenAttachment}
                  isFavorite={selectedNotice ? isNoticeFavorited(selectedNotice.id) : false}
                  onToggleFavorite={() => handleToggleFavoriteNotice(selectedNotice)}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="MEAL">
              {() => (
                <MealScreen
                  dormitoryLabel={dormitory?.label ?? '식단표'}
                  meal={meal}
                  active={isActive}
                  contentLoading={contentLoading}
                  tab={mealTab}
                  onBack={() => navigate('HOME', { direction: 'back' })}
                  onSelectDormitory={handleChangeDormitory}
                  onSelectTab={setMealTab}
                  onOpenSource={() => handleOpenWebView('식단 원문', meal?.sourceUrl, 'MEAL')}
                  onRefresh={handleRefreshContent}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="LIFE">
              {() => (
                <LifeScreen
                  dormitoryLabel={dormitory?.label ?? '생활'}
                  active={isActive}
                  quickActions={quickActions}
                  onBack={() => navigate('HOME', { direction: 'back' })}
                  onSelectDormitory={handleChangeDormitory}
                  onPressAction={action => handleQuickAction(action, 'LIFE')}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="SETTINGS">
              {() => (
                <SettingsScreen
                  dormitoryLabel={defaultDormitoryOption?.label ?? '선택 전'}
                  defaultDormitoryCode={defaultDormitory}
                  isDarkMode={isDarkMode}
                  onBack={() => navigate('HOME', { direction: 'back' })}
                  onChangeDormitory={() => handleChangeDormitory('SETTINGS')}
                  themePreference={themePreference}
                  onChangeThemePreference={onChangeThemePreference}
                />
              )}
            </AppStack.Screen>
            <AppStack.Screen name="WEBVIEW">
              {() => (
                <WebViewScreen
                  target={webViewTarget}
                  onBack={() => {
                    setWebViewTarget(null);
                    navigate('HOME', { direction: 'back' });
                  }}
                />
              )}
            </AppStack.Screen>
          </AppStack.Navigator>
        </NavigationContainer>

        <AppDialog
          visible={dialogState.visible}
          title={dialogState.title}
          message={dialogState.message}
          onClose={closeDialog}
        />

        <MealZoomModal
          visible={homeMealZoomVisible}
          imageUri={meal?.imageUri}
          onClose={() => setHomeMealZoomVisible(false)}
        />
      </View>
    </View>
  );
}

function LoadingScreen({
  backgroundColor,
  dormitoryCode,
}: {
  backgroundColor: string;
  dormitoryCode: DormitoryCode | null;
}) {
  const subtitle = getSplashSubtitleByDormitory(dormitoryCode);

  return (
    <View style={[styles.centeredScreen, { backgroundColor }]}>
      <Text style={styles.loadingTitle}>호서라이프</Text>
      <Text style={styles.loadingSubtitle}>{subtitle}</Text>
    </View>
  );
}

function OfflineConnectionScreen({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <View style={styles.offlineScreen}>
      <View style={styles.offlineIconWrap}>
        <MaterialCommunityIcon name="wifi-strength-alert-outline" size={30} style={styles.offlineIcon} />
      </View>
      <Text style={styles.offlineTitle}>인터넷 연결을 확인해주세요</Text>
      <Text style={styles.offlineSubtitle}>
        네트워크에 연결된 뒤 다시 시도하면 홈 화면으로 이동합니다.
      </Text>
      <Pressable onPress={onRetry} style={styles.offlineRetryButton}>
        <Text style={styles.offlineRetryButtonText}>다시 확인</Text>
      </Pressable>
    </View>
  );
}

function AnimatedEntrance({
  children,
  delay = 0,
  distance = 10,
  duration = 320,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  const scale = useRef(new Animated.Value(0.985)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(distance);
    scale.setValue(0.985);

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, distance, duration, opacity, scale, translateY]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}>
      {children}
    </Animated.View>
  );
}

function OnboardingScreen({
  selectedCode,
  onSelect,
  onContinue,
}: {
  selectedCode: DormitoryCode | null;
  onSelect: (code: DormitoryCode) => void;
  onContinue: (code: DormitoryCode) => void;
}) {
  const onboardingOptions = dormitoryOptions.filter(option =>
    ONBOARDING_DORMITORY_CODES.includes(option.code),
  );
  const [onboardingImageModeByCode, setOnboardingImageModeByCode] = useState<
    Partial<Record<DormitoryCode, 'ASSET' | 'URI' | 'FALLBACK'>>
  >({});
  const renderOption = (option: (typeof dormitoryOptions)[number]) => {
    const isSelected = selectedCode === option.code;
    const visual = ONBOARDING_CARD_VISUALS[option.code as 'ASAN_HAPPY' | 'ASAN_DIRECT'];
    const onboardingDormitoryTitle = option.label.replace(/^아산\s*/, '').trim() || option.label;
    const resolvedImageUri = Image.resolveAssetSource(visual.imageSource)?.uri;
    const imageMode = onboardingImageModeByCode[option.code] ?? 'ASSET';

    const handleOnboardingImageError = () => {
      setOnboardingImageModeByCode(current => {
        const currentMode = current[option.code] ?? 'ASSET';
        const nextMode =
          currentMode === 'ASSET'
            ? resolvedImageUri
              ? 'URI'
              : 'FALLBACK'
            : currentMode === 'URI'
              ? 'FALLBACK'
              : 'FALLBACK';
        if (currentMode === nextMode) {
          return current;
        }

        return {
          ...current,
          [option.code]: nextMode,
        };
      });
    };

    return (
      <Pressable
        key={option.code}
        onPress={() => {
          onSelect(option.code);
          onContinue(option.code);
        }}
        style={[styles.onboardingVisualCard, isSelected ? styles.onboardingVisualCardSelected : null]}>
        <View style={styles.onboardingVisualMedia}>
          {imageMode === 'FALLBACK' ? (
            <View style={styles.onboardingVisualFallback}>
              <MaterialCommunityIcon name="image-off-outline" size={22} style={styles.onboardingVisualFallbackIcon} />
              <Text style={styles.onboardingVisualFallbackText}>{onboardingDormitoryTitle}</Text>
            </View>
          ) : (
            <Image
              source={imageMode === 'URI' && resolvedImageUri ? { uri: resolvedImageUri } : visual.imageSource}
              resizeMode="cover"
              style={styles.onboardingVisualImage}
              onError={handleOnboardingImageError}
            />
          )}
        </View>
        <View style={styles.onboardingVisualMetaRow}>
          <View style={styles.onboardingVisualMetaText}>
            <Text style={styles.onboardingVisualMetaTitle}>{onboardingDormitoryTitle}</Text>
            <Text style={styles.onboardingVisualMetaSubtitle}>{visual.metaSubtitle}</Text>
          </View>
          <MaterialCommunityIcon
            name={isSelected ? 'check-circle' : 'chevron-right'}
            size={22}
            style={[styles.onboardingVisualArrowIcon, isSelected ? styles.onboardingVisualArrowIconSelected : null]}
          />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.onboardingScreen}>
      <ScrollView
        style={styles.onboardingScroll}
        contentContainerStyle={styles.onboardingScrollContent}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}>
        <View style={styles.onboardingMainContent}>
          <AnimatedEntrance delay={0} distance={12}>
            <View style={styles.onboardingTitleBlock}>
              <Text style={styles.onboardingHeadline}>현재 어디에{'\n'}살고 있나요?</Text>
              <Text style={styles.onboardingSubhead}>거주하시는 기숙사를 선택해주세요.</Text>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={70} distance={14}>
            <View style={styles.onboardingCardColumn}>{onboardingOptions.map(renderOption)}</View>
          </AnimatedEntrance>
        </View>
      </ScrollView>
    </View>
  );
}

function HomeHeaderIcon({
  dormitoryCode,
}: {
  dormitoryCode?: DormitoryCode | null;
}) {
  const targetCode = dormitoryCode === 'ASAN_DIRECT' ? 'ASAN_DIRECT' : 'ASAN_HAPPY';
  const logoSource: ImageSourcePropType =
    Platform.OS === 'ios'
      ? { uri: HOME_HEADER_IOS_NATIVE_LOGO_URIS[targetCode] }
      : HOME_HEADER_LOGOS[targetCode];

  return (
    <View style={styles.homeTopHeaderLogoWrap}>
      <Image
        source={logoSource}
        resizeMode="contain"
        style={styles.homeTopHeaderLogo}
      />
    </View>
  );
}

function HomeScreen({
  dormitory,
  headerDormitoryCode,
  isNeutral,
  notices,
  meal,
  quickActions,
  contentLoading,
  contentError,
  onOpenNoticeList,
  onOpenMealZoom,
  onOpenLife,
  onToggleDormitory,
  onOpenSettings,
  onChangeDormitory,
  onPressNotice,
  onPressQuickAction,
  refreshing,
  onRefresh,
}: {
  dormitory: ReturnType<typeof getDormitoryOption>;
  headerDormitoryCode?: DormitoryCode | null;
  isNeutral: boolean;
  notices: NoticeItem[];
  meal: MealItem | null;
  quickActions: QuickAction[];
  contentLoading: boolean;
  contentError: string | null;
  onOpenNoticeList: () => void;
  onOpenMealZoom: () => void;
  onOpenLife: () => void;
  onToggleDormitory: () => void;
  onOpenSettings: () => void;
  onChangeDormitory: () => void;
  onPressNotice: (noticeId: string) => void;
  onPressQuickAction: (action: QuickAction) => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const dormitoryDisclosureLabel =
    dormitory?.code === 'ASAN_DIRECT'
      ? '직영기숙사'
      : dormitory?.code === 'ASAN_HAPPY'
        ? '행복기숙사'
        : '행복기숙사/직영기숙사';
  const homeRefreshIndicatorColor = isDarkPalette(colors) ? '#C7C7CC' : '#8E8E93';
  const homeDisclosureText = `본 앱은 호서대학교 ${dormitoryDisclosureLabel} 공식 웹사이트의 공개 정보를 비공식적으로 재구성하여 제공하며, 모든 자료에 대한 저작권은 호서대학교 ${dormitoryDisclosureLabel}에 귀속됩니다. 실제 운영 정보와 상이할 수 있으므로, 정확한 안내는 반드시 기숙사 공식 홈페이지를 참조하시기 바랍니다.`;
  const homeHeaderLogoCode = headerDormitoryCode ?? dormitory?.code ?? null;
  const homeHeaderLogo = <HomeHeaderIcon dormitoryCode={homeHeaderLogoCode} />;
  const homeDormitoryToggleSlot = (
    <View style={styles.homeDormitoryToggleSlot}>
      <DormitorySwitchToggle
        selectedDormitory={dormitory?.code ?? null}
        onToggle={onToggleDormitory}
      />
    </View>
  );

  if (isNeutral) {
    return (
      <View style={styles.homeScreen}>
        <TopHeader
          title="호서라이프"
          titleAlign="left"
          inset="wide"
          titleStyle={styles.homeTopHeaderTitle}
          titlePrefix={homeHeaderLogo}
          rightSlot={homeDormitoryToggleSlot}
        />
        <ScrollView
          style={styles.homeScroll}
          contentContainerStyle={styles.homeDashboardContent}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          showsVerticalScrollIndicator={false}>
          <AnimatedEntrance delay={70} distance={12}>
            <View style={styles.homeDashboardHeader}>
              <View style={styles.homeDormitoryIdentity}>
                <View style={styles.homeDormitoryTextBlock}>
                  <Text style={styles.homeDormitoryTitle}>호서라이프</Text>
                  <Text style={styles.homeDormitorySubtitle}>{APP_SUBTITLE}</Text>
                </View>
              </View>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={130} distance={14}>
            <View style={styles.homeNeutralHero}>
              <Text style={styles.homeNeutralHeroTitle}>현재 거주 중인 기숙사를 먼저 선택해주세요.</Text>
              <Text style={styles.homeNeutralHeroSubtitle}>
                공지, 식단, 생활 기능을 정확하게 맞춤 제공하기 위해 기숙사 선택이 필요합니다.
              </Text>
              <Pressable onPress={onChangeDormitory} style={styles.homeNeutralHeroButton}>
                <Text style={styles.homeNeutralHeroButtonText}>기숙사 선택하기</Text>
              </Pressable>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={190} distance={12}>
            <View style={styles.homeNeutralInfo}>
              <Text style={styles.homeNeutralInfoText}>아산 행복기숙사 / 아산 직영기숙사는 즉시 사용 가능합니다.</Text>
              <Text style={styles.homeNeutralInfoText}>천안 기숙사는 준비중 화면으로 연결됩니다.</Text>
              <Text style={styles.homeNeutralInfoText}>우측 상단 버튼으로 행복/직영 전환이 가능합니다.</Text>
            </View>
          </AnimatedEntrance>

          <AnimatedEntrance delay={250} distance={10}>
            <Pressable onPress={onOpenLife} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>생활 기능 미리 보기</Text>
            </Pressable>
          </AnimatedEntrance>

          <AnimatedEntrance delay={290} distance={8}>
            <Text style={styles.homeVersionText}>{APP_VERSION} gbnam</Text>
          </AnimatedEntrance>
          <AnimatedEntrance delay={320} distance={8}>
            <Text style={styles.homeDisclosureText}>{homeDisclosureText}</Text>
          </AnimatedEntrance>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.homeScreen}>
      <TopHeader
        title="호서라이프"
        titleAlign="left"
        inset="wide"
        titleStyle={styles.homeTopHeaderTitle}
        titlePrefix={homeHeaderLogo}
        rightSlot={homeDormitoryToggleSlot}
      />
      <ScrollView
        style={styles.homeScroll}
        contentContainerStyle={styles.homeDashboardContent}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={homeRefreshIndicatorColor}
            colors={[homeRefreshIndicatorColor]}
            progressBackgroundColor={colors.surface}
          />
        }
        showsVerticalScrollIndicator={false}>
        {contentError ? (
          <AnimatedEntrance delay={40} distance={8}>
            <InfoBanner title="동기화 지연" message={contentError} compact />
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance delay={90} distance={12}>
          <Pressable onPress={onOpenMealZoom} style={styles.homeMealHeroCard}>
            <View style={styles.homeMealHeroMedia}>
              {!meal ? (
                <View style={styles.mealPreviewSkeleton}>
                  <SkeletonBlock height={18} width="36%" />
                  <SkeletonBlock height={14} width="62%" />
                  <SkeletonBlock height={14} width="54%" />
                </View>
              ) : meal?.imageUri ? (
                <MealVisual key={meal.imageUri} uri={meal.imageUri} />
              ) : (
                <View style={styles.emptyMealPreview} />
              )}
            </View>
          </Pressable>
        </AnimatedEntrance>

        {quickActions.length > 0 ? (
          <AnimatedEntrance delay={150} distance={12}>
            <View style={styles.quickLaunchPanel}>
              <View style={styles.quickLaunchGrid}>
                {quickActions.slice(0, 4).map((action, index) => {
                  const quickLaunchPalette = getQuickLaunchPalette(index);
                  return (
                    <Pressable key={action.id} onPress={() => onPressQuickAction(action)} style={styles.quickLaunchItem}>
                      <View style={styles.quickLaunchIconShell}>
                        <View
                          style={[
                            styles.quickActionIcon,
                            styles.quickLaunchActionIcon,
                            {
                              backgroundColor: quickLaunchPalette.iconBackground,
                            },
                          ]}>
                          <MaterialCommunityIcon
                            name={getActionIconName(action)}
                            size={22}
                            style={[
                              styles.quickActionIconGlyph,
                              {
                                color: quickLaunchPalette.iconGlyph,
                              },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.quickLaunchLabel, { color: quickLaunchPalette.labelColor }]}>{action.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </AnimatedEntrance>
        ) : null}

        <AnimatedEntrance delay={200} distance={10}>
          <View style={styles.homeSectionHead}>
            <Text style={styles.homeSectionTitle}>최근 공지</Text>
            <Pressable onPress={onOpenNoticeList} style={styles.homeSectionIconButton} hitSlop={8}>
              <MaterialCommunityIcon name="chevron-right" size={18} style={styles.homeSectionIcon} />
            </Pressable>
          </View>
        </AnimatedEntrance>
        <AnimatedEntrance delay={240} distance={12}>
          <View style={styles.homeNoticeFeed}>
            {contentLoading && notices.length === 0 ? (
              <View style={styles.homeNoticeSkeletonList}>
                {Array.from({ length: 3 }).map((_, index) => (
                  <View key={`home-notice-skeleton-${index}`} style={[styles.homeNoticeCard, styles.homeNoticeSkeletonCard]}>
                    <View style={styles.homeNoticeSkeletonDot} />
                    <View style={styles.homeNoticeSkeletonTextGroup}>
                      <SkeletonBlock height={16} width={index === 1 ? '84%' : index === 2 ? '70%' : '76%'} />
                      <SkeletonBlock height={11} width={index === 1 ? '24%' : '20%'} />
                    </View>
                  </View>
                ))}
              </View>
            ) : notices.length > 0 ? (
              notices.slice(0, 3).map((notice, index) => (
                <AnimatedEntrance key={notice.id} delay={260 + index * 55} distance={10} duration={360}>
                  <Pressable onPress={() => onPressNotice(notice.id)} style={styles.homeNoticeCard}>
                    <View style={[styles.homeNoticeDot, notice.isPinned ? styles.homeNoticeDotPinned : null]} />
                    <View style={styles.homeNoticeTextGroup}>
                      <Text style={styles.homeNoticeTitle} numberOfLines={1}>
                        {notice.title}
                      </Text>
                      <Text style={styles.homeNoticeDate}>{notice.date}</Text>
                    </View>
                  </Pressable>
                </AnimatedEntrance>
              ))
            ) : (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateText}>아직 표시할 공지사항이 없습니다.</Text>
              </View>
            )}
          </View>
        </AnimatedEntrance>

        <AnimatedEntrance delay={330} distance={10}>
          <Pressable onPress={onOpenSettings} style={styles.homeDormitorySwitchButton}>
            <MaterialCommunityIcon name="cog-outline" size={14} style={styles.homeDormitorySwitchButtonIcon} />
            <Text style={styles.homeDormitorySwitchButtonText}>설정</Text>
          </Pressable>
        </AnimatedEntrance>
        <AnimatedEntrance delay={370} distance={8}>
          <Text style={styles.homeVersionText}>{APP_VERSION} gbnam</Text>
        </AnimatedEntrance>
        <AnimatedEntrance delay={400} distance={8}>
          <Text style={styles.homeDisclosureText}>{homeDisclosureText}</Text>
        </AnimatedEntrance>
      </ScrollView>
    </View>
  );
}

function ComingSoonScreen({
  dormitoryLabel,
  onChangeDormitory,
  isDarkMode,
  onToggleDarkMode,
}: {
  dormitoryLabel: string;
  onChangeDormitory: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}) {
  const comingSoonDormitoryTitle =
    dormitoryLabel.replace(/^(아산|천안)\s*/, '').trim() || dormitoryLabel;

  return (
    <View style={styles.homeScreen}>
      <TopHeader
        title={comingSoonDormitoryTitle}
        inset="wide"
        leftSlot={<View style={styles.topHeaderToggleSpacer} />}
        rightSlot={<TopActionButtons isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} inline />}
      />
      <View style={styles.comingSoonBody}>
        <Text style={styles.homeHeaderCaption}>선택된 기숙사</Text>
        <View style={styles.comingSoonCard}>
          <Text style={styles.comingSoonTitle}>준비중</Text>
          <Text style={styles.comingSoonDescription}>
            해당 기숙사 서비스는 현재 준비 중입니다. 추후 오픈 예정입니다.
          </Text>
          <Pressable onPress={onChangeDormitory} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>기숙사 다시 선택하기</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function NoticeListScreen({
  notices,
  isActive,
  contentLoading,
  refreshing,
  onRefresh,
  onBack,
  onOpenNotice,
  onSelectDormitory,
  isNoticeFavorited,
}: {
  notices: NoticeItem[];
  isActive: boolean;
  contentLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onOpenNotice: (noticeId: string) => void;
  onSelectDormitory: () => void;
  isNoticeFavorited: (noticeId: string) => boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(NOTICE_LIST_PAGE_SIZE, notices.length),
  );
  const nearBottomReachedRef = useRef(false);
  const firstNoticeId = notices[0]?.id ?? '';
  const lastNoticeId = notices[notices.length - 1]?.id ?? '';

  useEffect(() => {
    setVisibleCount(Math.min(NOTICE_LIST_PAGE_SIZE, notices.length));
    nearBottomReachedRef.current = false;
  }, [firstNoticeId, lastNoticeId, notices.length]);

  const visibleNotices = notices.slice(0, visibleCount);
  const hasMoreNotices = visibleCount < notices.length;

  const loadMoreNotices = () => {
    setVisibleCount(currentCount => {
      if (currentCount >= notices.length) {
        return currentCount;
      }

      return Math.min(currentCount + NOTICE_LIST_PAGE_SIZE, notices.length);
    });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!hasMoreNotices) {
      return;
    }

    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const isNearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 140;

    if (isNearBottom && !nearBottomReachedRef.current) {
      nearBottomReachedRef.current = true;
      loadMoreNotices();
      return;
    }

    if (!isNearBottom) {
      nearBottomReachedRef.current = false;
    }
  };

  const handleRefresh = () => {
    nearBottomReachedRef.current = false;
    setVisibleCount(Math.min(NOTICE_LIST_PAGE_SIZE, notices.length));
    onRefresh();
  };

  if (!isActive) {
    return (
      <View style={styles.noticeScreen}>
        <TopHeader title="공지사항" onBack={onBack} backButtonPosition="left" inset="wide" />
        <View style={styles.noticeNeutralContent}>
          <NeutralRequiredCard
            title="거주 기숙사 선택이 필요합니다"
            message="공지사항은 선택한 기숙사 기준으로 제공됩니다."
            ctaLabel="기숙사 선택하기"
            onPressCta={onSelectDormitory}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.noticeScreen}>
      <TopHeader title="공지사항" onBack={onBack} backButtonPosition="left" inset="wide" />

      <ScrollView
        style={styles.noticeScroll}
        contentContainerStyle={styles.noticeListContent}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={DEFAULT_REFRESH_COLOR}
            colors={[DEFAULT_REFRESH_COLOR]}
            progressBackgroundColor={colors.surface}
          />
        }
        bounces
        alwaysBounceVertical
        showsVerticalScrollIndicator={false}>
        <AnimatedEntrance delay={0} distance={12}>
          <View style={styles.noticeFeedBoard}>
            {contentLoading && notices.length === 0 ? (
              <View style={styles.noticeSkeletonWrap}>
                <SkeletonBlock height={12} width="22%" />
                <SkeletonBlock height={18} width="86%" />
                <SkeletonBlock height={12} width="20%" />
                <SkeletonBlock height={18} width="92%" />
                <SkeletonBlock height={12} width="24%" />
                <SkeletonBlock height={18} width="81%" />
                <SkeletonBlock height={12} width="20%" />
                <SkeletonBlock height={18} width="75%" />
              </View>
            ) : notices.length > 0 ? (
              visibleNotices.map((notice, index) => {
                const normalizedTitle = normalizeListPreviewText(notice.title);
                const isFavorited = isNoticeFavorited(notice.id);

                return (
                  <AnimatedEntrance
                    key={notice.id}
                    delay={100 + Math.min(index * 45, 360)}
                    distance={10}
                    duration={340}>
                    <Pressable
                      onPress={() => onOpenNotice(notice.id)}
                      style={[styles.noticeFeedItem, notice.isPinned ? styles.noticeFeedItemPinned : null]}>
                      <View style={styles.noticeFeedTopRow}>
                        <View style={styles.noticeFeedMetaRow}>
                          {notice.isPinned ? (
                            <View style={styles.noticeFeedPinnedIconChip}>
                              <MaterialCommunityIcon name="pin" size={12} style={styles.noticeFeedPinnedIcon} />
                            </View>
                          ) : null}
                          <Text style={styles.noticeFeedDate}>{notice.date}</Text>
                          {notice.attachments.length > 0 ? <Text style={styles.noticeFeedAttachChip}>첨부</Text> : null}
                        </View>
                        <View style={styles.noticeFeedRightIcons}>
                          {isFavorited ? (
                            <MaterialCommunityIcon name="star" size={14} style={styles.noticeFeedFavoriteIcon} />
                          ) : null}
                          <MaterialCommunityIcon name="chevron-right" size={18} style={styles.noticeFeedArrow} />
                        </View>
                      </View>
                      <Text style={styles.noticeFeedTitle} numberOfLines={2}>
                        {normalizedTitle}
                      </Text>
                    </Pressable>
                  </AnimatedEntrance>
                );
              })
            ) : (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateText}>조건에 맞는 공지가 없습니다.</Text>
              </View>
            )}
            {hasMoreNotices ? (
              <View style={styles.noticeLoadMoreHint}>
                <ActivityIndicator color={isDarkPalette(colors) ? '#C7C7CC' : '#8E8E93'} size="small" />
                <Text style={styles.noticeLoadMoreHintText}>
                  스크롤하면 공지가 10개씩 추가로 표시됩니다.
                </Text>
              </View>
            ) : null}
          </View>
        </AnimatedEntrance>
      </ScrollView>
    </View>
  );
}

function NoticeDetailScreen({
  notice,
  loading,
  onBack,
  onOpenSource,
  onOpenAttachment,
  isFavorite,
  onToggleFavorite,
}: {
  notice: NoticeItem | null;
  loading: boolean;
  onBack: () => void;
  onOpenSource: () => void;
  onOpenAttachment: (attachment: string) => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const [zoomVisible, setZoomVisible] = useState(false);
  const [zoomImageIndex, setZoomImageIndex] = useState(0);
  const [noticeImageSizes, setNoticeImageSizes] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    let cancelled = false;

    setZoomVisible(false);
    setZoomImageIndex(0);
    const targets = notice?.contentImages ?? [];

    if (targets.length === 0) {
      setNoticeImageSizes({});
      return;
    }

    const initialSizes: Record<string, { width: number; height: number }> = {};
    const validRemoteTargets: string[] = [];
    targets.forEach(imageUri => {
      if (!isLikelyUrl(imageUri)) {
        return;
      }

      validRemoteTargets.push(imageUri);
      const cachedSize = getImageSizeFromCache(imageUri);
      if (cachedSize) {
        initialSizes[imageUri] = cachedSize;
      }
    });
    setNoticeImageSizes(initialSizes);
    void warmImageCacheBatch(validRemoteTargets);

    targets.forEach(imageUri => {
      if (!isLikelyUrl(imageUri)) {
        return;
      }

      void getCachedImageSize(imageUri).then(size => {
        if (!size || cancelled) {
          return;
        }

        setNoticeImageSizes(current => {
          const existing = current[imageUri];
          if (existing && existing.width === size.width && existing.height === size.height) {
            return current;
          }

          return {
            ...current,
            [imageUri]: size,
          };
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [notice?.id, notice?.contentImages]);

  const handleOpenNoticeImage = (targetIndex: number) => {
    if (!Number.isFinite(targetIndex) || targetIndex < 0) {
      return;
    }

    setZoomImageIndex(targetIndex);
    setZoomVisible(true);
  };

  const attachmentIcon = (attachment: string) => {
    const lower = attachment.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return 'file-pdf-box';
    }
    if (lower.endsWith('.hwp') || lower.endsWith('.hwpx') || lower.endsWith('.doc') || lower.endsWith('.docx')) {
      return 'file-document-outline';
    }
    if (isLikelyImageUrl(attachment)) {
      return 'file-image-outline';
    }
    return 'file-outline';
  };
  const attachmentName = (attachment: string) => {
    if (!isLikelyUrl(attachment)) {
      return attachment;
    }

    const decodedName = decodeURIComponent(
      attachment.split('/').pop()?.split('?')[0] ?? attachment,
    );
    return decodedName || attachment;
  };
  const attachmentMeta = (attachment: string) => {
    const sizeMatch = attachment.match(/(?:^|\s)(\d+(?:\.\d+)?\s?(?:KB|MB|GB))(?:$|\s|\))/i);
    return sizeMatch?.[1] ?? '첨부파일';
  };
  const attachmentTone = (attachment: string) => {
    const lower = attachment.toLowerCase();
    if (lower.endsWith('.pdf')) {
      return 'PDF' as const;
    }
    if (lower.endsWith('.hwp') || lower.endsWith('.hwpx') || lower.endsWith('.doc') || lower.endsWith('.docx')) {
      return 'DOC' as const;
    }
    if (isLikelyImageUrl(attachment)) {
      return 'IMG' as const;
    }
    return 'FILE' as const;
  };
  const noticeImages = notice?.contentImages ?? [];
  const hasNoticeImages = noticeImages.length > 0;
  const hasNoticeBody = Boolean(
    (notice?.body ?? '').trim() ||
      (notice?.bodyHtml ?? '').trim(),
  );
  const hasAttachments = (notice?.attachments.length ?? 0) > 0;
  const noticeCategoryLabel = notice ? getNoticeCategoryLabel(notice) : '공지사항';
  const handleOpenNoticeBodyLink = (targetUrl: string) => {
    if (!targetUrl) {
      return;
    }

    Linking.openURL(targetUrl).catch(() => undefined);
  };
  const renderNoticeBodyText = (content: string, keyPrefix: string) => {
    const segments = parseNoticeBodyWithLinks(content);
    return (
      <Text key={keyPrefix} style={styles.noticeDetailBodyText}>
        {segments.map((segment, index) =>
          segment.type === 'link' ? (
            <Text
              key={`${keyPrefix}-link-${index}-${segment.value}`}
              style={styles.noticeDetailBodyLink}
              suppressHighlighting
              onPress={() => handleOpenNoticeBodyLink(segment.url)}>
              {segment.value}
            </Text>
          ) : (
            <Text key={`${keyPrefix}-text-${index}`}>{segment.value}</Text>
          ),
        )}
      </Text>
    );
  };
  const renderNoticeTable = (table: NoticeBodyTable, keyPrefix: string) => {
    const isWideTable = table.columnCount > 2;
    const tableMinWidth = isWideTable ? table.columnCount * 108 : undefined;

    return (
      <View key={keyPrefix} style={styles.noticeTableContainer}>
        <ScrollView
          horizontal={isWideTable}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.noticeTableHorizontalContent}>
          <View style={[styles.noticeTableGrid, tableMinWidth ? { minWidth: tableMinWidth } : null]}>
            {table.rows.map((row, rowIndex) => (
              <View
                key={`${keyPrefix}-row-${rowIndex}`}
                style={[
                  styles.noticeTableRow,
                  row.isHeader ? styles.noticeTableRowHeader : null,
                  !row.isHeader && rowIndex % 2 === 1 ? styles.noticeTableRowStriped : null,
                  rowIndex === table.rows.length - 1 ? styles.noticeTableRowLast : null,
                ]}>
                {row.cells.map((cell, cellIndex) => (
                  <View
                    key={`${keyPrefix}-cell-${rowIndex}-${cellIndex}`}
                    style={[
                      styles.noticeTableCell,
                      table.columnCount === 1 ? styles.noticeTableCellSingleColumn : null,
                      cellIndex === row.cells.length - 1 ? styles.noticeTableCellLast : null,
                    ]}>
                    <Text
                      style={[
                        styles.noticeTableCellText,
                        row.isHeader ? styles.noticeTableCellTextHeader : null,
                      ]}>
                      {cell || ' '}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };
  const renderNoticeBody = () => {
    if (!notice) {
      return null;
    }

    const bodyBlocks = parseNoticeBodyBlocksFromHtml(notice.bodyHtml, notice.body);
    if (bodyBlocks.length === 0) {
      return null;
    }

    return (
      <View style={styles.noticeDetailBodyBlockStack}>
        {bodyBlocks.map((block, index) =>
          block.type === 'text'
            ? renderNoticeBodyText(block.value, `notice-body-${index}`)
            : renderNoticeTable(block.value, `notice-table-${index}`),
        )}
      </View>
    );
  };

  return (
    <View style={styles.noticeDetailScreen}>
      <TopHeader title="공지사항" onBack={onBack} backButtonPosition="left" inset="wide" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.noticeDetailScrollContent,
          { paddingBottom: 132 + safeAreaInsets.bottom },
        ]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}>
        {loading ? (
          <View style={styles.detailLoadingBox}>
            <ActivityIndicator color={isDarkPalette(colors) ? '#C7C7CC' : '#8E8E93'} />
            <Text style={styles.loadingInlineText}>공지 상세를 불러오는 중입니다.</Text>
          </View>
        ) : notice ? (
          <>
            <View style={styles.noticeDetailHeaderBlock}>
              <View style={styles.noticeDetailBadgeRow}>
                <Text style={styles.noticeDetailCategory}>{noticeCategoryLabel}</Text>
              </View>
              <Text style={styles.noticeDetailTitle}>{notice.title}</Text>
              <View style={styles.noticeDetailMetaRow}>
                <MaterialCommunityIcon name="calendar-month-outline" size={16} style={styles.noticeDetailMetaIcon} />
                <Text style={styles.noticeDetailMetaText}>{notice.date || '등록일 미확인'}</Text>
                <Text style={styles.noticeDetailMetaDivider}>•</Text>
                <Text style={styles.noticeDetailMetaText}>{notice.sourceName ?? '생활관 행정실'}</Text>
              </View>
            </View>

            <View style={styles.noticeDetailDivider} />
            <View style={styles.noticeDetailBodyCard}>
              {hasNoticeImages ? (
                <View style={styles.noticeDetailImageGroup}>
                  {noticeImages.map((imageUri, index) => (
                    <Pressable
                      key={`${imageUri}-${index}`}
                      onPress={() => handleOpenNoticeImage(index)}
                      style={styles.noticeDetailImageFrame}>
                      <NoticeInlineImage
                        uri={imageUri}
                        onResolveSize={(width, height) => {
                          if (!width || !height) {
                            return;
                          }

                          setNoticeImageSizes(current => {
                            const existing = current[imageUri];
                            if (existing && existing.width === width && existing.height === height) {
                              return current;
                            }

                            return {
                              ...current,
                              [imageUri]: { width, height },
                            };
                          });
                        }}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {hasNoticeBody ? renderNoticeBody() : null}
              {!hasNoticeImages && !hasNoticeBody ? (
                <Text style={styles.noticeDetailBodyText}>공지 본문은 원문 보기에서 확인할 수 있습니다.</Text>
              ) : null}
            </View>

            {hasAttachments ? (
              <View style={styles.noticeAttachmentSection}>
                <View style={styles.noticeAttachmentTitleRow}>
                  <MaterialCommunityIcon name="paperclip" size={18} style={styles.noticeAttachmentTitleIcon} />
                  <Text style={styles.noticeAttachmentTitle}>첨부파일</Text>
                  <Text style={styles.noticeAttachmentCount}>{notice.attachments.length}</Text>
                </View>

                {notice.attachments.map(attachment => (
                  <Pressable
                    key={attachment}
                    onPress={() => onOpenAttachment(attachment)}
                    style={styles.noticeAttachmentCard}>
                    <View
                      style={[
                        styles.noticeAttachmentIconBox,
                        attachmentTone(attachment) === 'PDF' ? styles.noticeAttachmentIconBoxPdf : null,
                        attachmentTone(attachment) === 'DOC' ? styles.noticeAttachmentIconBoxDoc : null,
                        attachmentTone(attachment) === 'IMG' ? styles.noticeAttachmentIconBoxImage : null,
                      ]}>
                      <MaterialCommunityIcon
                        name={attachmentIcon(attachment)}
                        size={20}
                        style={[
                          styles.noticeAttachmentIcon,
                          attachmentTone(attachment) === 'PDF' ? styles.noticeAttachmentIconPdf : null,
                          attachmentTone(attachment) === 'DOC' ? styles.noticeAttachmentIconDoc : null,
                          attachmentTone(attachment) === 'IMG' ? styles.noticeAttachmentIconImage : null,
                        ]}
                      />
                    </View>
                    <View style={styles.noticeAttachmentTextBox}>
                      <Text style={styles.noticeAttachmentName} numberOfLines={1}>
                        {attachmentName(attachment)}
                      </Text>
                      <Text style={styles.noticeAttachmentMeta}>{attachmentMeta(attachment)}</Text>
                    </View>
                    <MaterialCommunityIcon name="download" size={18} style={styles.noticeAttachmentDownloadIcon} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyStateText}>선택한 공지를 찾을 수 없습니다.</Text>
          </View>
        )}
      </ScrollView>

      {notice ? (
        <View style={[styles.noticeDetailBottomBar, { paddingBottom: 14 + safeAreaInsets.bottom }]}>
          <View style={styles.noticeDetailBottomBarRow}>
            <Pressable style={styles.noticeDetailPrimaryButton} onPress={onOpenSource}>
              <Text style={styles.noticeDetailPrimaryButtonText}>원문 보기</Text>
              <MaterialCommunityIcon name="open-in-new" size={15} style={styles.noticeDetailPrimaryButtonIcon} />
            </Pressable>
            <Pressable
              style={[
                styles.noticeDetailFavoriteButton,
                isFavorite ? styles.noticeDetailFavoriteButtonActive : null,
              ]}
              onPress={onToggleFavorite}>
              <MaterialCommunityIcon
                name={isFavorite ? 'star' : 'star-outline'}
                size={20}
                style={[
                  styles.noticeDetailFavoriteIcon,
                  isFavorite ? styles.noticeDetailFavoriteIconActive : null,
                ]}
              />
            </Pressable>
          </View>
        </View>
      ) : null}

      <MealZoomModal
        visible={zoomVisible}
        imageUris={noticeImages}
        initialIndex={zoomImageIndex}
        imageSizeMap={noticeImageSizes}
        onClose={() => setZoomVisible(false)}
      />
    </View>
  );
}

function NoticeInlineImage({
  uri,
  onResolveSize,
}: {
  uri: string;
  onResolveSize?: (width: number, height: number) => void;
}) {
  const [aspectRatio, setAspectRatio] = useState(1.25);

  useEffect(() => {
    let cancelled = false;

    void warmImageCache(uri);
    void getCachedImageSize(uri).then(size => {
      if (!size || cancelled) {
        return;
      }

      const nextRatio = size.width / size.height;
      if (!Number.isFinite(nextRatio) || nextRatio <= 0) {
        return;
      }

      setAspectRatio(nextRatio);
      onResolveSize?.(size.width, size.height);
    });

    return () => {
      cancelled = true;
    };
  }, [onResolveSize, uri]);

  const handleImageLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    const { width, height } = event.nativeEvent.source;
    if (!width || !height) {
      return;
    }

    const nextRatio = width / height;
    if (!Number.isFinite(nextRatio) || nextRatio <= 0) {
      return;
    }

    setAspectRatio(nextRatio);
    onResolveSize?.(width, height);
  };

  return (
    <Image
      source={getCachedImageSource(uri) ?? { uri }}
      onLoad={handleImageLoad}
      resizeMode="contain"
      style={[styles.noticeDetailImage, { aspectRatio }]}
    />
  );
}

function MealScreen({
  dormitoryLabel,
  meal,
  active,
  contentLoading: _contentLoading,
  tab,
  onBack,
  onSelectDormitory,
  onSelectTab,
  onOpenSource,
  onRefresh,
}: {
  dormitoryLabel: string;
  meal: MealItem | null;
  active: boolean;
  contentLoading: boolean;
  tab: MealTab;
  onBack: () => void;
  onSelectDormitory: () => void;
  onSelectTab: (tab: MealTab) => void;
  onOpenSource: () => void;
  onRefresh: () => void;
}) {
  const [viewerVisible, setViewerVisible] = useState(false);

  if (!active) {
    return (
      <View style={styles.screen}>
        <TopHeader title="식단표" onBack={onBack} />
        <NeutralRequiredCard
          title="거주 기숙사 선택이 필요합니다"
          message="식단은 선택한 기숙사 기준으로 제공됩니다."
          ctaLabel="기숙사 선택하기"
          onPressCta={onSelectDormitory}
        />
      </View>
    );
  }

  const selectedSection = meal?.sections?.find(section => section.id === tab) ?? meal?.sections?.[0];

  return (
    <View style={styles.screen}>
      <TopHeader title="식단표" onBack={onBack} />
      <Text style={styles.sectionCaption}>{dormitoryLabel}</Text>

      {!meal ? (
        <View style={styles.mealLoadingSkeletonWrap}>
          <View style={styles.mealLoadingToolbarSkeleton}>
            <SkeletonBlock height={20} width="44%" />
            <SkeletonBlock height={12} width="36%" />
          </View>
          <View style={styles.mealLoadingChipRow}>
            <SkeletonBlock height={34} width={84} />
            <SkeletonBlock height={34} width={84} />
            <SkeletonBlock height={34} width={84} />
          </View>
          <View style={styles.mealLoadingBodyCard}>
            <SkeletonBlock height={16} width="28%" />
            <SkeletonBlock height={14} width="92%" />
            <SkeletonBlock height={14} width="86%" />
            <SkeletonBlock height={14} width="74%" />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.mealToolbar}>
            <Text style={styles.mealToolbarTitle}>{meal.title}</Text>
            <Text style={styles.mealToolbarSubtitle}>마지막 업데이트 {meal.updatedAt}</Text>
          </View>

          {meal.sections && meal.sections.length > 0 ? (
            <>
              <View style={styles.chipRow}>
                {meal.sections.map(section => {
                  const selected = section.id === tab;
                  return (
                    <Pressable
                      key={section.id}
                      onPress={() => onSelectTab(section.id)}
                      style={[styles.categoryChip, selected ? styles.categoryChipActive : null]}>
                      <Text style={[styles.categoryChipText, selected ? styles.categoryChipTextActive : null]}>
                        {section.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.mealTextCard}>
                <Text style={styles.mealTextTitle}>{selectedSection?.label ?? '식단'}</Text>
                <Text style={styles.mealTextContent}>{selectedSection?.content ?? '식단 정보 없음'}</Text>
              </View>
            </>
          ) : (
            <>
              <Pressable onPress={() => setViewerVisible(true)} style={styles.mealViewer}>
                <MealVisual key={meal.imageUri} uri={meal.imageUri} />
                <View style={styles.mealViewerHintBox}>
                  <MaterialCommunityIcon name="gesture-pinch" size={18} style={styles.mealViewerHintIcon} />
                  <Text style={styles.mealViewerHintText}>핀치 인/아웃으로 확대</Text>
                </View>
              </Pressable>
            </>
          )}

          <Text style={styles.mealDescription}>{meal.description}</Text>

          <View style={styles.inlineActionRow}>
            <Pressable style={styles.secondaryButtonCompact} onPress={onRefresh}>
              <Text style={styles.secondaryButtonText}>다시 시도</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonCompact} onPress={onOpenSource}>
              <Text style={styles.secondaryButtonText}>원문 보기</Text>
            </Pressable>
          </View>
        </>
      )}

      <MealZoomModal visible={viewerVisible} imageUri={meal?.imageUri} onClose={() => setViewerVisible(false)} />
    </View>
  );
}

function LifeScreen({
  dormitoryLabel,
  active,
  quickActions,
  onBack,
  onSelectDormitory,
  onPressAction,
}: {
  dormitoryLabel: string;
  active: boolean;
  quickActions: QuickAction[];
  onBack: () => void;
  onSelectDormitory: () => void;
  onPressAction: (action: QuickAction) => void;
}) {
  return (
    <View style={styles.screen}>
      <TopHeader title="생활" onBack={onBack} />
      <View style={styles.lifeHeaderRow}>
        <Text style={styles.sectionCaption}>{dormitoryLabel}</Text>
      </View>

      {!active ? (
        <NeutralRequiredCard
          title="생활 기능을 사용하려면 기숙사를 선택하세요"
          message="상벌점 확인, 외출·외박 신청, 세탁실 앱 실행은 기숙사 선택 후 활성화됩니다."
          ctaLabel="기숙사 선택하기"
          onPressCta={onSelectDormitory}
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}>
          {quickActions.map(action => {
            const actionTone = getActionTone(action);
            return (
              <Pressable key={action.id} onPress={() => onPressAction(action)} style={styles.lifeActionCard}>
                <View
                  style={[
                    styles.quickActionIcon,
                    styles.lifeActionIcon,
                    actionTone === 'ACCENT' ? styles.quickActionIconAccent : null,
                    actionTone === 'MUTED' ? styles.quickActionIconMuted : null,
                  ]}>
                  <MaterialCommunityIcon
                    name={getActionIconName(action)}
                    size={18}
                    style={[
                      styles.quickActionIconGlyph,
                      actionTone === 'ACCENT' ? styles.quickActionIconGlyphAccent : null,
                      actionTone === 'MUTED' ? styles.quickActionIconGlyphMuted : null,
                    ]}
                  />
                </View>
                <Text style={styles.lifeActionTitle}>{action.label}</Text>
                <Text style={styles.lifeActionDescription}>{action.description}</Text>
                <View style={styles.badgeRow}>
                  {action.loginRequired ? <Badge label="로그인 필요" tone="PRIMARY" /> : null}
                  {action.official ? <Badge label="공식 연결" tone="ACCENT" /> : null}
                  <Badge label={action.type === 'EXTERNAL' ? '외부 앱' : '웹뷰'} tone="MUTED" />
                </View>
              </Pressable>
            );
          })}

          <View style={styles.noticeBanner}>
            <Text style={styles.bannerTitle}>생활 기능 안내</Text>
            <Text style={styles.bannerSubtitle}>
              로그인 기반 기능은 앱 내부 구현이 아닌 공식 사이트 연결 방식으로 제공합니다.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function SettingsScreen({
  dormitoryLabel,
  defaultDormitoryCode,
  isDarkMode,
  onBack,
  onChangeDormitory,
  themePreference,
  onChangeThemePreference,
}: {
  dormitoryLabel: string;
  defaultDormitoryCode: DormitoryCode | null;
  isDarkMode: boolean;
  onBack: () => void;
  onChangeDormitory: () => void;
  themePreference: ThemePreference;
  onChangeThemePreference: (nextPreference: ThemePreference) => void;
}) {
  const settingsDormitoryLabel =
    dormitoryLabel.replace(/^아산\s*/, '').trim() || dormitoryLabel;
  const settingsDormitoryPalette = getDormitoryBrandedPalette(
    isDarkMode ? DARK_COLORS : LIGHT_COLORS,
    defaultDormitoryCode,
  );
  const settingsDormitoryVisual =
    defaultDormitoryCode === 'ASAN_HAPPY' || defaultDormitoryCode === 'ASAN_DIRECT'
      ? ONBOARDING_CARD_VISUALS[defaultDormitoryCode]
      : null;

  return (
    <View style={styles.settingsScreen}>
      <TopHeader title="설정" onBack={onBack} backButtonPosition="left" inset="wide" />
      <ScrollView
        style={styles.settingsScroll}
        contentContainerStyle={styles.settingsContent}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}>
        <View style={styles.settingsCard}>
          <View style={styles.settingsSectionHeadRow}>
            <Text style={styles.settingsSectionTitle}>내 기숙사</Text>
            <View
              style={[
                styles.settingsCurrentBadge,
                {
                  backgroundColor: settingsDormitoryPalette.primarySoft,
                  borderColor: settingsDormitoryPalette.lineSoft,
                },
              ]}>
              <Text
                numberOfLines={1}
                style={[styles.settingsCurrentBadgeText, { color: settingsDormitoryPalette.primary700 }]}>
                {settingsDormitoryLabel}
              </Text>
            </View>
          </View>
          {settingsDormitoryVisual ? (
            <View
              style={[
                styles.settingsDormitoryImageFrame,
                {
                  borderColor: settingsDormitoryPalette.lineSoft,
                  backgroundColor: settingsDormitoryPalette.surfaceMuted,
                },
              ]}>
              <Image
                source={settingsDormitoryVisual.imageSource}
                resizeMode="cover"
                style={styles.settingsDormitoryImage}
              />
            </View>
          ) : null}
          <Pressable
            onPress={onChangeDormitory}
            style={[
              styles.settingsPrimaryButton,
              {
                backgroundColor: settingsDormitoryPalette.primarySoft,
                borderColor: settingsDormitoryPalette.lineSoft,
              },
            ]}>
            <Text style={[styles.settingsPrimaryButtonText, { color: settingsDormitoryPalette.primary700 }]}>
              기숙사 선택 변경
            </Text>
          </Pressable>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsSectionTitle}>화면 모드</Text>
          <View style={styles.settingsThemeOptionRow}>
            {THEME_PREFERENCE_OPTIONS.map(option => {
              const isSelected = option.value === themePreference;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onChangeThemePreference(option.value)}
                  style={[styles.settingsThemeOptionChip, isSelected ? styles.settingsThemeOptionChipSelected : null]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.settingsThemeOptionChipLabel,
                      isSelected ? styles.settingsThemeOptionChipLabelSelected : null,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.settingsCard}>
          <Text style={styles.settingsSectionTitle}>앱 정보</Text>
          <Text style={styles.settingsMuted}>{APP_VERSION} gbnam</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function WebViewScreen({
  target,
  onBack,
}: {
  target: { title: string; url: string; returnScreen: Screen; sourceActionId?: QuickAction['id'] } | null;
  onBack: () => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const [webError, setWebError] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [webRegionBlockedStatusCode, setWebRegionBlockedStatusCode] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const happyDormLastRedirectAtRef = useRef(0);
  const isRegionBlockedScreenVisible =
    FORCE_WEBVIEW_REGION_BLOCKED_SCREEN || webRegionBlockedStatusCode !== null;
  const webViewBlockedLanguageCards = [
    {
      key: 'ko',
      title: '페이지 연결이 원활하지 않아요',
      body: '학교 기숙사 홈페이지는 한국에서만 접속할 수 있어요. 한국 외 지역에서는 페이지가 열리지 않을 수 있습니다. 네트워크를 변경한 뒤 다시 시도해 주세요.',
      iconName: 'alert-circle-outline',
    },
    {
      key: 'en',
      title: 'This page is temporarily unavailable',
      body: 'The dormitory website is available only in Korea. Outside Korea, this page may not open. Please switch networks and try again.',
      iconName: 'earth-off',
    },
  ] as const;
  const showActionDateLabel =
    target?.sourceActionId === 'merit' || target?.sourceActionId === 'outing';
  const actionDateLabel = showActionDateLabel ? formatMonthDayWeekday(new Date()) : '';
  const useLeftBackButton =
    target?.returnScreen === 'NOTICE_DETAIL' ||
    target?.title.includes('원문') ||
    target?.sourceActionId === 'merit' ||
    target?.sourceActionId === 'outing' ||
    target?.sourceActionId === 'phone' ||
    target?.sourceActionId === 'rules';

  useEffect(() => {
    setWebError(false);
    setWebLoading(Boolean(target?.url) && !FORCE_WEBVIEW_REGION_BLOCKED_SCREEN);
    setWebRegionBlockedStatusCode(null);
    setReloadKey(0);
    happyDormLastRedirectAtRef.current = 0;
  }, [target?.url]);

  const tryHappyDormActionRedirect = (currentUrl?: string | null) => {
    if (!currentUrl) {
      return;
    }

    const sourceActionId = target?.sourceActionId;
    if (sourceActionId !== 'merit' && sourceActionId !== 'outing') {
      return;
    }

    const redirectUrl = resolveHappyDormQuickActionRedirectUrl(sourceActionId);
    if (!redirectUrl) {
      return;
    }

    const currentParsed = parseWebUrl(currentUrl);
    const redirectParsed = parseWebUrl(redirectUrl);
    if (
      currentParsed &&
      redirectParsed &&
      currentParsed.hostname === redirectParsed.hostname &&
      normalizeWebPath((currentParsed.pathname || '/').toLowerCase()) ===
        normalizeWebPath((redirectParsed.pathname || '/').toLowerCase())
    ) {
      return;
    }

    if (!isHappyDormHomeUrl(currentUrl)) {
      return;
    }

    const now = Date.now();
    if (now - happyDormLastRedirectAtRef.current < HAPPY_DORM_REDIRECT_COOLDOWN_MS) {
      return;
    }
    happyDormLastRedirectAtRef.current = now;
    const redirectScript = buildHappyDormQuickActionRedirectScript(sourceActionId);
    webViewRef.current?.injectJavaScript(redirectScript);
  };

  const handleWebViewNavigationChange = (navigationState: WebViewNavigation) => {
    tryHappyDormActionRedirect(navigationState.url);
  };

  const handleWebViewHttpError = (
    event: NativeSyntheticEvent<{
      statusCode: number;
      description?: string;
      url?: string;
    }>,
  ) => {
    const statusCode = event.nativeEvent.statusCode;
    setWebLoading(false);

    if (WEBVIEW_REGION_BLOCKED_HTTP_STATUS_CODES.has(statusCode)) {
      setWebRegionBlockedStatusCode(statusCode);
      return;
    }

    setWebError(true);
  };

  return (
    <View style={styles.webViewWrapper}>
      <TopHeader
        title={target?.title ?? ''}
        onBack={onBack}
        backButtonPosition={useLeftBackButton ? 'left' : 'right'}
        inset="wide"
        rightSlot={
          showActionDateLabel ? (
            <View style={styles.webViewActionDateSlot}>
              <Text numberOfLines={1} style={styles.webViewActionDateText}>
                {actionDateLabel}
              </Text>
            </View>
          ) : undefined
        }
      />
      {!target?.url ? (
        <View style={styles.webViewStateBox}>
          <Text style={styles.emptyStateText}>연결할 페이지 주소가 없습니다.</Text>
        </View>
      ) : isRegionBlockedScreenVisible ? (
        <View style={styles.webViewStateBox}>
          <View style={styles.webViewBlockedCardStack}>
            {webViewBlockedLanguageCards.map(card => (
              <View key={card.key} style={styles.webViewBlockedLanguageCard}>
                <MaterialCommunityIcon
                  name={card.iconName}
                  size={22}
                  style={styles.webViewBlockedLanguageIcon}
                />
                <Text style={styles.webViewBlockedLanguageTitle}>{card.title}</Text>
                <Text style={styles.webViewBlockedLanguageBody}>{card.body}</Text>
              </View>
            ))}
          </View>
          {webRegionBlockedStatusCode ? (
            <Text style={[styles.settingsMuted, styles.webViewBlockedStatusText]}>
              페이지를 불러오지 못하고 있어요. 잠시 후 다시 시도해 주세요.
            </Text>
          ) : null}
          {!FORCE_WEBVIEW_REGION_BLOCKED_SCREEN ? (
            <View style={styles.inlineActionRow}>
              <Pressable
                style={styles.secondaryButtonCompact}
                onPress={() => {
                  setWebRegionBlockedStatusCode(null);
                  setWebError(false);
                  setReloadKey(current => current + 1);
                }}>
                <Text style={styles.secondaryButtonText}>다시 시도</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : webError ? (
        <View style={styles.webViewStateBox}>
          <Text style={styles.bannerTitle}>페이지를 불러오지 못했습니다.</Text>
          <Text style={styles.emptyStateText}>네트워크 상태를 확인한 뒤 다시 시도해주세요.</Text>
          <View style={styles.inlineActionRow}>
            <Pressable
              style={styles.secondaryButtonCompact}
              onPress={() => {
                setWebError(false);
                setReloadKey(current => current + 1);
              }}>
              <Text style={styles.secondaryButtonText}>다시 시도</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.webViewContent}>
          <WebView
            ref={webViewRef}
            key={`webview-${reloadKey}`}
            style={styles.webViewFull}
            source={{ uri: target.url }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            onNavigationStateChange={handleWebViewNavigationChange}
            onHttpError={handleWebViewHttpError}
            onShouldStartLoadWithRequest={request => {
              const targetUrl = request.url?.trim();
              if (!targetUrl) {
                return false;
              }

              if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
                return true;
              }

              Linking.openURL(targetUrl).catch(() => undefined);
              return false;
            }}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={event => {
              setWebLoading(false);
              tryHappyDormActionRedirect(event.nativeEvent.url);
            }}
            onError={() => {
              if (webRegionBlockedStatusCode !== null) {
                return;
              }
              setWebLoading(false);
              setWebError(true);
            }}
          />
          {webLoading ? (
            <View style={styles.webViewLoadingOverlay} pointerEvents="none">
              <ActivityIndicator color={isDarkPalette(colors) ? '#C7C7CC' : '#8E8E93'} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function MealVisual({ uri }: { uri: string }) {
  const isSvgImage = isSvgDataUri(uri);
  const [aspectRatio, setAspectRatio] = useState(DEFAULT_LOADING_IMAGE_ASPECT_RATIO);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retrySeed, setRetrySeed] = useState(() => Date.now());
  const [imageCacheMode, setImageCacheMode] = useState<'CACHE_ONLY' | 'AUTO'>('CACHE_ONLY');
  const [imageLoaded, setImageLoaded] = useState(false);
  const hasLoadedCurrentImageRef = useRef(false);
  const resolvedImageUri = buildRetryImageUri(uri, retryAttempt, retrySeed);

  const applyAspectRatio = (width?: number, height?: number) => {
    if (typeof width === 'number' && typeof height === 'number' && width > 0 && height > 0) {
      setAspectRatio(width / height);
    }
  };
  const handleImageLoad = (event: NativeSyntheticEvent<ImageLoadEventData>) => {
    hasLoadedCurrentImageRef.current = true;
    setImageLoaded(true);
    applyAspectRatio(event.nativeEvent.source.width, event.nativeEvent.source.height);
  };
  const handleImageError = () => {
    if (!uri || isSvgImage) {
      return;
    }

    if (imageCacheMode === 'CACHE_ONLY') {
      setImageCacheMode('AUTO');
      return;
    }

    if (retryAttempt >= MEAL_IMAGE_MAX_RETRY_COUNT) {
      void warmImageCache(uri);
      return;
    }

    setRetryAttempt(current => current + 1);
    setRetrySeed(Date.now());
  };

  useEffect(() => {
    if (!uri) {
      setAspectRatio(DEFAULT_LOADING_IMAGE_ASPECT_RATIO);
      setRetryAttempt(0);
      setImageCacheMode('CACHE_ONLY');
      setImageLoaded(false);
      hasLoadedCurrentImageRef.current = false;
      return;
    }

    if (isSvgImage) {
      setAspectRatio(getSvgAspectRatioFromDataUri(uri) ?? DEFAULT_LOADING_IMAGE_ASPECT_RATIO);
      setRetryAttempt(0);
      setImageCacheMode('AUTO');
      setImageLoaded(true);
      hasLoadedCurrentImageRef.current = true;
      return;
    }

    setRetryAttempt(0);
    setRetrySeed(Date.now());
    setImageCacheMode('CACHE_ONLY');
    setImageLoaded(false);
    hasLoadedCurrentImageRef.current = false;

    let cancelled = false;
    const cacheOnlyFallbackTimer = setTimeout(() => {
      if (!cancelled && !hasLoadedCurrentImageRef.current) {
        setImageCacheMode('AUTO');
      }
    }, MEAL_IMAGE_CACHE_ONLY_FALLBACK_MS);
    void warmImageCache(uri);
    void getCachedImageSize(uri)
      .then(size => {
        if (cancelled) {
          return;
        }

        if (size) {
          applyAspectRatio(size.width, size.height);
        } else {
          setAspectRatio(DEFAULT_LOADING_IMAGE_ASPECT_RATIO);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAspectRatio(DEFAULT_LOADING_IMAGE_ASPECT_RATIO);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(cacheOnlyFallbackTimer);
    };
  }, [isSvgImage, uri]);

  if (isSvgImage) {
    return (
      <View style={[styles.mealPreviewImageFrame, { aspectRatio }]}>
        <WebView
          originWhitelist={['*']}
          scrollEnabled={false}
          source={{ html: buildMealHtml(uri) }}
          style={styles.mealWebView}
        />
      </View>
    );
  }

  return (
    <View style={[styles.mealPreviewImageFrame, { aspectRatio }]}>
      {!imageLoaded ? (
        <View style={styles.mealVisualLoadingSkeleton}>
          <SkeletonBlock height={18} width="36%" />
          <SkeletonBlock height={14} width="62%" />
          <SkeletonBlock height={14} width="54%" />
        </View>
      ) : null}
      <Image
        source={getCachedImageSource(resolvedImageUri, imageCacheMode) ?? { uri: resolvedImageUri }}
        onLoad={handleImageLoad}
        onError={handleImageError}
        style={[
          styles.mealPreviewImageContent,
          styles.mealVisualImageLayer,
          !imageLoaded ? styles.mealVisualImageHidden : null,
        ]}
      />
    </View>
  );
}

function MealZoomModal({
  visible,
  imageUri,
  imageUris,
  initialIndex = 0,
  imageWidth,
  imageHeight,
  imageSizeMap,
  onClose,
}: {
  visible: boolean;
  imageUri?: string;
  imageUris?: string[];
  initialIndex?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageSizeMap?: Record<string, { width: number; height: number }>;
  onClose: () => void;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const normalizedImageUris = (
    imageUris && imageUris.length > 0
      ? imageUris
      : imageUri
        ? [imageUri]
        : []
  ).filter((uri): uri is string => Boolean(uri));

  if (normalizedImageUris.length === 0) {
    return (
      <Modal
        visible={visible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onClose}>
        <View style={styles.mealZoomBackdrop}>
          <Text style={styles.mealZoomEmptyText}>표시할 식단 이미지가 없습니다.</Text>
        </View>
      </Modal>
    );
  }

  const closePaddingBottom = Math.max(24, safeAreaInsets.bottom + 4);
  const safeInitialIndex = Math.min(
    Math.max(Math.trunc(initialIndex), 0),
    normalizedImageUris.length - 1,
  );
  const imageItems = normalizedImageUris.map(uri => {
    const mappedSize = imageSizeMap?.[uri];
    const fallbackSize = !mappedSize && imageUri === uri ? { width: imageWidth, height: imageHeight } : undefined;
    const size = mappedSize ?? fallbackSize;

    return {
      url: uri,
      width: size?.width,
      height: size?.height,
      props: {
        source: getCachedImageSource(uri) ?? { uri },
      },
    };
  });

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <View style={styles.mealZoomBackdrop}>
        <ImageViewer
          imageUrls={imageItems}
          index={safeInitialIndex}
          enableImageZoom
          enablePreload
          enableSwipeDown
          onSwipeDown={onClose}
          onCancel={onClose}
          saveToLocalByLongPress={false}
          backgroundColor={colors.background}
          maxScale={5}
          renderIndicator={() => <View />}
          loadingRender={() => (
            <ActivityIndicator color={isDarkPalette(colors) ? '#C7C7CC' : '#8E8E93'} />
          )}
        />
        <View style={[styles.imageViewingFooter, { paddingBottom: closePaddingBottom }]}>
          <Pressable onPress={onClose} style={styles.imageViewingCloseButton}>
            <Text style={styles.imageViewingCloseButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DormitorySwitchToggle({
  selectedDormitory,
  onToggle,
  disabled = false,
}: {
  selectedDormitory: DormitoryCode | null;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const isDirectSelected = selectedDormitory === 'ASAN_DIRECT';
  const toggleProgress = useRef(new Animated.Value(isDirectSelected ? 1 : 0)).current;

  useEffect(() => {
    toggleProgress.stopAnimation();
    Animated.spring(toggleProgress, {
      toValue: isDirectSelected ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isDirectSelected, toggleProgress]);

  const thumbTranslateX = toggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, DORMITORY_TOGGLE_DIRECT_THUMB_TRANSLATE_X],
  });

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      style={[
        styles.dormitoryToggle,
        isDirectSelected ? styles.dormitoryToggleDirect : styles.dormitoryToggleHappy,
        disabled ? styles.dormitoryToggleDisabled : null,
      ]}>
      <Animated.View
        style={[
          styles.dormitoryToggleThumb,
          isDirectSelected ? styles.dormitoryToggleThumbDirect : styles.dormitoryToggleThumbHappy,
          { transform: [{ translateX: thumbTranslateX }] },
        ]}
      />
      <View pointerEvents="none" style={styles.dormitoryToggleLabelRow}>
        <View style={styles.dormitoryToggleLabelHalf}>
          <Text
            style={[
              styles.dormitoryToggleTrackLabel,
              !isDirectSelected ? styles.dormitoryToggleTrackLabelSelected : styles.dormitoryToggleTrackLabelUnselected,
            ]}>
            행복
          </Text>
        </View>
        <View style={styles.dormitoryToggleLabelHalf}>
          <Text
            style={[
              styles.dormitoryToggleTrackLabel,
              styles.dormitoryToggleTrackLabelDirect,
              isDirectSelected ? styles.dormitoryToggleTrackLabelSelected : styles.dormitoryToggleTrackLabelUnselected,
            ]}>
            직영
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function TopActionButtons({
  isDarkMode,
  onToggleDarkMode,
  inline = false,
}: {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  inline?: boolean;
}) {
  const toggleProgress = useRef(new Animated.Value(isDarkMode ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(toggleProgress, {
      toValue: isDarkMode ? 1 : 0,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isDarkMode, toggleProgress]);

  const thumbTranslateX = toggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 36],
  });
  const sunOpacity = toggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 0.38],
  });
  const moonOpacity = toggleProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.38, 0.96],
  });

  return (
    <View style={[styles.topActionRow, inline ? styles.topActionRowInline : null]}>
      <Pressable
        onPress={onToggleDarkMode}
        style={[styles.themeToggle, isDarkMode ? styles.themeToggleDark : styles.themeToggleLight]}>
        <View style={styles.themeToggleTrackIcons}>
          <Animated.View style={{ opacity: sunOpacity }}>
            <MaterialCommunityIcon
              name="weather-sunny"
              size={14}
              style={[styles.themeToggleTrackIcon, !isDarkMode ? styles.themeToggleTrackIconActive : null]}
            />
          </Animated.View>
          <Animated.View style={{ opacity: moonOpacity }}>
            <MaterialCommunityIcon
              name="weather-night"
              size={14}
              style={[styles.themeToggleTrackIcon, isDarkMode ? styles.themeToggleTrackIconActive : null]}
            />
          </Animated.View>
        </View>
        <Animated.View
          style={[
            styles.themeToggleThumb,
            isDarkMode ? styles.themeToggleThumbDark : styles.themeToggleThumbLight,
            {
              transform: [{ translateX: thumbTranslateX }],
            },
          ]}>
          <MaterialCommunityIcon
            name={isDarkMode ? 'weather-night' : 'weather-sunny'}
            size={15}
            style={[styles.themeToggleThumbIcon, isDarkMode ? styles.themeToggleThumbIconDark : styles.themeToggleThumbIconLight]}
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function TopHeader({
  title,
  onBack,
  backButtonPosition = 'right',
  titleAlign = 'center',
  inset = 'screen',
  leftSlot,
  rightSlot,
  titleStyle,
  titlePrefix,
}: {
  title: string;
  onBack?: () => void;
  backButtonPosition?: 'left' | 'right';
  titleAlign?: 'center' | 'left';
  inset?: 'screen' | 'wide';
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  titlePrefix?: React.ReactNode;
}) {
  const safeAreaInsets = useSafeAreaInsets();
  const showLeftBack = backButtonPosition === 'left' && Boolean(onBack);
  const showRightBack = backButtonPosition === 'right' && Boolean(onBack);
  const showCollapsedLeftSpacer = titleAlign === 'left' && !leftSlot && !showLeftBack;
  const isCenterTitle = titleAlign === 'center';
  const leftNode = leftSlot ? (
    <View style={styles.topHeaderCustomSlot}>{leftSlot}</View>
  ) : showLeftBack ? (
    <Pressable onPress={onBack} style={styles.topHeaderButton} hitSlop={6}>
      <MaterialCommunityIcon name="chevron-left" size={30} style={[styles.topHeaderButtonIcon, styles.topHeaderBackIcon]} />
    </Pressable>
  ) : (
    <View style={showCollapsedLeftSpacer ? styles.topHeaderSpacerCollapsed : styles.topHeaderSpacer} />
  );
  const rightNode = rightSlot ? (
    <View style={styles.topHeaderCustomSlot}>{rightSlot}</View>
  ) : showRightBack ? (
    <Pressable onPress={onBack} style={styles.topHeaderButton}>
      <MaterialCommunityIcon name="close" size={22} style={styles.topHeaderButtonIcon} />
    </Pressable>
  ) : (
    <View style={styles.topHeaderSpacer} />
  );

  return (
    <View
      style={[
        styles.topHeaderShell,
        inset === 'wide' ? styles.topHeaderShellWide : null,
        { paddingTop: safeAreaInsets.top },
      ]}>
      <View style={styles.topHeader}>
        {leftNode}
        {isCenterTitle ? (
          <View pointerEvents="none" style={styles.topHeaderTitleCenterOverlay}>
            <Text
              numberOfLines={1}
              style={[styles.topHeaderTitle, styles.topHeaderTitleCenter, titleStyle]}>
              {title}
            </Text>
          </View>
        ) : (
          <View style={styles.topHeaderTitleWrap}>
            <View style={styles.topHeaderTitleRow}>
              {titlePrefix ? <View style={styles.topHeaderTitlePrefix}>{titlePrefix}</View> : null}
              <Text
                numberOfLines={1}
                style={[styles.topHeaderTitle, styles.topHeaderTitleLeft, styles.topHeaderTitleInline, titleStyle]}>
                {title}
              </Text>
            </View>
          </View>
        )}
        {rightNode}
      </View>
    </View>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'PRIMARY' | 'ACCENT' | 'MUTED';
}) {
  return (
    <Text
      style={[
        styles.badgeBase,
        tone === 'PRIMARY' ? styles.badgePrimary : null,
        tone === 'ACCENT' ? styles.badgeAccent : null,
        tone === 'MUTED' ? styles.badgeMuted : null,
      ]}>
      {label}
    </Text>
  );
}

function SkeletonBlock({
  width = '100%',
  height = 14,
}: {
  width?: number | `${number}%` | '100%';
  height?: number;
}) {
  const pulseOpacity = useRef(new Animated.Value(0.64)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0.64,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => {
      pulse.stop();
    };
  }, [pulseOpacity]);

  return <Animated.View style={[styles.skeletonBlock, { width, height, opacity: pulseOpacity }]} />;
}

function NeutralRequiredCard({
  title,
  message,
  ctaLabel,
  onPressCta,
}: {
  title: string;
  message: string;
  ctaLabel: string;
  onPressCta: () => void;
}) {
  return (
    <View style={styles.neutralRequiredCard}>
      <Text style={styles.neutralRequiredTitle}>{title}</Text>
      <Text style={styles.neutralRequiredMessage}>{message}</Text>
      <Pressable style={styles.primaryButton} onPress={onPressCta}>
        <Text style={styles.primaryButtonText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

function InfoBanner({
  title,
  message,
  compact = false,
}: {
  title: string;
  message: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.noticeBanner, compact ? styles.noticeBannerCompact : null]}>
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerSubtitle}>{message}</Text>
    </View>
  );
}

function AppDialog({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialogCard}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogMessage}>{message}</Text>
          <Pressable onPress={onClose} style={styles.dialogButton}>
            <Text style={styles.dialogButtonText}>확인</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function isDormitoryCode(value: string | null): value is DormitoryCode {
  return dormitoryOptions.some(option => option.code === value);
}

function isSvgDataUri(uri: string) {
  return uri.startsWith('data:image/svg+xml');
}

function getSvgAspectRatioFromDataUri(uri: string) {
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

function isLikelyUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

type NoticeBodySegment =
  | {
      type: 'text';
      value: string;
    }
  | {
      type: 'link';
      value: string;
      url: string;
    };

type NoticeBodyTableRow = {
  cells: string[];
  isHeader: boolean;
};

type NoticeBodyTable = {
  rows: NoticeBodyTableRow[];
  columnCount: number;
};

type NoticeBodyBlock =
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

function parseNoticeBodyBlocksFromHtml(bodyHtml: string | undefined, fallbackBodyText: string) {
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

function parseNoticeBodyWithLinks(content: string): NoticeBodySegment[] {
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

function isLikelyImageUrl(value: string) {
  const lower = value.toLowerCase();
  if (/\.(png|jpe?g|gif|bmp|webp|svg)(?:[?#].*)?$/i.test(lower)) {
    return true;
  }

  return /thumbnailprint\.do|imgdownload|\/api\/image\//i.test(lower);
}

function getNoticeCategoryLabel(notice: NoticeItem): NoticeCategoryChip {
  const resolvedActionCode =
    notice.actionCode ??
    notice.sourceUrl?.match(/[?&]action=([^&]+)/i)?.[1];

  if (resolvedActionCode === 'MAPP_2104261723') {
    return '입관 공지';
  }
  if (resolvedActionCode === 'MAPP_2104261724') {
    return '일반 공지';
  }
  return '공지사항';
}

function getActionIconName(action: QuickAction) {
  switch (action.id) {
    case 'merit':
      return 'medal-outline';
    case 'outing':
      return 'logout-variant';
    case 'laundry':
      return 'washing-machine';
    case 'rules':
      return 'book-open-page-variant-outline';
    case 'phone':
      return 'phone-outline';
    case 'meal-large':
      return 'image-size-select-large';
    case 'guide':
      return 'office-building-outline';
    default:
      return 'dots-grid';
  }
}

function getActionTone(action: QuickAction): 'PRIMARY' | 'ACCENT' | 'MUTED' {
  if (action.id === 'laundry' || action.id === 'meal-large') {
    return 'ACCENT';
  }
  if (action.type === 'INFO') {
    return 'MUTED';
  }
  return 'PRIMARY';
}

function getQuickLaunchPalette(index: number) {
  const toneCount = colors.quickLaunchTones.length;
  const paletteIndex = ((index % toneCount) + toneCount) % toneCount;
  return colors.quickLaunchTones[paletteIndex];
}

function normalizeListPreviewText(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildRetryImageUri(uri: string, retryAttempt: number, retrySeed: number) {
  if (!uri || retryAttempt <= 0 || !/^https?:\/\//i.test(uri)) {
    return uri;
  }

  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}hl_img_retry=${retryAttempt}_${retrySeed}`;
}

function buildMealHtml(uri: string) {
  return `
    <!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: ${colors.surfaceMuted};
            overflow: hidden;
          }
          .frame {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="frame">
          <img src="${uri}" alt="식단 이미지" />
        </div>
      </body>
    </html>
  `;
}

async function openMetaClubApp() {
  if (Platform.OS === 'android') {
    try {
      await Linking.openURL(META_CLUB_ANDROID_INTENT);
      return;
    } catch {
      await Linking.openURL(META_CLUB_ANDROID_STORE_WEB);
      ToastAndroid.show('먼저 메타클럽 앱을 설치 해주세요', ToastAndroid.SHORT);
      return;
    }
  }

  try {
    await Linking.openURL(META_CLUB_IOS_URL_SCHEME);
    return;
  } catch {
    await Linking.openURL(META_CLUB_IOS_STORE);
  }
}

function createStyles(
  // eslint-disable-next-line @typescript-eslint/no-shadow
  colors: AppPalette,
  cardShadow: ReturnType<typeof getCardShadow>,
) {
  const homeCardShadow = Platform.select({
    ios: cardShadow,
    android: {
      shadowColor: isDarkPalette(colors) ? 'rgba(0, 0, 0, 0.5)' : 'rgba(133, 154, 198, 0.36)',
      elevation: 0.5,
    },
    default: cardShadow,
  });

  const styleDefinitions = applyPretendardTypography({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenTransitionLayer: {
    flex: 1,
  },
  topActionRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    marginBottom: 10,
  },
  topActionRowInline: {
    alignSelf: 'auto',
    marginBottom: 0,
  },
  dormitoryToggle: {
    width: DORMITORY_TOGGLE_WIDTH,
    height: DORMITORY_TOGGLE_HEIGHT,
    borderRadius: 999,
    position: 'relative',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: -1,
    overflow: 'hidden',
  },
  dormitoryToggleHappy: {
    borderWidth: 1,
    borderColor: isDarkPalette(colors) ? 'rgba(92, 130, 255, 0.52)' : 'rgba(102, 142, 253, 0.34)',
    backgroundColor: isDarkPalette(colors) ? 'rgba(74, 103, 205, 0.28)' : 'rgba(102, 142, 253, 0.14)',
  },
  dormitoryToggleDirect: {
    borderWidth: 1,
    borderColor: isDarkPalette(colors) ? 'rgba(79, 173, 121, 0.52)' : 'rgba(59, 168, 109, 0.34)',
    backgroundColor: isDarkPalette(colors) ? 'rgba(61, 127, 89, 0.28)' : 'rgba(59, 168, 109, 0.14)',
  },
  dormitoryToggleDisabled: {
    opacity: 0.58,
  },
  dormitoryToggleLabelRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: DORMITORY_TOGGLE_PADDING,
  },
  dormitoryToggleLabelHalf: {
    width: DORMITORY_TOGGLE_THUMB_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dormitoryToggleTrackLabel: {
    fontSize: 14,
    fontFamily: PRETENDARD_FONTS.semiBold,
    width: '100%',
    textAlign: 'center',
    marginTop: -1,
    includeFontPadding: false,
  },
  dormitoryToggleTrackLabelDirect: {
    transform: [{ translateX: DORMITORY_TOGGLE_DIRECT_LABEL_SHIFT_X }],
  },
  dormitoryToggleTrackLabelSelected: {
    color: colors.onPrimary,
    fontFamily: PRETENDARD_FONTS.semiBold,
  },
  dormitoryToggleTrackLabelUnselected: {
    color: colors.textMuted,
    opacity: 0.86,
  },
  dormitoryToggleThumb: {
    position: 'absolute',
    top: DORMITORY_TOGGLE_THUMB_TOP,
    left: DORMITORY_TOGGLE_PADDING,
    width: DORMITORY_TOGGLE_THUMB_WIDTH,
    height: DORMITORY_TOGGLE_THUMB_HEIGHT,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dormitoryToggleThumbHappy: {
    backgroundColor: colors.primary,
  },
  dormitoryToggleThumbDirect: {
    backgroundColor: isDarkPalette(colors) ? '#4DBA81' : '#3BA86D',
  },
  themeToggle: {
    width: 76,
    height: 40,
    borderRadius: 999,
    position: 'relative',
    justifyContent: 'center',
    paddingHorizontal: 6,
    ...cardShadow,
  },
  themeToggleLight: {
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
  },
  themeToggleDark: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  themeToggleTrackIcons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  themeToggleTrackIcon: {
    color: colors.textMuted,
    opacity: 0.46,
  },
  themeToggleTrackIconActive: {
    color: colors.primary700,
    opacity: 0.92,
  },
  themeToggleThumb: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggleThumbLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  themeToggleThumbDark: {
    backgroundColor: colors.primary,
  },
  themeToggleThumbIcon: {
    fontSize: 15,
  },
  themeToggleThumbIconLight: {
    color: colors.primary700,
  },
  themeToggleThumbIconDark: {
    color: colors.onPrimary,
  },
  screen: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
    zIndex: 1,
  },
  homeScreen: {
    flex: 1,
    backgroundColor: colors.background,
    zIndex: 1,
  },
  homeScroll: {
    flex: 1,
  },
  webViewWrapper: {
    flex: 1,
    backgroundColor: colors.background,
    zIndex: 1,
  },
  webViewFull: {
    flex: 1,
    backgroundColor: colors.background,
  },
  webViewContent: {
    flex: 1,
  },
  webViewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  webViewStateBox: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewBlockedCardStack: {
    width: '100%',
    gap: 10,
  },
  webViewBlockedLanguageCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewBlockedLanguageIcon: {
    color: colors.primary700,
  },
  webViewBlockedLanguageTitle: {
    marginTop: 7,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  webViewBlockedLanguageBody: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  webViewBlockedStatusText: {
    marginTop: 10,
    textAlign: 'center',
  },
  webViewActionDateSlot: {
    minWidth: 92,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 2,
    marginTop: -2,
  },
  webViewActionDateText: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: PRETENDARD_FONTS.semiBold,
    letterSpacing: -0.1,
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SPLASH_BACKGROUND_COLOR,
    paddingHorizontal: 24,
  },
  loadingTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  loadingSubtitle: {
    marginTop: 12,
    color: '#FFFFFF',
    fontSize: 15,
  },
  loadingIndicator: {
    marginTop: 18,
  },
  offlineScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: 26,
  },
  offlineIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  offlineIcon: {
    color: colors.primary700,
  },
  offlineTitle: {
    marginTop: 18,
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  offlineSubtitle: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  offlineRetryButton: {
    marginTop: 22,
    minWidth: 132,
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  offlineRetryButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  onboardingScreen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  onboardingScroll: {
    flex: 1,
  },
  onboardingScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  onboardingMainContent: {
    width: '100%',
  },
  onboardingTitleBlock: {
    marginTop: 0,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  onboardingHeadline: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.4,
    fontWeight: '700',
  },
  onboardingSubhead: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  onboardingCardColumn: {
    gap: 10,
  },
  onboardingVisualCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  onboardingVisualCardSelected: {
    borderColor: colors.primary,
    borderWidth: 1.8,
  },
  onboardingVisualMedia: {
    width: '100%',
    height: 170,
  },
  onboardingVisualImage: {
    width: '100%',
    height: '100%',
  },
  onboardingVisualFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceMuted,
  },
  onboardingVisualFallbackIcon: {
    color: colors.textMuted,
  },
  onboardingVisualFallbackText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  onboardingVisualGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
  },
  onboardingVisualLabelBlock: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 4,
  },
  onboardingVisualTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    overflow: 'hidden',
  },
  onboardingVisualTagPrimary: {
    backgroundColor: colors.primary700,
  },
  onboardingVisualTagSecondary: {
    backgroundColor: 'rgba(30, 41, 59, 0.82)',
  },
  onboardingVisualTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  onboardingVisualMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoftAlt,
  },
  onboardingVisualMetaText: {
    flex: 1,
    paddingRight: 8,
    gap: 4,
  },
  onboardingVisualMetaTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  onboardingVisualMetaSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  onboardingVisualArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingVisualArrowPrimary: {
    backgroundColor: colors.primarySoft,
  },
  onboardingVisualArrowSecondary: {
    backgroundColor: colors.surfaceMuted,
  },
  onboardingVisualArrowSelected: {
    backgroundColor: colors.primary,
  },
  onboardingVisualArrowIcon: {
    color: colors.textMuted,
  },
  onboardingVisualArrowIconSelected: {
    color: colors.primary,
  },
  onboardingFooterInfo: {
    marginTop: 'auto',
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  onboardingFooterInfoIcon: {
    color: colors.textMuted,
  },
  onboardingFooterInfoText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  headerBlock: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  onboardingBrand: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    color: colors.primary700,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  onboardingPanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    ...cardShadow,
  },
  optionGroupTitle: {
    color: colors.primary700,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    paddingHorizontal: 2,
    marginBottom: 12,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  optionCard: {
    flex: 1,
    minHeight: 176,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.selectedSoft,
  },
  optionCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  optionIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  optionIconBubbleSelected: {
    backgroundColor: colors.primary,
  },
  optionIconGlyph: {
    color: colors.primary700,
  },
  optionIconGlyphSelected: {
    color: colors.onPrimary,
  },
  optionCampusBadge: {
    backgroundColor: colors.primarySoft,
    color: colors.primary700,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  optionTextBlock: {
    flex: 1,
    gap: 8,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
  },
  optionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  optionFeatureRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  optionFeatureChip: {
    backgroundColor: colors.surface,
    color: colors.primary700,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.border,
  },
  comingSoonBadge: {
    backgroundColor: colors.comingSoonBg,
    color: colors.comingSoonText,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  selectionCircle: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCircleActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  selectionCheck: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 16,
  },
  onboardingFootnote: {
    marginTop: 14,
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  onboardingComingSoonText: {
    marginTop: 6,
    color: colors.comingSoonText,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '700',
  },
  primaryButton: {
    marginTop: 14,
    marginBottom: 12,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.35,
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  homeDashboardContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 30,
  },
  homeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginBottom: 16,
    gap: 12,
  },
  homeDashboardHeader: {
    flex: 1,
    paddingTop: 2,
  },
  homeDormitoryIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  homeDormitoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  homeDormitoryIcon: {
    color: colors.primary,
  },
  homeDormitoryTextBlock: {
    flex: 1,
  },
  homeDormitoryTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  homeDormitorySubtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 13,
  },
  homeNeutralHero: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: 20,
    ...homeCardShadow,
  },
  homeNeutralHeroTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  homeNeutralHeroSubtitle: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  homeNeutralHeroButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    borderRadius: 14,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  homeNeutralHeroButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  homeNeutralInfo: {
    marginTop: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 6,
  },
  homeNeutralInfoText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  homeSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    marginTop: 20,
    marginBottom: 10,
  },
  homeSectionTitle: {
    color: colors.text,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  homeSectionAction: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  homeSectionIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeSectionIcon: {
    color: colors.textMuted,
  },
  homeMealHeroCard: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    ...homeCardShadow,
  },
  homeMealHeroMedia: {
    position: 'relative',
  },
  homeMealHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayBg,
  },
  homeMealHeroTextBox: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 15,
  },
  homeMealHeroTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  homeMealHeroTag: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  homeMealHeroTime: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '600',
  },
  homeMealHeroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  homeMealHeroSubtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.74)',
    fontSize: 13,
  },
  homeMealHeroAction: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  homeMealHeroActionIcon: {
    color: '#FFFFFF',
  },
  quickLaunchPanel: {
    width: '100%',
    alignSelf: 'stretch',
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 12,
    ...homeCardShadow,
  },
  quickLaunchGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickLaunchItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickLaunchIconShell: {
    width: '100%',
    alignItems: 'center',
  },
  quickLaunchLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  homeNoticeFeed: {
    width: '100%',
    alignSelf: 'stretch',
    gap: 10,
  },
  homeNoticeSkeletonList: {
    gap: 10,
  },
  homeNoticeCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...homeCardShadow,
  },
  homeNoticeSkeletonCard: {
    alignItems: 'center',
  },
  homeNoticeSkeletonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.skeleton,
  },
  homeNoticeSkeletonTextGroup: {
    flex: 1,
    gap: 8,
  },
  homeNoticeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary500,
  },
  homeNoticeDotPinned: {
    backgroundColor: '#EF4444',
  },
  homeNoticeTextGroup: {
    flex: 1,
    gap: 4,
  },
  homeNoticeTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  homeNoticeBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  homeNoticeDate: {
    marginTop: 1,
    color: colors.textMuted,
    fontSize: 11,
  },
  homeDormitorySwitchButton: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  homeDormitorySwitchButtonIcon: {
    color: colors.textMuted,
    marginRight: 6,
  },
  homeDormitorySwitchButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  homeVersionText: {
    marginTop: 18,
    marginBottom: 12,
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.72,
  },
  homeDisclosureText: {
    marginTop: 2,
    marginBottom: 6,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 13,
    textAlign: 'center',
    opacity: 0.78,
  },
  homeContent: {
    paddingBottom: 40,
  },
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 0,
    paddingBottom: 18,
    gap: 12,
  },
  homeHeaderCopy: {
    flex: 1,
  },
  homeHeaderActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
  },
  homeDormitoryToggleSlot: {
    marginTop: -3,
  },
  campusLabel: {
    alignSelf: 'flex-start',
    color: colors.primary700,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    overflow: 'hidden',
  },
  homeTitle: {
    marginTop: 8,
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  homeSubtitle: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  homeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  homeMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.surfaceSoft,
  },
  homeMetaChipIcon: {
    color: colors.primary700,
  },
  homeMetaChipText: {
    color: colors.primary700,
    fontSize: 12,
    fontWeight: '700',
  },
  inlineButton: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inlineButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    marginBottom: 16,
    ...cardShadow,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 35,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  heroSubtitle: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  heroButton: {
    marginTop: 18,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  heroButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  neutralInfoCard: {
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    padding: 18,
    gap: 8,
    ...cardShadow,
  },
  neutralInfoTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  neutralInfoText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeBanner: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.bannerBorder,
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
  },
  noticeBannerCompact: {
    padding: 16,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  bannerSubtitle: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderIcon: {
    color: colors.primary700,
  },
  sectionHeaderTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  sectionHeaderAction: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  mealPreviewCard: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  mealPreviewMedia: {
    position: 'relative',
  },
  mealPreviewImageFrame: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  mealPreviewImageContent: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
    resizeMode: 'contain',
  },
  mealVisualImageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  mealVisualImageHidden: {
    opacity: 0,
  },
  mealVisualLoadingSkeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
  },
  mealPreviewSkeleton: {
    width: '100%',
    aspectRatio: DEFAULT_LOADING_IMAGE_ASPECT_RATIO,
    paddingHorizontal: 20,
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.surfaceMuted,
  },
  emptyMealPreview: {
    width: '100%',
    aspectRatio: DEFAULT_LOADING_IMAGE_ASPECT_RATIO,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 24,
  },
  mealPreviewOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.overlayBg,
  },
  mealOverlayTag: {
    alignSelf: 'flex-start',
    color: colors.overlayText,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(237, 180, 111, 0.35)',
    overflow: 'hidden',
  },
  mealOverlayText: {
    color: colors.overlayText,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyMealPreviewText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  mealPreviewFooter: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 6,
  },
  mealPreviewTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  mealPreviewSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  inlineLoader: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: '48.4%',
    minHeight: 154,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 17,
    justifyContent: 'space-between',
    ...cardShadow,
  },
  quickActionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  quickLaunchActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
  },
  quickActionIconAccent: {
    backgroundColor: colors.accentSoft,
  },
  quickActionIconMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  quickActionIconGlyph: {
    color: colors.primary700,
  },
  quickActionIconGlyphAccent: {
    color: colors.accent,
  },
  quickActionIconGlyphMuted: {
    color: colors.textMuted,
  },
  quickActionChevron: {
    color: colors.textMuted,
  },
  quickActionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  quickActionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  quickActionFooter: {
    marginTop: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeBase: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
  },
  badgePrimary: {
    backgroundColor: colors.primarySoft,
    color: colors.primary700,
  },
  badgeAccent: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
  },
  badgeMuted: {
    backgroundColor: colors.badgeMutedBg,
    color: colors.badgeMutedText,
  },
  noticeListCard: {
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
    ...cardShadow,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoftAlt,
  },
  noticeRowText: {
    flex: 1,
    gap: 4,
  },
  noticeRowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  noticeRowDate: {
    color: colors.textMuted,
    fontSize: 12,
  },
  noticeRowArrow: {
    color: colors.textMuted,
    fontSize: 22,
    marginLeft: 12,
  },
  noticeRowArrowIcon: {
    color: colors.textMuted,
    marginLeft: 12,
  },
  emptyStateBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeSkeletonWrap: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 10,
  },
  skeletonBlock: {
    borderRadius: 10,
    backgroundColor: colors.skeleton,
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingInlineText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 10,
  },
  topHeaderShell: {
    paddingHorizontal: 6,
  },
  topHeaderShellWide: {
    paddingHorizontal: 24,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingTop: 0,
    paddingBottom: 0,
  },
  topHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  topHeaderButtonText: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 26,
  },
  topHeaderButtonIcon: {
    color: colors.text,
  },
  topHeaderBackIcon: {
    marginLeft: 0,
    marginTop: 0,
  },
  topHeaderTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: PRETENDARD_FONTS.bold,
  },
  homeTopHeaderTitle: {
    color: colors.primary,
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -0.6,
    fontFamily: PRETENDARD_FONTS.black,
  },
  homeTopHeaderLogoWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeTopHeaderLogo: {
    width: 22,
    height: 22,
  },
  topHeaderTitleWrap: {
    flex: 1,
    marginHorizontal: 8,
  },
  topHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topHeaderTitlePrefix: {
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitleInline: {
    flexShrink: 1,
  },
  topHeaderTitleCenterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 56,
  },
  topHeaderTitleCenter: {
    textAlign: 'center',
  },
  topHeaderTitleLeft: {
    textAlign: 'left',
  },
  topHeaderCustomSlot: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderSpacer: {
    width: 40,
    height: 40,
  },
  topHeaderSpacerCollapsed: {
    width: 0,
    height: 40,
  },
  topHeaderToggleSpacer: {
    width: 76,
    height: 40,
  },
  homeHeaderCaption: {
    marginTop: 2,
    marginBottom: 8,
    color: colors.textMuted,
    fontSize: 13,
  },
  sectionCaption: {
    color: colors.primary700,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 14,
  },
  noticeScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  noticeNeutralContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  noticeScroll: {
    flex: 1,
  },
  noticeListContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  noticeFeedBoard: {
    gap: 10,
  },
  noticeLoadMoreHint: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  noticeLoadMoreHintText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  noticeFeedItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 7,
    ...cardShadow,
  },
  noticeFeedItemPinned: {
    borderColor: 'rgba(102, 142, 253, 0.32)',
    backgroundColor: colors.primarySoft,
    ...Platform.select({
      android: {
        elevation: 0,
        shadowColor: 'transparent',
      },
      default: {},
    }),
  },
  noticeFeedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  noticeFeedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    flexShrink: 1,
    minWidth: 0,
  },
  noticeFeedPinnedIconChip: {
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(102, 142, 253, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeFeedPinnedIcon: {
    color: colors.primary700,
  },
  noticeFeedDate: {
    color: colors.textMuted,
    fontSize: 11,
  },
  noticeFeedArrow: {
    color: colors.textMuted,
  },
  noticeFeedRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginLeft: 8,
  },
  noticeFeedFavoriteIcon: {
    color: colors.primary,
  },
  noticeFeedAttachChip: {
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '700',
  },
  noticeFeedTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  noticeFeedPreview: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  noticeFeedSource: {
    color: colors.textMuted,
    fontSize: 11,
  },
  searchBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    color: colors.text,
    fontSize: 14,
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  categoryChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  categoryChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: colors.primary,
  },
  fallbackCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  fallbackTitle: {
    color: colors.primary700,
    fontSize: 16,
    fontWeight: '800',
  },
  fallbackSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  noticeListItem: {
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoftAlt,
    gap: 8,
  },
  noticeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  noticeBadge: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  noticeListDate: {
    color: colors.textMuted,
    fontSize: 12,
  },
  attachBadge: {
    backgroundColor: colors.accentSoft,
    color: colors.accent,
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
  },
  noticeListTitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  noticeCategoryText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  detailCard: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    gap: 12,
    ...cardShadow,
  },
  noticeDetailScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  noticeDetailScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 132,
  },
  noticeDetailHeaderBlock: {
    paddingBottom: 14,
  },
  noticeDetailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
  },
  noticeDetailBadge: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  noticeDetailPinnedBadge: {
    minWidth: 30,
    minHeight: 22,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeDetailPinnedIcon: {
    color: colors.primary,
  },
  noticeDetailCategory: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  noticeDetailTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  noticeDetailMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  noticeDetailMetaIcon: {
    color: colors.textMuted,
  },
  noticeDetailMetaText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  noticeDetailMetaDivider: {
    color: colors.textMuted,
    opacity: 0.55,
    fontSize: 13,
  },
  noticeDetailDivider: {
    height: 1,
    backgroundColor: colors.primarySoft,
    marginBottom: 20,
  },
  noticeDetailBodyCard: {
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  noticeDetailBodyBlockStack: {
    gap: 12,
  },
  noticeDetailImageGroup: {
    gap: 10,
    marginBottom: 12,
  },
  noticeDetailImageFrame: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceMuted,
  },
  noticeDetailImage: {
    width: '100%',
    backgroundColor: colors.surfaceMuted,
  },
  noticeDetailBodyText: {
    color: isDarkPalette(colors) ? '#D6DCE3' : '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
  noticeDetailBodyLink: {
    color: colors.primary700,
    textDecorationLine: 'underline',
    textDecorationColor: colors.primary700,
  },
  noticeTableContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  noticeTableHorizontalContent: {
    flexGrow: 1,
  },
  noticeTableGrid: {
    width: '100%',
  },
  noticeTableRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  noticeTableRowStriped: {
    backgroundColor: colors.surfaceMuted,
  },
  noticeTableRowLast: {
    borderBottomWidth: 0,
  },
  noticeTableRowHeader: {
    backgroundColor: colors.surfaceSoft,
  },
  noticeTableCell: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.lineSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeTableCellSingleColumn: {
    borderRightWidth: 0,
  },
  noticeTableCellLast: {
    borderRightWidth: 0,
  },
  noticeTableCellText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  noticeTableCellTextHeader: {
    color: colors.primary700,
    fontWeight: '700',
  },
  noticeAttachmentSection: {
    marginTop: 8,
    marginBottom: 8,
    gap: 11,
  },
  noticeAttachmentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 2,
  },
  noticeAttachmentTitleIcon: {
    color: colors.primary,
  },
  noticeAttachmentTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
  },
  noticeAttachmentCount: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSoft,
    color: colors.textMuted,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '500',
  },
  noticeAttachmentCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
  },
  noticeAttachmentIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeAttachmentIconBoxPdf: {
    backgroundColor: isDarkPalette(colors) ? 'rgba(248,113,113,0.2)' : '#FEF2F2',
  },
  noticeAttachmentIconBoxDoc: {
    backgroundColor: isDarkPalette(colors) ? 'rgba(102,142,253,0.22)' : '#EEF3FF',
  },
  noticeAttachmentIconBoxImage: {
    backgroundColor: isDarkPalette(colors) ? 'rgba(45,212,191,0.2)' : '#ECFEFF',
  },
  noticeAttachmentIcon: {
    color: colors.textMuted,
  },
  noticeAttachmentIconPdf: {
    color: isDarkPalette(colors) ? '#FCA5A5' : '#EF4444',
  },
  noticeAttachmentIconDoc: {
    color: isDarkPalette(colors) ? '#B6C9FF' : '#668EFD',
  },
  noticeAttachmentIconImage: {
    color: isDarkPalette(colors) ? '#5EEAD4' : '#0D9488',
  },
  noticeAttachmentTextBox: {
    flex: 1,
    gap: 3,
  },
  noticeAttachmentName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  noticeAttachmentMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  noticeAttachmentEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeAttachmentDownloadIcon: {
    color: colors.textMuted,
  },
  noticeDetailBottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: colors.surfaceSoft,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noticeDetailBottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeDetailPrimaryButton: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    ...cardShadow,
  },
  noticeDetailPrimaryButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  noticeDetailPrimaryButtonIcon: {
    color: colors.onPrimary,
  },
  noticeDetailFavoriteButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.lineSoft,
  },
  noticeDetailFavoriteButtonActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  noticeDetailFavoriteIcon: {
    color: colors.textMuted,
  },
  noticeDetailFavoriteIconActive: {
    color: colors.primary,
  },
  detailLoadingBox: {
    flex: 1,
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailDormitory: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  detailTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
  },
  detailDate: {
    color: colors.textMuted,
    fontSize: 13,
  },
  detailSource: {
    color: colors.primary700,
    fontSize: 13,
    fontWeight: '600',
  },
  detailBody: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 6,
  },
  attachmentTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  attachmentRow: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  attachmentName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  detailMuted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 12,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonCompact: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  mealToolbar: {
    marginBottom: 12,
    gap: 4,
  },
  mealToolbarTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  mealToolbarSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  mealLoadingSkeletonWrap: {
    gap: 14,
  },
  mealLoadingToolbarSkeleton: {
    gap: 8,
  },
  mealLoadingChipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mealLoadingBodyCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
    gap: 10,
    ...cardShadow,
  },
  mealViewer: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...cardShadow,
  },
  mealViewerHintBox: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    backgroundColor: colors.overlayBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mealViewerHintIcon: {
    color: colors.overlayText,
  },
  mealViewerHintText: {
    color: colors.overlayText,
    fontSize: 12,
    fontWeight: '600',
  },
  mealWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mealTextCard: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginTop: 6,
    ...cardShadow,
  },
  mealTextTitle: {
    color: colors.primary700,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  mealTextContent: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  mealDescription: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  inlineActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    marginBottom: 4,
  },
  mealZoomBackdrop: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  imageViewingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  imageViewingHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  imageViewingHeaderIcon: {
    color: colors.text,
  },
  imageViewingHeaderTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  imageViewingHeaderSpacer: {
    width: 40,
    height: 40,
  },
  imageViewingFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    ...Platform.select({
      android: {
        backgroundColor: colors.background,
      },
      default: {},
    }),
  },
  imageViewingCloseButton: {
    width: '100%',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  imageViewingCloseButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  mealZoomHeader: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealZoomHeaderIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSoft,
  },
  mealZoomHeaderIcon: {
    color: colors.text,
  },
  mealZoomHeaderTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  mealZoomHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  mealZoomViewerStage: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  mealZoomFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  mealZoomGestureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  mealZoomGestureIcon: {
    color: colors.primary700,
  },
  mealZoomGestureDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.lineSoft,
  },
  mealZoomEmptyText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  lifeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lifeActionCard: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  lifeActionIcon: {
    marginBottom: 10,
  },
  lifeActionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  lifeActionDescription: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  settingsScreen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
  },
  settingsCard: {
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
    ...cardShadow,
  },
  settingsSectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  settingsSectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingsCurrentBadge: {
    maxWidth: '62%',
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsCurrentBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  settingsDormitoryImageFrame: {
    marginTop: 12,
    width: '100%',
    aspectRatio: 1.8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingsDormitoryImage: {
    width: '100%',
    height: '100%',
  },
  settingsPrimaryButton: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsPrimaryButtonText: {
    color: colors.primary700,
    fontSize: 13,
    fontWeight: '700',
  },
  settingsMuted: {
    marginTop: 8,
    color: colors.textMuted,
    fontSize: 14,
  },
  settingsThemeOptionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  settingsThemeOptionChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsThemeOptionChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  settingsThemeOptionChipLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  settingsThemeOptionChipLabelSelected: {
    color: colors.primary700,
  },
  settingsThemeOptionHint: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  comingSoonCard: {
    marginTop: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 22,
    paddingVertical: 28,
    ...cardShadow,
  },
  comingSoonBody: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 4,
  },
  comingSoonTitle: {
    color: colors.primary700,
    fontSize: 32,
    fontWeight: '900',
  },
  comingSoonDescription: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 24,
  },
  neutralRequiredCard: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...cardShadow,
  },
  neutralRequiredTitle: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
  },
  neutralRequiredMessage: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 25, 21, 0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
    ...cardShadow,
  },
  dialogTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  dialogMessage: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 23,
  },
  dialogButton: {
    marginTop: 20,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  bottomTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  tabGlyph: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tabGlyphBg,
  },
  tabGlyphActive: {
    backgroundColor: colors.primarySoft,
  },
  tabGlyphText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tabGlyphTextActive: {
    color: colors.primary700,
  },
  tabButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  tabIndicator: {
    marginTop: 2,
    width: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: {
    backgroundColor: colors.primary500,
  },
  });

  return StyleSheet.create(styleDefinitions);
}

let styles = createStyles(colors, getCardShadow(colors));

export default App;
