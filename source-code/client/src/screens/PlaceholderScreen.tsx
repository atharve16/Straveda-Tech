import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { SecondaryButton } from '../components/common/Buttons';
import { ScreenContainer } from '../components/common/ScreenContainer';

interface PlaceholderScreenProps {
  moduleName: string;
  category: string;
  description: string;
  features: string[];
  auditRef?: string;
  onBack?: () => void;
}

export function PlaceholderScreen({
  moduleName,
  category,
  description,
  features,
  auditRef,
  onBack,
}: PlaceholderScreenProps) {
  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      <View style={[styles.headerCard, shadows.card]}>
        <View style={styles.badgeRow}>
          <View style={styles.categoryPill}>
            <Text style={styles.categoryText}>{category.toUpperCase()}</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>SPECIFICATION AUDITED</Text>
          </View>
        </View>
        <Text style={styles.title}>{moduleName}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={[styles.card, shadows.subtle]}>
        <Text style={styles.cardHeader}>Planned Capabilities</Text>
        <Text style={styles.helperNotice}>
          The functional specification for this module has been audited from the PHP reference source.
          Android domain services are pending implementation in the next phase.
        </Text>
        <View style={styles.featureList}>
          {features.map((feature, idx) => (
            <View key={idx} style={styles.featureItem}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkText}>✓</Text>
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </View>

      {auditRef ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeIcon}>ℹ</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>Reference Documentation</Text>
            <Text style={styles.noticeText}>Audited under: {auditRef}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.samplePreviewCard, shadows.subtle]}>
        <Text style={styles.previewTitle}>Sample Mock Interface (Read-Only Preview)</Text>
        <Text style={styles.previewNotice}>
          Actions on this screen are disabled until domain authorization is verified.
        </Text>
        <View style={styles.mockTable}>
          <View style={styles.mockTableRowHeader}>
            <Text style={styles.mockHeaderCell}>PARAM / FIELD</Text>
            <Text style={styles.mockHeaderCell}>DEMO STATUS</Text>
          </View>
          <View style={styles.mockTableRow}>
            <Text style={styles.mockCellKey}>Domain Service</Text>
            <Text style={styles.mockCellValuePending}>Pending Phase 2</Text>
          </View>
          <View style={styles.mockTableRow}>
            <Text style={styles.mockCellKey}>Local DB Table</Text>
            <Text style={styles.mockCellValue}>Schema Verified</Text>
          </View>
          <View style={styles.mockTableRow}>
            <Text style={styles.mockCellKey}>Offline Access</Text>
            <Text style={styles.mockCellValue}>Standalone Ready</Text>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  headerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryPill: {
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  statusPill: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.xs,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
  },
  title: {
    ...typography.headingLg,
  },
  description: {
    ...typography.bodyRegular,
    color: colors.textSecondary,
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
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  helperNotice: {
    ...typography.captionRegular,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  featureList: {
    gap: spacing.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  featureText: {
    ...typography.bodyRegular,
    color: colors.textPrimary,
    flex: 1,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  noticeIcon: {
    fontSize: 18,
    color: colors.info,
    fontWeight: '800',
  },
  noticeTitle: {
    ...typography.captionMedium,
    color: colors.info,
    fontWeight: '700',
  },
  noticeText: {
    ...typography.captionRegular,
    color: colors.textPrimary,
  },
  samplePreviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewTitle: {
    ...typography.captionMedium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  previewNotice: {
    ...typography.captionRegular,
    color: colors.textMuted,
  },
  mockTable: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  mockTableRowHeader: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  mockHeaderCell: {
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  mockTableRow: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  mockCellKey: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  mockCellValue: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '600',
  },
  mockCellValuePending: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: '600',
  },
});
