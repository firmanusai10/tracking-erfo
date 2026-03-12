export interface User {
  id: number;
  username: string;
  role: string;
}

export interface Store {
  id: number;
  name: string;
  platform: 'SHOPEE' | 'TIKTOK' | 'LAZADA';
}

export interface Session {
  id: number;
  user_id: number;
  store_id: number;
  start_time: string;
  end_time: string | null;
  status: 'active' | 'closed';
  type: 'NORMAL' | 'URGENT';
  store_name?: string;
  platform?: string;
  scan_count?: number;
  username?: string;
}

export interface Scan {
  id: number;
  session_id: number;
  tracking_number: string;
  scan_time: string;
  username?: string;
  role?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}
