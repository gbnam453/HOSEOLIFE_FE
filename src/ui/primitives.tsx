import React from 'react';
import { Pressable as RNPressable, Text as RNText } from 'react-native';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export const PRETENDARD_FONTS = {
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

const APP_FONT_SIZE_SCALE = 0.93;
const APP_MIN_FONT_SIZE = 10;
const APP_MIN_LINE_HEIGHT = 12;
const HAPTIC_OPTIONS = {
  enableVibrateFallback: false,
  ignoreAndroidSystemSettings: false,
} as const;

export type AppTextProps = React.ComponentProps<typeof RNText>;

export function Text({
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

export type AppPressableProps = React.ComponentProps<typeof RNPressable>;

export function Pressable({ onPress, disabled, ...rest }: AppPressableProps) {
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

export function applyPretendardTypography<T extends Record<string, Record<string, unknown>>>(
  styleDefinitions: T,
) {
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
