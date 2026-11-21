import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';

async function initialize(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (version?.user_version !== 1) throw new Error('Unsupported demo database version');
  const required = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('portal_orders','portal_mis_rows','officer_accounts','portal_outlet_users')"
  );
  if (required?.count !== 4) throw new Error('Demo database is incomplete');
  const foreignKeys = await db.getAllAsync('PRAGMA foreign_key_check');
  if (foreignKeys.length) throw new Error('Demo database relationships are invalid');
}

export default function RootLayout() {
  return (
    <Suspense fallback={<View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>}>
    <SQLiteProvider
      databaseName="rohan_energy.db"
      assetSource={{ assetId: require('../assets/database/rohan_energy_demo.db') }}
      onInit={initialize}
      useSuspense
    >
      <Stack screenOptions={{ headerShown: false }} />
    </SQLiteProvider>
    </Suspense>
  );
}
