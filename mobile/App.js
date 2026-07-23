import { useEffect, useState } from 'react';
import { StatusBar, View } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import JobListScreen from './src/screens/JobListScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';
import { initAuth, isLoggedIn, logout } from './src/api';

// Minimaler Screen-Switch ohne Navigations-Bibliothek, um das Scaffold
// abhängigkeitsarm und sofort lauffähig zu halten.
export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [job, setJob] = useState(null);

  useEffect(() => { initAuth().then((a) => { setAuthed(a); setReady(true); }); }, []);

  async function signOut() { await logout(); setAuthed(false); setJob(null); }

  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0e1117' }} />;

  return (
    <>
      <StatusBar barStyle="light-content" />
      {!authed
        ? <LoginScreen onLogin={() => setAuthed(isLoggedIn())} />
        : job
          ? <JobDetailScreen job={job} onBack={() => setJob(null)} />
          : <JobListScreen onOpen={setJob} onLogout={signOut} />}
    </>
  );
}
