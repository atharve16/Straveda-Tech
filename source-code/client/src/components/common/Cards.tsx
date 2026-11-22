import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';

interface StatCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  accentColor?: string;
  onPress?: () => void;
}

export function StatCard({
  label,
  value,
  subtitle,
  icon,
  accentColor = colors.primary,
  onPress,
}: StatCardProps) {
  const content = (
    <View style={[styles.statCard, shadows.card]}>
      <View style={[styles.statAccentBar, { backgroundColor: accentColor }]} />
      <View style={styles.statContent}>
        <View style={styles.statTopRow}>
          <Text style={styles.statLabel}>{label}</Text>
          {icon ? <Text style={styles.statIcon}>{icon}</Text> : null}
        </View>
        <Text style={[styles.statValue, { color: accentColor }]}>{value}</Text>
        {subtitle ? <Text style={styles.statSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function SummaryCard({
  title,
  children,
  subtitle,
  headerAction,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        {headerAction}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

export function DataCard({
  children,
  highlight = false,
  onPress,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.dataCard, highlight && styles.dataCardHighlight, shadows.subtle]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        {content}
      </Pressable>
    );
  }
  return content;
}

export function SectionHeader({
  title,
  subtitle,
  actionText,
  onActionPress,
}: {
  title: string;
  subtitle?: string;
  actionText?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionText && onActionPress ? (
        <Pressable onPress={onActionPress}>
          <Text style={styles.sectionAction}>{actionText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  statAccentBar: {
    width: 4,
  },
  statContent: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    gap: 2,
  },
  statTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statIcon: {
    fontSize: 14,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    ...typography.headingMd,
  },
  cardSubtitle: {
    ...typography.captionRegular,
    marginTop: 2,
  },
  cardBody: {
    gap: spacing.sm,
  },
  dataCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dataCardHighlight: {
    borderColor: colors.primaryLight,
    backgroundColor: colors.surfaceSubtle,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.headingMd,
    color: colors.primaryDark,
  },
  sectionSubtitle: {
    ...typography.captionRegular,
    marginTop: 2,
  },
  sectionAction: {
    ...typography.captionMedium,
    color: colors.primary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
