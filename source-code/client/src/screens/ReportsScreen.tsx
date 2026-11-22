import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { StatCard, SectionHeader } from '../components/common/Cards';
import { PrimaryButton, SecondaryButton } from '../components/common/Buttons';
import type { Actor, MisRow, Order } from '../domain';

interface ReportsScreenProps {
  actor: Actor;
  misRows: MisRow[];
  orders: Order[];
  onExportCsv: () => Promise<void>;
  initialTab?: ReportType;
  onBack?: () => void;
}

type ReportType = 'summary' | 'volume' | 'ro' | 'orders';

export function ReportsScreen({
  actor,
  misRows,
  orders,
  onExportCsv,
  initialTab = 'summary',
  onBack,
}: ReportsScreenProps) {
  const [reportType, setReportType] = useState<ReportType>(initialTab);

  useEffect(() => {
    setReportType(initialTab);
  }, [initialTab]);

  // Compute metrics from actual domain data
  const totalLitres = misRows.reduce((sum, r) => sum + Number(r.litres || 0), 0);
  const totalEa = misRows.reduce((sum, r) => sum + Number(r.ea || 0), 0);
  const totalOrdersEa = orders.reduce((sum, o) => sum + Number(o.total_ea || 0), 0);

  // Group MIS volume by Zone
  const zoneVolumeMap = new Map<string, number>();
  for (const r of misRows) {
    const z = r.zone || 'Unassigned';
    zoneVolumeMap.set(z, (zoneVolumeMap.get(z) || 0) + Number(r.litres || 0));
  }
  const zoneList = Array.from(zoneVolumeMap.entries()).sort((a, b) => b[1] - a[1]);
  const maxZoneVol = zoneList.length ? Math.max(...zoneList.map(x => x[1])) : 1;

  // Group by Product SKU
  const itemMap = new Map<string, { ea: number; litres: number }>();
  for (const r of misRows) {
    const item = r.item || 'Standard Pack';
    const curr = itemMap.get(item) || { ea: 0, litres: 0 };
    itemMap.set(item, {
      ea: curr.ea + Number(r.ea || 0),
      litres: curr.litres + Number(r.litres || 0),
    });
  }
  const productSummary = Array.from(itemMap.entries());

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Report Segment Tabs */}
      <View style={styles.segmentBar}>
        <Pressable
          onPress={() => setReportType('summary')}
          style={[styles.segmentItem, reportType === 'summary' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, reportType === 'summary' && styles.segmentTextActive]}>
            Executive
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReportType('volume')}
          style={[styles.segmentItem, reportType === 'volume' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, reportType === 'volume' && styles.segmentTextActive]}>
            Volume by Zone
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReportType('ro')}
          style={[styles.segmentItem, reportType === 'ro' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, reportType === 'ro' && styles.segmentTextActive]}>
            RO Reports
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setReportType('orders')}
          style={[styles.segmentItem, reportType === 'orders' && styles.segmentItemActive]}
        >
          <Text style={[styles.segmentText, reportType === 'orders' && styles.segmentTextActive]}>
            Orders Report
          </Text>
        </Pressable>
      </View>

      {/* Action Banner */}
      <View style={[styles.bannerCard, shadows.subtle]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Offline Performance Analytics</Text>
          <Text style={styles.bannerText}>
            Metrics computed from local SQLite dataset for {actor.label || actor.username}.
          </Text>
        </View>
        <SecondaryButton title="Export CSV" onPress={onExportCsv} size="sm" />
      </View>

      {/* VIEW: EXECUTIVE SUMMARY */}
      {reportType === 'summary' ? (
        <View style={styles.viewSection}>
          <View style={styles.metricsGrid}>
            <View style={styles.col}>
              <StatCard
                label="Total MIS Volume"
                value={`${(totalLitres / 1000).toFixed(1)}k L`}
                subtitle={`${totalLitres.toFixed(0)} Litres total`}
                accentColor={colors.primary}
              />
              <StatCard
                label="Total Packs Dispensed"
                value={totalEa}
                subtitle="20L standard packaging"
                accentColor={colors.primaryDark}
              />
            </View>
            <View style={styles.col}>
              <StatCard
                label="Registered Orders"
                value={orders.length}
                subtitle={`${totalOrdersEa} packs ordered`}
                accentColor={colors.info}
              />
              <StatCard
                label="Active Records"
                value={misRows.length}
                subtitle="Historical & sheet rows"
                accentColor={colors.success}
              />
            </View>
          </View>

          {/* Product Distribution Breakdown */}
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.cardHeader}>Volume by SKU Packaging</Text>
            {productSummary.map(([item, data]) => {
              const pct = totalLitres > 0 ? (data.litres / totalLitres) * 100 : 0;
              return (
                <View key={item} style={styles.skuRow}>
                  <View style={styles.skuHeader}>
                    <Text style={styles.skuName}>{item}</Text>
                    <Text style={styles.skuVol}>
                      {data.litres.toFixed(0)} L ({pct.toFixed(1)}%)
                    </Text>
                  </View>
                  <View style={styles.barBackground}>
                    <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%` }]} />
                  </View>
                  <Text style={styles.skuSub}>{data.ea} packs accounted</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* VIEW: VOLUME BY ZONE */}
      {reportType === 'volume' ? (
        <View style={styles.viewSection}>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.cardHeader}>Zonal Volume Distribution (Native Visualizer)</Text>
            <Text style={styles.cardNotice}>
              Volume representation using clean native Android bars (no external chart libraries).
            </Text>

            {zoneList.length === 0 ? (
              <Text style={styles.emptyNotice}>No zonal volume data available.</Text>
            ) : (
              zoneList.map(([zone, vol]) => {
                const ratio = maxZoneVol > 0 ? (vol / maxZoneVol) * 100 : 0;
                return (
                  <View key={zone} style={styles.zoneBarItem}>
                    <View style={styles.zoneBarHeader}>
                      <Text style={styles.zoneBarName}>{zone}</Text>
                      <Text style={styles.zoneBarVal}>{vol.toFixed(1)} Litres</Text>
                    </View>
                    <View style={styles.barBackground}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.min(ratio, 100)}%`, backgroundColor: colors.primary },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>
      ) : null}

      {/* VIEW: RO REPORTS */}
      {reportType === 'ro' ? (
        <View style={styles.viewSection}>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.cardHeader}>Regional Office (RO) Report Overview</Text>
            <Text style={styles.cardNotice}>
              Regional breakdown mapped from verified master data.
            </Text>

            <View style={styles.mockDataTable}>
              <View style={styles.thRow}>
                <Text style={[styles.thCell, { flex: 2 }]}>REGION (RO)</Text>
                <Text style={[styles.thCell, { flex: 1, textAlign: 'right' }]}>ENTRIES</Text>
                <Text style={[styles.thCell, { flex: 2, textAlign: 'right' }]}>VOLUME (L)</Text>
              </View>
              {['Indore RO', 'Bhopal RO', 'Kanpur RO', 'Jaipur RO'].map(roName => {
                const matching = misRows.filter(r => (r.ro || '').includes(roName.split(' ')[0]));
                const vol = matching.reduce((s, r) => s + Number(r.litres || 0), 0);
                return (
                  <View key={roName} style={styles.tbRow}>
                    <Text style={[styles.tbCellBold, { flex: 2 }]}>{roName}</Text>
                    <Text style={[styles.tbCell, { flex: 1, textAlign: 'right' }]}>
                      {matching.length}
                    </Text>
                    <Text style={[styles.tbCell, { flex: 2, textAlign: 'right' }]}>
                      {vol.toFixed(1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      {/* VIEW: ORDERS REPORT */}
      {reportType === 'orders' ? (
        <View style={styles.viewSection}>
          <View style={[styles.card, shadows.subtle]}>
            <Text style={styles.cardHeader}>Order Fulfillment Status Summary</Text>
            <View style={styles.orderStatRows}>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatLabel}>Draft Orders</Text>
                <Text style={styles.orderStatCount}>
                  {orders.filter(o => o.status === 'draft').length}
                </Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatLabel}>Pending Approval</Text>
                <Text style={[styles.orderStatCount, { color: colors.warning }]}>
                  {orders.filter(o => o.status === 'pending').length}
                </Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatLabel}>In Transit</Text>
                <Text style={[styles.orderStatCount, { color: colors.info }]}>
                  {orders.filter(o => o.delivery_stage === 'transit').length}
                </Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatLabel}>Approved & Finalized</Text>
                <Text style={[styles.orderStatCount, { color: colors.success }]}>
                  {orders.filter(o => o.status === 'approved').length}
                </Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatLabel}>Rejected Orders</Text>
                <Text style={[styles.orderStatCount, { color: colors.danger }]}>
                  {orders.filter(o => o.status === 'rejected').length}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerTitle: {
    ...typography.headingSm,
    fontSize: 14,
    color: colors.primaryDark,
  },
  bannerText: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    fontSize: 11,
  },
  viewSection: {
    gap: spacing.md,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  col: {
    flex: 1,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  cardNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    marginTop: -4,
  },
  skuRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  skuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuName: {
    ...typography.bodyBold,
    fontSize: 13,
  },
  skuVol: {
    ...typography.captionMedium,
    color: colors.primary,
  },
  skuSub: {
    ...typography.captionRegular,
    color: colors.textMuted,
    fontSize: 11,
  },
  barBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceSubtle,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
  },
  zoneBarItem: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  zoneBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  zoneBarName: {
    ...typography.bodyMedium,
  },
  zoneBarVal: {
    ...typography.captionMedium,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  emptyNotice: {
    ...typography.captionRegular,
    color: colors.textMuted,
  },
  mockDataTable: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  thCell: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tbRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: 'center',
  },
  tbCell: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  tbCellBold: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primaryDark,
  },
  orderStatRows: {
    gap: spacing.sm,
  },
  orderStatItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderStatLabel: {
    ...typography.bodyRegular,
    color: colors.textPrimary,
  },
  orderStatCount: {
    ...typography.bodyBold,
    fontSize: 15,
  },
  backRow: {
    marginBottom: spacing.xs,
  },
});
