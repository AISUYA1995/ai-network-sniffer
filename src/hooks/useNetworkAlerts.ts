import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface NetworkAlert {
  id: string;
  source?: string;
  risk_level?: string;
  description?: string;
  timestamp?: string;
  raw_traffic_logs?: any[];
  [key: string]: any;
}

export function useNetworkAlerts() {
  const [alerts, setAlerts] = useState<NetworkAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) {
      setError("Firebase configuration is missing.");
      setLoading(false);
      return;
    }

    try {
      const alertsRef = collection(db, 'network_alerts');
      // Query to sort by timestamp descending
      const q = query(alertsRef, orderBy('timestamp', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const newAlerts = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as NetworkAlert));
        
        setAlerts(newAlerts);
        setLoading(false);
        setError(null);
      }, (err) => {
        console.error("Firestore onSnapshot error:", err);
        // Fallback: If orderBy fails due to missing index, fetch without orderBy
        if (err.message.includes('index')) {
           const fallbackQ = query(alertsRef);
           onSnapshot(fallbackQ, (fallbackSnap) => {
             const fallbackAlerts = fallbackSnap.docs.map(d => ({id: d.id, ...d.data() as NetworkAlert}));
             // Sort client-side
             fallbackAlerts.sort((a, b) => {
               if (!a.timestamp || !b.timestamp) return 0;
               return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
             });
             setAlerts(fallbackAlerts);
             setLoading(false);
             setError(null);
           });
        } else {
           setError(err.message);
           setLoading(false);
        }
      });

      return () => unsubscribe();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }, []);

  return { alerts, loading, error };
}
