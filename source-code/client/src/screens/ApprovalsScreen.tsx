import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { FormField } from '../components/common/Inputs';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { EmptyState } from '../components/common/Feedback';
import { ApprovalCard } from '../components/domain/ApprovalCard';
import { OrderCard } from '../components/domain/OrderCard';
import type { Actor, Order, Pending } from '../domain';
import { canDecideOrder, canDecidePending } from '../domain';

export type ApprovalTab = 'pending_mis' | 'pending_orders' | 'submit_entry';

interface ApprovalsScreenProps {
  actor: Actor;
  pendingList: Pending[];
  orders: Order[];
  onApprovePending: (id: number) => Promise<void>;
  onRejectPending: (id: number, reason: string) => Promise<void>;
  onSubmitPendingEntry: (
    d: string,
    sap: string,
    item: string,
    ea: string
  ) => Promise<void>;
  onApproveOrder: (id: number) => Promise<void>;
  onRejectOrder: (id: number, reason: string) => Promise<void>;
  initialTab?: ApprovalTab;
  onTabChange?: (tab: ApprovalTab) => void;
}

export function ApprovalsScreen({
  actor,
  pendingList,
  orders,
  onApprovePending,
  onRejectPending,
  onSubmitPendingEntry,
  onApproveOrder,
  onRejectOrder,
  initialTab = 'pending_mis',
  onTabChange,
}: ApprovalsScreenProps) {
  const [activeTab, setActiveTab] = useState<ApprovalTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  function changeTab(tab: ApprovalTab) {
    setActiveTab(tab);
    onTabChange?.(tab);
  }

  // Submit Pending Form State
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sap, setSap] = useState('');
  const [item, setItem] = useState('HP DEF - 1X20L');
  const [ea, setEa] = useState('10');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rejection Dialog State
  const [rejectingItem, setRejectingItem] = useState<{
    id: number;
    type: 'mis' | 'order';
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const pendingOrders = orders.filter(
    o => o.status === 'pending' && (o.canDecide ?? canDecideOrder(actor, o))
  );
  const userCanDecidePending = canDecidePending(actor);

  async function handleSubmitNewEntry() {
    setSubmitError('');
    setIsSubmitting(true);
    try {
      await onSubmitPendingEntry(date, sap, item, ea);
      setSap('');
      setEa('10');
      changeTab('pending_mis');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectingItem || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      if (rejectingItem.type === 'mis') {
        await onRejectPending(rejectingItem.id, rejectionReason);
      } else {
        await onRejectOrder(rejectingItem.id, rejectionReason);
      }
      setRejectingItem(null);
      setRejectionReason('');
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <ScreenContainer>
      {/* Segmented Top Bar */}
      <View style={styles.tabBar}>
        <Pressable
          onPress={() => changeTab('pending_mis')}
          style={[styles.tabItem, activeTab === 'pending_mis' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'pending_mis' && styles.tabTextActive]}>
            Pending MIS ({pendingList.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('pending_orders')}
          style={[styles.tabItem, activeTab === 'pending_orders' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'pending_orders' && styles.tabTextActive]}>
            Orders ({pendingOrders.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('submit_entry')}
          style={[styles.tabItem, activeTab === 'submit_entry' && styles.tabItemActive]}
        >
          <Text style={[styles.tabText, activeTab === 'submit_entry' && styles.tabTextActive]}>
            ＋ Submit Entry
          </Text>
        </Pressable>
      </View>

      {/* VIEW: SUBMIT NEW PENDING ENTRY */}
      {activeTab === 'submit_entry' ? (
        <View style={[styles.card, shadows.card]}>
          <Text style={styles.cardTitle}>Submit Entry for Super Admin Approval</Text>
          <Text style={styles.cardSub}>
            Any signed-in officer or outlet may submit a pending volume entry. Once reviewed and
            approved, it is transacted into the MIS sheet.
          </Text>

          {submitError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {submitError}</Text>
            </View>
          ) : null}

          <FormField
            label="DATE (YYYY-MM-DD)"
            value={date}
            onChangeText={setDate}
            placeholder="e.g. 2026-11-22"
            required
          />

          <FormField
            label="OUTLET SAP NUMBER"
            value={sap}
            onChangeText={setSap}
            placeholder="e.g. 90000001"
            keyboardType="numeric"
            required
          />

          <FormField
            label="PRODUCT ITEM"
            value={item}
            onChangeText={setItem}
            placeholder="e.g. HP DEF - 1X20L"
            required
          />

          <FormField
            label="QUANTITY (PACKS / EA)"
            value={ea}
            onChangeText={setEa}
            keyboardType="numeric"
            placeholder="e.g. 10"
            helperText={`Total Litres: ${(Number(ea || 0) * 20).toFixed(1)} L`}
            required
          />

          <PrimaryButton
            title="Submit for Approval"
            onPress={handleSubmitNewEntry}
            loading={isSubmitting}
            size="lg"
            fullWidth
          />
        </View>
      ) : null}

      {/* VIEW: PENDING MIS ENTRIES */}
      {activeTab === 'pending_mis' ? (
        <View style={styles.listContainer}>
          <View style={[styles.infoBanner, shadows.subtle]}>
            <Text style={styles.infoTitle}>Pending MIS Verification Queue</Text>
            <Text style={styles.infoText}>
              {userCanDecidePending
                ? 'You have Super Admin authority to approve or reject pending submissions.'
                : 'Showing entries submitted by your account. Decisions require Super Admin review.'}
            </Text>
          </View>

          {pendingList.length === 0 ? (
            <EmptyState
              title="No Pending MIS Submissions"
              description="All submitted volume entries have been decided. You can submit new entries at any time."
              actionTitle="＋ Submit New Entry"
              onActionPress={() => setActiveTab('submit_entry')}
            />
          ) : (
            pendingList.map(item => (
              <ApprovalCard
                key={item.id}
                pending={item}
                actor={actor}
                onApprove={onApprovePending}
                onReject={id => setRejectingItem({ id, type: 'mis' })}
              />
            ))
          )}
        </View>
      ) : null}

      {/* VIEW: PENDING ORDERS */}
      {activeTab === 'pending_orders' ? (
        <View style={styles.listContainer}>
          <View style={[styles.infoBanner, shadows.subtle]}>
            <Text style={styles.infoTitle}>Orders Awaiting Your Decision</Text>
            <Text style={styles.infoText}>
              Orders eligible for your decision based on your organization, level and team hierarchy.
            </Text>
          </View>

          {pendingOrders.length === 0 ? (
            <EmptyState
              title="No Orders Awaiting Approval"
              description="There are currently no submitted orders in your area that require your decision."
              icon="✓"
            />
          ) : (
            pendingOrders.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                actor={actor}
                onApprove={onApproveOrder}
                onReject={id => setRejectingItem({ id, type: 'order' })}
              />
            ))
          )}
        </View>
      ) : null}

      {/* Shared Rejection Reason Dialog */}
      <Modal
        visible={rejectingItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectingItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>Enter Rejection Comment</Text>
            <Text style={styles.modalSubtitle}>
              A mandatory explanation must be provided when rejecting this{' '}
              {rejectingItem?.type === 'mis' ? 'MIS entry' : 'order'}:
            </Text>

            <FormField
              label="REASON FOR REJECTION"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="e.g. Quantity discrepancies or unverified outlet"
              required
            />

            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setRejectingItem(null);
                  setRejectionReason('');
                }}
              />
              <PrimaryButton
                title="Confirm Rejection"
                onPress={handleConfirmReject}
                loading={isRejecting}
                disabled={!rejectionReason.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  tabText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 11,
  },
  tabTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    ...typography.headingMd,
    color: colors.primaryDark,
  },
  cardSub: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginTop: -4,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  errorText: {
    ...typography.captionMedium,
    color: colors.danger,
  },
  listContainer: {
    gap: spacing.md,
  },
  infoBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  infoTitle: {
    ...typography.captionMedium,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  infoText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.headingMd,
  },
  modalSubtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
