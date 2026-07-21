import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { apiSend } from '../api';

export default function JobDetailScreen({ job, onBack }) {
  const [status, setStatus] = useState(job.status);
  const [photos, setPhotos] = useState({ vorher: null, nachher: null });
  const [note, setNote] = useState('');

  async function checkIn() {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    let coords = {};
    if (perm === 'granted') {
      const loc = await Location.getCurrentPositionAsync({});
      coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    }
    const r = await apiSend('POST', `/jobs/${job.id}/checkin`, coords);
    setStatus('in_arbeit');
    setNote(r.offline ? '📴 Offline gespeichert – wird synchronisiert.' : '✓ Eingecheckt.');
  }

  async function checkOut() {
    const r = await apiSend('POST', `/jobs/${job.id}/checkout`);
    setStatus('erledigt');
    setNote(r.offline ? '📴 Offline gespeichert.' : '✓ Ausgecheckt.');
  }

  async function takePhoto(phase) {
    const { status: perm } = await ImagePicker.requestCameraPermissionsAsync();
    if (perm !== 'granted') return Alert.alert('Kamera-Zugriff nötig');
    const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!res.canceled) setPhotos((p) => ({ ...p, [phase]: res.assets[0].uri }));
  }

  return (
    <ScrollView style={styles.wrap}>
      <TouchableOpacity onPress={onBack}><Text style={styles.back}>← Zurück</Text></TouchableOpacity>
      <Text style={styles.h1}>{job.title || 'Reinigung'}</Text>
      <Text style={styles.status}>Status: {status}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}

      <View style={styles.row}>
        <TouchableOpacity style={[styles.btn, styles.primary]} onPress={checkIn}>
          <Text style={styles.btnText}>📍 GPS-Check-in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={checkOut}>
          <Text style={styles.btnText}>✓ Check-out</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.h2}>Fotodokumentation</Text>
      <View style={styles.row}>
        {['vorher', 'nachher'].map((phase) => (
          <TouchableOpacity key={phase} style={styles.photoBox} onPress={() => takePhoto(phase)}>
            {photos[phase]
              ? <Image source={{ uri: photos[phase] }} style={styles.photo} />
              : <Text style={styles.photoLabel}>📷 {phase}</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0e1117', padding: 16, paddingTop: 56 },
  back: { color: '#2f81f7', marginBottom: 12, fontSize: 16 },
  h1: { color: '#e6edf3', fontSize: 22, fontWeight: '800' },
  h2: { color: '#e6edf3', fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 10 },
  status: { color: '#8b97a7', marginTop: 4, marginBottom: 12 },
  note: { color: '#3fb950', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, backgroundColor: '#1c2230', borderRadius: 10, padding: 16, alignItems: 'center' },
  primary: { backgroundColor: '#2f81f7' },
  btnText: { color: '#fff', fontWeight: '600' },
  photoBox: { flex: 1, height: 140, backgroundColor: '#161b22', borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photoLabel: { color: '#8b97a7' },
  photo: { width: '100%', height: '100%' },
});
