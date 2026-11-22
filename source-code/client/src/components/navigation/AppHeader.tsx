import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import type { Actor } from '../../domain';

interface AppHeaderProps {
  actor: Actor;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onBack?: () => void;
  screenTitle?: string;
}

export function AppHeader({
  actor,
  onLogout,
  onOpenSettings,
  onBack,
  screenTitle,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const isOutlet = actor.org === 'outlet';
  const orgColor = isOutlet ? colors.outletBadge : actor.org === 'hpcl' ? colors.hpclBadge : colors.rohanBadge;

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 2 }, shadows.subtle]}>
      <View style={styles.brandingRow}>
        <View style={styles.brandGroup}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              accessibilityLabel="Back to Home"
            >
              <Text style={styles.backBtnText}>‹ Back</Text>
            </Pressable>
          ) : (
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>SE</Text>
            </View>
          )}

          <View>
            <View style={styles.titleRow}>
              <Text style={styles.brandTitle}>
                {screenTitle || 'STRAVEDA'}
              </Text>
              {!onBack ? (
                <View style={styles.offlinePill}>
                  <View style={styles.offlineDot} />
                  <Text style={styles.offlineText}>OFFLINE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.brandSubtitle}>Rohan Energy Order & MIS</Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {onOpenSettings ? (
            <Pressable
              onPress={onOpenSettings}
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              accessibilityLabel="Settings"
            >
              <Text style={styles.actionIcon}>⚙</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            accessibilityLabel="Sign out"
          >
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.userBar}>
        <View style={styles.userInfoGroup}>
          <View style={[styles.orgIndicator, { backgroundColor: orgColor }]} />
          <Text style={styles.userName} numberOfLines={1}>
            {actor.label || actor.username}
          </Text>
          <View style={[styles.roleTag, { borderColor: orgColor }]}>
            <Text style={[styles.roleTagText, { color: orgColor }]}>
              {actor.org.toUpperCase()} · {actor.role.toUpperCase()}
            </Text>
          </View>
        </View>

        {actor.zone ? (
          <Text style={styles.zoneScope} numberOfLines={1}>
            {actor.zone}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 2,
  },
  brandingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: -0.5,
  },
  backBtn: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
  },
  backBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  brandSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: -2,
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.successLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.full,
  },
  offlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.success,
  },
  offlineText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actionButton: {
    padding: spacing.xs,
    borderRadius: radius.md,
  },
  actionIcon: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  logoutButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '700',
  },
  userBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  userInfoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  orgIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  userName: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '700',
    maxWidth: 140,
  },
  roleTag: {
    borderWidth: 1,
    borderRadius: radius.xs,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
  },
  roleTagText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  zoneScope: {
    fontSize: 10,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.7,
  },
});
