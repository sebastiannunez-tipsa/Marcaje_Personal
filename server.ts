import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("attendance.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS centers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius REAL DEFAULT 100
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    dni TEXT,
    role TEXT DEFAULT 'employee',
    area TEXT,
    shift TEXT,
    hireDate TEXT,
    terminationDate TEXT,
    standardHours REAL DEFAULT 8,
    contractorId TEXT,
    roleId TEXT,
    password TEXT
  );

  CREATE TABLE IF NOT EXISTS contractors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS custom_roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    isAdmin INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS employee_centers (
    employeeId TEXT,
    centerId TEXT,
    PRIMARY KEY (employeeId, centerId),
    FOREIGN KEY (employeeId) REFERENCES employees(id),
    FOREIGN KEY (centerId) REFERENCES centers(id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT NOT NULL,
    employeeName TEXT NOT NULL,
    centerId TEXT,
    checkIn DATETIME DEFAULT CURRENT_TIMESTAMP,
    checkOut DATETIME,
    latitude REAL,
    longitude REAL,
    distance REAL,
    status TEXT DEFAULT 'active'
  );
`);

// Migration: Add columns if they don't exist
const migrations = [
  { table: 'employees', column: 'dni', type: 'TEXT' },
  { table: 'employees', column: 'area', type: 'TEXT' },
  { table: 'employees', column: 'shift', type: 'TEXT' },
  { table: 'employees', column: 'hireDate', type: 'TEXT' },
  { table: 'employees', column: 'terminationDate', type: 'TEXT' },
  { table: 'employees', column: 'standardHours', type: 'REAL DEFAULT 8' },
  { table: 'employees', column: 'contractorId', type: 'TEXT' },
  { table: 'employees', column: 'roleId', type: 'TEXT' },
  { table: 'employees', column: 'password', type: 'TEXT' },
  { table: 'centers', column: 'radius', type: 'REAL DEFAULT 100' },
  { table: 'attendance', column: 'centerId', type: 'TEXT' }
];

for (const m of migrations) {
  try {
    const info = db.prepare(`PRAGMA table_info(${m.table})`).all() as any[];
    if (!info.some(col => col.name === m.column)) {
      db.prepare(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`).run();
      console.log(`Migration: Added ${m.column} to ${m.table}`);
    }
  } catch (e) {
    console.error(`Migration failed for ${m.table}.${m.column}:`, e);
  }
}

// Seed some data if empty
const centerCount = db.prepare("SELECT COUNT(*) as count FROM centers").get() as { count: number };
if (centerCount.count === 0) {
  db.prepare("INSERT INTO centers (id, name, address, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?, ?)").run("c1", "Oficina Central Madrid", "Puerta del Sol", 40.416775, -3.703790, 100);
  db.prepare("INSERT INTO centers (id, name, address, latitude, longitude, radius) VALUES (?, ?, ?, ?, ?, ?)").run("c2", "Almacén Barcelona", "Puerto de Barcelona", 41.385063, 2.173404, 200);
}

const employeeCount = db.prepare("SELECT COUNT(*) as count FROM employees").get() as { count: number };
if (employeeCount.count === 0) {
  db.prepare("INSERT INTO employees (id, name, dni, role, area, shift) VALUES (?, ?, ?, ?, ?, ?)").run("admin", "Administrador", "00000000T", "admin", "Sistemas", "Completo");
  db.prepare("INSERT INTO employees (id, name, dni, role, area, shift) VALUES (?, ?, ?, ?, ?, ?)").run("emp001", "Juan Pérez", "12345678A", "employee", "Logística", "Mañana");
  
  db.prepare("INSERT INTO employee_centers (employeeId, centerId) VALUES (?, ?)").run("emp001", "c1");
  db.prepare("INSERT INTO employee_centers (employeeId, centerId) VALUES (?, ?)").run("emp001", "c2");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/centers", (req, res) => {
    const centers = db.prepare("SELECT * FROM centers").all();
    res.json(centers);
  });

  app.get("/api/contractors", (req, res) => {
    const contractors = db.prepare("SELECT * FROM contractors").all();
    res.json(contractors);
  });

  app.post("/api/contractors", (req, res) => {
    const { id, name } = req.body;
    if (!id || !name) return res.status(400).json({ error: "ID and Name are required" });
    try {
      db.prepare("INSERT OR REPLACE INTO contractors (id, name) VALUES (?, ?)").run(id, name);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/roles", (req, res) => {
    const roles = db.prepare("SELECT * FROM custom_roles").all();
    res.json(roles);
  });

  app.post("/api/roles", (req, res) => {
    const { id, name, isAdmin } = req.body;
    if (!id || !name) return res.status(400).json({ error: "ID and Name are required" });
    try {
      db.prepare("INSERT OR REPLACE INTO custom_roles (id, name, isAdmin) VALUES (?, ?, ?)").run(id, name, isAdmin ? 1 : 0);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/centers", (req, res) => {
    const { id, name, address, latitude, longitude, radius } = req.body;
    console.log("Saving center:", { id, name, address, latitude, longitude, radius });
    
    if (!id || !name) {
      return res.status(400).json({ error: "ID and Name are required" });
    }

    try {
      db.prepare(`
        INSERT INTO centers (id, name, address, latitude, longitude, radius) 
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          address=excluded.address,
          latitude=excluded.latitude,
          longitude=excluded.longitude,
          radius=excluded.radius
      `).run(id, name, address, latitude, longitude, radius);
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error saving center:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/employees", (req, res) => {
    const employees = db.prepare("SELECT * FROM employees").all();
    const employeesWithCenters = employees.map((emp: any) => {
      const centers = db.prepare("SELECT centerId FROM employee_centers WHERE employeeId = ?").all(emp.id);
      return { ...emp, centerIds: centers.map((c: any) => c.centerId) };
    });
    res.json(employeesWithCenters);
  });

  app.post("/api/employees", (req, res) => {
    const { id, name, dni, role, area, shift, hireDate, terminationDate, standardHours, contractorId, roleId, password, centerIds } = req.body;
    console.log("Saving employee:", { id, name, dni, role, area, shift, hireDate, terminationDate, standardHours, contractorId, roleId, password, centerIds });
    
    if (!id || !name) {
      return res.status(400).json({ error: "ID and Name are required" });
    }

    try {
      const saveTx = db.transaction(() => {
        // Use INSERT OR REPLACE for maximum compatibility and simplicity
        db.prepare(`
          INSERT OR REPLACE INTO employees (id, name, dni, role, area, shift, hireDate, terminationDate, standardHours, contractorId, roleId, password) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, dni || null, role || 'employee', area || null, shift || null, hireDate || null, terminationDate || null, standardHours || 8, contractorId || null, roleId || null, password || null);

        db.prepare("DELETE FROM employee_centers WHERE employeeId = ?").run(id);
        
        if (Array.isArray(centerIds)) {
          const insertCenter = db.prepare("INSERT INTO employee_centers (employeeId, centerId) VALUES (?, ?)");
          for (const centerId of centerIds) {
            insertCenter.run(id, centerId);
          }
        }
      });

      saveTx();
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error saving employee:", err);
      res.status(500).json({ error: "Error interno del servidor: " + err.message });
    }
  });

  app.get("/api/attendance/active/:employeeId", (req, res) => {
    const active = db.prepare("SELECT * FROM attendance WHERE employeeId = ? AND status = 'active'").get(req.params.employeeId);
    res.json(active || null);
  });

  app.post("/api/attendance/checkin", (req, res) => {
    const { employeeId, employeeName, centerId, latitude, longitude, distance } = req.body;
    
    const active = db.prepare("SELECT id FROM attendance WHERE employeeId = ? AND status = 'active'").get(employeeId);
    if (active) return res.status(400).json({ error: "Ya tienes una sesión activa" });

    const result = db.prepare(`
      INSERT INTO attendance (employeeId, employeeName, centerId, latitude, longitude, distance, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(employeeId, employeeName, centerId, latitude, longitude, distance);
    
    res.json({ id: result.lastInsertRowid });
  });

  app.post("/api/attendance/checkout", (req, res) => {
    const { employeeId } = req.body;
    const result = db.prepare(`
      UPDATE attendance 
      SET checkOut = CURRENT_TIMESTAMP, status = 'completed'
      WHERE employeeId = ? AND status = 'active'
    `).run(employeeId);

    if (result.changes === 0) return res.status(400).json({ error: "No hay sesión activa para cerrar" });
    res.json({ success: true });
  });

  app.get("/api/admin/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM attendance ORDER BY checkIn DESC").all();
    res.json(logs);
  });

  app.get("/api/admin/stats", (req, res) => {
    const { from, to } = req.query;
    
    let query = `
      SELECT 
        COUNT(*) as totalRecords,
        COUNT(DISTINCT a.employeeId) as totalEmployees,
        SUM(CASE WHEN a.status = 'active' THEN 1 ELSE 0 END) as activeNow,
        SUM(CASE WHEN a.status = 'completed' THEN (strftime('%s', a.checkOut) - strftime('%s', a.checkIn)) / 3600.0 ELSE 0 END) as totalHours,
        SUM(CASE WHEN a.status = 'completed' THEN 
          CASE WHEN ((strftime('%s', a.checkOut) - strftime('%s', a.checkIn)) / 3600.0) > e.standardHours 
          THEN ((strftime('%s', a.checkOut) - strftime('%s', a.checkIn)) / 3600.0) - e.standardHours 
          ELSE 0 END
        ELSE 0 END) as extraHours,
        SUM(CASE WHEN a.status = 'completed' THEN 
          CASE WHEN ((strftime('%s', a.checkOut) - strftime('%s', a.checkIn)) / 3600.0) < e.standardHours 
          THEN e.standardHours - ((strftime('%s', a.checkOut) - strftime('%s', a.checkIn)) / 3600.0)
          ELSE 0 END
        ELSE 0 END) as lessHours
      FROM attendance a
      JOIN employees e ON a.employeeId = e.id
    `;

    const params: any[] = [];
    if (from && to) {
      query += " WHERE date(a.checkIn) BETWEEN ? AND ?";
      params.push(from, to);
    }

    const stats = db.prepare(query).get(...params);
    res.json(stats);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
