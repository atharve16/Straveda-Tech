const development = process.env.EAS_BUILD_PROFILE === 'development' || (!process.env.EAS_BUILD_PROFILE && process.env.NODE_ENV !== 'production');

module.exports = {
  expo: {
    name: 'Rohan Energy',
    slug: 'rohan-energy-offline',
    scheme: 'rohanenergy',
    version: '0.1.0',
    orientation: 'portrait',
    platforms: ['android'],
    android: {
      package: 'in.rohanenergy.offline',
      permissions: [],
      blockedPermissions: development ? [] : ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE'],
    },
    plugins: ['expo-router', 'expo-sqlite'],
    experiments: { typedRoutes: true },
  },
};
