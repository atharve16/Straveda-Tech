import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { StatusBadge } from '../common/Badge';
import { PrimaryButton, SecondaryButton } from '../common/Buttons';
import type { Order, Actor } from '../../domain';
import { canDecideOrder } from '../../domain';

interface OrderCardProps {
  order: Order;
  actor: Actor;
  onSubmit?: (id: number) => void;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  onPressDetails?: (order: Order) => void;
}

export function OrderCard({
  order,
  actor,
  onSubmit,
  onApprove,
  onReject,
  onPressDetails,
}: OrderCardProps) {
  const isCreator = order.created_by === actor.username;
  const canSubmit = isCreator && (order.status === 'draft' || order.status === 'rejected');
  const isApprover = order.canDecide ?? canDecideOrder(actor, order);

  return (
    <View style={[styles.card, shadows.subtle]}>
      {/* Top row: Ref and Status */}
      <View style={styles.topRow}>
        <View style={styles.refGroup}>
          <Text style={styles.orderRef}>{order.order_ref}</Text>
          <Text style={styles.orderDate}>{order.order_date}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {/* Outlet & Area */}
      <View style={styles.outletBlock}>
        <Text style={styles.outletName} numberOfLines={1}>
          {order.outlet}
        </Text>
        <Text style={styles.outletDetails}>
          {order.sap ? `SAP: ${order.sap} · ` : ''}
          {order.zone}
          {order.ro ? ` · ${order.ro}` : ''}
        </Text>
      </View>

      {/* Metrics Row: Total EA & Stage */}
      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>TOTAL QUANTITY</Text>
          <Text style={styles.metricValue}>
            {order.total_ea} <Text style={styles.metricUnit}>EA</Text>
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>DELIVERY STAGE</Text>
          <Text style={styles.deliveryStage}>
            {order.delivery_stage ? order.delivery_stage.toUpperCase() : 'NOT DISPATCHED'}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>CREATED BY</Text>
          <Text style={styles.creatorText} numberOfLines={1}>
            {order.created_by}
          </Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        {onPressDetails ? (
          <Pressable
            onPress={() => onPressDetails(order)}
            style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
          >
            <Text style={styles.detailsButtonText}>View Details ›</Text>
          </Pressable>
        ) : <View style={{ flex: 1 }} />}

        <View style={styles.rightButtons}>
          {canSubmit && onSubmit ? (
            <PrimaryButton
              title="Submit Order"
              onPress={() => onSubmit(order.id)}
              size="sm"
            />
          ) : null}

          {isApprover ? (
            <>
              {onReject ? (
                <SecondaryButton
                  title="Reject"
                  onPress={() => onReject(order.id)}
                  size="sm"
                />
              ) : null}
              {onApprove ? (
                <PrimaryButton
                  title="Approve"
                  onPress={() => onApprove(order.id)}
                  size="sm"
                />
              ) : null}
            </>
          ) : null}
        </View>
      </View>
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
  refGroup: {
    gap: 1,
  },
  orderRef: {
    ...typography.bodyBold,
    fontSize: 15,
    color: colors.primaryDark,
  },
  orderDate: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  outletBlock: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 2,
  },
  outletName: {
    ...typography.headingSm,
    fontSize: 15,
    color: colors.textPrimary,
  },
  outletDetails: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  metricItem: {
    gap: 2,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  metricValue: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  metricUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  deliveryStage: {
    ...typography.captionMedium,
    color: colors.info,
    fontWeight: '700',
  },
  creatorText: {
    ...typography.captionRegular,
    color: colors.textPrimary,
    maxWidth: 90,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  detailsButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.sm,
  },
  detailsButtonText: {
    ...typography.captionMedium,
    color: colors.primary,
    fontWeight: '700',
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});
