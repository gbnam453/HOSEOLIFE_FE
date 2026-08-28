import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  type StyleProp,
  type TextStyle,
  View,
} from 'react-native';
import MaterialCommunityIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { DormitoryCode } from '../domain';
import { Pressable, Text } from '../ui/primitives';

let sharedStyles: Record<string, any> | null = null;

export function setCommonUIStyles(nextStyles: Record<string, any>) {
  sharedStyles = nextStyles;
}

function getStyles() {
  return sharedStyles ?? {};
}

export function TopActionButtons({
  isDarkMode,
  onToggleDarkMode,
  inline = false,
}: {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  inline?: boolean;
}) {
  const styles = getStyles();
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

export function TopHeader({
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
  const styles = getStyles();
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

export function Badge({
  label,
  tone,
}: {
  label: string;
  tone: 'PRIMARY' | 'ACCENT' | 'MUTED';
}) {
  const styles = getStyles();
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

export function SkeletonBlock({
  width = '100%',
  height = 14,
}: {
  width?: number | `${number}%` | '100%';
  height?: number;
}) {
  const styles = getStyles();
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

export function NeutralRequiredCard({
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
  const styles = getStyles();
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

export function InfoBanner({
  title,
  message,
  compact = false,
}: {
  title: string;
  message: string;
  compact?: boolean;
}) {
  const styles = getStyles();
  return (
    <View style={[styles.noticeBanner, compact ? styles.noticeBannerCompact : null]}>
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={styles.bannerSubtitle}>{message}</Text>
    </View>
  );
}

export function AppDialog({
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
  const styles = getStyles();
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

export function DormitorySwitchToggle({
  selectedDormitory,
  onToggle,
  disabled = false,
  directThumbTranslateX,
}: {
  selectedDormitory: DormitoryCode | null;
  onToggle: () => void;
  disabled?: boolean;
  directThumbTranslateX: number;
}) {
  const styles = getStyles();
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
    outputRange: [0, directThumbTranslateX],
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
