import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme/tokens';
import { ScreenContainer } from '../components/common/ScreenContainer';
import { SearchBar } from '../components/common/Inputs';
import { SecondaryButton } from '../components/common/Buttons';
import { EmptyState } from '../components/common/Feedback';
import type { Actor } from '../domain';

interface HistoryRecord {
  id: number;
  actor: string;
  action: string;
  detail: string;
  at: string;
}

interface HistoryScreenProps {
  actor: Actor;
  history: HistoryRecord[];
  onBack?: () => void;
}

type ActionCategory = 'ALL' | 'ORDERS' | 'MIS' | 'PENDING';

export function HistoryScreen({ actor, history, onBack }: HistoryScreenProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ActionCategory>('ALL');

  const filtered = history.filter(item => {
    const matchesSearch =
      !search ||
      `${item.actor} ${item.action} ${item.detail}`
        .toLowerCase()
        .includes(search.toLowerCase());

    if (!matchesSearch) return false;

    if (category === 'ORDERS') return item.action.startsWith('order');
    if (category === 'MIS') return item.action.startsWith('mis');
    if (category === 'PENDING') return item.action.startsWith('pending');
    return true;
  });

  return (
    <ScreenContainer>
      {onBack ? (
        <View style={styles.backRow}>
          <SecondaryButton title="‹ Back to Modules" onPress={onBack} size="sm" />
        </View>
      ) : null}

      {/* Header Info */}
      <View style={[styles.headerCard, shadows.subtle]}>
        <Text style={styles.title}>Local Device Activity Stream</Text>
        <Text style={styles.subtitle}>
          Audit trail of SQLite database transactions recorded on this installation.
          {actor.role === 'superadmin' && actor.org === 'rohan'
            ? ' Showing all installation events (Super Admin view).'
            : ' Showing activities attributed to your account.'}
        </Text>
      </View>

      {/* Search & Filter */}
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search activity by actor, action or detail..."
      />

      <View style={styles.filterBar}>
        {(['ALL', 'ORDERS', 'MIS', 'PENDING'] as ActionCategory[]).map(cat => {
          const isActive = category === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive && styles.filterChipTextActive,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Activity List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Activity Records"
          description={
            search || category !== 'ALL'
              ? 'No activity entries match your current search or filter.'
              : 'No transactions have been recorded in this device database yet.'
          }
          icon="⏱"
        />
      ) : (
        <View style={[styles.listCard, shadows.subtle]}>
          {filtered.map((item, idx) => {
            const isOrder = item.action.startsWith('order');
            const isMis = item.action.startsWith('mis');
            const dotColor = isOrder
              ? colors.primary
              : isMis
              ? colors.info
              : colors.warning;

            return (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  idx < filtered.length - 1 && styles.itemDivider,
                ]}
              >
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.itemTopRow}>
                    <Text style={styles.actionName}>
                      {item.action.replace('_', ' ').toUpperCase()}
                    </Text>
                    <Text style={styles.timeText}>{item.at}</Text>
                  </View>
                  <Text style={styles.detailText}>{item.detail}</Text>
                  <Text style={styles.actorText}>Actor: {item.actor}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typography.headingSm,
    color: colors.primaryDark,
  },
  subtitle: {
    ...typography.captionRegular,
    color: colors.textSecondary,
  },
  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterChip: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textInverse,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  itemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionName: {
    ...typography.captionMedium,
    color: colors.primaryDark,
    fontWeight: '700',
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  detailText: {
    ...typography.bodyRegular,
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 1,
  },
  actorText: {
    ...typography.captionRegular,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
});
