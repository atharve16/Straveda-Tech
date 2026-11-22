/**
 * STRAVEDA Design Tokens
 * Reusable constants for colors, typography, spacing, and elevation.
 */

export const colors = {
  // Brand colors
  primary: '#155B91',
  primaryDark: '#153B63',
  primaryLight: '#2879B8',
  primarySubtle: '#E8F1F8',

  // Backgrounds & Surfaces
  background: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  surfaceHover: '#F1F5F9',

  // Typography
  textPrimary: '#172B4D',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Borders & Dividers
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderDark: '#CBD5E1',

  // Semantic Status Colors
  success: '#15803D',
  successLight: '#DCFCE7',
  warning: '#D97706',
  warningLight: '#FEF3C7',
  danger: '#B91C1C',
  dangerLight: '#FEE2E2',
  info: '#0284C7',
  infoLight: '#E0F2FE',

  // Role / Organization colors
  rohanBadge: '#155B91',
  hpclBadge: '#C2410C',
  outletBadge: '#0D9488',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

export const typography = {
  headingXl: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: colors.primaryDark,
    letterSpacing: -0.5,
  },
  headingLg: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.primaryDark,
  },
  headingMd: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  headingSm: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  bodyRegular: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  bodyBold: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  captionRegular: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  captionMedium: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
} as const;

export const shadows = {
  subtle: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modal: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
