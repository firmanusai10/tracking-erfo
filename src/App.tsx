import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Package, 
  Scan as ScanIcon, 
  Store as StoreIcon, 
  LogOut, 
  History, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle, 
  Search,
  LayoutDashboard,
  Clock,
  User as UserIcon,
  Users,
  FileText,
  BarChart3,
  Settings,
  ArrowRight,
  Loader2,
  X,
  Trash2,
  Eraser
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { format } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { User, Store, Session, Scan, AuthState } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- API Service ---
// Gunakan environment variable untuk base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = {
  async request(method: string, path: string, body?: any, token?: string, retries = 10): Promise<any> {
    // ✅ CORRECT
const url = `${API_BASE_URL}/api${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    };

    try {
      const res = await fetch(url, options);
      
      const contentType = res.headers.get('content-type');
      const isHtml = contentType && contentType.includes('text/html');

      // If we get HTML but expected JSON, it's likely the "Starting Server" page
      if (isHtml && retries > 0) {
        console.log(`Server is starting up... retrying in 2s (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.request(method, path, body, token, retries - 1);
      }

      if (!res.ok) {
        const text = await res.text();
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('auth');
          window.location.reload();
          throw new Error('Session expired');
        }
        try {
          const json = JSON.parse(text);
          throw new Error(json.error || json.message || 'Request failed');
        } catch {
          throw new Error(text || 'Request failed');
        }
      }

      if (contentType && contentType.includes('application/json')) {
        return res.json();
      } else {
        const text = await res.text();
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.request(method, path, body, token, retries - 1);
        }
        throw new Error('Server returned non-JSON response');
      }
    } catch (err: any) {
      if (retries > 0 && (err.message.includes('Failed to fetch') || err.message.includes('non-JSON'))) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.request(method, path, body, token, retries - 1);
      }
      throw err;
    }
  },

  async post(path: string, body: any, token?: string) {
    return this.request('POST', path, body, token);
  },
  
  async get(path: string, token: string) {
    return this.request('GET', path, undefined, token);
  },
  
  async delete(path: string, token: string) {
    return this.request('DELETE', path, undefined, token);
  }
};

const ConfirmDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message, 
  confirmText = "Hapus", 
  cancelText = "Batal",
  type = "danger"
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string,
  confirmText?: string,
  cancelText?: string,
  type?: "danger" | "warning"
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="p-8 text-center">
            <div className={cn(
              "w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center",
              type === "danger" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
            )}>
              {type === "danger" ? <Trash2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 mb-2">{title}</h3>
            <p className="text-zinc-500 mb-8 leading-relaxed">{message}</p>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="flex-1 px-4 py-4 rounded-2xl bg-zinc-100 text-zinc-600 font-bold hover:bg-zinc-200 transition-all"
              >
                {cancelText}
              </button>
              <button 
                onClick={() => { onConfirm(); onClose(); }}
                className={cn(
                  "flex-1 px-4 py-4 rounded-2xl text-white font-bold transition-all shadow-lg",
                  type === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// --- Components ---

const Login = ({ onLogin }: { onLogin: (data: AuthState) => void }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.post('/auth/login', { username, password });
      onLogin(data);
    } catch (err: any) {
      setError('Username atau password salah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-950">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4 border border-emerald-500/20">
            <Package className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">PaketTrack Pro</h1>
          <p className="text-zinc-400 text-sm mt-1">Sistem Pelacakan Resi Real-time</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              placeholder="Masukkan username"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              placeholder="Masukkan password"
              required
            />
          </div>
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Masuk Sekarang"}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const StoreSelector = ({ stores, onSelect }: { stores: Store[], onSelect: (store: Store, type: 'NORMAL' | 'URGENT') => void }) => {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<'ALL' | 'SHOPEE' | 'TIKTOK' | 'LAZADA'>('ALL');
  const [sessionType, setSessionType] = useState<'NORMAL' | 'URGENT'>('NORMAL');

  const filtered = (stores || []).filter(s => 
    (platform === 'ALL' || s.platform === platform) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900 mb-2">Pilih Toko</h2>
          <p className="text-zinc-500">Pilih toko dan tipe sesi sebelum memulai scan.</p>
        </div>
        
        <div className="flex gap-2 p-1 bg-zinc-100 rounded-2xl w-fit">
          <button
            onClick={() => setSessionType('NORMAL')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              sessionType === 'NORMAL' ? "bg-white text-emerald-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <Package className="w-4 h-4" />
            Normal
          </button>
          <button
            onClick={() => setSessionType('URGENT')}
            className={cn(
              "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              sessionType === 'URGENT' ? "bg-white text-red-600 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <Clock className="w-4 h-4" />
            Urgent
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input 
            type="text" 
            placeholder="Cari nama toko..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
        <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl">
          {['ALL', 'SHOPEE', 'TIKTOK', 'LAZADA'].map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p as any)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                platform === p ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((store) => (
          <motion.button
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.98 }}
            key={`store-${store.id}`}
            onClick={() => onSelect(store, sessionType)}
            className={cn(
              "p-5 rounded-2xl bg-white border transition-all text-left flex flex-col justify-between h-32 group",
              sessionType === 'URGENT' 
                ? "border-red-100 hover:border-red-500 hover:shadow-red-500/10" 
                : "border-zinc-200 hover:border-emerald-500 hover:shadow-emerald-500/10",
              "shadow-sm hover:shadow-md"
            )}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                  store.platform === 'SHOPEE' ? "bg-orange-100 text-orange-600" :
                  store.platform === 'TIKTOK' ? "bg-zinc-900 text-white" : "bg-blue-100 text-blue-600"
                )}>
                  {store.platform}
                </span>
                {sessionType === 'URGENT' && (
                  <span className="text-[10px] font-black text-red-600 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> URGENT
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mt-2 line-clamp-1">{store.name}</h3>
            </div>
            <div className={cn(
              "flex items-center font-semibold text-sm transition-all",
              sessionType === 'URGENT' ? "text-red-600" : "text-emerald-600"
            )}>
              Mulai Sesi <ArrowRight className="w-4 h-4 ml-1 group-hover:ml-2 transition-all" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

const Scanner = ({ session, token, onEnd }: { session: Session, token: string, onEnd: () => void }) => {
  const [scans, setScans] = useState<Scan[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadScans();
    
    // Auto-focus input for physical scanner
    inputRef.current?.focus();
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        inputRef.current?.focus();
      }
    }, 2000);

    const handleSocketScan = (e: any) => {
      const newScan = e.detail;
      setScans(prev => {
        const currentScans = prev || [];
        if (currentScans.find(s => s.id === newScan.id)) return currentScans;
        return [newScan, ...currentScans];
      });
    };
    const handleSocketDelete = (e: any) => {
      const { id } = e.detail;
      setScans(prev => (prev || []).filter(s => s.id !== parseInt(id)));
    };
    const handleSocketClear = () => {
      setScans([]);
    };
    window.addEventListener('socket-new-scan', handleSocketScan);
    window.addEventListener('socket-delete-scan', handleSocketDelete);
    window.addEventListener('socket-clear-scans', handleSocketClear);

    // Initialize scanner with mobile-friendly settings
    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 20, 
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxSize = Math.floor(minEdgeSize * 0.7);
          return {
            width: qrboxSize,
            height: qrboxSize
          };
        },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
      /* verbose= */ false
    );
    
    scannerRef.current.render(onScanSuccess, onScanFailure);

    return () => {
      clearInterval(interval);
      window.removeEventListener('socket-new-scan', handleSocketScan);
      window.removeEventListener('socket-delete-scan', handleSocketDelete);
      window.removeEventListener('socket-clear-scans', handleSocketClear);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
      }
    };
  }, []);

  const loadScans = async () => {
    try {
      const data = await api.get(`/scans/${session.id}`, token);
      setScans(data);
    } catch (err) {
      console.error(err);
    }
  };

  const onScanSuccess = async (decodedText: string) => {
    // Prevent rapid double scans of the same text in the same session UI
    const currentScans = scans || [];
    if (currentScans.length > 0 && currentScans[0].tracking_number === decodedText) return;
    handleScan(decodedText);
  };

  const onScanFailure = (error: any) => {
    // Silent failure for continuous scanning
  };

  const scanningRef = useRef<Set<string>>(new Set());

  const handleScan = async (trackingNumber: string) => {
    const cleanTrackingNumber = trackingNumber.trim();
    if (!cleanTrackingNumber) return;
    
    // Prevent simultaneous scans of the same tracking number
    if (scanningRef.current.has(cleanTrackingNumber)) return;
    
    // Clear input immediately to prevent concatenation with next scan
    setManualInput('');
    setError('');
    setSuccess('');
    
    scanningRef.current.add(cleanTrackingNumber);
    
    try {
      const data = await api.post('/scans', { session_id: session.id, tracking_number: cleanTrackingNumber }, token);
      setScans(prev => {
        const currentScans = prev || [];
        if (currentScans.find(s => s.id === data.id)) return currentScans;
        return [data, ...currentScans];
      });
      setSuccess(`Berhasil scan: ${cleanTrackingNumber}`);
      inputRef.current?.focus();
      
      if (soundEnabled) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
        audio.play().catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Gagal scan paket');
      
      if (soundEnabled) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2573/2573-preview.mp3');
        audio.play().catch(() => {});
      }
    } finally {
      scanningRef.current.delete(cleanTrackingNumber);
    }
  };

  const handleClearHistory = async () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Kosongkan Riwayat?',
      message: 'Semua data scan pada sesi ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
      onConfirm: async () => {
        try {
          await api.request('DELETE', `/scans/session/${session.id}`, null, token);
          setScans([]);
          setSuccess('Riwayat scan berhasil dikosongkan');
        } catch (err: any) {
          setError(err.message || 'Gagal mengosongkan riwayat');
        }
      }
    });
  };

  const handleDeleteScan = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Data Scan?',
      message: 'Data scan ini akan dihapus dari sistem.',
      onConfirm: async () => {
        try {
          await api.delete(`/scans/${id}`, token);
          setScans(prev => (prev || []).filter(s => s.id !== id));
          setSuccess('Data scan berhasil dihapus');
        } catch (err: any) {
          setError(err.message || 'Gagal menghapus scan');
        }
      }
    });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="p-4 md:p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  "w-2 h-2 rounded-full animate-pulse",
                  session.type === 'URGENT' ? "bg-red-500" : "bg-emerald-500"
                )} />
                <h2 className="text-xl font-bold text-zinc-900">Sesi Aktif: {session.store_name}</h2>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest ml-2",
                  session.type === 'URGENT' ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                )}>
                  {session.type}
                </span>
              </div>
              <p className="text-sm text-zinc-500">{session.platform} • Dimulai {format(new Date(session.start_time), 'HH:mm:ss')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearHistory}
                className="px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100"
              >
                <Eraser className="w-4 h-4" />
                Hapus Riwayat
              </button>
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={cn(
                  "p-2 rounded-xl border transition-all",
                  soundEnabled ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-zinc-50 border-zinc-100 text-zinc-400"
                )}
              >
                {soundEnabled ? <Clock className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              </button>
              <button 
                onClick={onEnd}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold text-sm hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-lg"
              >
                Akhiri Sesi
              </button>
            </div>
          </div>

          <div className="relative">
            <div id="reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-zinc-200 mb-6 bg-zinc-50"></div>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input 
                ref={inputRef}
                type="text" 
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan(manualInput)}
                placeholder="Scanner otomatis aktif... (atau input manual)"
                className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-emerald-50/30"
              />
              <button 
                onClick={() => handleScan(manualInput)}
                className="px-6 py-3 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all"
              >
                Input
              </button>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  key="error-alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </motion.div>
              )}
              {success && (
                <motion.div 
                  key="success-alert"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {success}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="p-6 rounded-3xl bg-zinc-900 text-white shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Total Scan</h3>
            <Package className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-5xl font-black text-emerald-500">{scans.length}</div>
          <p className="text-zinc-400 text-xs mt-2 uppercase tracking-widest font-bold">Paket Terdata</p>
        </div>

        <div className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm flex-1 flex flex-col h-[500px]">
          <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-400" />
            Riwayat Scan Terbaru
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-zinc-200">
            {scans.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 opacity-50">
                <ScanIcon className="w-12 h-12 mb-2" />
                <p className="text-sm">Belum ada data scan</p>
              </div>
            ) : (
              scans.map((scan) => (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={`scan-${scan.id}`}
                  className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <p className="text-sm font-mono font-bold text-zinc-900">{scan.tracking_number}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{format(new Date(scan.scan_time), 'HH:mm:ss')}</p>
                      {scan.username && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-600 font-bold uppercase tracking-tighter">
                          {scan.username} ({scan.role})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleDeleteScan(scan.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />
    </div>
  );
};

// --- Dashboard Component ---
const Dashboard = ({ token }: { token: string }) => {
  const [stats, setStats] = useState<any>(null);
  const [summary, setSummary] = useState<{ stores: any[], global: any }>({ stores: [], global: { total_scans: 0, normal_scans: 0, urgent_scans: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [statsData, summaryData] = await Promise.all([
          api.request('GET', '/dashboard/stats', null, token),
          api.request('GET', '/reports/summary', null, token)
        ]);
        setStats(statsData);
        setSummary(summaryData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Scan', value: stats?.totalScans, icon: Package, color: 'emerald' },
          { label: 'Scan Hari Ini', value: stats?.todayScans, icon: Clock, color: 'blue' },
          { label: 'Sesi Aktif', value: stats?.activeSessions, icon: ScanIcon, color: 'orange' },
          { label: 'Total Toko', value: stats?.totalStores, icon: StoreIcon, color: 'purple' }
        ].map((item, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={item.label} 
            className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-2xl bg-${item.color}-50 flex items-center justify-center`}>
                <item.icon className={`w-6 h-6 text-${item.color}-600`} />
              </div>
            </div>
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">{item.label}</p>
            <h3 className="text-3xl font-black text-zinc-900 mt-1">{item.value}</h3>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-8 rounded-3xl bg-white border border-zinc-200 shadow-sm">
          <h3 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-zinc-400" />
            Ringkasan Per Toko & Tipe
          </h3>
          <div className="space-y-4">
            {summary.stores.filter(s => s.total_scans > 0).map((item, i) => (
              <div key={`${item.store_name}-${item.platform}-${item.type}-${i}`} className="flex items-center justify-between p-4 rounded-2xl bg-zinc-50 border border-zinc-100 relative overflow-hidden">
                <div className={cn(
                  "absolute top-0 right-0 px-2 py-0.5 text-[7px] font-black uppercase tracking-tighter",
                  item.type === 'URGENT' ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
                )}>
                  {item.type}
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center font-bold text-zinc-400">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900">{item.store_name}</p>
                    <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-widest">{item.platform}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-zinc-900">{item.total_scans}</p>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase">Total Scan</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 rounded-3xl bg-zinc-900 text-white shadow-xl">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-500" />
            Aktivitas Terakhir
          </h3>
          <div className="space-y-6">
            {summary.stores.filter(s => s.last_session).slice(0, 5).map((item, i) => (
              <div key={`activity-${item.store_name}-${item.platform}-${item.type}-${i}`} className="flex gap-4">
                <div className="w-1 h-12 rounded-full bg-emerald-500/20 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold">{item.store_name}</p>
                  <p className="text-xs text-zinc-400">Sesi terakhir selesai pada</p>
                  <p className="text-[10px] text-emerald-500 font-bold uppercase mt-1">
                    {format(new Date(item.last_session), 'dd MMM yyyy HH:mm')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- User Management Component ---
const UserManagement = ({ token }: { token: string }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'user' });
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const loadUsers = async () => {
    try {
      const data = await api.request('GET', '/users', null, token);
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingUser) {
        await api.request('PUT', `/users/${editingUser.id}`, formData, token);
      } else {
        await api.request('POST', '/users', formData, token);
      }
      setShowModal(false);
      setEditingUser(null);
      setFormData({ username: '', password: '', role: 'user' });
      loadUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus User?',
      message: 'Akun ini akan dihapus permanen dan tidak dapat digunakan lagi untuk login.',
      onConfirm: async () => {
        try {
          await api.request('DELETE', `/users/${id}`, null, token);
          loadUsers();
        } catch (err: any) {
          setError(err.message);
        }
      }
    });
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-black text-zinc-900">Manajemen User</h2>
          <p className="text-sm text-zinc-500">Kelola akun operator dan admin sistem</p>
        </div>
        <button 
          onClick={() => { setEditingUser(null); setFormData({ username: '', password: '', role: 'user' }); setShowModal(true); }}
          className="px-6 py-3 bg-zinc-900 text-white rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-zinc-800 transition-all shadow-lg"
        >
          <UserIcon className="w-4 h-4" />
          Tambah User
        </button>
      </div>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-50 text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-100">
              <th className="px-8 py-4">Username</th>
              <th className="px-8 py-4">Role</th>
              <th className="px-8 py-4">Dibuat Pada</th>
              <th className="px-8 py-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-50 transition-all">
                <td className="px-8 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <span className="font-bold text-zinc-900">{user.username}</span>
                  </div>
                </td>
                <td className="px-8 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                    user.role === 'admin' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                  )}>
                    {user.role}
                  </span>
                </td>
                <td className="px-8 py-4 text-sm text-zinc-500">
                  {format(new Date(user.created_at), 'dd MMM yyyy')}
                </td>
                <td className="px-8 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => { setEditingUser(user); setFormData({ username: user.username, password: '', role: user.role }); setShowModal(true); }}
                      className="p-2 text-zinc-400 hover:text-zinc-900 transition-all"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(user.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-zinc-900">{editingUser ? 'Edit User' : 'Tambah User Baru'}</h3>
                  <button type="button" onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-zinc-100"><X className="w-6 h-6 text-zinc-400" /></button>
                </div>

                {error && <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Username</label>
                    <input 
                      type="text" 
                      required
                      value={formData.username}
                      onChange={e => setFormData({...formData, username: e.target.value})}
                      className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Password {editingUser && '(Kosongkan jika tidak ganti)'}</label>
                    <input 
                      type="password" 
                      required={!editingUser}
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 block">Role</label>
                    <select 
                      value={formData.role}
                      onChange={e => setFormData({...formData, role: e.target.value})}
                      className="w-full px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all font-bold"
                    >
                      <option value="user">Operator (User)</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-xl">
                  {editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Reports = ({ token, role }: { token: string, role?: string }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summary, setSummary] = useState<{ stores: any[], global: any }>({ stores: [], global: { total_scans: 0, normal_scans: 0, urgent_scans: 0 } });
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [sessionScans, setSessionScans] = useState<Scan[]>([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [error, setError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sessionsData, summaryData] = await Promise.all([
        api.get('/reports/sessions', token),
        api.get('/reports/summary', token)
      ]);
      setSessions(sessionsData);
      setSummary(summaryData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const viewSessionDetails = async (session: Session) => {
    setSelectedSession(session);
    setLoadingScans(true);
    try {
      const scans = await api.get(`/scans/${session.id}`, token);
      setSessionScans(scans);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingScans(false);
    }
  };

  const exportToPDF = (session: Session, scans: Scan[]) => {
    const doc = new jsPDF() as any;
    doc.setFontSize(18);
    doc.text(`Laporan Scan Paket - ${session.store_name}`, 14, 22);
    doc.setFontSize(11);
    doc.text(`Platform: ${session.platform}`, 14, 30);
    doc.text(`Tipe Sesi: ${session.type}`, 14, 36);
    doc.text(`Operator: ${session.username}`, 14, 42);
    doc.text(`Waktu: ${format(new Date(session.start_time), 'dd MMM yyyy HH:mm')}`, 14, 48);
    doc.text(`Total Paket: ${scans.length}`, 14, 54);

    const tableData = (scans || []).map((s, i) => [
      i + 1,
      s.tracking_number,
      format(new Date(s.scan_time), 'HH:mm:ss')
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['No', 'Nomor Resi', 'Waktu Scan']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save(`Laporan_${session.store_name}_${format(new Date(session.start_time), 'yyyyMMdd')}.pdf`);
  };

  const exportToExcel = (session: Session, scans: Scan[]) => {
    const data = (scans || []).map((s, i) => ({
      'No': i + 1,
      'Nomor Resi': s.tracking_number,
      'Waktu Scan': format(new Date(s.scan_time), 'HH:mm:ss'),
      'Toko': session.store_name,
      'Platform': session.platform,
      'Tipe': session.type,
      'Operator': session.username,
      'Tanggal': format(new Date(session.start_time), 'dd MMM yyyy')
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scans");
    XLSX.writeFile(wb, `Laporan_${session.store_name}_${format(new Date(session.start_time), 'yyyyMMdd')}.xlsx`);
  };

  const exportSummaryExcel = () => {
    const data = summary.stores.map(item => ({
      'Nama Toko': item.store_name,
      'Platform': item.platform,
      'Tipe': item.type,
      'Total Scan': item.total_scans,
      'Sesi Terakhir': item.last_session ? format(new Date(item.last_session), 'dd MMM yyyy HH:mm') : '-'
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.writeFile(wb, `Ringkasan_Toko_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const handleDeleteSession = async (id: number) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Sesi?',
      message: 'Seluruh riwayat scan pada sesi ini akan dihapus permanen dari laporan.',
      onConfirm: async () => {
        try {
          await api.request('DELETE', `/sessions/${id}`, null, token);
          setSessions(prev => prev.filter(s => s.id !== id));
          loadData(); // Refresh summary too
        } catch (err: any) {
          setError(err.message || 'Gagal menghapus sesi');
        }
      }
    });
  };

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900 mb-2">Laporan & Riwayat</h2>
          <p className="text-zinc-500">Data lengkap pengiriman paket per toko.</p>
        </div>
        <button 
          onClick={exportSummaryExcel}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-all"
        >
          <ArrowRight className="w-4 h-4 rotate-90" />
          Export Ringkasan Excel
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-600 text-sm font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Global Summary</p>
          <h4 className="text-lg font-bold text-zinc-900 mb-4">Total Semua Scan</h4>
          <div className="flex items-end justify-between">
            <div className="text-3xl font-black text-emerald-600">{summary.global.total_scans}</div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-zinc-400 uppercase">Normal: {summary.global.normal_scans}</p>
              <p className="text-[10px] font-bold text-red-400 uppercase">Urgent: {summary.global.urgent_scans}</p>
            </div>
          </div>
        </div>

        {summary.stores.filter(s => s.total_scans > 0).slice(0, 2).map((item, i) => (
          <div key={`${item.store_name}-${item.platform}-${item.type}-${i}`} className="p-6 rounded-3xl bg-white border border-zinc-200 shadow-sm relative overflow-hidden">
            <div className={cn(
              "absolute top-0 right-0 px-3 py-1 text-[8px] font-black uppercase tracking-tighter",
              item.type === 'URGENT' ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
            )}>
              {item.type}
            </div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">{item.platform}</p>
            <h4 className="text-lg font-bold text-zinc-900 mb-4">{item.store_name}</h4>
            <div className="flex items-end justify-between">
              <div className="text-3xl font-black text-zinc-900">{item.total_scans}</div>
              <p className="text-xs text-zinc-400">Total Paket</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-6 border-bottom border-zinc-100 flex items-center justify-between">
          <h3 className="font-bold text-zinc-900">Riwayat Sesi</h3>
          <History className="w-5 h-5 text-zinc-400" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-50 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                <th className="px-6 py-4">Waktu</th>
                <th className="px-6 py-4">Tipe</th>
                <th className="px-6 py-4">Toko / Platform</th>
                <th className="px-6 py-4">Operator</th>
                <th className="px-6 py-4">Total Scan</th>
                <th className="px-6 py-4">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sessions.map((s) => (
                <tr key={`session-${s.id}`} className="hover:bg-zinc-50 transition-all cursor-pointer" onClick={() => viewSessionDetails(s)}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-zinc-900">{format(new Date(s.start_time), 'dd MMM yyyy')}</p>
                    <p className="text-xs text-zinc-400">{format(new Date(s.start_time), 'HH:mm')}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                      s.type === 'URGENT' ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                    )}>
                      {s.type}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-zinc-900">{s.store_name}</p>
                    <span className="text-[10px] font-bold text-zinc-400">{s.platform}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                        <UserIcon className="w-3 h-3 text-emerald-600" />
                      </div>
                      <span className="text-sm text-zinc-600">{s.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-900 text-xs font-bold">
                      {s.scan_count} Paket
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => viewSessionDetails(s)}
                        className="p-2 text-zinc-400 hover:text-emerald-500 transition-all"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                      {role === 'admin' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id); }}
                          className="p-2 text-zinc-400 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />

      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
      />

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedSession && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900">{selectedSession.store_name}</h3>
                  <p className="text-sm text-zinc-500">{selectedSession.platform} • {format(new Date(selectedSession.start_time), 'dd MMM yyyy HH:mm')}</p>
                </div>
                <button 
                  onClick={() => setSelectedSession(null)}
                  className="p-2 rounded-xl hover:bg-zinc-200 transition-all"
                >
                  <X className="w-6 h-6 text-zinc-500" />
                </button>
              </div>

              <div className="p-6 flex flex-wrap gap-3 border-b border-zinc-100">
                <button 
                  onClick={() => exportToPDF(selectedSession, sessionScans)}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-red-100 transition-all"
                >
                  <ArrowRight className="w-4 h-4 rotate-90" />
                  Export PDF
                </button>
                <button 
                  onClick={() => exportToExcel(selectedSession, sessionScans)}
                  className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-100 transition-all"
                >
                  <ArrowRight className="w-4 h-4 rotate-90" />
                  Export Excel
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingScans ? (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {sessionScans.map((scan, i) => (
                      <div key={`session-scan-${scan.id}-${i}`} className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-xs text-zinc-400 font-bold mb-0.5">#{i + 1}</p>
                          <p className="text-sm font-mono font-bold text-zinc-900">{scan.tracking_number}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{format(new Date(scan.scan_time), 'HH:mm:ss')}</p>
                            {scan.username && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-600 font-bold uppercase tracking-tighter">
                                {scan.username} ({scan.role})
                              </span>
                            )}
                          </div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      </div>
                    ))}
                    {sessionScans.length === 0 && (
                      <div className="col-span-full py-12 text-center text-zinc-400">
                        Tidak ada data scan untuk sesi ini.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const saved = localStorage.getItem('auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [view, setView] = useState<'DASHBOARD' | 'STORES' | 'SCANNER' | 'REPORTS' | 'USERS'>('DASHBOARD');
  const [stores, setStores] = useState<Store[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (auth) {
      localStorage.setItem('auth', JSON.stringify(auth));
      loadStores();
      checkActiveSession();
      
      const s = io();
      setSocket(s);
      
      const handleClearScans = ({ session_id }: { session_id: number }) => {
        if (activeSession && session_id === activeSession.id) {
          window.dispatchEvent(new CustomEvent('socket-clear-scans'));
        }
      };

      s.on('clear-scans', handleClearScans);
      
      return () => { 
        s.off('clear-scans', handleClearScans);
        s.disconnect(); 
      };
    } else {
      localStorage.removeItem('auth');
    }
  }, [auth, activeSession?.id]);

  useEffect(() => {
    if (socket && activeSession) {
      const handleNewScan = ({ scan, session_id }: { scan: Scan, session_id: number }) => {
        if (session_id === activeSession.id) {
          window.dispatchEvent(new CustomEvent('socket-new-scan', { detail: scan }));
        }
      };
      const handleDeleteScan = ({ id, session_id }: { id: string, session_id: number }) => {
        if (session_id === activeSession.id) {
          window.dispatchEvent(new CustomEvent('socket-delete-scan', { detail: { id } }));
        }
      };
      socket.on("new-scan", handleNewScan);
      socket.on("delete-scan", handleDeleteScan);
      return () => { 
        socket.off("new-scan", handleNewScan); 
        socket.off("delete-scan", handleDeleteScan);
      };
    }
  }, [socket, activeSession]);

  const loadStores = async () => {
    if (!auth) return;
    try {
      const data = await api.get('/stores', auth.token!);
      setStores(data);
    } catch (err) {
      console.error(err);
    }
  };

  const checkActiveSession = async () => {
    if (!auth) return;
    try {
      const session = await api.get('/sessions/active', auth.token!);
      if (session) {
        setActiveSession(session);
        setView('SCANNER');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startSession = async (store: Store, type: 'NORMAL' | 'URGENT') => {
    if (!auth) return;
    try {
      const session = await api.post('/sessions/start', { store_id: store.id, type }, auth.token!);
      setActiveSession(session);
      setView('SCANNER');
    } catch (err) {
      console.error(err);
    }
  };

  const endSession = async () => {
    if (!auth || !activeSession) return;
    try {
      await api.post('/sessions/end', { session_id: activeSession.id }, auth.token!);
      setActiveSession(null);
      setView('REPORTS');
    } catch (err) {
      console.error(err);
    }
  };

  if (!auth) return <Login onLogin={setAuth} />;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Navbar */}
      <nav className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
            <Package className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 leading-none uppercase tracking-tight">ERFOLGS TRACKING ONLINE</h1>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Dashboard Pro</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1 p-1 bg-zinc-100 rounded-xl">
          <button 
            onClick={() => setView('DASHBOARD')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              view === 'DASHBOARD' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
          <button 
            onClick={() => setView('STORES')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              view === 'STORES' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <ScanIcon className="w-4 h-4" />
            Scan Baru
          </button>
          <button 
            onClick={() => setView('REPORTS')}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
              view === 'REPORTS' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
            )}
          >
            <FileText className="w-4 h-4" />
            Laporan
          </button>
          {auth.user?.role === 'admin' && (
            <button 
              onClick={() => setView('USERS')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2",
                view === 'USERS' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              )}
            >
              <Users className="w-4 h-4" />
              User
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-zinc-200">
            <div className="text-right">
              <p className="text-sm font-bold text-zinc-900">{auth.user?.username}</p>
              <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{auth.user?.role}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <button 
            onClick={() => setAuth(null)}
            className="p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </nav>

      {/* Mobile Nav */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] glass-panel rounded-2xl p-2 flex items-center justify-around shadow-2xl border-zinc-200">
        <button 
          onClick={() => setView('DASHBOARD')}
          className={cn(
            "p-3 rounded-xl transition-all",
            view === 'DASHBOARD' ? "bg-zinc-900 text-emerald-500" : "text-zinc-400"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setView('STORES')}
          className={cn(
            "p-3 rounded-xl transition-all",
            view === 'STORES' ? "bg-zinc-900 text-emerald-500" : "text-zinc-400"
          )}
        >
          <ScanIcon className="w-6 h-6" />
        </button>
        {activeSession && (
          <button 
            onClick={() => setView('SCANNER')}
            className={cn(
              "p-3 rounded-xl transition-all",
              view === 'SCANNER' ? "bg-zinc-900 text-emerald-500" : "text-zinc-400"
            )}
          >
            <ArrowRight className="w-6 h-6" />
          </button>
        )}
        <button 
          onClick={() => setView('REPORTS')}
          className={cn(
            "p-3 rounded-xl transition-all",
            view === 'REPORTS' ? "bg-zinc-900 text-emerald-500" : "text-zinc-400"
          )}
        >
          <FileText className="w-6 h-6" />
        </button>
        {auth.user?.role === 'admin' && (
          <button 
            onClick={() => setView('USERS')}
            className={cn(
              "p-3 rounded-xl transition-all",
              view === 'USERS' ? "bg-zinc-900 text-emerald-500" : "text-zinc-400"
            )}
          >
            <Users className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Content */}
      <main className="flex-1 pb-24 md:pb-6">
        <AnimatePresence mode="wait">
          {view === 'DASHBOARD' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Dashboard token={auth.token!} />
            </motion.div>
          )}
          {view === 'STORES' && (
            <motion.div
              key="stores"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <StoreSelector stores={stores} onSelect={startSession} />
            </motion.div>
          )}
          {view === 'SCANNER' && activeSession && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Scanner session={activeSession} token={auth.token!} onEnd={endSession} />
            </motion.div>
          )}
          {view === 'REPORTS' && (
            <motion.div
              key="reports"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Reports token={auth.token!} role={auth.user?.role} />
            </motion.div>
          )}
          {view === 'USERS' && auth.user?.role === 'admin' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <UserManagement token={auth.token!} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
