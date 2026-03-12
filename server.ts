import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { format } from "date-fns";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "paket-track-secret-key-2024";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://ffxhozraccteohyahpwi.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmeGhvenJhY2N0ZW9oeWFocHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMTYwODksImV4cCI6MjA4ODc5MjA4OX0.-J_uQpDSJwlYOghRPNDLt-JwCnxhwfsuNMdKpiM3YMQ";

let supabase: any = null;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is missing.");
} else {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client initialized successfully.");
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
}

// Middleware to check if Supabase is configured
const checkSupabaseConfig = (req: any, res: any, next: any) => {
  if (!supabase) {
    return res.status(503).json({ 
      error: "Database not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in the Settings menu." 
    });
  }
  next();
};

// Seed function for Supabase
async function seedDatabase() {
  if (!supabase) return;
  try {
    console.log("Checking database tables...");
    
    // Check if stores exist
    const { data: storesData, error: storesError, count: storeCount } = await supabase
      .from('stores')
      .select('*', { count: 'exact', head: true });
    
    if (storesError) {
      console.error("Error checking stores table. Make sure you have created the tables in Supabase SQL Editor:", storesError.message);
      return;
    }
    
    if (storeCount === 0) {
      console.log("Seeding default stores...");
      const platforms = {
        "SHOPEE": ["ERFO.ID", "SA FASHION", "BENGHAR.ID", "SPECIALIS KEMEJA", "WE_WEARS", "GLOWRICH", "AERIS"],
        "TIKTOK": ["ERFO.ID", "SA FASHION", "SPECIALIS KEMEJA", "GLOWRICH", "AERIS"],
        "LAZADA": ["ERFO.ID", "SPECIALIS KEMEJA", "WE_WEARS"]
      };

      const storeData: any[] = [];
      for (const [platform, names] of Object.entries(platforms)) {
        for (const name of names) {
          storeData.push({ name, platform });
        }
      }
      const { error: insertError } = await supabase.from('stores').insert(storeData);
      if (insertError) console.error("Error seeding stores:", insertError.message);
    }

    // Check if admin exists
    const { data: adminData, error: adminError, count: adminCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('username', 'admin');
    
    if (adminError) {
      console.error("Error checking users table:", adminError.message);
      return;
    }

    if (adminCount === 0) {
      console.log("Seeding admin user...");
      const hashedPassword = bcrypt.hashSync("admin123", 10);
      const { error: userError } = await supabase.from('users').insert([{ username: "admin", password: hashedPassword, role: "admin" }]);
      if (userError) console.error("Error seeding admin:", userError.message);
    }
    
    console.log("Database check complete.");
  } catch (err) {
    console.error("Unexpected error during database seeding:", err);
  }
}

async function startServer() {
  await seedDatabase();

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  app.use(express.json());

  // Manual CORS Middleware
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Auth Middleware
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: "Authentication token missing" });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
      }
      req.user = user;
      next();
    });
  };

  // Auth Routes
  app.post("/api/auth/login", checkSupabaseConfig, async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
      res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Store Routes
  app.get("/api/stores", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const { data: stores } = await supabase.from('stores').select('*');
    res.json(stores || []);
  });

  // Session Routes
  app.post("/api/sessions/start", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    const { store_id, type = 'NORMAL' } = req.body;
    const { data: result, error: insertError } = await supabase
      .from('sessions')
      .insert([{ user_id: req.user.id, store_id, type }])
      .select()
      .single();

    if (insertError) return res.status(500).json({ error: insertError.message });

    const { data: session } = await supabase
      .from('sessions')
      .select(`
        *,
        stores (name, platform)
      `)
      .eq('id', result.id)
      .single();

    // Flatten the response to match frontend expectation
    const formattedSession = {
      ...session,
      store_name: (session as any).stores?.name,
      platform: (session as any).stores?.platform
    };
    res.json(formattedSession);
  });

  app.post("/api/sessions/end", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const { session_id } = req.body;
    await supabase
      .from('sessions')
      .update({ end_time: new Date().toISOString(), status: 'closed' })
      .eq('id', session_id);
    res.json({ success: true });
  });

  app.get("/api/sessions/active", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    const { data: session } = await supabase
      .from('sessions')
      .select(`
        *,
        stores (name, platform)
      `)
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!session) return res.json(null);

    const formattedSession = {
      ...session,
      store_name: (session as any).stores?.name,
      platform: (session as any).stores?.platform
    };
    res.json(formattedSession);
  });

  // Scan Routes
  app.post("/api/scans", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const { session_id, tracking_number } = req.body;
    
    try {
      // Check if duplicate globally
      const { data: existing, error: checkError } = await supabase
        .from('scans')
        .select(`
          *,
          sessions (
            start_time,
            stores (name)
          )
        `)
        .eq('tracking_number', tracking_number)
        .maybeSingle();

      if (checkError) {
        console.error("Error checking for duplicate scan:", checkError.message);
        return res.status(500).json({ error: "Database error during duplicate check" });
      }

      if (existing) {
        const storeName = (existing as any).sessions?.stores?.name;
        const scanTime = existing.scan_time;
        return res.status(400).json({ 
          error: `Resi ini sudah pernah discan pada ${format(new Date(scanTime), 'dd MMM HH:mm')} di toko ${storeName}` 
        });
      }

      const { data: result, error: insertError } = await supabase
        .from('scans')
        .insert([{ session_id, tracking_number }])
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting scan:", insertError.message);
        return res.status(500).json({ error: insertError.message });
      }

      const { data: scan, error: fetchError } = await supabase
        .from('scans')
        .select(`
          *,
          sessions (
            users (username, role)
          )
        `)
        .eq('id', result.id)
        .single();

      if (fetchError) {
        console.error("Error fetching formatted scan:", fetchError.message);
        return res.status(500).json({ error: "Error fetching scan details" });
      }

      const formattedScan = {
        ...scan,
        username: (scan as any).sessions?.users?.username,
        role: (scan as any).sessions?.users?.role
      };
      
      // Broadcast to all clients
      io.emit("new-scan", { scan: formattedScan, session_id });
      
      res.json(formattedScan);
    } catch (err) {
      console.error("Unexpected error in /api/scans:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/scans/session/:session_id", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    const { session_id } = req.params;
    
    const { data: session } = await supabase
      .from('sessions')
      .select('status, user_id')
      .eq('id', session_id)
      .single();

    if (!session) return res.status(404).json({ error: "Session not found" });
    
    // Allow if admin OR if it's the user's own active session
    if (req.user.role !== 'admin' && (session.status !== 'active' || session.user_id !== req.user.id)) {
      return res.status(403).json({ error: "Unauthorized to clear this session's scans" });
    }

    const { error } = await supabase
      .from('scans')
      .delete()
      .eq('session_id', session_id);

    if (error) return res.status(500).json({ error: error.message });
    
    io.emit("clear-scans", { session_id });
    res.json({ success: true });
  });

  app.delete("/api/sessions/:id", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    
    const { id } = req.params;

    // First delete associated scans (Supabase might handle this with cascade, but let's be safe)
    await supabase.from('scans').delete().eq('session_id', id);
    
    const { error } = await supabase
      .from('sessions')
      .delete()
      .eq('id', id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/scans/:session_id", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const { data: scans } = await supabase
      .from('scans')
      .select(`
        *,
        sessions (
          users (username, role)
        )
      `)
      .eq('session_id', req.params.session_id)
      .order('scan_time', { ascending: false });

    const formattedScans = (scans || []).map(scan => ({
      ...scan,
      username: (scan as any).sessions?.users?.username,
      role: (scan as any).sessions?.users?.role
    }));

    res.json(formattedScans);
  });

  app.delete("/api/scans/:id", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const scanId = parseInt(req.params.id);
    if (isNaN(scanId)) return res.status(400).json({ error: "Invalid scan ID" });

    const { data: scan } = await supabase
      .from('scans')
      .select(`
        *,
        sessions (status)
      `)
      .eq('id', scanId)
      .single();

    if (!scan) return res.status(404).json({ error: "Scan not found" });
    if ((scan as any).sessions?.status !== 'active') return res.status(400).json({ error: "Cannot delete scan from a closed session" });

    const { error: deleteError } = await supabase.from('scans').delete().eq('id', scanId);
    
    if (deleteError) {
      console.error("Error deleting scan:", deleteError.message);
      return res.status(500).json({ error: deleteError.message });
    }

    // Broadcast to all clients
    io.emit("delete-scan", { id: scanId, session_id: scan.session_id });
    
    res.json({ success: true });
  });

  // User Management Routes
  app.get("/api/users", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, role, created_at')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json(users);
  });

  app.post("/api/users", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    
    const { username, password, role } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword, role }])
      .select('id, username, role, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.put("/api/users/:id", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    
    const { username, password, role } = req.body;
    const updateData: any = { username, role };
    if (password) {
      updateData.password = bcrypt.hashSync(password, 10);
    }
    
    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id)
      .select('id, username, role, created_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.delete("/api/users/:id", authenticateToken, checkSupabaseConfig, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin only" });
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Dashboard Routes
  app.get("/api/dashboard/stats", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count: totalScans } = await supabase.from('scans').select('*', { count: 'exact', head: true });
    const { count: todayScans } = await supabase.from('scans').select('*', { count: 'exact', head: true }).gte('scan_time', today.toISOString());
    const { count: activeSessions } = await supabase.from('sessions').select('*', { count: 'exact', head: true }).eq('status', 'active');
    const { count: totalStores } = await supabase.from('stores').select('*', { count: 'exact', head: true });

    res.json({
      totalScans: totalScans || 0,
      todayScans: todayScans || 0,
      activeSessions: activeSessions || 0,
      totalStores: totalStores || 0
    });
  });

  // Report Routes
  app.get("/api/reports/summary", authenticateToken, checkSupabaseConfig, async (req, res) => {
    // This is a bit complex for Supabase client without a custom RPC or view
    // We'll do a simplified version or fetch and aggregate
    const { data: stores } = await supabase.from('stores').select('*');
    const { data: sessions } = await supabase.from('sessions').select('*, scans(id)');
    
    const summary = (stores || []).flatMap(store => {
      const storeSessions = (sessions || []).filter(s => s.store_id === store.id);
      
      // Group by type
      const types = ['NORMAL', 'URGENT'];
      return types.map(type => {
        const typeSessions = storeSessions.filter(s => s.type === type);
        const totalScans = typeSessions.reduce((acc, s) => acc + (s.scans?.length || 0), 0);
        const lastSession = typeSessions.length > 0 
          ? typeSessions.sort((a, b) => new Date(b.end_time || 0).getTime() - new Date(a.end_time || 0).getTime())[0].end_time 
          : null;

        return {
          store_name: store.name,
          platform: store.platform,
          type: type,
          total_scans: totalScans,
          last_session: lastSession
        };
      });
    });

    // Global summary
    const globalSummary = {
      total_scans: (sessions || []).reduce((acc, s) => acc + (s.scans?.length || 0), 0),
      normal_scans: (sessions || []).filter(s => s.type === 'NORMAL').reduce((acc, s) => acc + (s.scans?.length || 0), 0),
      urgent_scans: (sessions || []).filter(s => s.type === 'URGENT').reduce((acc, s) => acc + (s.scans?.length || 0), 0)
    };

    res.json({ stores: summary, global: globalSummary });
  });

  app.get("/api/reports/sessions", authenticateToken, checkSupabaseConfig, async (req, res) => {
    const { data: sessions } = await supabase
      .from('sessions')
      .select(`
        *,
        stores (name, platform),
        users (username),
        scans (id)
      `)
      .order('start_time', { ascending: false });

    const formattedSessions = (sessions || []).map(s => ({
      ...s,
      store_name: (s as any).stores?.name,
      platform: (s as any).stores?.platform,
      username: (s as any).users?.username,
      scan_count: (s as any).scans?.length || 0
    }));

    res.json(formattedSessions);
  });

  // Catch-all for unmatched API routes
  app.all(["/api", "/api/*"], (req, res) => {
    res.status(404).json({ 
      error: `API Route ${req.method} ${req.url} not found`,
      path: req.url,
      method: req.method
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Socket.io connection
  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}

startServer();
