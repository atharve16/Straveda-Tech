import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import { FormField } from '../components/common/Inputs';
import { ConfirmationDialog, EmptyState } from '../components/common/Feedback';
import type { Actor } from '../domain';
import type { InventoryProduct, InventorySnapshot } from '../inventory';

interface InventoryScreenProps {
  actor: Actor;
  snapshot: InventorySnapshot | null;
  loading: boolean;
  error: string;
  onSetStock: (pid: number, value: string) => Promise<void>;
  onSetStockEnabled: (enabled: boolean) => Promise<void>;
  initialTab?: InvTab;
  onBack?: () => void;
}

type InvTab = 'products' | 'pricing' | 'foc' | 'sap';

export function InventoryScreen({ actor, snapshot, loading, error, onSetStock, onSetStockEnabled, initialTab = 'products', onBack }: InventoryScreenProps) {
  const [activeTab, setActiveTab] = useState<InvTab>(initialTab);
  const products = snapshot?.products ?? [];
  const [editingStock, setEditingStock] = useState<InventoryProduct | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [stockError, setStockError] = useState('');
  const [savingStock, setSavingStock] = useState(false);
  const [toggleConfirm, setToggleConfirm] = useState(false);
  const [toggleError, setToggleError] = useState('');

  const isAdmin = actor.role === 'superadmin' && actor.org === 'rohan';

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Segment Tabs */}
      <View style={styles.segmentBar}>
        <Pressable
          onPress={() => setActiveTab('products')}
          style={[styles.segmentItem, activeTab === 'products' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'products' && styles.segmentTextActive]}>
            Products
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('pricing')}
          style={[styles.segmentItem, activeTab === 'pricing' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'pricing' && styles.segmentTextActive]}>
            Prices & Stock
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('foc')}
          style={[styles.segmentItem, activeTab === 'foc' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'foc' && styles.segmentTextActive]}>
            FOC Schemes
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('sap')}
          style={[styles.segmentItem, activeTab === 'sap' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'sap' && styles.segmentTextActive]}>
            SAP Codes
          </Text>
        </Pressable>
      </View>

      {/* Access Permission State Notice */}
      <View style={[styles.permissionBanner, shadows.subtle]}>
        <View style={styles.permIcon}>
          <Text style={styles.permIconText}>{isAdmin ? '✎' : '🔒'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.permTitle}>
            {isAdmin ? 'Administrative Edit Access' : 'Read-Only Mode (Restricted)'}
          </Text>
          <Text style={styles.permText}>
            {isAdmin
              ? 'Stock settings can be changed below. Editing prices and FOC tiers is unavailable here.'
              : 'Product rates, stock parameters and scheme thresholds are managed centrally.'}
          </Text>
        </View>
      </View>

      {loading ? <Text style={styles.disclaimer}>Loading local inventory…</Text> : null}
      {error ? <Text style={styles.disclaimer}>{error}</Text> : null}
      {!loading && !error && !products.length ? <EmptyState title="No Products" description="No products are stored in the local catalog." /> : null}

      {/* VIEW: PRODUCTS LIST */}
      {!loading && !error && activeTab === 'products' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Catalog (portal_products)</Text>
          {products.map(p => (
            <View key={p.pid} style={[styles.productCard, shadows.subtle]}>
              <View style={styles.productLeft}>
                <View style={styles.brandBadge}>
                  <Text style={styles.brandText}>{p.brand}</Text>
                </View>
                <Text style={styles.productName}>{p.name}</Text>
                <Text style={styles.productSku}>SKU Identifier: PID #{p.pid} · 20L Pack</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>ACTIVE</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* VIEW: PRICING & STOCK */}
      {!loading && !error && activeTab === 'pricing' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price & Stock Parameters</Text>
          {isAdmin ? <SecondaryButton title={snapshot?.stockEnabled ? 'Disable Stock Checks' : 'Enable Stock Checks'} onPress={() => setToggleConfirm(true)} size="sm" /> : null}
          {toggleError ? <Text style={styles.disclaimer}>{toggleError}</Text> : null}
          <View style={[styles.card, shadows.subtle]}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>PRODUCT</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>RATE (EX-GST)</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>GST</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>STOCK</Text>
            </View>
            {products.map(p => (
              <View key={p.pid} style={styles.tableRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tbProduct}>{p.name}</Text>
                  <Text style={styles.tbSub}>{p.brand}</Text>
                  {isAdmin ? <SecondaryButton title="Set Stock" size="sm" onPress={() => { setEditingStock(p); setStockInput(p.available === null ? '' : String(p.available)); setStockError(''); }} /> : null}
                </View>
                <Text style={[styles.tbCell, { flex: 1, textAlign: 'right' }]}>{p.rate === null ? 'Unset' : `₹ ${Number(p.rate).toFixed(2)}`}</Text>
                <Text style={[styles.tbCell, { flex: 1, textAlign: 'right' }]}>{p.gst === null ? '18% default*' : `${Number(p.gst)}%`}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.tbStockCell}>{!snapshot?.stockEnabled ? 'Disabled' : p.available === null ? 'Unlimited' : `${p.available.toLocaleString()} EA`}</Text>
                  {p.settingAt ? <Text style={styles.tbSub}>Set {p.settingAt}</Text> : null}
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.disclaimer}>
            Rates are ex-GST. *18% is a display default; orders require a saved GST setting. Stock is baseline minus approved EA since the setting time. Blank stock means unlimited.
          </Text>
        </View>
      ) : null}

      {/* VIEW: FOC SCHEMES */}
      {!loading && !error && activeTab === 'foc' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Free-of-Cost (FOC) Scheme Rules</Text>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.schemeNotice}>
              Rules apply automatically when placing orders. The greatest qualifying tier threshold
              is calculated at order creation.
            </Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>SKU</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>MIN QTY</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>FOC FREE</Text>
            </View>

            {snapshot?.foc.length ? snapshot.foc.map(tier => (
              <View key={`${tier.pid}-${tier.min_qty}`} style={styles.tableRow}>
                <Text style={[styles.tbProduct, { flex: 2 }]}>{tier.item}</Text>
                <Text style={[styles.tbCell, { flex: 1, textAlign: 'center' }]}>{tier.min_qty} EA</Text>
                <Text style={[styles.tbFocCell, { flex: 1, textAlign: 'right' }]}>+{tier.foc_qty} EA</Text>
              </View>
            )) : <Text style={styles.disclaimer}>No FOC tiers are configured.</Text>}
          </View>
        </View>
      ) : null}

      {/* VIEW: SAP CODES */}
      {!loading && !error && activeTab === 'sap' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SAP Master Directory (Preview)</Text>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.schemeNotice}>
              Verified SAP codes mapped to authorized retail outlets.
            </Text>
            {snapshot?.outlets.length ? snapshot.outlets.map(outlet => (
              <View key={outlet.sap_code} style={styles.sapItem}>
                <View>
                  <Text style={styles.sapCode}>SAP {outlet.sap_code}</Text>
                  <Text style={styles.sapDesc}>{outlet.outlet_name} · {outlet.zone} · {outlet.ro}</Text>
                </View>
                <View style={styles.verifiedTag}>
                  <Text style={styles.verifiedText}>LINKED</Text>
                </View>
              </View>
            )) : <Text style={styles.disclaimer}>No outlets are available in your assigned area.</Text>}
          </View>
        </View>
      ) : null}
      <Modal visible={editingStock !== null} transparent animationType="fade" onRequestClose={() => setEditingStock(null)}>
        <View style={styles.stockOverlay}>
          <View style={[styles.card, styles.stockModal, shadows.subtle]}>
            <Text style={styles.sectionTitle}>Set available stock</Text>
            <Text style={styles.disclaimer}>{editingStock?.name}</Text>
            <FormField label="AVAILABLE EA" value={stockInput} onChangeText={setStockInput} keyboardType="numeric" placeholder="Blank for unlimited" />
            <Text style={styles.disclaimer}>Saving the current available EA keeps the existing baseline timestamp.</Text>
            {stockError ? <Text style={styles.disclaimer}>{stockError}</Text> : null}
            <View style={styles.stockActions}>
              <SecondaryButton title="Cancel" size="sm" onPress={() => setEditingStock(null)} />
              <PrimaryButton title="Save Stock" size="sm" loading={savingStock} onPress={async () => {
                if (!editingStock || savingStock) return;
                setSavingStock(true);
                setStockError('');
                try { await onSetStock(editingStock.pid, stockInput); setEditingStock(null); }
                catch (failure) { setStockError(failure instanceof Error ? failure.message : String(failure)); }
                finally { setSavingStock(false); }
              }} />
            </View>
          </View>
        </View>
      </Modal>
      <ConfirmationDialog
        visible={toggleConfirm}
        title={snapshot?.stockEnabled ? 'Disable stock checks?' : 'Enable stock checks?'}
        message="Existing stock quantities and timestamps will be preserved."
        confirmTitle={snapshot?.stockEnabled ? 'Disable' : 'Enable'}
        onConfirm={async () => {
          try { await onSetStockEnabled(!snapshot?.stockEnabled); setToggleError(''); setToggleConfirm(false); }
          catch (failure) { setToggleError(failure instanceof Error ? failure.message : String(failure)); setToggleConfirm(false); }
        }}
        onCancel={() => setToggleConfirm(false)}
      />
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
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  segmentItemActive: {
    backgroundColor: colors.primarySubtle,
  },
  segmentText: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    fontSize: 11,
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  permIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permIconText: {
    fontSize: 14,
    color: colors.primaryDark,
  },
  permTitle: {
    ...typography.captionMedium,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  permText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  productCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  productLeft: {
    gap: 3,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  brandText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  productName: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  productSku: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  statusPill: {
    backgroundColor: colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.xs,
  },
  th: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tbProduct: {
    ...typography.bodyMedium,
    fontSize: 13,
  },
  tbSub: {
    ...typography.captionRegular,
    color: colors.textMuted,
    fontSize: 10,
  },
  tbCell: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  tbStockCell: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  tbFocCell: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  disclaimer: {
    ...typography.captionRegular,
    color: colors.textMuted,
    fontSize: 11,
  },
  schemeNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  sapItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  sapCode: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
  sapDesc: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  verifiedTag: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  verifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  stockOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stockModal: {
    gap: spacing.sm,
  },
  stockActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
