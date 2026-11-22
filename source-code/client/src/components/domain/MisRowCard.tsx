import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { StatusBadge } from '../common/Badge';
import { DangerButton, SecondaryButton } from '../common/Buttons';
import type { MisRow, Actor } from '../../domain';
import { canEditMis } from '../../domain';

interface MisRowCardProps {
  row: MisRow;
  actor: Actor;
  onEdit?: (row: MisRow) => void;
  onDelete?: (row: MisRow) => void;
  selected?: boolean;
  onToggleSelect?: (row: MisRow) => void;
}

export function MisRowCard({
  row,
  actor,
  onEdit,
  onDelete,
  selected,
  onToggleSelect,
}: MisRowCardProps) {
  const editable = canEditMis(actor);

  return (
    <View style={[styles.card, shadows.subtle]}>
      {/* Top Header */}
      <View style={styles.topRow}>
        <View style={styles.dateGroup}>
          <Text style={styles.dateText}>{row.d}</Text>
          <Text style={styles.sapText}>SAP: {row.sap}</Text>
        </View>
        <StatusBadge status={row.src} label={row.src === 'order' ? 'ORDER' : 'SHEET'} size="sm" />
      </View>

      {/* Outlet */}
      <Text style={styles.outletName} numberOfLines={1}>
        {row.outlet}
      </Text>

      {/* Details Box */}
      <View style={styles.detailsBox}>
        <View style={styles.detailLine}>
          <Text style={styles.itemTitle} numberOfLines={1}>
            {row.item}
          </Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>EA:</Text>
            <Text style={styles.statValue}>{row.ea}</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>VOLUME:</Text>
            <Text style={styles.statValue}>{Number(row.litres || 0).toFixed(1)} L</Text>
          </View>
          <View style={styles.statPill}>
            <Text style={styles.statLabel}>ZONE:</Text>
            <Text style={styles.statValue}>{row.zone || '—'}</Text>
          </View>
        </View>
      </View>

      {/* Actions (if user has edit permission) */}
      {editable ? (
        <View style={styles.actionRow}>
          {onToggleSelect ? (
            <SecondaryButton title={selected ? 'Selected ✓' : 'Select'} onPress={() => onToggleSelect(row)} size="sm" />
          ) : null}
          {onEdit ? (
            <SecondaryButton
              title="Edit Row"
              onPress={() => onEdit(row)}
              size="sm"
            />
          ) : null}
          {onDelete ? (
            <DangerButton
              title="Delete"
              onPress={() => onDelete(row)}
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  sapText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  outletName: {
    ...typography.headingSm,
    color: colors.textPrimary,
  },
  detailsBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemTitle: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  statValue: {
    ...typography.captionMedium,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
