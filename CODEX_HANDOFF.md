# CODEX HANDOFF

## 1) 프로젝트 현재 스냅샷
- 앱: `HOSEOLIFE_FE` (React Native 0.84.1)
- 패키지명: `com.gbnam.hoseolife`
- 버전: `1.0.0` (`package.json`)
- Metro 포트: `8092` (start/ios/android 스크립트 모두 동일)
- 엔트리 등록: `index.js`에서 `HOSEOLIFE_FE`를 메인으로 등록하고, `app.json` 이름도 fallback 등록

## 2) 사용자 작업 원칙 (중요)
- 검증은 **에뮬레이터가 아니라 실기기 우선**.
- iOS 배포 검증은 `Release` 빌드 기준.
- 현재 사용자 의사결정: “iPad 빌드하지 말고 iPhone 기준으로 진행”.

## 3) 최근 핵심 반영 사항

### 스플래시/초기 진입
- 스플래시는 식단 이미지 로딩 완료를 기다리지 않도록 변경.
- 대신 최소 표시 시간만 보장: `STARTUP_SPLASH_MIN_VISIBLE_MS = 700` (0.7초).
- 위치: `App.tsx`의 startup 전환 로직 (`pendingStartupHome` 처리 부분).

### 애니메이션/스켈레톤
- `AnimatedEntrance`를 실제 애니메이션(페이드 + translateY + 미세 scale)으로 복구.
- 스켈레톤 블록에 펄스 애니메이션 추가.

### 로딩 인디케이터 정책
- 웹뷰 로딩 UI를 단순화: 중앙 인디케이터만 표시(패널/문구 제거).
- 인디케이터는 기본 파랑/초록 대신 회색 고정:
  - 라이트: `#8E8E93`
  - 다크: `#C7C7CC`
- 홈 pull-to-refresh 인디케이터도 동일 회색으로 명시.

### 홈 상단 로고
- 사용자 제공 로고 2개를 홈 타이틀 왼쪽에 적용:
  - 행복: `src/assets/branding/happy.png`
  - 직영: `src/assets/branding/hoseo.png`
- 홈 헤더에서만 `titlePrefix`로 노출.
- `TopHeader`에 `titlePrefix` props 추가.

### 웹뷰 우측 날짜 정렬
- 상벌점/외출외박 신청 웹뷰 우측 상단 날짜 슬롯 수직 보정:
  - `webViewActionDateSlot.marginTop = -2`

### App Store 아이콘 검증 오류 수정
- 원인: iPad 아이콘 슬롯 누락.
- `AppIcon.appiconset`에 iPad 엔트리 추가 및 파일 생성:
  - `152x152` (`76x76@2x`)
  - `167x167` (`83.5x83.5@2x`)
- 수정 파일:
  - `ios/HOSEOLIFE_FE/Images.xcassets/AppIcon.appiconset/Contents.json`
  - `.../152.png`, `.../167.png` (및 iPad 관련 20/29/76 파일)

## 4) 색상 기준 (현재 코드)
- 행복 메인 블루: `#668EFD`
- 직영 메인 그린:
  - 라이트: `#3BA86D`
  - 다크: `#4DBA81`
- 라이트 배경/서피스:
  - 배경: `#F6F6F8`
  - 서피스: `#FFFFFF`

## 5) iOS 실기기 빌드 명령 (자주 사용)

### Debug 실기기
```bash
npm run ios -- --udid 00008140-00144D820213001C
```

### Release 실기기 (배포 검증)
```bash
npm run ios -- --udid 00008140-00144D820213001C --mode Release --no-packager
```

### 연결 기기 확인
```bash
xcrun xctrace list devices
xcrun devicectl list devices
```

## 6) 다음 Codex가 바로 확인할 체크리스트
- `package.json` 버전/포트가 문서와 맞는지.
- iPhone 실기기가 인식되는지 (`xctrace`/`devicectl`).
- Release 빌드 설치 성공 여부.
- 홈 상단 로고(행복/직영 전환 시 이미지 전환) 확인.
- 웹뷰 로딩이 “중앙 인디케이터만” 표시되는지 확인.
- 홈 pull-to-refresh 인디케이터 가시성 확인.
- App Store 업로드 전 아이콘 경고 재발 여부 확인.

## 7) 참고
- 현재 UI/상태 로직이 대부분 `App.tsx` 단일 파일에 집중되어 있음.
- README 내용 중 일부(버전/포트 등)는 오래된 값이 남아있을 수 있으므로, 실제 값은 `package.json`/`App.tsx`를 우선 기준으로 볼 것.
