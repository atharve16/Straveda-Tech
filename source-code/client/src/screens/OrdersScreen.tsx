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
import { FormField, SearchBar } from '../components/common/Inputs';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { EmptyState } from '../components/common/Feedback';
import { OrderCard } from '../components/domain/OrderCard';
import { DocumentViewerModal } from '../components/domain/DocumentViewerModal';
import type { Actor, Order } from '../domain';
import type { DraftLine, OrderDetail, OrderFile, OrderReturn } from '../order-workflows';
import type { OrderFileKind } from '../order-file-validation';

export type OrderViewTab = 'all_orders' | 'my_orders' | 'create' | 'returns' | 'pod';

interface OrdersScreenProps {
  actor: Actor;
  orders: Order[];
  products: { pid: number; name: string; brand: string }[];
  outlets: { sap_code: string; outlet_name: string }[];
  onSaveDraft: (sap: string, lines: DraftLine[], editId?: number) => Promise<void>;
  onPreviewLines: (lines: DraftLine[]) => Promise<{ item: string; paid: number; foc: number; ea: number; rate: string | null; gst: string | null }[]>;
  onGetDetail: (id: number) => Promise<OrderDetail>;
  onRequestReturn: (id: number, reason: string, creditNote: string) => Promise<void>;
  onDecideReturn: (id: number, approve: boolean, comment: string) => Promise<void>;
  onUploadFile: (id: number, kind: OrderFileKind) => Promise<void>;
  onShareFile: (orderId: number, file: OrderFile) => Promise<void>;
  returns: OrderReturn[];
  returnDecisionAllowed: boolean;
  onSubmitOrder: (id: number) => Promise<void>;
  onApproveOrder: (id: number) => Promise<void>;
  onRejectOrder: (id: number, reason: string) => Promise<void>;
  initialTab?: 'list' | 'create' | 'returns' | 'pod' | OrderViewTab;
  onTabChange?: (tab: OrderViewTab) => void;
  onBack?: () => void;
}

type FilterStatus = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'TRANSIT';

export function OrdersScreen({
  actor,
  orders,
  products,
  outlets,
  onSaveDraft,
  onPreviewLines,
  onGetDetail,
  onRequestReturn,
  onDecideReturn,
  onUploadFile,
  onShareFile,
  returns,
  returnDecisionAllowed,
  onSubmitOrder,
  onApproveOrder,
  onRejectOrder,
  initialTab = 'list',
  onTabChange,
  onBack,
}: OrdersScreenProps) {
  const [viewTab, setViewTab] = useState<OrderViewTab>(
    initialTab === 'create'
      ? 'create'
      : initialTab === 'returns'
      ? 'returns'
      : initialTab === 'pod'
      ? 'pod'
      : initialTab === 'my_orders'
      ? 'my_orders'
      : 'all_orders'
  );
  useEffect(() => {
    setViewTab(
      initialTab === 'create'
        ? 'create'
        : initialTab === 'returns'
        ? 'returns'
        : initialTab === 'pod'
        ? 'pod'
        : initialTab === 'my_orders'
        ? 'my_orders'
        : 'all_orders'
    );
  }, [initialTab]);

  function changeTab(tab: OrderViewTab) {
    setViewTab(tab);
    onTabChange?.(tab);
  }
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL');

  // Draft Creation Form State
  const [selectedSap, setSelectedSap] = useState(outlets[0]?.sap_code || '');
  const [selectedProduct, setSelectedProduct] = useState(
    products[0]?.name || 'HP DEF - 1X20L'
  );
  const [paidEa, setPaidEa] = useState('10');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [hasAddedLine, setHasAddedLine] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [preview, setPreview] = useState<{ item: string; paid: number; foc: number; ea: number; rate: string | null; gst: string | null }[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Rejection Dialog State
  const [rejectOrderId, setRejectOrderId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState('');

  // Document Viewer Modal State (Sales Order / Tax Invoice voucher)
  const [activeDocDetail, setActiveDocDetail] = useState<OrderDetail | null>(null);
  const [detailError, setDetailError] = useState('');

  // Return Request Modal State
  const [returnOrderId, setReturnOrderId] = useState<number | null>(null);
  const [creditNote, setCreditNote] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returnError, setReturnError] = useState('');
  const [decisionReturnId, setDecisionReturnId] = useState<number | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  useEffect(() => {
    const effective = hasAddedLine ? draftLines : [{ item: selectedProduct, paid: Number(paidEa) }];
    if (!effective.length) { setPreview([]); return; }
    if (effective.some(line => !Number.isInteger(line.paid) || line.paid < 1)) { setPreview([]); return; }
    let live = true;
    onPreviewLines(effective).then(value => { if (live) setPreview(value); }).catch(() => { if (live) setPreview([]); });
    return () => { live = false; };
  }, [draftLines, hasAddedLine, selectedProduct, paidEa]);

  // Filtered orders
  const myOrders = orders.filter(o => o.created_by === actor.username);
  const baseList = viewTab === 'my_orders' ? myOrders : orders;

  const filteredOrders = baseList.filter(o => {
    const matchesSearch =
      !search ||
      `${o.order_ref} ${o.outlet} ${o.sap || ''} ${o.status}`
        .toLowerCase()
        .includes(search.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'TRANSIT') return o.delivery_stage === 'transit';
    return o.status.toUpperCase() === statusFilter;
  });

  const paidNum = preview.reduce((sum, line) => sum + line.paid, 0);
  const estimatedFoc = preview.reduce((sum, line) => sum + line.foc, 0);
  const totalEstimatedEa = paidNum + estimatedFoc;
  const estimatedAmount = preview.reduce((sum, line) => sum + line.paid * Number(line.rate || 0) * (1 + Number(line.gst || 0) / 100), 0);

  function addOrUpdateLine() {
    const paid = Number(paidEa);
    if (!selectedProduct || !Number.isInteger(paid) || paid < 1 || paid > 100000) { setCreateError('Enter a whole paid quantity from 1 to 100000.'); return; }
    setDraftLines(previous => [...previous.filter(line => line.item !== selectedProduct), { item: selectedProduct, paid }]);
    setHasAddedLine(true);
    setCreateError('');
  }

  async function openDetail(order: Order) {
    setDetailError('');
    try { setActiveDocDetail(await onGetDetail(order.id)); }
    catch (error) { setDetailError(error instanceof Error ? error.message : String(error)); }
  }

  async function editDraft(order: Order) {
    try {
      const detail = await onGetDetail(order.id);
      setEditingId(order.id);
      setSelectedSap(order.sap);
      setDraftLines(detail.lines.map(line => ({ item: line.item, paid: line.paid })));
      setHasAddedLine(true);
      changeTab('create');
      setCreateError('');
    } catch (error) { setDetailError(error instanceof Error ? error.message : String(error)); }
  }

  async function handleCreateDraft() {
    const lines = hasAddedLine ? draftLines : [{ item: selectedProduct, paid: Number(paidEa) }];
    if (!selectedSap || !lines.length) {
      setCreateError('Please select an outlet and product, then enter pack quantity.');
      return;
    }
    setCreateError('');
    setIsCreating(true);
    try {
      await onSaveDraft(selectedSap, lines, editingId);
      setDraftLines([]);
      setHasAddedLine(false);
      setEditingId(undefined);
      changeTab('all_orders');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectOrderId || !rejectionReason.trim()) return;
    setIsRejecting(true);
    try {
      await onRejectOrder(rejectOrderId, rejectionReason);
      setRejectOrderId(null);
      setRejectionReason('');
      setRejectError('');
    } catch (error) {
      setRejectError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Segment Bar */}
      <View style={styles.segmentBar}>
        <Pressable
          onPress={() => changeTab('all_orders')}
          style={[styles.segmentItem, viewTab === 'all_orders' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, viewTab === 'all_orders' && styles.segmentTextActive]}>
            All ({orders.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('my_orders')}
          style={[styles.segmentItem, viewTab === 'my_orders' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, viewTab === 'my_orders' && styles.segmentTextActive]}>
            My ({myOrders.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('create')}
          style={[styles.segmentItem, viewTab === 'create' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, viewTab === 'create' && styles.segmentTextActive]}>
            ＋ New Order
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('pod')}
          style={[styles.segmentItem, viewTab === 'pod' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, viewTab === 'pod' && styles.segmentTextActive]}>
            POD Track
          </Text>
        </Pressable>

        <Pressable
          onPress={() => changeTab('returns')}
          style={[styles.segmentItem, viewTab === 'returns' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, viewTab === 'returns' && styles.segmentTextActive]}>
            Returns
          </Text>
        </Pressable>
      </View>

      {/* VIEW: CREATE NEW ORDER (PAGE: neworder) */}
      {viewTab === 'create' ? (
        <View style={[styles.createCard, shadows.card]}>
          <Text style={styles.cardTitle}>{editingId ? `Edit Draft #${editingId}` : 'Create Sales Order Draft'}</Text>
          <Text style={styles.cardSubtitle}>
            Drafts can be reviewed, edited and submitted once saved to local database.
          </Text>

          {createError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {createError}</Text>
            </View>
          ) : null}

          {/* Outlet Selection */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>DESTINATION OUTLET / SAP</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {outlets.map(o => {
                const isSelected = selectedSap === o.sap_code;
                return (
                  <Pressable
                    key={o.sap_code}
                    onPress={() => setSelectedSap(o.sap_code)}
                    style={[styles.selectChip, isSelected && styles.selectChipActive]}
                  >
                    <Text style={[styles.selectChipCode, isSelected && styles.selectChipTextActive]}>
                      SAP {o.sap_code}
                    </Text>
                    <Text
                      style={[styles.selectChipName, isSelected && styles.selectChipTextActive]}
                      numberOfLines={1}
                    >
                      {o.outlet_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Product Selection */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>PRODUCT SKU</Text>
            <View style={styles.productsGrid}>
              {products.map(p => {
                const isSelected = selectedProduct === p.name;
                return (
                  <Pressable
                    key={p.pid}
                    onPress={() => setSelectedProduct(p.name)}
                    style={[styles.productCard, isSelected && styles.productCardActive]}
                  >
                    <Text style={[styles.productBrand, isSelected && styles.productTextActive]}>
                      {p.brand}
                    </Text>
                    <Text style={[styles.productName, isSelected && styles.productTextActive]}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Paid Quantity Input */}
          <FormField
            label="PAID PACKS QUANTITY (EA)"
            value={paidEa}
            onChangeText={setPaidEa}
            keyboardType="numeric"
            placeholder="e.g. 10"
            helperText="1 pack = 20L. Free-of-cost (FOC) scheme is calculated automatically."
            required
          />

          <SecondaryButton title={draftLines.some(line => line.item === selectedProduct) ? 'Update Product Line' : 'Add Product Line'} onPress={addOrUpdateLine} size="sm" />
          {draftLines.map(line => (
            <View key={line.item} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{line.item}: {line.paid} paid EA</Text>
              <SecondaryButton title="Remove" onPress={() => setDraftLines(previous => previous.filter(item => item.item !== line.item))} size="sm" />
            </View>
          ))}

          {/* Live Order Summary Box */}
          <View style={styles.summaryBox}>
            <Text style={styles.summaryBoxTitle}>ORDER PREVIEW SUMMARY</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Paid Packs:</Text>
              <Text style={styles.summaryValue}>{paidNum} EA</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Free-of-Cost (FOC Scheme):</Text>
              <Text style={styles.summaryValueFoc}>+{estimatedFoc} EA (Free)</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}>
              <Text style={styles.summaryTotalLabel}>Total Order Quantity:</Text>
              <Text style={styles.summaryTotalValue}>
                {totalEstimatedEa} EA ({totalEstimatedEa * 20} Litres)
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated Total incl. GST:</Text>
              <Text style={styles.summaryValue}>{preview.every(line => line.rate && line.gst) ? `₹ ${estimatedAmount.toFixed(2)}` : 'Price not configured'}</Text>
            </View>
          </View>

          {/* Save Action */}
          <PrimaryButton
            title={editingId ? 'Save Draft Changes' : 'Save Draft Order'}
            onPress={handleCreateDraft}
            loading={isCreating}
            size="md"
            fullWidth
          />
        </View>
      ) : null}

      {/* VIEW: PROOF OF DELIVERY (POD) */}
      {viewTab === 'pod' ? (
        <View style={styles.listContainer}>
          {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
          <View style={[styles.infoBanner, shadows.subtle]}>
            <Text style={styles.infoTitle}>Proof of Delivery (POD) Dispatch Desk</Text>
            <Text style={styles.infoText}>
              In accordance with order rules, approved orders in transit require verified delivery
              documentation to be marked as delivered and locked.
            </Text>
          </View>

          {orders.filter(o => o.delivery_stage === 'transit').length === 0 ? (
            <EmptyState
              title="No In-Transit Orders"
              description="Orders currently in transit will appear here for receipt verification and POD document handling."
              icon="🚚"
            />
          ) : (
            orders
              .filter(o => o.delivery_stage === 'transit')
              .map(o => (
                <OrderCard
                  key={o.id}
                  order={o}
                  actor={actor}
                  onPressDetails={openDetail}
                />
              ))
          )}
        </View>
      ) : null}

      {/* VIEW: RETURNS (PAGE: returns) */}
      {viewTab === 'returns' ? (
        <View style={styles.listContainer}>
          <View style={[styles.infoBanner, shadows.subtle]}>
            <Text style={styles.infoTitle}>Order Returns & Credit Notes (PAGE: returns)</Text>
            <Text style={styles.infoText}>
              Return requests are permitted exclusively on delivered orders. A credit note number
              and minimum 3-character reason are mandatory per business rules.
            </Text>
          </View>

          {returnError ? <Text style={styles.errorText}>{returnError}</Text> : null}
          {returns.map(ret => (
            <View key={ret.id} style={[styles.returnCard, shadows.subtle]}>
              <Text style={styles.returnRef}>Return #{ret.id} · Order #{ret.order_id} · {ret.status.toUpperCase()}</Text>
              <Text style={styles.returnMeta}>{ret.credit_note} · {ret.reason}</Text>
              <Text style={styles.returnMeta}>Requested by {ret.requested_by_name}{ret.decided_by_name ? ` · Decided by ${ret.decided_by_name}` : ''}</Text>
              {ret.decision_comment ? <Text style={styles.returnMeta}>Decision: {ret.decision_comment}</Text> : null}
              {ret.status === 'pending' && returnDecisionAllowed && (actor.role === 'superadmin' || ret.requested_by !== actor.username) ? (
                <SecondaryButton title="Decide Return" onPress={() => { setDecisionReturnId(ret.id); setDecisionComment(''); }} size="sm" />
              ) : null}
            </View>
          ))}

          {orders.filter(o => o.delivery_stage === 'delivered').length === 0 ? (
            <EmptyState
              title="No Delivered Orders Eligible for Return"
              description="Only orders marked with status 'delivered' accept return requests. Once delivered, return requests can be submitted here."
              icon="↩"
            />
          ) : (
            orders
              .filter(o => o.delivery_stage === 'delivered')
              .map(o => (
                <View key={o.id} style={[styles.returnCard, shadows.subtle]}>
                  <View style={styles.returnHeader}>
                    <Text style={styles.returnRef}>{o.order_ref}</Text>
                    <Text style={styles.returnOutlet}>{o.outlet}</Text>
                  </View>
                  <Text style={styles.returnMeta}>
                    Delivered: {o.total_ea} EA ({o.total_ea * 20} L) · SAP {o.sap}
                  </Text>
                  <SecondaryButton
                    title="Request Return"
                    onPress={() => { setReturnOrderId(o.id); setReturnError(''); }}
                    size="sm"
                  />
                </View>
              ))
          )}
        </View>
      ) : null}

      {/* VIEW: ORDER LISTS (All Orders or My Orders) */}
      {viewTab === 'all_orders' || viewTab === 'my_orders' ? (
        <View style={styles.listContainer}>
          {/* Search Bar */}
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search by ref, outlet, or status..."
          />

          {/* Status Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {(['ALL', 'DRAFT', 'PENDING', 'APPROVED', 'TRANSIT'] as FilterStatus[]).map(status => {
              const isActive = statusFilter === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setStatusFilter(status)}
                  style={[styles.statusChip, isActive && styles.statusChipActive]}
                >
                  <Text style={[styles.statusChipText, isActive && styles.statusChipTextActive]}>
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Orders List */}
          {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
          {filteredOrders.length === 0 ? (
            <EmptyState
              title="No Orders Found"
              description={
                search || statusFilter !== 'ALL'
                  ? 'Try adjusting your search query or status filter.'
                  : 'No orders have been recorded in your geographic area yet.'
              }
              actionTitle="＋ Create Draft Order"
              onActionPress={() => setViewTab('create')}
            />
          ) : (
            filteredOrders.map(order => (
              <View key={order.id}>
              <OrderCard
                order={order}
                actor={actor}
                onSubmit={onSubmitOrder}
                onApprove={onApproveOrder}
                onReject={id => setRejectOrderId(id)}
                onPressDetails={openDetail}
              />
              {order.created_by === actor.username && ['draft', 'rejected'].includes(order.status) ? (
                <SecondaryButton title="Edit Draft Lines" onPress={() => void editDraft(order)} size="sm" />
              ) : null}
              </View>
            ))
          )}
        </View>
      ) : null}

      {/* Document Letterhead Voucher Modal (salesorder.js reproduction) */}
      <DocumentViewerModal
        visible={activeDocDetail !== null}
        order={activeDocDetail?.order || null}
        detail={activeDocDetail}
        onClose={() => setActiveDocDetail(null)}
        onUploadFile={async (id, kind) => {
          try {
            await onUploadFile(id, kind);
            setActiveDocDetail(await onGetDetail(id));
          } catch (error) { setDetailError(error instanceof Error ? error.message : String(error)); setActiveDocDetail(null); }
        }}
        onShareFile={async file => {
          try { await onShareFile(activeDocDetail!.order.id, file); }
          catch (error) { setDetailError(error instanceof Error ? error.message : String(error)); setActiveDocDetail(null); }
        }}
      />

      {/* Rejection Reason Modal */}
      <Modal
        visible={rejectOrderId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectOrderId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>Order Rejection Reason</Text>
            <Text style={styles.modalSubtitle}>
              A mandatory explanation must be recorded when rejecting Order #{rejectOrderId}:
            </Text>
            {rejectError ? <Text style={styles.errorText}>{rejectError}</Text> : null}

            <FormField
              label="REASON FOR REJECTION"
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder="e.g. Quantity discrepancy or price rate mismatch"
              required
            />

            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setRejectOrderId(null);
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

      {/* Return Request Modal */}
      <Modal
        visible={returnOrderId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReturnOrderId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>Request Order Return</Text>
            <Text style={styles.modalSubtitle}>
              Submit credit note documentation for Order #{returnOrderId}:
            </Text>
            {returnError ? <Text style={styles.errorText}>{returnError}</Text> : null}

            <FormField
              label="CREDIT NOTE NUMBER"
              value={creditNote}
              onChangeText={setCreditNote}
              placeholder="e.g. CN-2026-0042"
              required
            />

            <FormField
              label="REASON FOR RETURN (MIN 3 CHARACTERS)"
              value={returnReason}
              onChangeText={setReturnReason}
              placeholder="e.g. Damaged seal or packaging leakage"
              required
            />

            <View style={styles.modalActions}>
              <SecondaryButton
                title="Cancel"
                onPress={() => {
                  setReturnOrderId(null);
                  setCreditNote('');
                  setReturnReason('');
                }}
              />
              <PrimaryButton
                title="Submit Request"
                onPress={async () => {
                  if (returnOrderId === null) return;
                  try {
                    await onRequestReturn(returnOrderId, returnReason, creditNote);
                    setReturnOrderId(null); setCreditNote(''); setReturnReason(''); setReturnError('');
                  } catch (error) { setReturnError(error instanceof Error ? error.message : String(error)); }
                }}
                disabled={!creditNote.trim() || returnReason.trim().length < 3}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={decisionReturnId !== null} transparent animationType="fade" onRequestClose={() => setDecisionReturnId(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, shadows.modal]}>
            <Text style={styles.modalTitle}>Decide Return #{decisionReturnId}</Text>
            <FormField label="DECISION COMMENT / REJECTION REASON" value={decisionComment} onChangeText={setDecisionComment} />
            <View style={styles.modalActions}>
              <SecondaryButton title="Cancel" onPress={() => setDecisionReturnId(null)} />
              <SecondaryButton title="Reject" onPress={async () => {
                if (decisionReturnId === null) return;
                try { await onDecideReturn(decisionReturnId, false, decisionComment); setDecisionReturnId(null); setReturnError(''); }
                catch (error) { setReturnError(error instanceof Error ? error.message : String(error)); setDecisionReturnId(null); }
              }} disabled={!decisionComment.trim()} />
              <PrimaryButton title="Approve" onPress={async () => {
                if (decisionReturnId === null) return;
                try { await onDecideReturn(decisionReturnId, true, decisionComment); setDecisionReturnId(null); setReturnError(''); }
                catch (error) { setReturnError(error instanceof Error ? error.message : String(error)); setDecisionReturnId(null); }
              }} />
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  listContainer: {
    gap: spacing.sm,
  },
  filterScroll: {
    flexGrow: 0,
  },
  statusChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  statusChipActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  statusChipTextActive: {
    color: colors.textInverse,
  },
  createCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  cardSubtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: -4,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    padding: spacing.xs + 2,
    borderRadius: radius.xs,
  },
  errorText: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '600',
  },
  fieldSection: {
    gap: 3,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
    letterSpacing: 0.3,
  },
  chipRow: {
    flexGrow: 0,
  },
  selectChip: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xs + 2,
    marginRight: spacing.xs,
    minWidth: 120,
    maxWidth: 160,
  },
  selectChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  selectChipCode: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  selectChipName: {
    fontSize: 11,
    color: colors.textPrimary,
  },
  selectChipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  productCard: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xs + 2,
    flex: 1,
    minWidth: 120,
  },
  productCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  productBrand: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  productName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 1,
  },
  productTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  summaryBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  summaryBoxTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  summaryValueFoc: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 3,
    marginTop: 2,
  },
  summaryTotalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  summaryTotalValue: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  infoBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  infoText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  returnCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  returnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  returnRef: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  returnOutlet: {
    ...typography.captionMedium,
    color: colors.textPrimary,
  },
  returnMeta: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    ...typography.headingSm,
  },
  modalSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
