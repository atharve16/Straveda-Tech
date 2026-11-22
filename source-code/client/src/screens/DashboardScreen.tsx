import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { StatCard, SectionHeader } from '../components/common/Cards';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { OrderCard } from '../components/domain/OrderCard';
import type { Actor, Order, Pending } from '../domain';

interface DashboardMetrics {
  orders: number;
  mis: number;
  pending: number;
  litres: number;
}

interface DashboardScreenProps {
  actor: Actor;
  metrics: DashboardMetrics;
  orders: Order[];
  pending: Pending[];
  history: { id: number; action: string; detail: string; at: string }[];
  onNavigateTab: (tab: 'Orders' | 'MIS' | 'Approvals') => void;
  onNewOrder: () => void;
  onAddMis: () => void;
  onExportMis: () => void;
  onSubmitOrder: (id: number) => void;
  onApproveOrder: (id: number) => void;
  onRejectOrder: (id: number) => void;
}

export function DashboardScreen({
  actor,
  metrics,
  orders,
  pending,
  history,
  onNavigateTab,
  onNewOrder,
  onAddMis,
  onExportMis,
  onSubmitOrder,
  onApproveOrder,
  onRejectOrder,
}: DashboardScreenProps) {
  // Compute order status counts
  const draftOrders = orders.filter(o => o.status === 'draft').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const approvedOrders = orders.filter(o => o.status === 'approved').length;
  const transitOrders = orders.filter(o => o.delivery_stage === 'transit').length;
  const rejectedOrders = orders.filter(o => o.status === 'rejected').length;

  const recentOrders = orders.slice(0, 3);
  const recentHistory = history.slice(0, 4);

  return (
    <ScreenContainer>
      {/* Greeting Banner */}
      <View style={[styles.welcomeBanner, shadows.subtle]}>
        <View style={styles.welcomeTextGroup}>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.userNameText}>{actor.label || actor.username}</Text>
          <Text style={styles.scopeNotice}>
            Local Scope: {actor.org.toUpperCase()} · {actor.role.toUpperCase()}
            {actor.zone ? ` · ${actor.zone}` : ''}
          </Text>
        </View>
        <View style={styles.quickStatCircle}>
          <Text style={styles.quickStatVal}>{orders.length}</Text>
          <Text style={styles.quickStatLbl}>ORDERS</Text>
        </View>
      </View>

      {/* Metrics 2x2 Grid */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricsCol}>
          <StatCard
            label="Total Orders"
            value={metrics.orders}
            subtitle={`${pendingOrders} awaiting decision`}
            icon="📦"
            accentColor={colors.primary}
            onPress={() => onNavigateTab('Orders')}
          />
          <StatCard
            label="MIS Rows"
            value={metrics.mis}
            subtitle="Local sheet & orders"
            icon="📊"
            accentColor={colors.primaryDark}
            onPress={() => onNavigateTab('MIS')}
          />
        </View>

        <View style={styles.metricsCol}>
          <StatCard
            label="Pending Approvals"
            value={metrics.pending}
            subtitle="Entries requiring review"
            icon="⏳"
            accentColor={metrics.pending > 0 ? colors.warning : colors.success}
            onPress={() => onNavigateTab('Approvals')}
          />
          <StatCard
            label="Total Volume"
            value={`${(metrics.litres / 1000).toFixed(1)}k`}
            subtitle={`${metrics.litres.toFixed(0)} Litres`}
            icon="🛢"
            accentColor="#0284C7"
            onPress={() => onNavigateTab('MIS')}
          />
        </View>
      </View>

      {/* Quick Action Shortcuts */}
      <View style={[styles.quickActionsCard, shadows.subtle]}>
        <Text style={styles.quickActionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionButtonsRow}>
          <PrimaryButton
            title="＋ New Order"
            onPress={onNewOrder}
            size="sm"
          />
          <SecondaryButton
            title="＋ Add MIS Row"
            onPress={onAddMis}
            size="sm"
          />
          <SecondaryButton
            title="Export CSV"
            onPress={onExportMis}
            size="sm"
          />
          <SecondaryButton
            title="⏳ Approvals"
            onPress={() => onNavigateTab('Approvals')}
            size="sm"
          />
        </View>
      </View>

      {/* Order Status Breakdown */}
      <View style={[styles.statusBreakdownCard, shadows.subtle]}>
        <Text style={styles.cardHeading}>Order Status Distribution</Text>
        <View style={styles.statusPillsRow}>
          <View style={styles.statusPillItem}>
            <Text style={styles.statusPillCount}>{draftOrders}</Text>
            <Text style={styles.statusPillLabel}>Draft</Text>
          </View>
          <View style={styles.statusPillItem}>
            <Text style={[styles.statusPillCount, { color: colors.warning }]}>{pendingOrders}</Text>
            <Text style={styles.statusPillLabel}>Pending</Text>
          </View>
          <View style={styles.statusPillItem}>
            <Text style={[styles.statusPillCount, { color: colors.info }]}>{transitOrders}</Text>
            <Text style={styles.statusPillLabel}>In Transit</Text>
          </View>
          <View style={styles.statusPillItem}>
            <Text style={[styles.statusPillCount, { color: colors.success }]}>{approvedOrders}</Text>
            <Text style={styles.statusPillLabel}>Approved</Text>
          </View>
          <View style={styles.statusPillItem}>
            <Text style={[styles.statusPillCount, { color: colors.danger }]}>{rejectedOrders}</Text>
            <Text style={styles.statusPillLabel}>Rejected</Text>
          </View>
        </View>
      </View>

      {/* Pending Approvals Alert (if any) */}
      {metrics.pending > 0 ? (
        <Pressable
          onPress={() => onNavigateTab('Approvals')}
          style={({ pressed }) => [
            styles.approvalAlert,
            shadows.subtle,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.alertIconCircle}>
            <Text style={styles.alertIconText}>⏳</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.alertTitle}>
              {metrics.pending} pending MIS {metrics.pending === 1 ? 'entry' : 'entries'} awaiting review
            </Text>
            <Text style={styles.alertSub}>Tap to open the decision desk</Text>
          </View>
          <Text style={styles.alertArrow}>›</Text>
        </Pressable>
      ) : null}

      {/* Recent Orders Section */}
      <SectionHeader
        title="Recent Orders"
        subtitle="Most recent orders in your local scope"
        actionText="View all orders ›"
        onActionPress={() => onNavigateTab('Orders')}
      />

      {recentOrders.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No orders recorded in this installation.</Text>
        </View>
      ) : (
        recentOrders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            actor={actor}
            onSubmit={onSubmitOrder}
            onApprove={onApproveOrder}
            onReject={onRejectOrder}
          />
        ))
      )}

      {/* Recent Local Activity */}
      <SectionHeader
        title="Local Activity Stream"
        subtitle="Recent database transactions on this device"
      />
      <View style={[styles.historyCard, shadows.subtle]}>
        {recentHistory.length === 0 ? (
          <Text style={styles.emptyText}>No local activities recorded yet.</Text>
        ) : (
          recentHistory.map((item, idx) => (
            <View
              key={item.id}
              style={[
                styles.historyItem,
                idx < recentHistory.length - 1 && styles.historyDivider,
              ]}
            >
              <View style={styles.historyDot} />
              <View style={{ flex: 1 }}>
                <View style={styles.historyTopRow}>
                  <Text style={styles.historyAction}>{item.action.toUpperCase()}</Text>
                  <Text style={styles.historyTime}>{item.at}</Text>
                </View>
                <Text style={styles.historyDetail} numberOfLines={2}>
                  {item.detail}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  welcomeBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  welcomeTextGroup: {
    flex: 1,
    gap: 2,
  },
  greetingText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  userNameText: {
    ...typography.headingLg,
    fontSize: 21,
  },
  scopeNotice: {
    ...typography.captionMedium,
    color: colors.primary,
    marginTop: 2,
    fontSize: 11,
  },
  quickStatCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySubtle,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStatVal: {
    ...typography.headingMd,
    color: colors.primaryDark,
    fontSize: 18,
  },
  quickStatLbl: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.primary,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricsCol: {
    flex: 1,
    gap: spacing.md,
  },
  quickActionsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quickActionTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusBreakdownCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeading: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  statusPillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  statusPillItem: {
    alignItems: 'center',
    flex: 1,
  },
  statusPillCount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusPillLabel: {
    ...typography.captionRegular,
    fontSize: 11,
    color: colors.textSecondary,
  },
  approvalAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  alertIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIconText: {
    fontSize: 18,
  },
  alertTitle: {
    ...typography.bodyBold,
    color: '#92400E',
    fontSize: 13,
  },
  alertSub: {
    ...typography.captionRegular,
    color: '#B45309',
    fontSize: 11,
  },
  alertArrow: {
    fontSize: 22,
    color: '#B45309',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  historyItem: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  historyDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  historyTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyAction: {
    ...typography.captionMedium,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  historyTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  historyDetail: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.8,
  },
});
