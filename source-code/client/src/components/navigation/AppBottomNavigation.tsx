import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, shadows, spacing } from '../../theme/tokens';

export type MainTab = 'Home' | 'Orders' | 'MIS' | 'Approvals' | 'More';

interface NavItem {
  id: MainTab;
  label: string;
  icon: string;
  badge?: number;
}

interface AppBottomNavigationProps {
  currentTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  pendingApprovalsCount?: number;
}

export function AppBottomNavigation({
  currentTab,
  onSelectTab,
  pendingApprovalsCount = 0,
}: AppBottomNavigationProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 6);

  const items: NavItem[] = [
    { id: 'Home', label: 'Home', icon: '⌂' },
    { id: 'Orders', label: 'Orders', icon: '📦' },
    { id: 'MIS', label: 'MIS', icon: '📊' },
    { id: 'Approvals', label: 'Approvals', icon: '⏳', badge: pendingApprovalsCount },
    { id: 'More', label: 'More', icon: '☰' },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: bottomInset,
          height: 54 + bottomInset,
        },
        shadows.modal,
      ]}
    >
      {items.map(item => {
        const isActive = currentTab === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => onSelectTab(item.id)}
            style={({ pressed }) => [
              styles.navItem,
              pressed && styles.pressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.iconWrapper}>
              <Text style={[styles.icon, isActive && styles.iconActive]}>
                {item.icon}
              </Text>
              {item.badge && item.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
            {isActive ? <View style={styles.activeIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 4,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    position: 'relative',
  },
  iconWrapper: {
    position: 'relative',
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  iconActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -12,
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 8,
    fontWeight: '800',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -3,
    width: 20,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
});
