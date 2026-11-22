import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { StatusBadge } from '../common/Badge';
import { PrimaryButton, SecondaryButton } from '../common/Buttons';
import type { Order } from '../../domain';
import type { OrderDetail, OrderFile } from '../../order-workflows';
import type { OrderFileKind } from '../../order-file-validation';

interface DocumentViewerModalProps {
  visible: boolean;
  order: Order | null;
  detail?: OrderDetail | null;
  onClose: () => void;
  onUploadFile?: (orderId: number, kind: OrderFileKind) => void;
  onShareFile?: (file: OrderFile) => void;
}

export function DocumentViewerModal({
  visible,
  order,
  detail,
  onClose,
  onUploadFile,
  onShareFile,
}: DocumentViewerModalProps) {
  const [docTab, setDocTab] = useState<'salesorder' | 'taxinvoice' | 'pod'>('salesorder');

  if (!order) return null;

  const lines = detail?.lines || [];
  const lineAmount = lines.reduce((sum, line) => sum + line.paid * Number(line.rate || 0), 0);
  const gstAmount = lines.reduce((sum, line) => sum + line.paid * Number(line.rate || 0) * Number(line.gst || 0) / 100, 0);
  const totalInvoiceAmount = lineAmount + gstAmount;
  const priced = lines.length > 0 && lines.every(line => line.rate !== null && line.gst !== null);
  const payment = detail?.files.find(file => file.kind === 'payment');
  const pod = detail?.files.find(file => file.kind === 'pod');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, shadows.modal]}>
          {/* Modal Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Document Viewer</Text>
              <Text style={styles.subtitle}>Order Ref: {order.order_ref}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Document Type Selector Tabs */}
          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setDocTab('salesorder')}
              style={[styles.tabItem, docTab === 'salesorder' && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, docTab === 'salesorder' && styles.tabTextActive]}>
                Sales Order
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setDocTab('taxinvoice')}
              style={[styles.tabItem, docTab === 'taxinvoice' && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, docTab === 'taxinvoice' && styles.tabTextActive]}>
                Tax Invoice
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setDocTab('pod')}
              style={[styles.tabItem, docTab === 'pod' && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, docTab === 'pod' && styles.tabTextActive]}>
                POD Status
              </Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
            {docTab === 'pod' ? (
              /* PROOF OF DELIVERY (POD) VIEW */
              <View style={styles.podContainer}>
                <View style={[styles.docCard, shadows.subtle]}>
                  <Text style={styles.docHeader}>Proof of Delivery (POD) Tracking</Text>
                  <Text style={styles.podNotice}>
                    POD documents are required to mark an approved transit order as delivered.
                  </Text>

                  <View style={styles.podStatusBox}>
                    <Text style={styles.podStatusLabel}>CURRENT STAGE:</Text>
                    <StatusBadge
                      status={order.delivery_stage || 'PENDING DISPATCH'}
                      label={order.delivery_stage ? order.delivery_stage.toUpperCase() : 'PENDING'}
                    />
                  </View>

                  <View style={styles.tableBlock}>
                    <View style={styles.row}>
                      <Text style={styles.rowKey}>Payment Receipt</Text>
                      <Text style={payment ? styles.rowValSuccess : styles.rowValPending}>{payment ? payment.orig_name : 'Awaiting receipt'}</Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowKey}>POD Uploaded</Text>
                      <Text style={order.delivery_stage === 'delivered' ? styles.rowValSuccess : styles.rowValPending}>
                        {pod ? pod.orig_name : 'Awaiting POD'}
                      </Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowKey}>Destination Outlet</Text>
                      <Text style={styles.rowVal}>{order.outlet}</Text>
                    </View>
                  </View>

                  {order.status === 'approved' && order.delivery_stage !== 'delivered' && onUploadFile ? (
                    <PrimaryButton title="Upload Payment Receipt" onPress={() => onUploadFile(order.id, 'payment')} size="sm" />
                  ) : null}
                  {order.status === 'approved' && order.delivery_stage !== 'delivered' && payment && onUploadFile ? (
                    <PrimaryButton
                      title="Upload Proof of Delivery"
                      onPress={() => onUploadFile(order.id, 'pod')}
                      size="sm"
                    />
                  ) : null}
                  {order.status === 'approved' && order.doc_type === 'invoice' && order.invoice_mode === 'manual' && (order.delivery_stage !== 'delivered' || !detail?.files.some(file => file.kind === 'invoice')) && onUploadFile ? (
                    <PrimaryButton title="Upload Manual Invoice" onPress={() => onUploadFile(order.id, 'invoice')} size="sm" />
                  ) : null}
                  {detail?.files.map(file => (
                    <SecondaryButton key={`${file.kind}-${file.stored_name}`} title={`Open ${file.kind}: ${file.orig_name}`} onPress={() => onShareFile?.(file)} size="sm" />
                  ))}
                  {detail?.events.map(event => (
                    <Text key={event.id} style={styles.rowVal}>{event.created_at} · {event.action} → {event.to_status} · {event.user_label}{event.comment ? ` · ${event.comment}` : ''}</Text>
                  ))}
                </View>
              </View>
            ) : (
              /* SALES ORDER / TAX INVOICE LETTERHEAD VIEW (matches salesorder.js) */
              <View style={[styles.letterheadPaper, shadows.card]}>
                {/* Letterhead Header */}
                <View style={styles.letterheadHeader}>
                  <View style={styles.companyBadge}>
                    <Text style={styles.companyBadgeText}>ROHAN</Text>
                  </View>
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyName}>ROHAN ENERGY SOLUTIONS PVT. LTD.</Text>
                    <Text style={styles.companyAddr}>
                      Plot No. 14, Sector 2, Industrial Area, Pithampur - 454775
                    </Text>
                    <Text style={styles.companyMeta}>
                      GSTIN: 23AABCR1234F1Z8 · PAN: AABCR1234F · E-mail: orders@rohanenergy.in
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                {/* Document Title Banner */}
                <View style={styles.docBanner}>
                  <Text style={styles.docBannerTitle}>
                    {docTab === 'salesorder' ? 'SALES ORDER VOUCHER' : 'TAX INVOICE'}
                  </Text>
                  <Text style={styles.voucherNumber}>
                    {docTab === 'salesorder' ? order.voucher_no || 'Not issued' : order.invoice_no || 'Not issued'}
                  </Text>
                </View>

                {/* Order & Outlet Meta */}
                <View style={styles.metaGrid}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>BILLED TO (RETAIL OUTLET):</Text>
                    <Text style={styles.metaValueBold}>{order.outlet}</Text>
                    <Text style={styles.metaValue}>SAP Code: {order.sap || 'Unavailable'}</Text>
                    <Text style={styles.metaValue}>{order.ro} · {order.zone}</Text>
                    <Text style={styles.metaValue}>State: {order.state || 'Unavailable'}</Text>
                  </View>

                  <View style={styles.metaColRight}>
                    <Text style={styles.metaLabel}>ORDER DETAILS:</Text>
                    <Text style={styles.metaValue}>Date: {order.order_date}</Text>
                    <Text style={styles.metaValue}>Ref: {order.order_ref}</Text>
                    <Text style={styles.metaValue}>Status: {order.status.toUpperCase()}</Text>
                    <Text style={styles.metaValue}>Placed By: {order.created_by_name || order.created_by}</Text>
                    {order.decided_by_name ? <Text style={styles.metaValue}>Decided By: {order.decided_by_name}</Text> : null}
                    {order.review_comment ? <Text style={styles.metaValue}>Decision: {order.review_comment}</Text> : null}
                  </View>
                </View>

                {/* Items Table */}
                <View style={styles.itemsTable}>
                  <View style={styles.thRow}>
                    <Text style={[styles.th, { flex: 2 }]}>DESCRIPTION</Text>
                    <Text style={[styles.th, { width: 50, textAlign: 'right' }]}>PAID</Text>
                    <Text style={[styles.th, { width: 50, textAlign: 'right' }]}>FOC</Text>
                    <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>TOTAL</Text>
                    <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>RATE</Text>
                    <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>AMOUNT</Text>
                  </View>

                  {lines.map(line => <View key={line.id} style={styles.trRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.itemName}>{line.item}</Text>
                    </View>
                    <Text style={[styles.td, { width: 50, textAlign: 'right' }]}>
                      {line.paid}
                    </Text>
                    <Text style={[styles.tdFoc, { width: 50, textAlign: 'right' }]}>
                      {line.foc}
                    </Text>
                    <Text style={[styles.tdBold, { width: 60, textAlign: 'right' }]}>
                      {line.ea} EA
                    </Text>
                    <Text style={[styles.td, { width: 70, textAlign: 'right' }]}>
                      ₹ {line.rate || '—'}
                    </Text>
                    <Text style={[styles.tdBold, { width: 80, textAlign: 'right' }]}>
                      ₹ {(line.paid * Number(line.rate || 0)).toFixed(2)}
                    </Text>
                  </View>)}
                </View>

                {/* Totals Summary */}
                <View style={styles.totalsBox}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalKey}>Taxable Value (ex-GST):</Text>
                    <Text style={styles.totalVal}>{priced ? `₹ ${lineAmount.toFixed(2)}` : 'Pricing unavailable'}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalKey}>Output GST:</Text>
                    <Text style={styles.totalVal}>{priced ? `₹ ${gstAmount.toFixed(2)}` : 'Pricing unavailable'}</Text>
                  </View>
                  <View style={[styles.totalRow, styles.grandTotalRow]}>
                    <Text style={styles.grandTotalKey}>Total Invoice Amount:</Text>
                    <Text style={styles.grandTotalVal}>{priced ? `₹ ${totalInvoiceAmount.toFixed(2)}` : 'Pricing unavailable'}</Text>
                  </View>
                  <Text style={styles.amountWords}>
                    Total Volume: {lines.reduce((sum, line) => sum + line.vol, 0)} Litres ({order.total_ea} Packs)
                  </Text>
                </View>

                {/* Footer Signoff */}
                <View style={styles.letterheadFooter}>
                  <View style={styles.signBlock}>
                    <Text style={styles.signNotice}>Generated offline via STRAVEDA</Text>
                    <Text style={styles.signNotice}>Local order reference: {order.order_ref}</Text>
                  </View>
                  <View style={styles.signStamp}>
                    <Text style={styles.signCompany}>For Rohan Energy Solutions</Text>
                    <Text style={styles.signAuthor}>Authorised Signatory</Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Modal Bottom Actions */}
          <View style={styles.footerActions}>
            <SecondaryButton title="Close Document" onPress={onClose} size="sm" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    paddingBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  title: {
    ...typography.headingMd,
    color: colors.primaryDark,
  },
  subtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  scrollArea: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  letterheadPaper: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  letterheadHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  companyBadge: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.xs,
  },
  companyBadgeText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  companyAddr: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 1,
  },
  companyMeta: {
    fontSize: 8,
    color: colors.textMuted,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.primaryLight,
    opacity: 0.3,
  },
  docBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xs,
  },
  docBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  voucherNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  metaCol: {
    flex: 1,
    gap: 1,
  },
  metaColRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  metaLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  metaValueBold: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metaValue: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  itemsTable: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xs,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  th: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  trRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  itemName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemSku: {
    fontSize: 9,
    color: colors.textMuted,
  },
  td: {
    fontSize: 10,
    color: colors.textPrimary,
  },
  tdBold: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  tdFoc: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  totalsBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.xs,
    padding: spacing.sm,
    gap: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalKey: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  totalVal: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 3,
    marginTop: 2,
  },
  grandTotalKey: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  grandTotalVal: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  amountWords: {
    fontSize: 9,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  letterheadFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  signBlock: {
    gap: 1,
  },
  signNotice: {
    fontSize: 8,
    color: colors.textMuted,
  },
  signStamp: {
    alignItems: 'flex-end',
    gap: 1,
  },
  signCompany: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  signAuthor: {
    fontSize: 8,
    color: colors.textSecondary,
  },
  podContainer: {
    gap: spacing.sm,
  },
  docCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  docHeader: {
    ...typography.headingSm,
    fontSize: 14,
    color: colors.primaryDark,
  },
  podNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  podStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  podStatusLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  tableBlock: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.xs,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowKey: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  rowVal: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowValSuccess: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  rowValPending: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
});
