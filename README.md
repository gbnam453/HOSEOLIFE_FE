<div align="center">
  <h1>HOSEOLIFE</h1>
  <p><strong>더 나은 기숙사 생활</strong></p>
  <p>호서대학교 기숙사 생활정보를 빠르게 확인하는 React Native 앱</p>
  <p>
    <img src="https://img.shields.io/badge/version-0.0.1-668EFD?style=flat-square" alt="version" />
    <img src="https://img.shields.io/badge/react%20native-0.84.1-20232A?style=flat-square&logo=react" alt="react-native" />
    <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android-111827?style=flat-square" alt="platform" />
    <img src="https://img.shields.io/badge/port-8082-3BA86D?style=flat-square" alt="port" />
  </p>
</div>

---

## 프로젝트 소개
HOSEOLIFE는 아산 행복기숙사/직영기숙사 기준으로 공지사항, 식단표, 생활 기능 링크를 한 화면에서 확인할 수 있도록 만든 앱입니다.

- 최근 작업 및 인수인계 메모: `CODEX_HANDOFF.md`

- 앱 이름: `HOSEOLIFE`
- 패키지명: `com.gbnam.hoseolife`
- 앱 버전: `0.0.1`
- 부제: `더 나은 기숙사 생활`

## 주요 기능
- 기숙사 전환: 행복기숙사/직영기숙사 토글
- 공지사항:
  - 웹사이트 기반 공지 수집
  - 목록 10개 단위 점진 로딩
  - 고정 공지 라벨 표시
  - 상세 이미지 확대/축소, 첨부파일/원문 보기
- 식단표:
  - 이미지 기반 식단 표시
  - 이미지 캐싱 및 확대/축소
- 설정:
  - 기본 기숙사 변경
  - 화면 모드(`시스템 설정`/`라이트`/`다크`)
  - 앱 버전 표시
- 기타:
  - Pull-to-refresh
  - 스플래시/온보딩
  - 공통 상단 내비게이션

## 화면 프리뷰
| 행복기숙사 | 직영기숙사 |
| --- | --- |
| ![happy](./src/assets/onboarding/asan-happy.jpeg) | ![direct](./src/assets/onboarding/asan-direct.png) |

## 기술 스택
- React Native `0.84.1`
- React `19.2.3`
- TypeScript
- AsyncStorage
- react-native-webview
- react-native-safe-area-context
- react-native-vector-icons
- react-native-image-zoom-viewer
- Jest
- Maestro (E2E)

## 프로젝트 구조
```text
HOSEOLIFE_FE
├── App.tsx
├── src
│   ├── domain.ts
│   ├── services
│   │   └── dormitoryClient.ts
│   ├── storage.ts
│   └── utils
│       └── imageCache.ts
├── e2e
│   └── maestro
│       └── ios-selection-persistence.yaml
├── __tests__
└── package.json
```

## 빠른 실행
### 1) 의존성 설치
```bash
npm install
```

### 2) iOS (최초 1회 또는 네이티브 의존성 변경 시)
```bash
bundle install
cd ios && bundle exec pod install && cd ..
```

### 3) 개발 서버
```bash
npm start
```

### 4) 앱 실행
```bash
# iOS (예시: iPhone 17 Pro)
npm run ios -- --simulator="iPhone 17 Pro"

# Android
npm run android
```

## 테스트
```bash
# Unit test
npm test -- --watchAll=false

# E2E (Maestro, iOS)
npm run e2e:ios:maestro
```

## 스크립트
| Script | 설명 |
| --- | --- |
| `npm start` | Metro 서버 실행 (`8082`) |
| `npm run ios` | iOS 빌드/실행 |
| `npm run android` | Android 빌드/실행 |
| `npm test` | Jest 테스트 |
| `npm run e2e:ios:maestro` | Maestro E2E 테스트 |

## 개발 환경 요구사항
- Node.js `>= 22.11.0`
- Xcode + CocoaPods (iOS)
- Android Studio + Android SDK (Android)
- Ruby/Bundler (Pod 설치용)

## 데이터 소스 및 고지
본 앱은 호서대학교 기숙사 공식 웹사이트의 공개 정보를 비공식적으로 재구성하여 제공합니다.

- 행복기숙사: `https://happydorm.hoseo.ac.kr`
- 직영기숙사: `https://hoseoin.hoseo.ac.kr`

정확한 운영 정보는 반드시 공식 홈페이지를 기준으로 확인해주세요.
