
const development =
  process.env.EAS_BUILD_PROFILE === 'development' ||
  (!process.env.EAS_BUILD_PROFILE &&
    process.env.NODE_ENV !== 'production');

module.exports = {
  expo: {
    name: 'STRAVEDA',
    slug: 'rohan-energy-offline',
    scheme: 'rohanenergy',
    version: '0.1.0',
    orientation: 'portrait',
    platforms: ['android'],

    android: {
      package: 'in.rohanenergy.offline',
      permissions: [],
      blockedPermissions: development
        ? []
        : [
            'android.permission.INTERNET',
            'android.permission.ACCESS_NETWORK_STATE',
          ],
    },

    plugins: ['expo-router', 'expo-sqlite'],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      eas: {
        projectId: '1588b446-83d5-4a51-b162-d97e425ea5c6',
      },
    },
  },
};
