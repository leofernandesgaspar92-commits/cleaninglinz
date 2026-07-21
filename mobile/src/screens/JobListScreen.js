import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { apiGet, flushQueue, queueSize } from '../api';

const STATUS_COLOR = { geplant: '#d29922', unterwegs: '#2f81f7', in_arbeit: '#3fb950', erledigt: '#8b97a7' };

export default function JobListScreen({ onOpen }) {
  const [jobs, setJobs] = useState([]);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      await flushQueue();
      setPending(await queueSize());
      setJobs(await apiGet('/jobs'));
      setErr(null);
    } catch (e) { setErr('Offline – zeige zuletzt geladene Aufträge.'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Meine Aufträge</Text>
      {pending > 0 && <Text style={styles.pending}>⏳ {pending} Aktion(en) warten auf Sync</Text>}
      {err && <Text style={styles.err}>{err}</Text>}
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#fff" />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onOpen(item)}>
            <View style={[styles.dot, { backgroundColor: STATUS_COLOR[item.status] || '#888' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title || 'Reinigung'}</Text>
              <Text style={styles.sub}>{item.status} · {item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('de-AT') : 'ohne Termin'}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.sub}>Keine Aufträge.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0e1117', padding: 16, paddingTop: 56 },
  h1: { color: '#e6edf3', fontSize: 24, fontWeight: '800', marginBottom: 8 },
  pending: { color: '#d29922', marginBottom: 8 },
  err: { color: '#f85149', marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161b22', borderRadius: 10, padding: 14, marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  title: { color: '#e6edf3', fontSize: 16, fontWeight: '600' },
  sub: { color: '#8b97a7', marginTop: 2 },
});
