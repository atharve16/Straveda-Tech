import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function FoundationScreen() {
  const db = useSQLiteContext();
  const [counts, setCounts] = useState<{ orders: number; mis: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([
      db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM portal_orders'),
      db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM portal_mis_rows'),
    ]).then(([orders, mis]) => setCounts({ orders: orders?.n ?? 0, mis: mis?.n ?? 0 }))
      .catch(() => setError('The local database could not be read.'));
  }, [db]);
  return <SafeAreaView style={styles.page}><View style={styles.card}>
    <Text style={styles.title}>Rohan Energy</Text>
    <Text style={styles.subtitle}>Offline database foundation</Text>
    {error ? <Text style={styles.error}>{error}</Text> : counts ? <Text style={styles.body}>Demo seed loaded: {counts.orders} orders and {counts.mis} MIS rows.</Text> : <ActivityIndicator />}
    <Text style={styles.note}>Business workflows are still under source review.</Text>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', backgroundColor: '#eef3f8', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { color: '#153b63', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#375b7b', fontSize: 18 },
  body: { color: '#12283c', fontSize: 16 },
  error: { color: '#a4262c', fontSize: 16 },
  note: { color: '#667789', fontSize: 13 }
});
