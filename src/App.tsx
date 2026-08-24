'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Terminal, ShieldAlert, Activity, ShieldCheck, AlertTriangle, Cpu, Trash2, Lock, LogOut } from 'lucide-react';
import { useNetworkAlerts, NetworkAlert } from './hooks/useNetworkAlerts';
import { auth } from './lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, User } from 'firebase/auth';

// Component สำหรับแสดง Badge สีตามระดับความเสี่ยง
const RiskBadge = ({ level = 'low' }: { level?: string }) => {
  const l = level.toLowerCase();
  
  if (l.includes('high') || l.includes('critical')) {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-sm font-mono text-xs uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
        {level}
      </span>
    );
  }
  
  if (l.includes('medium') || l.includes('warn')) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-sm font-mono text-xs uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
        {level}
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1.5 text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded-sm font-mono text-xs uppercase tracking-wider">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
      {level}
    </span>
  );
};

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthChecked(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) return;
    setIsLoggingIn(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  const { alerts, loading, error, clearAllAlerts, isClearing } = useNetworkAlerts(!!user);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClearLogs = async () => {
    await clearAllAlerts();
    setIsModalOpen(false);
  };

  // สรุปข้อมูลสำหรับ Header
  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return alerts.filter(a => a.timestamp && new Date(a.timestamp).toDateString() === today).length;
  }, [alerts]);

  const highRiskCount = useMemo(() => {
    const today = new Date().toDateString();
    return alerts.filter(a => {
      if (!a.timestamp || new Date(a.timestamp).toDateString() !== today) return false;
      const l = (a.risk_level || '').toLowerCase();
      return l.includes('high') || l.includes('critical');
    }).length;
  }, [alerts]);

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#050505] text-neutral-300 flex items-center justify-center font-mono">
        <Activity className="animate-spin text-red-500" />
      </div>
    );
  }

  if (!user && auth) {
    return (
      <div className="min-h-screen bg-[#050505] text-neutral-300 flex items-center justify-center font-mono p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0a0a0a] border border-red-500/20 p-8 rounded-lg max-w-sm w-full shadow-[0_0_40px_rgba(239,68,68,0.05)] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400 opacity-50" />
          
          <div className="flex justify-center mb-6">
            <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20">
              <Lock className="text-red-500" size={28} />
            </div>
          </div>
          
          <h1 className="text-center text-xl font-bold tracking-wider mb-2 text-white">SECURE_ACCESS</h1>
          <p className="text-center text-xs text-neutral-500 mb-8 uppercase tracking-widest">Authentication Required</p>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="email"
                placeholder="OPERATOR_EMAIL"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#111] border border-neutral-800 focus:border-red-500/50 rounded px-4 py-2 text-sm outline-none transition-colors text-white placeholder-neutral-600"
                required
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="ACCESS_TOKEN"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#111] border border-neutral-800 focus:border-red-500/50 rounded px-4 py-2 text-sm outline-none transition-colors text-white placeholder-neutral-600"
                required
              />
            </div>
            
            {loginError && (
              <div className="text-red-400 text-xs text-center bg-red-400/10 py-2 rounded">
                [!] {loginError}
              </div>
            )}
            
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/50 py-2 rounded text-sm uppercase tracking-widest transition-all disabled:opacity-50 mt-4"
            >
              {isLoggingIn ? 'AUTHENTICATING...' : 'INITIATE_LOGIN'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ฟังก์ชันจัดรูปแบบเวลา
  const formatTime = (ts?: string) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // ดึง Source IP จาก raw_traffic_logs
  const getSourceIp = (alert: NetworkAlert) => {
    if (alert.raw_traffic_logs && alert.raw_traffic_logs.length > 0 && alert.raw_traffic_logs[0].source_ip) {
      return alert.raw_traffic_logs[0].source_ip;
    }
    return alert.source || 'Unknown IP';
  };

  // Loading State (Terminal Style)
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center font-mono text-green-500 text-sm">
        <div className="flex items-center gap-2">
          <Terminal size={18} />
          <span>INITIALIZING_SECURE_CONNECTION</span>
          <span className="animate-pulse">_</span>
        </div>
      </div>
    );
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6 selection:bg-red-500/30">
        <div className="border border-red-500/30 bg-red-500/5 p-6 rounded-lg max-w-md w-full font-mono">
          <div className="flex items-center gap-3 text-red-400 mb-4">
             <AlertTriangle size={24} />
             <h2 className="text-lg">SYSTEM_ERROR</h2>
          </div>
          <p className="text-red-400/80 text-sm mb-4 leading-relaxed">{error}</p>
          <div className="h-px w-full bg-red-500/20 my-4"></div>
          <p className="text-neutral-500 text-xs">Check your Firebase configuration in the .env file.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-300 font-sans selection:bg-green-500/30 pb-12">
      {/* Header / Navbar */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-500/10 p-1.5 rounded-md border border-green-500/20">
              <Cpu className="text-green-500" size={20} />
            </div>
            <h1 className="text-xl font-medium tracking-tight text-neutral-100">
              NET_MONITOR <span className="text-neutral-600 font-mono text-xs ml-2 border border-neutral-800 px-1.5 py-0.5 rounded">v1.0.4</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 font-mono text-sm">
             <div className="flex items-center gap-2 text-green-400 bg-green-400/5 border border-green-400/10 px-3 py-1 rounded-full text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                SYSTEM_ONLINE
             </div>
             {user && (
               <button 
                 onClick={handleLogout}
                 className="flex items-center gap-2 text-neutral-400 hover:text-red-400 transition-colors bg-neutral-900 border border-neutral-800 hover:border-red-500/50 px-3 py-1 rounded text-xs"
               >
                 <LogOut size={14} />
                 LOGOUT
               </button>
             )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8 space-y-8">
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-5 border border-neutral-800 bg-neutral-900/30 rounded-lg flex items-start justify-between hover:border-neutral-700 transition-colors">
            <div>
              <p className="text-xs text-neutral-500 font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                <Activity size={14} /> Total Alerts Today
              </p>
              <p className="text-4xl font-mono text-neutral-100">{todayCount}</p>
            </div>
          </div>
          
          <div className="p-5 border border-neutral-800 bg-neutral-900/30 rounded-lg flex items-start justify-between hover:border-neutral-700 transition-colors">
            <div>
              <p className="text-xs text-neutral-500 font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                <ShieldAlert size={14} className={highRiskCount > 0 ? "text-red-400" : ""} /> High Risk
              </p>
              <p className={`text-4xl font-mono ${highRiskCount > 0 ? 'text-red-400' : 'text-neutral-100'}`}>
                {highRiskCount}
              </p>
            </div>
          </div>

          <div className="p-5 border border-neutral-800 bg-neutral-900/30 rounded-lg flex items-start justify-between hover:border-neutral-700 transition-colors">
            <div>
              <p className="text-xs text-neutral-500 font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                <ShieldCheck size={14} /> System Status
              </p>
              <p className="text-lg font-mono text-green-400 mt-2 flex items-center gap-2">
                MONITORING...
              </p>
            </div>
          </div>
        </div>

        {/* Alert Table */}
        <div className="border border-neutral-800 bg-neutral-900/20 rounded-lg overflow-hidden shadow-2xl">
          <div className="px-5 py-4 border-b border-neutral-800 bg-neutral-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-300">
              <Terminal size={16} className="text-neutral-500" />
              <h2 className="text-sm font-medium tracking-wide">LIVE_TRAFFIC_LOGS</h2>
            </div>
            <div className="flex items-center gap-4">
              {alerts.length > 0 && (
                 <div className="text-xs font-mono text-neutral-500 hidden sm:block">
                   Showing {alerts.length} records
                 </div>
              )}
              {alerts.length > 0 && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono text-red-500 border border-red-500/30 bg-red-500/5 hover:bg-red-500/20 hover:border-red-500/60 rounded transition-all group"
                >
                  <Trash2 size={14} className="group-hover:animate-pulse" />
                  [ CLEAR LOGS ]
                </button>
              )}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-xs font-mono text-neutral-500 bg-neutral-950/50">
                  <th className="px-5 py-3 font-normal whitespace-nowrap">TIMESTAMP</th>
                  <th className="px-5 py-3 font-normal whitespace-nowrap">SOURCE_IP</th>
                  <th className="px-5 py-3 font-normal whitespace-nowrap">RISK_LEVEL</th>
                  <th className="px-5 py-3 font-normal">AI_ANALYSIS_DESCRIPTION</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                <AnimatePresence>
                  {alerts.map((alert) => (
                    <motion.tr
                      key={alert.id}
                      initial={{ opacity: 0, y: -10, backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                      animate={{ opacity: 1, y: 0, backgroundColor: 'transparent' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                      className="border-b border-neutral-800/50 hover:bg-neutral-800/30 transition-colors group"
                    >
                      <td className="px-5 py-4 text-neutral-400 whitespace-nowrap">
                        {formatTime(alert.timestamp)}
                      </td>
                      <td className="px-5 py-4 text-neutral-200 whitespace-nowrap group-hover:text-green-400 transition-colors">
                        {getSourceIp(alert)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <RiskBadge level={alert.risk_level} />
                      </td>
                      <td className="px-5 py-4 text-neutral-400 leading-relaxed min-w-[300px]">
                        {alert.description || 'No description provided'}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            
            {/* Empty State */}
            {alerts.length === 0 && !loading && (
              <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
                <Terminal size={32} className="text-neutral-700" />
                <p className="text-neutral-600 font-mono text-sm">AWAITING_INCOMING_TRAFFIC...</p>
                <p className="text-neutral-700 font-sans text-xs max-w-sm">
                  ระบบกำลังรอรับข้อมูลจาก Python Script กรุณารันสคริปต์เพื่อส่งข้อมูลเข้าสู่ Firebase
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0a0a0a] border-2 border-red-500/50 rounded-lg p-6 max-w-md w-full shadow-[0_0_30px_rgba(239,68,68,0.2)] font-mono"
            >
              <div className="flex items-center gap-3 text-red-500 mb-4">
                <AlertTriangle size={24} className="animate-pulse" />
                <h3 className="text-lg font-semibold tracking-wider">SYSTEM_WARNING</h3>
              </div>
              <p className="text-neutral-300 text-sm mb-6 leading-relaxed font-sans">
                คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการตรวจจับ Traffic ทั้งหมด? <span className="text-red-400">การกระทำนี้ไม่สามารถย้อนกลับได้</span>
              </p>
              <div className="flex justify-end gap-3 font-mono">
                <button
                  onClick={() => setIsModalOpen(false)}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm text-neutral-400 border border-neutral-700 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  [ ABORT ]
                </button>
                <button
                  onClick={handleClearLogs}
                  disabled={isClearing}
                  className="px-4 py-2 text-sm text-red-500 border border-red-500 hover:bg-red-500/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isClearing ? 'EXECUTING...' : '[ EXECUTE ]'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

