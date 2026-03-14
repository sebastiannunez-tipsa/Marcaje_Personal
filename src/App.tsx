import React, { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  MapPin, 
  LayoutDashboard, 
  User, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  BarChart3, 
  Users, 
  History,
  ChevronRight,
  ShieldCheck,
  Smartphone,
  Monitor,
  Plus,
  Building2,
  Settings,
  FileText,
  Save,
  Trash2,
  Search,
  Download,
  TrendingUp,
  TrendingDown,
  Briefcase,
  UserCog,
  Key,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInHours, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AttendanceRecord, Employee, WorkCenter, Contractor, CustomRole } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

import { initDB, subscribeToCollection, saveEmployee, saveCenter, saveContractor, saveRole, checkIn, checkOut, subscribeToActiveSession, deleteEmployee, deleteCenter, deleteContractor, deleteRole } from './db';
import { auth } from './firebase';
import { onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';

export default function App() {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loginCenterId, setLoginCenterId] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [view, setView] = useState<'login' | 'employee' | 'admin'>('login');
  const [adminSubView, setAdminSubView] = useState<'dashboard' | 'employees' | 'centers' | 'reports' | 'contractors' | 'roles'>('dashboard');
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    initDB();
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthReady(true);
        setAuthError(null);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (err: any) {
          console.error("Error in anonymous sign-in:", err);
          if (err.code === 'auth/admin-restricted-operation') {
            setAuthError("La autenticación anónima está desactivada. Por favor, actívala en la consola de Firebase o inicia sesión con Google.");
          }
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const unsubEmployees = subscribeToCollection<Employee>('employees', setEmployees);
    const unsubCenters = subscribeToCollection<WorkCenter>('centers', setCenters);
    const unsubContractors = subscribeToCollection<Contractor>('contractors', setContractors);
    const unsubRoles = subscribeToCollection<CustomRole>('roles', setRoles);

    return () => {
      unsubEmployees();
      unsubCenters();
      unsubContractors();
      unsubRoles();
    };
  }, [isAuthReady]);

  const handleLogin = (employee: Employee, centerId: string, asAdmin: boolean = false) => {
    setCurrentUser(employee);
    setLoginCenterId(centerId);
    const assignedRole = roles.find(r => r.id === employee.roleId);
    const hasAdminPrivileges = employee.role === 'admin' || assignedRole?.isAdmin;
    
    if (hasAdminPrivileges && asAdmin) {
      setView('admin');
    } else {
      setView('employee');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Error in Google login:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error in sign out:", err);
    }
    setCurrentUser(null);
    setLoginCenterId('');
    setView('login');
  };

  const fetchData = () => {};

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-tipsa-blue p-2 rounded-xl">
            <Clock className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Sistema Control Horario - <span className="text-blue-400">MarSEPA</span></h1>
        </div>
        
        {currentUser && (
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-bold text-white">{currentUser.name}</span>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                {view === 'admin' ? 'Panel de Control' : 'Acceso Empleado'}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 hover:bg-slate-700 rounded-xl text-slate-300 transition-all border border-transparent hover:border-slate-600"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        )}
        {!currentUser && (
          <button 
            onClick={() => setIsAdminLogin(!isAdminLogin)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-colors border border-slate-700"
          >
            <div className="bg-white p-1.5 rounded-lg">
              <ShieldCheck className="text-tipsa-blue w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-white">
              {isAdminLogin ? 'Acceso Empleado' : 'Acceso Administrador'}
            </span>
          </button>
        )}
      </header>

      <div className="flex-1 flex flex-col md:flex-row">
        {view === 'admin' && (
          <aside className="w-full md:w-64 bg-slate-800 border-r border-slate-700 p-4 space-y-2">
            <AdminNavButton 
              active={adminSubView === 'dashboard'} 
              onClick={() => setAdminSubView('dashboard')}
              icon={<LayoutDashboard className="w-5 h-5" />}
              label="Dashboard"
            />
            <AdminNavButton 
              active={adminSubView === 'employees'} 
              onClick={() => setAdminSubView('employees')}
              icon={<Users className="w-5 h-5" />}
              label="Empleados"
            />
            <AdminNavButton 
              active={adminSubView === 'centers'} 
              onClick={() => setAdminSubView('centers')}
              icon={<Building2 className="w-5 h-5" />}
              label="Centros de Trabajo"
            />
            <AdminNavButton 
              active={adminSubView === 'reports'} 
              onClick={() => setAdminSubView('reports')}
              icon={<FileText className="w-5 h-5" />}
              label="Informes"
            />
            <AdminNavButton 
              active={adminSubView === 'kpis'} 
              onClick={() => setAdminSubView('kpis')}
              icon={<BarChart3 className="w-5 h-5" />}
              label="KPIs RRHH"
            />
            <AdminNavButton 
              active={adminSubView === 'contractors'} 
              onClick={() => setAdminSubView('contractors')}
              icon={<Briefcase className="w-5 h-5" />}
              label="Contratas"
            />
            <AdminNavButton 
              active={adminSubView === 'roles'} 
              onClick={() => setAdminSubView('roles')}
              icon={<UserCog className="w-5 h-5" />}
              label="Roles"
            />
          </aside>
        )}

        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-auto">
          <AnimatePresence mode="wait">
            {view === 'login' && (
              <LoginView 
                employees={employees} 
                centers={centers} 
                roles={roles} 
                isAdminLogin={isAdminLogin} 
                isAuthReady={isAuthReady}
                authError={authError}
                onGoogleLogin={handleGoogleLogin}
                onLogin={(emp, cid, asAdmin) => handleLogin(emp, cid, asAdmin)} 
              />
            )}

            {view === 'employee' && currentUser && (
              <EmployeeView employee={currentUser} centers={centers} roles={roles} contractors={contractors} initialCenterId={loginCenterId} onLogout={handleLogout} />
            )}

            {view === 'admin' && currentUser && (
              <div className="space-y-6">
                {adminSubView === 'dashboard' && <AdminDashboard employees={employees} />}
                {adminSubView === 'employees' && <EmployeeManagement employees={employees} centers={centers} contractors={contractors} roles={roles} onUpdate={fetchData} />}
                {adminSubView === 'centers' && <CenterManagement centers={centers} onUpdate={fetchData} />}
                {adminSubView === 'reports' && <ReportsView employees={employees} centers={centers} contractors={contractors} />}
                {adminSubView === 'kpis' && <KPIsView employees={employees} centers={centers} contractors={contractors} />}
                {adminSubView === 'contractors' && <ContractorManagement contractors={contractors} onUpdate={fetchData} />}
                {adminSubView === 'roles' && <RoleManagement roles={roles} onUpdate={fetchData} />}
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function LoginView({ employees, centers, roles, isAdminLogin, isAuthReady, authError, onGoogleLogin, onLogin }: { employees: Employee[], centers: WorkCenter[], roles: CustomRole[], isAdminLogin: boolean, isAuthReady: boolean, authError: string | null, onGoogleLogin: () => void, onLogin: (e: Employee, centerId: string, asAdmin: boolean) => void }) {
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'employee' | 'admin'>('employee');
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  const handleBootstrap = async () => {
    setIsBootstrapping(true);
    try {
      // Create a default center first
      const defaultCenter: Partial<WorkCenter> = {
        name: 'Oficina Central',
        address: 'Calle Principal 1',
        latitude: 40.4168,
        longitude: -3.7038,
        radius: 500
      };
      const centerId = `wc_${Date.now()}`;
      await saveCenter({ ...defaultCenter, id: centerId });

      // Create default admin
      const defaultAdmin: Partial<Employee> = {
        name: 'Administrador',
        dni: 'ADMIN01',
        role: 'admin',
        centerIds: [centerId],
        password: 'admin'
      };
      await saveEmployee(defaultAdmin);
      setError(null);
    } catch (err: any) {
      setError("Error al crear administrador: " + err.message);
    } finally {
      setIsBootstrapping(false);
    }
  };

  const handleMigration = async () => {
    setIsBootstrapping(true);
    try {
      const localEmps = localStorage.getItem('tipsa_employees');
      const localCenters = localStorage.getItem('tipsa_centers');
      const localRoles = localStorage.getItem('tipsa_roles');
      const localContractors = localStorage.getItem('tipsa_contractors');

      if (localCenters) {
        const parsed = JSON.parse(localCenters);
        for (const c of parsed) await saveCenter(c);
      }
      if (localRoles) {
        const parsed = JSON.parse(localRoles);
        for (const r of parsed) await saveRole(r);
      }
      if (localContractors) {
        const parsed = JSON.parse(localContractors);
        for (const c of parsed) await saveContractor(c);
      }
      if (localEmps) {
        const parsed = JSON.parse(localEmps);
        for (const e of parsed) await saveEmployee(e);
      }
      
      setError(null);
      alert("Migración completada con éxito.");
    } catch (err: any) {
      setError("Error en migración: " + err.message);
    } finally {
      setIsBootstrapping(false);
    }
  };

  const activeEmployees = employees.filter(emp => {
    if (!emp.terminationDate) return true;
    try {
      const terminationDate = parseISO(emp.terminationDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return terminationDate >= today;
    } catch (e) {
      return true;
    }
  });

  const filteredEmployees = activeEmployees.filter(emp => {
    const assignedRole = roles.find(r => r.id === emp.roleId);
    const hasAdminPrivileges = emp.role === 'admin' || Boolean(assignedRole?.isAdmin);

    if (isAdminLogin) {
      return hasAdminPrivileges;
    } else {
      return !hasAdminPrivileges && (!selectedCenterId || emp.centerIds.includes(selectedCenterId));
    }
  });

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const assignedRole = roles.find(r => r.id === selectedEmployee?.roleId);
  const isStrictAdmin = selectedEmployee?.role === 'admin';
  const isRoleAdmin = Boolean(assignedRole?.isAdmin);
  const hasAdminPrivileges = isStrictAdmin || isRoleAdmin;
  const needsChoice = !isAdminLogin && Boolean(!isStrictAdmin && isRoleAdmin);

  useEffect(() => {
    if (isAdminLogin || (hasAdminPrivileges && (!needsChoice || loginMode === 'admin'))) {
      setShowPassword(true);
    } else {
      setShowPassword(false);
      setPassword('');
    }
  }, [isAdminLogin, hasAdminPrivileges, needsChoice, loginMode]);

  const handleLogin = () => {
    if (!selectedEmployee) return;
    
    const isLoggingInAsAdmin = isAdminLogin || isStrictAdmin || (needsChoice && loginMode === 'admin');

    if (isLoggingInAsAdmin) {
      if (selectedEmployee.password && password !== selectedEmployee.password) {
        setError('Contraseña de administrador incorrecta');
        return;
      }
    }
    
    onLogin(selectedEmployee, selectedCenterId, isLoggingInAsAdmin);
  };

  const detectNearestCenter = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocalización no soportada");
      return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
      let nearest: WorkCenter | null = null;
      let minDist = Infinity;

      centers.forEach(c => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, c.latitude, c.longitude);
        if (dist < minDist) {
          minDist = dist;
          nearest = c;
        }
      });

      if (nearest) {
        setSelectedCenterId((nearest as WorkCenter).id);
      }
    }, (err) => {
      setError("Error al obtener ubicación: " + err.message);
    });
  }, [centers]);

  useEffect(() => {
    if (!isAdminLogin && centers.length > 0 && !selectedCenterId) {
      detectNearestCenter();
    }
  }, [isAdminLogin, centers, selectedCenterId, detectNearestCenter]);

  return (
    <motion.div 
      key="login"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="max-w-md mx-auto mt-12"
    >
      <div className="bg-white rounded-[2rem] shadow-2xl shadow-blue-100 p-10 border border-slate-100">
        <div className="text-center mb-10">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4", isAdminLogin ? "bg-slate-800" : "bg-emerald-50")}>
            <ShieldCheck className={cn("w-8 h-8", isAdminLogin ? "text-white" : "text-emerald-800")} />
          </div>
          <h2 className="text-3xl font-black text-slate-900">{isAdminLogin ? 'Acceso Administrador' : 'Acceso Marcaje Seguro'}</h2>
          <p className="text-slate-500 mt-2 font-medium">Identifícate para {isAdminLogin ? 'acceder al panel' : 'registrar tu jornada'}</p>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          {!isAdminLogin && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Selecciona Centro</label>
                <button 
                  onClick={detectNearestCenter}
                  className="text-[10px] font-bold text-tipsa-blue hover:text-blue-700 flex items-center gap-1"
                >
                  <MapPin className="w-3 h-3" /> Detectar cercano
                </button>
              </div>
              <select
                value={selectedCenterId}
                onChange={(e) => {
                  setSelectedCenterId(e.target.value);
                  setSelectedEmployeeId('');
                }}
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
              >
                <option value="">Seleccionar Centro...</option>
                {centers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {isAdminLogin ? 'Selecciona Administrador' : '2. Selecciona Empleado'}
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              disabled={!isAdminLogin && !selectedCenterId}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue disabled:opacity-50"
            >
              <option value="">{isAdminLogin ? 'Seleccionar Administrador...' : 'Seleccionar Empleado...'}</option>
              {filteredEmployees.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          {needsChoice && (
            <div className="space-y-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
              <p className="text-xs font-bold text-tipsa-blue text-center mb-2">Selecciona el modo de acceso:</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setLoginMode('employee')}
                  className={cn(
                    "py-3 px-2 rounded-xl text-xs font-bold transition-all border-2",
                    loginMode === 'employee' 
                      ? "bg-white border-tipsa-blue text-tipsa-blue shadow-sm" 
                      : "bg-transparent border-transparent text-slate-500 hover:bg-white/50"
                  )}
                >
                  ENTRAR PARA MARCAJE
                </button>
                <button
                  onClick={() => setLoginMode('admin')}
                  className={cn(
                    "py-3 px-2 rounded-xl text-xs font-bold transition-all border-2",
                    loginMode === 'admin' 
                      ? "bg-white border-tipsa-blue text-tipsa-blue shadow-sm" 
                      : "bg-transparent border-transparent text-slate-500 hover:bg-white/50"
                  )}
                >
                  ENTRAR COMO ADMIN
                </button>
              </div>
            </div>
          )}

          {showPassword && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Lock className="w-3 h-3" /> Contraseña Admin
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Introduce tu contraseña"
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
              />
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={!selectedEmployeeId || (showPassword && !password)}
            className="w-full py-4 bg-tipsa-blue text-white rounded-xl font-black text-lg shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:shadow-none mt-4"
          >
            ACCEDER
          </button>

          {authError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl text-center space-y-3">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">{authError}</p>
              <button
                onClick={onGoogleLogin}
                className="w-full py-2 bg-white border border-red-200 text-red-600 rounded-lg font-bold text-[10px] hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                INICIAR SESIÓN CON GOOGLE
              </button>
            </div>
          )}

          {employees.length === 0 && (
            <div className="mt-8 p-6 bg-slate-50 border border-slate-200 rounded-[2rem] text-center space-y-4">
              <div className="bg-amber-100 w-10 h-10 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Base de Datos Vacía</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1 uppercase tracking-wider">No hay empleados registrados en el nuevo sistema.</p>
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handleBootstrap}
                  disabled={isBootstrapping || !isAuthReady}
                  className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold text-xs hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  {isBootstrapping ? 'CREANDO...' : !isAuthReady ? 'CONECTANDO...' : 'CREAR ADMIN POR DEFECTO'}
                </button>
                
                {(localStorage.getItem('tipsa_employees') || localStorage.getItem('tipsa_centers')) && (
                  <button
                    onClick={handleMigration}
                    disabled={isBootstrapping}
                    className="w-full py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    MIGRAR DATOS LOCALES
                  </button>
                )}
              </div>
              
              <p className="text-[9px] text-slate-400 font-medium italic">
                * Admin por defecto: DNI: ADMIN01 / Pass: admin
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function AdminNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all",
        active 
          ? "bg-tipsa-blue text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-300 hover:bg-slate-700 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmployeeView({ employee, centers, roles, contractors, initialCenterId, onLogout }: { employee: Employee, centers: WorkCenter[], roles: CustomRole[], contractors: Contractor[], initialCenterId?: string, onLogout: () => void }) {
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<WorkCenter | null>(
    centers.find(c => c.id === initialCenterId) || null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assignedRole = roles.find(r => r.id === employee.roleId);
  const assignedContractor = contractors.find(c => c.id === employee.contractorId);

  // Filter centers allowed for this employee
  const allowedCenters = centers.filter(c => (employee.centerIds || []).includes(c.id));

  useEffect(() => {
    const unsub = subscribeToActiveSession(employee.id, (session) => {
      setActiveSession(session);
      if (session) {
        setSelectedCenter(centers.find(c => c.id === session.centerId) || null);
      }
    });
    return () => unsub();
  }, [employee.id, centers]);

  const handleCheckIn = async () => {
    if (!selectedCenter) {
      setError("Por favor, selecciona un centro de trabajo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, selectedCenter.latitude, selectedCenter.longitude);

      if (dist > selectedCenter.radius) {
        throw new Error(`Fuera de rango. Estás a ${Math.round(dist)}m del centro "${selectedCenter.name}". Máximo permitido: ${selectedCenter.radius}m.`);
      }

      await checkIn({
        employeeId: employee.id,
        employeeName: employee.name,
        centerId: selectedCenter.id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        distance: dist,
        checkIn: new Date().toISOString(),
        checkOut: null,
        status: 'active'
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeSession) return;
    setLoading(true);
    try {
      await checkOut(activeSession.id, new Date().toISOString());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
      <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200 p-12 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-black text-slate-900 mb-4 uppercase tracking-tight">{employee.name}</h1>
          <div className="inline-flex flex-wrap justify-center gap-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
              <Briefcase className="w-4 h-4 text-tipsa-blue" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Contrata:</span>
              <span className="text-sm font-bold text-slate-900">{assignedContractor?.name || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
              <UserCog className="w-4 h-4 text-tipsa-blue" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Rol:</span>
              <span className="text-sm font-bold text-slate-900">{assignedRole?.name || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl shadow-sm border border-slate-100">
              <Clock className="w-4 h-4 text-tipsa-blue" />
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Turno:</span>
              <span className="text-sm font-bold text-slate-900">{employee.shift || 'N/A'}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-4 text-red-700">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p className="font-bold text-sm leading-relaxed">{error}</p>
          </div>
        )}

        <div className="space-y-8">
          <div>
            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Centro de Trabajo Seleccionado</label>
            <div className="grid grid-cols-1 gap-3">
              {allowedCenters.length > 0 ? (
                allowedCenters.map(c => (
                  <button
                    key={c.id}
                    disabled={!!activeSession}
                    onClick={() => setSelectedCenter(c)}
                    className={cn(
                      "flex items-center justify-between p-5 rounded-2xl border-2 transition-all text-left",
                      selectedCenter?.id === c.id 
                        ? "border-tipsa-blue bg-blue-50/50" 
                        : "border-slate-100 hover:border-slate-200 bg-white",
                      activeSession && selectedCenter?.id !== c.id && "opacity-50 grayscale"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <Building2 className={cn("w-6 h-6", selectedCenter?.id === c.id ? "text-tipsa-blue" : "text-slate-400")} />
                      <div>
                        <div className="font-bold text-slate-900">{c.name}</div>
                        <div className="text-xs font-medium text-slate-500">{c.address}</div>
                      </div>
                    </div>
                    {selectedCenter?.id === c.id && <CheckCircle2 className="w-6 h-6 text-tipsa-blue" />}
                  </button>
                ))
              ) : (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No tienes centros de trabajo asignados.<br/>Contacta con tu administrador.</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estado Actual</div>
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", activeSession ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                <span className="font-black text-slate-900 text-lg">{activeSession ? "ACTIVO" : "INACTIVO"}</span>
              </div>
            </div>
            <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Hora de Entrada</div>
              <div className="font-black text-slate-900 text-lg">
                {activeSession ? format(parseISO(activeSession.checkIn), 'HH:mm:ss') : '--:--:--'}
              </div>
            </div>
          </div>

          <button
            onClick={activeSession ? handleCheckOut : handleCheckIn}
            disabled={loading || (!activeSession && !selectedCenter)}
            className={cn(
              "w-full py-10 rounded-[2.5rem] font-black text-3xl shadow-xl transition-all flex items-center justify-center gap-4",
              activeSession 
                ? "bg-slate-900 text-white hover:bg-black shadow-slate-200" 
                : "bg-tipsa-blue text-white hover:bg-blue-700 shadow-blue-200 disabled:opacity-50 disabled:shadow-none"
            )}
          >
            {loading ? "Procesando..." : (
              <>
                {activeSession ? <LogOut className="w-10 h-10" /> : <Clock className="w-10 h-10" />}
                {activeSession ? "REGISTRAR SALIDA" : "REGISTRAR ENTRADA"}
              </>
            )}
          </button>

          <button
            onClick={onLogout}
            className="w-full py-4 text-slate-400 font-bold flex items-center justify-center gap-2 hover:text-red-500 transition-colors mt-4"
          >
            <LogOut className="w-5 h-5" /> CERRAR SESIÓN
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function AdminDashboard({ employees }: { employees: Employee[] }) {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [dateRange, setDateRange] = useState({
    from: format(new Date(), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsub = subscribeToCollection<AttendanceRecord>('attendance', setLogs);
    return () => unsub();
  }, []);

  const filteredLogs = logs.filter(log => {
    const logDate = format(parseISO(log.checkIn), 'yyyy-MM-dd');
    return logDate >= dateRange.from && logDate <= dateRange.to;
  });

  const stats = React.useMemo(() => {
    let totalHours = 0;
    let extraHours = 0;
    let lessHours = 0;

    filteredLogs.forEach(log => {
      if (log.checkOut) {
        const hours = differenceInHours(parseISO(log.checkOut), parseISO(log.checkIn));
        totalHours += hours;
        
        const emp = employees.find(e => e.id === log.employeeId);
        const stdHours = emp?.standardHours || 8;
        
        if (hours > stdHours) {
          extraHours += (hours - stdHours);
        } else if (hours < stdHours) {
          lessHours += (stdHours - hours);
        }
      }
    });

    return {
      totalEmployees: new Set(filteredLogs.map(l => l.employeeId)).size,
      totalHours,
      extraHours,
      lessHours
    };
  }, [filteredLogs, employees]);

  const chartData = filteredLogs.slice(0, 10).reverse().map(log => ({
    name: log.employeeName,
    hours: log.checkOut ? differenceInHours(parseISO(log.checkOut), parseISO(log.checkIn)) : 0
  }));

  return (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-6 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
          <input 
            type="date" 
            value={dateRange.from} 
            onChange={e => setDateRange({...dateRange, from: e.target.value})}
            className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
          />
        </div>
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
          <input 
            type="date" 
            value={dateRange.to} 
            onChange={e => setDateRange({...dateRange, to: e.target.value})}
            className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Users className="text-blue-600" />} label="Empleados" value={stats?.totalEmployees || 0} color="blue" />
        <StatCard icon={<Clock className="text-tipsa-blue" />} label="Total Horas" value={(stats?.totalHours || 0).toFixed(1) + 'h'} color="tipsa-blue" />
        <StatCard icon={<TrendingUp className="text-emerald-600" />} label="Horas Extras" value={'+' + (stats?.extraHours || 0).toFixed(1) + 'h'} color="emerald" />
        <StatCard icon={<TrendingDown className="text-red-600" />} label="Menos Horas" value={'-' + (stats?.lessHours || 0).toFixed(1) + 'h'} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-xl font-black text-slate-900 mb-8">Rendimiento Últimas Jornadas</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]} fill="#004A99" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-xl font-black text-slate-900 mb-8">Actividad Reciente</h3>
          <div className="space-y-4 max-h-[300px] overflow-auto pr-2 custom-scrollbar">
            {logs.map(log => (
              <div key={log.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-bold text-slate-400">
                    {log.employeeName[0]}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{log.employeeName}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">
                      {format(parseISO(log.checkIn), 'd MMM, HH:mm', { locale: es })}
                    </div>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase",
                  log.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                )}>
                  {log.status === 'active' ? 'Activo' : 'Cerrado'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeManagement({ employees, centers, contractors, roles, onUpdate }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[], roles: CustomRole[], onUpdate: () => void }) {
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing && editing.dni) {
        const isDuplicateDni = employees.some(emp => emp.dni === editing.dni && emp.id !== editing.id);
        if (isDuplicateDni) {
          throw new Error("El DNI/NIE ya está registrado en otro empleado.");
        }
      }

      await saveEmployee(editing);
      setEditing(null);
      // onUpdate() is no longer needed since we use real-time listeners, but we can keep it or remove it.
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este empleado?")) {
      try {
        await deleteEmployee(id);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const selectedRole = roles.find(r => r.id === editing?.roleId);
  const isEditingAdmin = editing?.role === 'admin' || Boolean(selectedRole?.isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Empleados</h3>
        <button 
          onClick={() => setEditing({ id: `emp${Date.now()}`, name: '', dni: '', role: 'employee', centerIds: [], area: '', shift: '', standardHours: 8 })}
          className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Nuevo Empleado
        </button>
      </div>

      {editing && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSave}
          className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Input label="Nombre Completo" value={editing.name} onChange={v => setEditing({...editing, name: v})} required />
            <Input label="DNI / NIE" value={editing.dni} onChange={v => setEditing({...editing, dni: v})} required />
            <Input label="Área de Trabajo" value={editing.area} onChange={v => setEditing({...editing, area: v})} />
            <Input label="Turno" value={editing.shift} onChange={v => setEditing({...editing, shift: v})} />
            <Input label="Fecha de Alta" type="date" value={editing.hireDate} onChange={v => setEditing({...editing, hireDate: v})} />
            <Input label="Fecha de Baja" type="date" value={editing.terminationDate} onChange={v => setEditing({...editing, terminationDate: v})} />
            <Input label="Horas Jornada" type="number" value={editing.standardHours} onChange={v => setEditing({...editing, standardHours: parseFloat(v)})} />
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contrata</label>
              <select 
                value={editing.contractorId || ''} 
                onChange={e => setEditing({...editing, contractorId: e.target.value})}
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
              >
                <option value="">Sin contrata (Interno)</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Rol Asignado</label>
              <select 
                value={editing.roleId || ''} 
                onChange={e => setEditing({...editing, roleId: e.target.value})}
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
              >
                <option value="">Seleccionar Rol...</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name} {r.isAdmin ? '(Admin)' : ''}</option>)}
              </select>
            </div>

            {isEditingAdmin && (
              <Input 
                label="Contraseña de Acceso Admin" 
                type="password" 
                value={editing.password} 
                onChange={v => setEditing({...editing, password: v})} 
                required 
              />
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Tipo de Acceso</label>
              <select 
                value={editing.role || 'employee'} 
                onChange={e => setEditing({...editing, role: e.target.value as any})}
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
              >
                <option value="employee">Empleado Estándar</option>
                <option value="admin">Administrador del Sistema</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Centros Asignados</label>
              <div className="flex flex-wrap gap-2">
                {centers.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const ids = editing.centerIds || [];
                      setEditing({...editing, centerIds: ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id]});
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                      (editing.centerIds || []).includes(c.id) ? "bg-tipsa-blue text-white border-tipsa-blue" : "bg-white text-slate-500 border-slate-200"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
            <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
              <Save className="w-5 h-5" /> Guardar Cambios
            </button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Área / Turno</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Alta / Baja</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Centros</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {employees.map(emp => (
              <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{emp.name}</div>
                  <div className="text-[10px] font-bold text-tipsa-blue uppercase">
                    {roles.find(r => r.id === emp.roleId)?.name || emp.role}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-slate-600">
                    {contractors.find(c => c.id === emp.contractorId)?.name || 'Interno'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm font-bold text-slate-700">{emp.area || '-'}</div>
                  <div className="text-[10px] font-bold text-slate-400">{emp.shift || '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-[10px] font-bold text-slate-700">Alta: {emp.hireDate ? format(parseISO(emp.hireDate), 'dd/MM/yy') : '-'}</div>
                  <div className="text-[10px] font-bold text-red-600">Baja: {emp.terminationDate ? format(parseISO(emp.terminationDate), 'dd/MM/yy') : '-'}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {emp.centerIds.map(cid => (
                      <span key={cid} className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600">
                        {centers.find(c => c.id === cid)?.name || cid}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button onClick={() => setEditing(emp)} className="p-2 hover:bg-blue-50 text-tipsa-blue rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(emp.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CenterManagement({ centers, onUpdate }: { centers: WorkCenter[], onUpdate: () => void }) {
  const [editing, setEditing] = useState<Partial<WorkCenter> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCenter(editing);
      setEditing(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este centro?")) {
      try {
        await deleteCenter(id);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Centros de Trabajo</h3>
        <button 
          onClick={() => setEditing({ id: `cent${Date.now()}`, name: '', address: '', latitude: 0, longitude: 0, radius: 100 })}
          className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Nuevo Centro
        </button>
      </div>

      {editing && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSave}
          className="bg-white p-8 rounded-[2rem] border-2 border-blue-100 shadow-xl space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input label="Nombre del Centro" value={editing.name} onChange={v => setEditing({...editing, name: v})} required />
            <Input label="Dirección" value={editing.address} onChange={v => setEditing({...editing, address: v})} required />
            <Input label="Latitud (Google Maps)" type="number" value={editing.latitude} onChange={v => setEditing({...editing, latitude: v === '' ? undefined : parseFloat(v)})} required />
            <Input label="Longitud (Google Maps)" type="number" value={editing.longitude} onChange={v => setEditing({...editing, longitude: v === '' ? undefined : parseFloat(v)})} required />
            <Input label="Radio de Marcaje (Metros)" type="number" value={editing.radius} onChange={v => setEditing({...editing, radius: v === '' ? undefined : parseFloat(v)})} required />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
            <button type="submit" className="bg-red-800 hover:bg-red-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-900/20 transition-colors">
              <Save className="w-5 h-5" /> Guardar Centro
            </button>
          </div>
        </motion.form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {centers.map(c => (
          <div key={c.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex justify-between items-start">
            <div className="flex gap-4">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center">
                <Building2 className="w-7 h-7 text-slate-400" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-lg">{c.name}</h4>
                <p className="text-sm text-slate-500 font-medium mb-2">{c.address}</p>
                <div className="flex gap-3">
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">LAT: {c.latitude}</div>
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">LNG: {c.longitude}</div>
                  <div className="text-[10px] font-bold text-tipsa-blue bg-blue-50 px-2 py-1 rounded">RADIO: {c.radius}m</div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(c)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-red-50 rounded-xl text-red-400">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractorManagement({ contractors, onUpdate }: { contractors: Contractor[], onUpdate: () => void }) {
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveContractor(editing);
      setEditing(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar esta contrata?")) {
      try {
        await deleteContractor(id);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Contratas</h3>
        <button 
          onClick={() => setEditing({ id: `cont${Date.now()}`, name: '' })}
          className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Nueva Contrata
        </button>
      </div>

      {editing && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSave}
          className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl space-y-6"
        >
          <div className="grid grid-cols-1 gap-6">
            <Input label="Nombre de la Contrata" value={editing.name} onChange={v => setEditing({...editing, name: v})} required />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
            <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
              <Save className="w-5 h-5" /> Guardar Cambios
            </button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {contractors.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-900">{c.name}</td>
                <td className="px-6 py-4 flex gap-2">
                  <button onClick={() => setEditing(c)} className="p-2 hover:bg-blue-50 text-tipsa-blue rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleManagement({ roles, onUpdate }: { roles: CustomRole[], onUpdate: () => void }) {
  const [editing, setEditing] = useState<Partial<CustomRole> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveRole(editing);
      setEditing(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este rol?")) {
      try {
        await deleteRole(id);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Roles</h3>
        <button 
          onClick={() => setEditing({ id: `role${Date.now()}`, name: '', isAdmin: false })}
          className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Nuevo Rol
        </button>
      </div>

      {editing && (
        <motion.form 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          onSubmit={handleSave}
          className="bg-white p-8 rounded-[2rem] border-2 border-slate-100 shadow-xl space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input label="Nombre del Rol" value={editing.name} onChange={v => setEditing({...editing, name: v})} required />
            <div className="flex items-center gap-3 pt-6">
              <input 
                type="checkbox" 
                id="isAdmin"
                checked={editing.isAdmin} 
                onChange={e => setEditing({...editing, isAdmin: e.target.checked})}
                className="w-5 h-5 rounded border-slate-300 text-tipsa-blue focus:ring-tipsa-blue"
              />
              <label htmlFor="isAdmin" className="text-sm font-bold text-slate-700">¿Es Administrador?</label>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
            <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
              <Save className="w-5 h-5" /> Guardar Cambios
            </button>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
              <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {roles.map(r => (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 font-bold text-slate-900">{r.name}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                    r.isAdmin ? "bg-red-100 text-red-600" : "bg-blue-100 text-tipsa-blue"
                  )}>
                    {r.isAdmin ? 'Admin' : 'Empleado'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button onClick={() => setEditing(r)} className="p-2 hover:bg-blue-50 text-tipsa-blue rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportsView({ employees, centers, contractors }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[] }) {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [filter, setFilter] = useState({ 
    employeeId: '', 
    centerId: '', 
    contractorId: '',
    isActive: 'all',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });
  
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

  useEffect(() => {
    const unsub = subscribeToCollection<AttendanceRecord>('attendance', setLogs);
    return () => unsub();
  }, []);

  const filteredEmployeesForSearch = employees.filter(e => {
    const matchesSearch = e.name.toLowerCase().includes(employeeSearch.toLowerCase());
    
    let isActiveMatch = true;
    if (filter.isActive !== 'all') {
      const isCurrentlyActive = !e.terminationDate || new Date(e.terminationDate) >= new Date();
      isActiveMatch = filter.isActive === 'active' ? isCurrentlyActive : !isCurrentlyActive;
    }

    return matchesSearch && isActiveMatch;
  });

  const filteredLogs = logs.filter(log => {
    const logDate = format(parseISO(log.checkIn), 'yyyy-MM-dd');
    const emp = employees.find(e => e.id === log.employeeId);
    
    let isActiveMatch = true;
    if (filter.isActive !== 'all' && emp) {
      const isCurrentlyActive = !emp.terminationDate || new Date(emp.terminationDate) >= new Date();
      isActiveMatch = filter.isActive === 'active' ? isCurrentlyActive : !isCurrentlyActive;
    }

    return (
      (!filter.employeeId || log.employeeId === filter.employeeId) &&
      (!filter.centerId || log.centerId === filter.centerId) &&
      (!filter.contractorId || emp?.contractorId === filter.contractorId) &&
      isActiveMatch &&
      logDate >= filter.startDate && logDate <= filter.endDate
    );
  });

  const getLogData = (log: AttendanceRecord) => {
    const emp = employees.find(e => e.id === log.employeeId);
    const stdHours = emp?.standardHours || 8;
    const workedHours = log.checkOut ? differenceInHours(parseISO(log.checkOut), parseISO(log.checkIn)) : 0;
    const diff = workedHours - stdHours;
    return { workedHours, stdHours, diff, emp };
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    
    // Header background
    doc.setFillColor(0, 74, 153); // TIPSA Blue
    doc.rect(0, 0, 210, 45, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('TIPSA', 14, 22);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text('SISTEMA DE GESTIÓN DE MARCAJES', 14, 32);
    
    doc.setFontSize(10);
    doc.text(`INFORME DE ASISTENCIA: ${filter.startDate} al ${filter.endDate}`, 14, 40);
    
    const tableData = filteredLogs.map(log => {
      const { workedHours, stdHours, diff } = getLogData(log);
      return [
        format(parseISO(log.checkIn), 'dd/MM/yy HH:mm'),
        log.checkOut ? format(parseISO(log.checkOut), 'HH:mm') : 'En curso',
        log.employeeName,
        stdHours + 'h',
        workedHours.toFixed(1) + 'h',
        diff > 0 ? '+' + diff.toFixed(1) + 'h' : '-',
        diff < 0 ? diff.toFixed(1) + 'h' : '-'
      ];
    });

    autoTable(doc, {
      head: [['INICIO', 'FIN', 'EMPLEADO', 'JORNADA', 'TOTAL', 'EXTRAS', 'MENOS']],
      body: tableData,
      startY: 50,
      styles: { font: 'helvetica', fontSize: 8 },
      headStyles: { 
        fillColor: [0, 74, 153], 
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center', textColor: [0, 150, 0] },
        6: { halign: 'center', textColor: [200, 0, 0] }
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { top: 50 }
    });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} - Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 285);
    }

    doc.save(`informe_tipsa_${filter.startDate}_${filter.endDate}.pdf`);
  };

  const exportExcel = () => {
    const data = filteredLogs.map(log => {
      const { workedHours, stdHours, diff, emp } = getLogData(log);
      return {
        Fecha: format(parseISO(log.checkIn), 'dd/MM/yyyy'),
        Entrada: format(parseISO(log.checkIn), 'HH:mm'),
        Salida: log.checkOut ? format(parseISO(log.checkOut), 'HH:mm') : 'En curso',
        Empleado: log.employeeName,
        Contrata: contractors.find(c => c.id === emp?.contractorId)?.name || 'Interno',
        Centro: centers.find(c => c.id === log.centerId)?.name || '-',
        Jornada: stdHours,
        Total: workedHours.toFixed(1),
        Extras: diff > 0 ? diff.toFixed(1) : 0,
        Menos: diff < 0 ? Math.abs(diff).toFixed(1) : 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asistencias");
    XLSX.writeFile(wb, `informe_${filter.startDate}_${filter.endDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end mb-8">
          <div className="space-y-2 relative">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtrar por Empleado</label>
            <div className="relative">
              <input 
                type="text"
                value={employeeSearch}
                onChange={e => {
                  setEmployeeSearch(e.target.value);
                  if (e.target.value.length >= 3) {
                    setShowEmployeeDropdown(true);
                  } else {
                    setShowEmployeeDropdown(false);
                  }
                  if (e.target.value === '') {
                    setFilter({...filter, employeeId: ''});
                  }
                }}
                onFocus={() => {
                  if (employeeSearch.length >= 3) setShowEmployeeDropdown(true);
                }}
                onBlur={() => setTimeout(() => setShowEmployeeDropdown(false), 200)}
                placeholder="Buscar (mín. 3 letras)"
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none pl-10"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            </div>
            
            {showEmployeeDropdown && employeeSearch.length >= 3 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-auto">
                {filteredEmployeesForSearch.length > 0 ? (
                  filteredEmployeesForSearch.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setFilter({...filter, employeeId: emp.id});
                        setEmployeeSearch(emp.name);
                        setShowEmployeeDropdown(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 font-bold text-sm text-slate-700 border-b border-slate-100 last:border-0"
                    >
                      {emp.name}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-sm text-slate-500 font-medium">No se encontraron empleados</div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
            <select 
              value={filter.isActive} 
              onChange={e => setFilter({...filter, isActive: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</label>
            <select 
              value={filter.contractorId} 
              onChange={e => setFilter({...filter, contractorId: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="">Todas las contratas</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro</label>
            <select 
              value={filter.centerId} 
              onChange={e => setFilter({...filter, centerId: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="">Todos los centros</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
            <input 
              type="date" 
              value={filter.startDate} 
              onChange={e => setFilter({...filter, startDate: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
            <input 
              type="date" 
              value={filter.endDate} 
              onChange={e => setFilter({...filter, endDate: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            />
          </div>
        </div>
        
        <div className="flex gap-2 mb-6">
          <button 
            onClick={exportPDF}
            className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
          >
            <FileText className="w-5 h-5" /> Exportar PDF
          </button>
          <button 
            onClick={exportExcel}
            className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-100"
          >
            <Download className="w-5 h-5" /> Exportar Excel
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-100">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada/Salida</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Jornada</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-emerald-600">Extras</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-red-600">Menos</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.map(log => {
                const { workedHours, stdHours, diff, emp } = getLogData(log);
                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {format(parseISO(log.checkIn), 'dd/MM/yy')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">{log.employeeName}</div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {contractors.find(c => c.id === emp?.contractorId)?.name || 'Interno'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {format(parseISO(log.checkIn), 'HH:mm')} - {log.checkOut ? format(parseISO(log.checkOut), 'HH:mm') : 'En curso'}
                    </td>
                    <td className="px-6 py-4 font-black text-slate-500">
                      {stdHours}h
                    </td>
                    <td className="px-6 py-4 font-black text-tipsa-blue">
                      {workedHours.toFixed(1)}h
                    </td>
                    <td className="px-6 py-4 font-black text-emerald-600">
                      {diff > 0 ? `+${diff.toFixed(1)}` : '-'}
                    </td>
                    <td className="px-6 py-4 font-black text-red-600">
                      {diff < 0 ? diff.toFixed(1) : '-'}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">
                      {centers.find(c => c.id === log.centerId)?.name || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KPIsView({ employees, centers, contractors }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[] }) {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [filter, setFilter] = useState({ 
    centerId: '', 
    contractorId: '',
    isActive: 'all',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsub = subscribeToCollection<AttendanceRecord>('attendance', setLogs);
    return () => unsub();
  }, []);

  const filteredLogs = logs.filter(log => {
    const logDate = format(parseISO(log.checkIn), 'yyyy-MM-dd');
    const emp = employees.find(e => e.id === log.employeeId);
    
    let isActiveMatch = true;
    if (filter.isActive !== 'all' && emp) {
      const isCurrentlyActive = !emp.terminationDate || new Date(emp.terminationDate) >= new Date();
      isActiveMatch = filter.isActive === 'active' ? isCurrentlyActive : !isCurrentlyActive;
    }

    return (
      (!filter.centerId || log.centerId === filter.centerId) &&
      (!filter.contractorId || emp?.contractorId === filter.contractorId) &&
      isActiveMatch &&
      logDate >= filter.startDate && logDate <= filter.endDate
    );
  });

  // Calculate KPIs
  const totalEmployees = new Set(filteredLogs.map(l => l.employeeId)).size;
  const totalHours = filteredLogs.reduce((acc, log) => {
    if (log.checkOut) {
      return acc + differenceInHours(parseISO(log.checkOut), parseISO(log.checkIn));
    }
    return acc;
  }, 0);
  const totalExtraHours = filteredLogs.reduce((acc, log) => {
    const emp = employees.find(e => e.id === log.employeeId);
    const stdHours = emp?.standardHours || 8;
    if (log.checkOut) {
      const worked = differenceInHours(parseISO(log.checkOut), parseISO(log.checkIn));
      if (worked > stdHours) {
        return acc + (worked - stdHours);
      }
    }
    return acc;
  }, 0);
  
  // Calculate Absenteeism
  // This is a simplified calculation: (Expected Hours - Actual Hours) / Expected Hours * 100
  // In a real scenario, this would involve checking schedules and leaves.
  const expectedHours = totalEmployees * 8 * (differenceInHours(parseISO(filter.endDate), parseISO(filter.startDate)) / 24 + 1);
  const absenteeism = expectedHours > 0 ? Math.max(0, ((expectedHours - totalHours) / expectedHours) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end mb-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
            <select 
              value={filter.isActive} 
              onChange={e => setFilter({...filter, isActive: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</label>
            <select 
              value={filter.contractorId} 
              onChange={e => setFilter({...filter, contractorId: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="">Todas las contratas</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro</label>
            <select 
              value={filter.centerId} 
              onChange={e => setFilter({...filter, centerId: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            >
              <option value="">Todos los centros</option>
              {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
            <input 
              type="date" 
              value={filter.startDate} 
              onChange={e => setFilter({...filter, startDate: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
            <input 
              type="date" 
              value={filter.endDate} 
              onChange={e => setFilter({...filter, endDate: e.target.value})}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            icon={<Users className="text-tipsa-blue" />}
            label="Empleados Activos"
            value={totalEmployees}
            color="blue"
          />
          <StatCard
            icon={<Clock className="text-emerald-600" />}
            label="Horas Trabajadas"
            value={totalHours.toFixed(1)}
            color="emerald"
          />
          <StatCard
            icon={<BarChart3 className="text-tipsa-blue" />}
            label="Horas Extras"
            value={totalExtraHours.toFixed(1)}
            color="blue"
          />
          <StatCard
            icon={<UserCog className="text-red-600" />}
            label="Absentismo"
            value={`${absenteeism}%`}
            color="red"
          />
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required = false }: { label: string, value: any, onChange: (v: string) => void, type?: string, required?: boolean }) {
  return (
    <div className="space-y-2">
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none transition-all"
      />
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode, label: string, value: number | string, color: string }) {
  const colors: any = {
    blue: "bg-blue-50 border-blue-100",
    emerald: "bg-emerald-50 border-emerald-100",
    "tipsa-blue": "bg-blue-50 border-blue-100",
    red: "bg-red-50 border-red-100"
  };

  return (
    <div className={cn("p-8 rounded-[2rem] border shadow-sm", colors[color])}>
      <div className="flex items-center gap-5">
        <div className="p-4 bg-white rounded-2xl shadow-sm">
          {React.cloneElement(icon as React.ReactElement, { className: "w-8 h-8" })}
        </div>
        <div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{label}</div>
          <div className="text-4xl font-black text-slate-900 leading-none">{value}</div>
        </div>
      </div>
    </div>
  );
}
