import { useState } from 'react';
import { StatusBar } from 'react-native';
import JobListScreen from './src/screens/JobListScreen';
import JobDetailScreen from './src/screens/JobDetailScreen';

// Minimaler Screen-Switch ohne Navigations-Bibliothek, um das Scaffold
// abhängigkeitsarm und sofort lauffähig zu halten.
export default function App() {
  const [job, setJob] = useState(null);
  return (
    <>
      <StatusBar barStyle="light-content" />
      {job
        ? <JobDetailScreen job={job} onBack={() => setJob(null)} />
        : <JobListScreen onOpen={setJob} />}
    </>
  );
}
