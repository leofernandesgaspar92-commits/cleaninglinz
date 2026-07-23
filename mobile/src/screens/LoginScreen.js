import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { login } from '../api';

export default function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfa, setMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit() {
    setBusy(true); setErr(null);
    const r = await login(email.trim(), password, mfa ? totp.trim() : undefined);
    setBusy(false);
    if (r.ok) { onLogin(); return; }
    if (r.mfaRequired) { setMfa(true); setErr('Bitte MFA-Code eingeben.'); return; }
    setErr(r.error || 'Anmeldung fehlgeschlagen');
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Leco</Text>
      <Text style={styles.sub}>Feld-App · Anmeldung</Text>

      <Text style={styles.label}>E-Mail</Text>
      <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address"
        value={email} onChangeText={setEmail} placeholder="name@leco.at" placeholderTextColor="#5b6570" />

      <Text style={styles.label}>Passwort</Text>
      <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword}
        placeholder="••••••••" placeholderTextColor="#5b6570" />

      {mfa && (
        <>
          <Text style={styles.label}>MFA-Code</Text>
          <TextInput style={styles.input} keyboardType="number-pad" maxLength={6}
            value={totp} onChangeText={setTotp} placeholder="123456" placeholderTextColor="#5b6570" />
        </>
      )}

      {err && <Text style={styles.err}>{err}</Text>}

      <TouchableOpacity style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={submit}>
        <Text style={styles.btnText}>{busy ? 'Anmelden …' : 'Anmelden'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0e1117', padding: 24, justifyContent: 'center' },
  brand: { color: '#e6edf3', fontSize: 40, fontWeight: '800', textAlign: 'center' },
  sub: { color: '#8b97a7', textAlign: 'center', marginBottom: 28 },
  label: { color: '#8b97a7', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#161b22', color: '#e6edf3', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#2a3140' },
  err: { color: '#f85149', marginTop: 14 },
  btn: { backgroundColor: '#2f81f7', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
