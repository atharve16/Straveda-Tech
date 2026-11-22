import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Suspense } from 'react';
import { ActivityIndicator, Button, Text, View } from 'react-native';
import { initializeSession } from '../src/session';
import { initializeOrderWorkflow } from '../src/order-workflows';
import { recoverOrderFiles } from '../src/order-files';
import { initializeMisHistory } from '../src/mis-history';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text accessibilityRole="alert">The local database could not be opened.</Text>
      <Text>Check that the app has enough storage, then try again.</Text>
      <Button title="Try again" onPress={retry} />
    </View>
  );
}

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
  await db.withExclusiveTransactionAsync(async tx => {
    await tx.execAsync(`CREATE TABLE IF NOT EXISTS app_pending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,d TEXT NOT NULL,sap TEXT NOT NULL,outlet TEXT NOT NULL,
      item TEXT NOT NULL,ea REAL NOT NULL CHECK(ea>0),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),
      submitted_by TEXT NOT NULL,zone TEXT NOT NULL,ro TEXT NOT NULL,state TEXT NOT NULL,sales_area TEXT NOT NULL,
      reason TEXT,decided_by TEXT,decided_at TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS app_pending_active_once ON app_pending(submitted_by,d,sap,item,ea) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS app_history (id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL);`);
  });
  await initializeSession(db);
  await initializeOrderWorkflow(db);
  await initializeMisHistory(db);
  try { await recoverOrderFiles(db); } catch { /* Orphan cleanup can retry at next launch. */ }
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
