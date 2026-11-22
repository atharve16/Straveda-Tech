import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../../theme/tokens';

export type StatusType =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'transit'
  | 'delivered'
  | 'sheet'
  | 'order'
  | string;

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, label, size = 'md' }: StatusBadgeProps) {
  const norm = (status || '').toLowerCase().trim();
  let bg: string = colors.surfaceSubtle;
  let text: string = colors.textSecondary;
  let dot: string = colors.textMuted;
  let display = label || status.toUpperCase();

  switch (norm) {
    case 'draft':
      bg = '#F1F5F9';
      text = '#475569';
      dot = '#94A3B8';
      display = label || 'DRAFT';
      break;
    case 'pending':
      bg = colors.warningLight;
      text = colors.warning;
      dot = colors.warning;
      display = label || 'PENDING';
      break;
    case 'approved':
      bg = colors.successLight;
      text = colors.success;
      dot = colors.success;
      display = label || 'APPROVED';
      break;
    case 'rejected':
      bg = colors.dangerLight;
      text = colors.danger;
      dot = colors.danger;
      display = label || 'REJECTED';
      break;
    case 'transit':
    case 'in transit':
      bg = colors.infoLight;
      text = colors.info;
      dot = colors.info;
      display = label || 'IN TRANSIT';
      break;
    case 'delivered':
      bg = '#E0E7FF';
      text = '#4338CA';
      dot = '#4338CA';
      display = label || 'DELIVERED';
      break;
    case 'sheet':
      bg = '#F3E8FF';
      text = '#7E22CE';
      dot = '#7E22CE';
      display = label || 'MIS SHEET';
      break;
    case 'order':
      bg = '#CFFAFE';
      text = '#0E7490';
      dot = '#0E7490';
      display = label || 'ORDER SYNC';
      break;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg }, size === 'sm' && styles.badgeSm]}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.text, { color: text }, size === 'sm' && styles.textSm]}>
        {display}
      </Text>
    </View>
  );
}

export function RoleBadge({
  org,
  role,
}: {
  org: string;
  role: string;
}) {
  const isRohan = org.toLowerCase() === 'rohan';
  const isHpcl = org.toLowerCase() === 'hpcl';

  const bg = isRohan ? colors.primarySubtle : isHpcl ? '#FFEDD5' : '#CCFBF1';
  const text = isRohan ? colors.primaryDark : isHpcl ? '#9A3412' : '#0F766E';

  return (
    <View style={[styles.roleBadge, { backgroundColor: bg }]}>
      <Text style={[styles.roleText, { color: text }]}>
        {org.toUpperCase()} · {role}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  textSm: {
    fontSize: 10,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  roleText: {
    ...typography.captionMedium,
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
