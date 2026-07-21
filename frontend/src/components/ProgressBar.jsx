import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

// Dünner Fortschrittsbalken oben – animiert bei jedem Seitenwechsel (schnelles Feedback).
export default function ProgressBar() {
  const location = useLocation();
  const [w, setW] = useState(0);

  useEffect(() => {
    setW(15);
    const a = setTimeout(() => setW(70), 60);
    const b = setTimeout(() => setW(100), 220);
    const c = setTimeout(() => setW(0), 480);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [location.pathname]);

  return <div className="topbar" style={{ width: `${w}%`, opacity: w === 0 ? 0 : 1 }} />;
}
