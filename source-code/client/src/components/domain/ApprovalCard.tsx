import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { StatusBadge } from '../common/Badge';
import { DangerButton, SuccessButton } from '../common/Buttons';
import type { Pending, Actor } from '../../domain';
import { canDecidePending } from '../../domain';

interface ApprovalCardProps {
  pending: Pending;
  actor: Actor;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
}

export function ApprovalCard({
  pending,
  actor,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const canDecide = pending.status === 'pending' && canDecidePending(actor);

  return (
    <View style={[styles.card, shadows.subtle]}>
      {/* Header */}
      <View style={styles.topRow}>
        <View style={styles.idGroup}>
          <Text style={styles.pendingId}>Pending Entry #{pending.id}</Text>
          <Text style={styles.entryDate}>{pending.d}</Text>
        </View>
        <StatusBadge status={pending.status} />
      </View>

      {/* Outlet & Geography */}
      <View style={styles.outletBlock}>
        <Text style={styles.outletName} numberOfLines={1}>
          {pending.outlet}
        </Text>
        <Text style={styles.outletDetails}>
          SAP: {pending.sap} · {pending.zone} · {pending.ro}
        </Text>
      </View>

      {/* Product & Quantity details */}
      <View style={styles.itemBlock}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>ITEM:</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {pending.item}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>VOLUME:</Text>
          <Text style={styles.detailValueBold}>
            {pending.ea} EA <Text style={styles.volumeText}>({(pending.ea * 20).toFixed(0)} L)</Text>
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>SUBMITTED BY:</Text>
          <Text style={styles.detailValue}>{pending.submitted_by}</Text>
        </View>
      </View>

      {pending.reason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>DECISION REASON:</Text>
          <Text style={styles.reasonText}>{pending.reason}</Text>
        </View>
      ) : null}

      {/* Decision Actions */}
      {canDecide ? (
        <View style={styles.actionsRow}>
          <DangerButton
            title="Reject"
            onPress={() => onReject(pending.id)}
            size="sm"
          />
          <SuccessButton
            title="Approve Entry"
            onPress={() => onApprove(pending.id)}
            size="sm"
          />
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
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  idGroup: {
    gap: 1,
  },
  pendingId: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  entryDate: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  outletBlock: {
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.xs,
  },
  outletName: {
    ...typography.headingSm,
    fontSize: 15,
  },
  outletDetails: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  itemBlock: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    width: 95,
  },
  detailValue: {
    ...typography.captionMedium,
    color: colors.textPrimary,
    flex: 1,
  },
  detailValueBold: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.primaryDark,
  },
  volumeText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  reasonBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  reasonLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.danger,
  },
  reasonText: {
    ...typography.captionRegular,
    color: colors.danger,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
});
