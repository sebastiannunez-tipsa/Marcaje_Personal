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
  StickyNote,
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
  RefreshCw,
  Briefcase,
  UserCog,
  Key,
  Lock,
  Mail,
  X,
  Upload,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, differenceInHours, differenceInMinutes, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
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
  Pie,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AttendanceRecord, Employee, WorkCenter, Contractor, CustomRole, Note } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { useTheme } from './ThemeContext';

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

const validateDNI = (dni: string) => {
  if (dni.toUpperCase() === 'ADMIN01') return true;
  const dniRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/i;
  const nieRegex = /^[XYZ][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/i;
  
  if (!dniRegex.test(dni) && !nieRegex.test(dni)) return false;

  let str = dni.toUpperCase();
  let firstChar = str.charAt(0);
  
  if (firstChar === 'X') str = '0' + str.substring(1);
  else if (firstChar === 'Y') str = '1' + str.substring(1);
  else if (firstChar === 'Z') str = '2' + str.substring(1);

  const number = parseInt(str.substring(0, 8));
  const letter = str.charAt(8);
  const validLetters = "TRWAGMYFPDXBNJZSQVHLCKE";
  
  return validLetters.charAt(number % 23) === letter;
};

const calculateSimilarity = (s1: string, s2: string) => {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = (s1: string, s2: string) => {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  return (longer.length - editDistance(longer, shorter)) / longer.length;
};

const safeParseISO = (dateStr: string | undefined) => {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

const safeFormatDate = (dateStr: string | undefined, formatStr: string = 'dd/MM/yy') => {
  const date = safeParseISO(dateStr);
  if (!date) return '-';
  return format(date, formatStr);
};

const parseExcelDate = (val: any) => {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date (days since Dec 30, 1899)
    const date = new Date((val - 25569) * 86400 * 1000);
    return format(date, 'yyyy-MM-dd');
  }
  if (typeof val === 'string') {
    // Try to parse DD/MM/YYYY or DD-MM-YYYY
    const parts = val.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) return val; // Already YYYY-MM-DD
      if (parts[2].length === 4) {
        // DD/MM/YYYY -> YYYY-MM-DD
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  return String(val);
};

import { initDB, subscribeToCollection, saveEmployee, saveCenter, saveContractor, saveRole, checkIn, checkOut, updateAttendanceRecord, subscribeToActiveSession, subscribeToAttendanceRange, deleteEmployee, deleteCenter, deleteContractor, deleteRole, saveNote, deleteNote } from './db';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

function NotesView({ contractors, employees, currentUser, showSuccess, showError }: { contractors: Contractor[], employees: Employee[], currentUser: any, showSuccess: (m: string) => void, showError: (m: string) => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    contractorId: '',
    employeeId: '',
    complementType: '',
    content: '',
    recipientEmail: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setNotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Note)));
    }, (error) => {
      console.error("Error en el listener de notas:", error);
      // No lanzamos error para evitar que la app se rompa, solo logueamos
    });
  }, []);

  const normalizeString = (str: string) => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const normalizedQuery = normalizeString(searchQuery);
    const normalizedContent = normalizeString(note.content);
    const normalizedType = normalizeString(note.complementType);
    const normalizedCreatedBy = normalizeString(note.createdBy || '');
    
    const contractorName = note.contractorId === 'generico' ? 'Genérico' : contractors.find(c => c.id === note.contractorId)?.name || '';
    const employeeName = note.employeeId === 'generico' ? 'Genérico' : employees.find(e => e.id === note.employeeId)?.name || '';
    
    return normalizedContent.includes(normalizedQuery) || 
           normalizedType.includes(normalizedQuery) || 
           normalizedCreatedBy.includes(normalizedQuery) ||
           normalizeString(contractorName).includes(normalizedQuery) ||
           normalizeString(employeeName).includes(normalizedQuery);
  });

  const handleSave = async (sendEmail: boolean = false) => {
    if (!formData.contractorId || !formData.employeeId || !formData.complementType || !formData.content) {
      showError('Por favor rellene todos los campos');
      return;
    }
    if (formData.content.length > 250) {
      showError('La nota no puede exceder los 250 caracteres');
      return;
    }

    if (sendEmail) {
      if (!formData.recipientEmail) {
        showError('Por favor ingrese un email de destinatario');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.recipientEmail)) {
        showError('Por favor ingrese un email válido');
        return;
      }
    }

    try {
      await saveNote({
        contractorId: formData.contractorId,
        employeeId: formData.employeeId,
        complementType: formData.complementType,
        content: formData.content,
        createdAt: new Date().toISOString(),
        createdBy: currentUser?.email || 'Sistema'
      });

      if (sendEmail) {
        const subject = `Comunicacion interna de horas y complementos Tipsa ${format(new Date(), 'dd/MM/yyyy')}`;
        const contractorName = formData.contractorId === 'generico' ? 'Genérico' : contractors.find(c => c.id === formData.contractorId)?.name || 'N/A';
        const employeeName = formData.employeeId === 'generico' ? 'Genérico' : employees.find(e => e.id === formData.employeeId)?.name || 'N/A';

        const body = `RESUMEN DE NOTA / REGISTRO
--------------------------
FECHA: ${format(new Date(), 'dd/MM/yyyy HH:mm')}
CONTRATA: ${contractorName}
EMPLEADO: ${employeeName}
TIPO DE COMPLEMENTO: ${formData.complementType}

CONTENIDO:
${formData.content}

--------------------------
Enviado desde el Sistema de Gestión Tipsa`;

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(formData.recipientEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(gmailUrl, '_blank');
      }

      setIsModalOpen(false);
      setFormData({ contractorId: '', employeeId: '', complementType: '', content: '', recipientEmail: '' });
      showSuccess(sendEmail ? 'Nota guardada y correo preparado' : 'Nota guardada correctamente');
    } catch (error) {
      console.error("Error saving note:", error);
      showError('Error al guardar la nota. Verifique sus permisos.');
    }
  };

  const filteredEmployees = employees.filter(e => e.contractorId === formData.contractorId);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Notas y Registros</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nueva Nota
        </button>
      </div>

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          placeholder="Buscar por palabra clave, empleado, contrata o tipo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-11 pr-4 py-4 bg-white border border-slate-100 rounded-3xl text-sm font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-tipsa-blue focus:border-transparent shadow-sm transition-all"
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {filteredNotes.length > 0 ? (
          filteredNotes.map(note => (
            <div key={note.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                    <StickyNote className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900 uppercase tracking-widest">
                      {note.complementType}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {safeFormatDate(note.createdAt, 'dd/MM/yyyy HH:mm')} · Por {note.createdBy}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-slate-50 p-3 rounded-2xl">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Contrata</div>
                  <div className="text-xs font-bold text-slate-700">
                    {note.contractorId === 'generico' ? 'Genérico' : (contractors.find(c => c.id === note.contractorId)?.name || '-')}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empleado</div>
                  <div className="text-xs font-bold text-slate-700">
                    {note.employeeId === 'generico' ? 'Genérico' : (employees.find(e => e.id === note.employeeId)?.name || '-')}
                  </div>
                </div>
              </div>

              <div className="text-sm text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-2xl border border-slate-50">
                {note.content}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
            <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400 font-bold italic">
              {notes.length === 0 ? 'No hay notas registradas aún.' : 'No se encontraron notas que coincidan con la búsqueda.'}
            </p>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Nueva Nota / Registro</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Complete los detalles del registro</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-xl transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contrata</label>
                  <select
                    value={formData.contractorId}
                    onChange={(e) => setFormData({ ...formData, contractorId: e.target.value, employeeId: '' })}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all"
                  >
                    <option value="">Seleccionar Contrata</option>
                    <option value="generico">Genérico</option>
                    {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Empleado</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    disabled={!formData.contractorId}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all disabled:opacity-50"
                  >
                    <option value="">Seleccionar Empleado</option>
                    {formData.contractorId && <option value="generico">Genérico</option>}
                    {filteredEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Complemento</label>
                  <input
                    type="text"
                    value={formData.complementType}
                    onChange={(e) => setFormData({ ...formData, complementType: e.target.value })}
                    placeholder="Ej: Horas Nocturnas, Festivos..."
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Notas (máx. 250 caracteres)</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={6}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all resize-none"
                    placeholder="Escriba aquí los detalles..."
                  />
                  <div className="flex justify-end">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${formData.content.length > 250 ? 'text-red-600' : 'text-slate-400'}`}>
                      {formData.content.length} / 250
                    </span>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2 pt-4 border-t border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Destinatario (opcional para Guardar y Enviar)</label>
                  <input
                    type="email"
                    value={formData.recipientEmail}
                    onChange={(e) => setFormData({ ...formData, recipientEmail: e.target.value })}
                    placeholder="email@ejemplo.com"
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-900 transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  className="flex-1 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  <Mail className="w-4 h-4" /> Guardar y Enviar
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  className="flex-1 bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                >
                  Guardar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loginCenterId, setLoginCenterId] = useState<string>('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [centers, setCenters] = useState<WorkCenter[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [view, setView] = useState<'login' | 'employee' | 'admin'>('login');
  const [adminSubView, setAdminSubView] = useState<'dashboard' | 'employees' | 'centers' | 'reports' | 'contractors' | 'roles' | 'upload' | 'notes' | 'settings' | 'kpis'>('dashboard');
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{message: string, onConfirm: () => void} | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showSuccess = (msg: string) => setNotification({ message: msg, type: 'success' });
  const showError = (msg: string) => {
    try {
      const parsed = JSON.parse(msg);
      setNotification({ message: parsed.error || msg, type: 'error' });
    } catch {
      setNotification({ message: msg, type: 'error' });
    }
  };

  const confirm = (message: string, onConfirm: () => void) => {
    setConfirmDialog({ message, onConfirm });
  };

  useEffect(() => {
    initDB();
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      console.log("Auth state changed:", user ? `User ${user.uid}` : "No user");
      if (user) {
        setIsAuthReady(true);
        setAuthError(null);
      } else {
        setIsAuthReady(false);
        try {
          console.log("Attempting anonymous sign-in...");
          await signInAnonymously(auth);
        } catch (err: any) {
          console.error("Error in anonymous sign-in:", err);
          if (err.code === 'auth/admin-restricted-operation') {
            setAuthError("La autenticación anónima está desactivada. Por favor, actívala en la consola de Firebase o inicia sesión con Google.");
          } else {
            setAuthError("Error de conexión con el servicio de autenticación.");
          }
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    console.log("Auth is ready, current user:", auth.currentUser?.uid, "isAnonymous:", auth.currentUser?.isAnonymous);

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

  useEffect(() => {
    const admin = employees.find(e => e.name === 'Administrador' && e.dni === 'ADMIN01');
    if (admin) {
      saveEmployee({ ...admin, dni: 'X2224358M' });
    }
  }, [employees]);

  const handleLogin = async (employee: Employee, centerId: string, asAdmin: boolean = false) => {
    setCurrentUser(employee);
    setLoginCenterId(centerId);
    
    // Link Firebase UID to Employee record to enable Firestore security rules
    if (auth.currentUser && employee.firebaseUid !== auth.currentUser.uid) {
      try {
        await saveEmployee({ ...employee, firebaseUid: auth.currentUser.uid });
      } catch (err) {
        console.error("Error linking Firebase UID:", err);
      }
    }

    const assignedRole = roles.find(r => r.id === employee.roleId);
    const hasAdminPrivileges = employee.role === 'admin' || assignedRole?.isAdmin;
    
    // Also save to a dedicated admins collection for more robust security rules
    if (hasAdminPrivileges && auth.currentUser) {
      try {
        const { setDoc, doc } = await import('firebase/firestore');
        await setDoc(doc(db, 'admins', auth.currentUser.uid), {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email,
          employeeId: employee.id,
          linkedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error("Error saving to admins collection:", err);
      }
    }

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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors duration-300">
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-6 z-[100] p-4 rounded-2xl shadow-2xl border-2 flex items-center gap-3 min-w-[300px] ${
              notification.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                : 'bg-red-50 border-red-100 text-red-800'
            }`}
          >
            <div className={`p-2 rounded-xl ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
              {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-white" /> : <AlertCircle className="w-5 h-5 text-white" />}
            </div>
            <p className="font-bold text-sm flex-1">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
              <X className="w-4 h-4 opacity-50" />
            </button>
          </motion.div>
        )}

        {confirmDialog && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl border border-slate-100"
            >
              <div className="bg-amber-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">¿Confirmar acción?</h3>
              <p className="text-slate-500 font-bold mb-8 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDialog(null)}
                  className="flex-1 py-4 px-6 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className="flex-1 py-4 px-6 rounded-2xl font-black text-sm bg-tipsa-blue text-white shadow-lg shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <header className="bg-slate-800 dark:bg-slate-950 border-b border-slate-700 dark:border-slate-800 px-6 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-tipsa-blue p-2 rounded-xl">
            <Clock className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Sistema Control Horario - <span className="text-blue-400">PASeMarc</span></h1>
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
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2.5 hover:bg-slate-700 rounded-xl text-slate-300 transition-all border border-transparent hover:border-slate-600"
              title="Cambiar tema"
            >
              {theme === 'dark' ? <Monitor className="w-5 h-5" /> : <Smartphone className="w-5 h-5" />}
            </button>
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

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {view === 'admin' && (
          <aside className="w-full md:w-64 bg-slate-800 dark:bg-slate-950 border-b md:border-b-0 md:border-r border-slate-700 dark:border-slate-800 p-2 md:p-4 flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible scrollbar-hide">
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
            <AdminNavButton 
              active={adminSubView === 'upload'} 
              onClick={() => setAdminSubView('upload')}
              icon={<Upload className="w-5 h-5" />}
              label="Subida de Datos"
            />
            <AdminNavButton 
              active={adminSubView === 'notes'} 
              onClick={() => setAdminSubView('notes')}
              icon={<StickyNote className="w-5 h-5" />}
              label="Notas y Registros"
            />
            <AdminNavButton 
              active={adminSubView === 'settings'} 
              onClick={() => setAdminSubView('settings')}
              icon={<Settings className="w-5 h-5" />}
              label="Configuración"
            />
          </aside>
        )}

        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full overflow-auto">
          <AnimatePresence mode="wait">
            {view === 'login' && (
              <LoginView 
                employees={employees} 
                centers={centers} 
                contractors={contractors}
                roles={roles} 
                isAdminLogin={isAdminLogin} 
                isAuthReady={isAuthReady}
                authError={authError}
                onGoogleLogin={handleGoogleLogin}
                onLogin={(emp, cid, asAdmin) => handleLogin(emp, cid, asAdmin)} 
                showSuccess={showSuccess}
                showError={showError}
              />
            )}

            {view === 'employee' && currentUser && (
              <EmployeeView employee={currentUser} centers={centers} roles={roles} contractors={contractors} initialCenterId={loginCenterId} onLogout={handleLogout} />
            )}

            {view === 'admin' && currentUser && (
              <div className="space-y-6">
                {adminSubView === 'dashboard' && <AdminDashboard employees={employees} centers={centers} currentUser={currentUser} />}
                {adminSubView === 'employees' && <EmployeeManagement employees={employees} centers={centers} contractors={contractors} roles={roles} onUpdate={fetchData} showSuccess={showSuccess} showError={showError} confirm={confirm} />}
                {adminSubView === 'centers' && <CenterManagement centers={centers} onUpdate={fetchData} showSuccess={showSuccess} showError={showError} confirm={confirm} />}
                {adminSubView === 'reports' && <ReportsView employees={employees} centers={centers} contractors={contractors} currentUser={currentUser} />}
                {adminSubView === 'kpis' && <KPIsView employees={employees} centers={centers} contractors={contractors} />}
                {adminSubView === 'contractors' && <ContractorManagement contractors={contractors} onUpdate={fetchData} showSuccess={showSuccess} showError={showError} confirm={confirm} />}
                {adminSubView === 'roles' && <RoleManagement roles={roles} onUpdate={fetchData} showSuccess={showSuccess} showError={showError} confirm={confirm} />}
                {adminSubView === 'upload' && <DataUploadView employees={employees} centers={centers} contractors={contractors} roles={roles} onUpdate={fetchData} showSuccess={showSuccess} showError={showError} />}
                {adminSubView === 'notes' && <NotesView contractors={contractors} employees={employees} currentUser={currentUser} showSuccess={showSuccess} showError={showError} />}
                {adminSubView === 'settings' && <SettingsView />}
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function LoginView({ employees, centers, contractors, roles, isAdminLogin, isAuthReady, authError, onGoogleLogin, onLogin, showSuccess, showError }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[], roles: CustomRole[], isAdminLogin: boolean, isAuthReady: boolean, authError: string | null, onGoogleLogin: () => void, onLogin: (e: Employee, centerId: string, asAdmin: boolean) => void, showSuccess: (m: string) => void, showError: (m: string) => void }) {
  const [selectedCenterId, setSelectedCenterId] = useState<string>('');
  const [selectedContractorId, setSelectedContractorId] = useState<string>('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<'employee' | 'admin' | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);

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
        id: 'admin',
        name: 'Administrador',
        dni: 'X2224358M',
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
      showSuccess("Migración completada con éxito.");
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
      // Admin access: show only those with admin privileges
      return hasAdminPrivileges;
    } else {
      // Employee access: show only normal employees (even if they have admin roles)
      // but exclude pure administrators (role === 'admin')
      if (emp.role === 'admin') return false;
      const matchesCenter = !selectedCenterId || emp.centerIds.includes(selectedCenterId);
      const matchesContractor = !selectedContractorId || 
        (selectedContractorId === 'interno' ? !emp.contractorId : emp.contractorId === selectedContractorId);
      return matchesCenter && matchesContractor;
    }
  });

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId);
  const assignedRole = roles.find(r => r.id === selectedEmployee?.roleId);
  const isStrictAdmin = selectedEmployee?.role === 'admin';
  const isRoleAdmin = Boolean(assignedRole?.isAdmin);
  const hasAdminPrivileges = isStrictAdmin || isRoleAdmin;
  const needsChoice = !isAdminLogin && hasAdminPrivileges;

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

    setIsDetecting(true);
    setError(null);

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
      setIsDetecting(false);
    }, (err) => {
      setError("Error al obtener ubicación: " + err.message);
      setIsDetecting(false);
    }, { enableHighAccuracy: true, timeout: 10000 });
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
            <>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">1. Selecciona Centro</label>
                  <button 
                    onClick={detectNearestCenter}
                    disabled={isDetecting}
                    className="text-[10px] font-bold text-tipsa-blue hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                  >
                    <MapPin className={cn("w-3 h-3", isDetecting && "animate-bounce")} /> 
                    {isDetecting ? 'Detectando...' : 'Detectar cercano'}
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

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">2. Selecciona Contrata</label>
                <select
                  value={selectedContractorId}
                  onChange={(e) => {
                    setSelectedContractorId(e.target.value);
                    setSelectedEmployeeId('');
                  }}
                  className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
                >
                  <option value="">Seleccionar Contrata...</option>
                  <option value="interno">Personal Interno</option>
                  {contractors.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {isAdminLogin ? 'Selecciona Administrador' : '3. Selecciona Empleado'}
            </label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => {
                setSelectedEmployeeId(e.target.value);
                setLoginMode(null);
              }}
              disabled={!isAdminLogin && (!selectedCenterId || !selectedContractorId)}
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
                className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue dark:text-white"
              />
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={!selectedEmployeeId || (needsChoice && !loginMode) || (showPassword && !password)}
            className="w-full py-4 bg-tipsa-blue text-white rounded-xl font-black text-lg shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:shadow-none mt-4"
          >
            ACCEDER
          </button>

          {authError && (
            <div className="mt-4 p-6 bg-red-50 border-2 border-red-200 rounded-[2rem] text-center space-y-4 shadow-lg shadow-red-100">
              <div className="bg-red-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-black text-red-900 uppercase tracking-tight">Error de Configuración</p>
                <p className="text-[11px] font-bold text-red-700 leading-relaxed">
                  La autenticación anónima está desactivada en tu proyecto de Firebase. 
                  Esto impide que el sistema de fichaje funcione correctamente.
                </p>
              </div>
              
              <div className="bg-white/50 p-3 rounded-xl text-left border border-red-100">
                <p className="text-[9px] font-black text-red-800 uppercase mb-1">Cómo solucionarlo:</p>
                <ol className="text-[9px] text-red-700 space-y-1 list-decimal ml-3 font-medium">
                  <li>Ve a la Consola de Firebase</li>
                  <li>Authentication &gt; Sign-in method</li>
                  <li>Habilita el proveedor "Anónimo"</li>
                </ol>
              </div>

              <button
                onClick={onGoogleLogin}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-black text-xs hover:bg-red-700 transition-all flex items-center justify-center gap-2 shadow-md shadow-red-200"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                ENTRAR CON GOOGLE (ADMIN)
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

function SettingsView() {
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(theme);

  useEffect(() => {
    setSelectedTheme(theme);
  }, [theme]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Configuración</h2>
      </div>

      <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Apariencia</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Elige cómo se ve la aplicación en tu dispositivo.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                onClick={() => setSelectedTheme('light')}
                className={cn(
                  "flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all",
                  selectedTheme === 'light' 
                    ? "border-tipsa-blue bg-blue-50 dark:bg-blue-900/20" 
                    : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"
                )}
              >
                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <Monitor className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-center">
                  <div className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-widest">Claro</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Tema tradicional</div>
                </div>
              </button>

              <button
                onClick={() => setSelectedTheme('dark')}
                className={cn(
                  "flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all",
                  selectedTheme === 'dark' 
                    ? "border-tipsa-blue bg-blue-50 dark:bg-blue-900/20" 
                    : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"
                )}
              >
                <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm">
                  <Smartphone className="w-6 h-6 text-white" />
                </div>
                <div className="text-center">
                  <div className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-widest">Oscuro</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Ideal para la noche</div>
                </div>
              </button>

              <button
                onClick={() => setSelectedTheme('system')}
                className={cn(
                  "flex flex-col items-center gap-4 p-6 rounded-3xl border-2 transition-all",
                  selectedTheme === 'system' 
                    ? "border-tipsa-blue bg-blue-50 dark:bg-blue-900/20" 
                    : "border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600"
                )}
              >
                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center shadow-sm">
                  <RefreshCw className="w-6 h-6 text-slate-400" />
                </div>
                <div className="text-center">
                  <div className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-widest">Sistema</div>
                  <div className="text-[10px] font-bold text-slate-400 mt-1">Sincroniza con tu dispositivo</div>
                </div>
              </button>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setTheme(selectedTheme)}
                className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all"
              >
                Aplicar Cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-shrink-0 md:w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap",
        active 
          ? "bg-tipsa-blue text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-300 dark:text-slate-400 hover:bg-slate-700 dark:hover:bg-slate-800 hover:text-white dark:hover:text-white"
      )}
    >
      {icon}
      <span className="md:inline">{label}</span>
    </button>
  );
}

function EmployeeView({ employee, centers, roles, contractors, initialCenterId, onLogout }: { employee: Employee, centers: WorkCenter[], roles: CustomRole[], contractors: Contractor[], initialCenterId?: string, onLogout: () => void }) {
  const [activeSession, setActiveSession] = useState<AttendanceRecord | null>(null);
  const [lastSession, setLastSession] = useState<AttendanceRecord | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupName, setBackupName] = useState('');
  const [selectedCenter, setSelectedCenter] = useState<WorkCenter | null>(
    centers.find(c => c.id === initialCenterId) || null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

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

    // Fetch last session to check 30min margin
    const unsubLast = subscribeToCollection<AttendanceRecord>('attendance', (records) => {
      const empRecords = records
        .filter(r => r.employeeId === employee.id && r.status === 'completed')
        .sort((a, b) => new Date(b.checkOut!).getTime() - new Date(a.checkOut!).getTime());
      setLastSession(empRecords[0] || null);
    });

    return () => {
      unsub();
      unsubLast();
    };
  }, [employee.id, centers]);

  const handleCheckIn = async (realBackupName?: string) => {
    const actualBackupName = typeof realBackupName === 'string' ? realBackupName : null;
    if (!selectedCenter) {
      setError("Por favor, selecciona un centro de trabajo.");
      return;
    }

    const isBackup = employee.name.toLowerCase().includes('backup') && employee.dni.toLowerCase() === 'backup';
    if (isBackup && !actualBackupName) {
      setShowBackupModal(true);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Check 30 min margin
      if (lastSession && lastSession.checkOut) {
        const cOut = safeParseISO(lastSession.checkOut);
        const diff = cOut ? differenceInMinutes(new Date(), cOut) : 0;
        if (diff < 30) {
          throw new Error(`Debes esperar 30 minutos entre jornadas. Faltan ${30 - diff} minutos.`);
        }
      }

      const pos = await new Promise<GeolocationPosition>((res, rej) => {
        const timeoutId = setTimeout(() => rej(new Error("Tiempo de espera agotado al obtener ubicación. Revisa los permisos de GPS.")), 10000);
        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(timeoutId); res(p); },
          (e) => { clearTimeout(timeoutId); rej(e); },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });

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
        status: 'active',
        backupRealName: actualBackupName || null
      });
      
      setSuccess("¡Entrada registrada con éxito!");
      setShowBackupModal(false);
      setTimeout(() => onLogout(), 2000);
    } catch (err: any) {
      setError(err.message || "Error desconocido al registrar entrada");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!activeSession) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await checkOut(activeSession.id, new Date().toISOString());
      setSuccess("¡Salida registrada con éxito!");
      setTimeout(() => onLogout(), 2000);
    } catch (err: any) {
      setError(err.message || "Error desconocido al registrar salida");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto w-full">
      {showBackupModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100"
          >
            <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Identificación Backup</h3>
            <p className="text-slate-500 font-bold mb-6">Por favor, introduce tu nombre completo para este registro.</p>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="font-bold text-xs">{error}</p>
              </div>
            )}
            
            <div className="space-y-4 mb-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo (Máx. 30 caracteres)</label>
                <input 
                  type="text" 
                  maxLength={30}
                  value={backupName}
                  onChange={e => setBackupName(e.target.value)}
                  placeholder="Ej: Juan Pérez García"
                  className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setShowBackupModal(false)}
                className="flex-1 py-4 px-6 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button 
                disabled={backupName.trim().length < 3}
                onClick={() => handleCheckIn(backupName.trim())}
                className="flex-1 py-4 px-6 rounded-2xl font-black text-sm bg-tipsa-blue text-white shadow-lg shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest disabled:opacity-50 disabled:hover:scale-100"
              >
                Confirmar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <div className="bg-white rounded-2xl md:rounded-[3rem] shadow-2xl shadow-slate-200 p-6 md:p-12 border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 uppercase tracking-tight">{employee.name}</h1>
          <div className="inline-flex flex-wrap justify-center gap-2 md:gap-4 p-4 md:p-6 bg-slate-50 rounded-2xl md:rounded-3xl border border-slate-100 shadow-inner">
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
          <div className="mb-8 p-5 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-4 text-red-700 animate-shake">
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p className="font-bold text-sm leading-relaxed">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-8 p-5 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start gap-4 text-emerald-700 animate-bounce-subtle">
            <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
            <p className="font-bold text-sm leading-relaxed">{success}</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estado Actual</div>
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-full", activeSession ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                <span className="font-black text-slate-900 text-lg">{activeSession ? "ACTIVO" : "INACTIVO"}</span>
              </div>
            </div>
            <div className="p-4 md:p-6 rounded-2xl md:rounded-3xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Hora de Entrada</div>
              <div className="font-black text-slate-900 text-lg">
                {activeSession ? safeFormatDate(activeSession.checkIn, 'HH:mm:ss') : '--:--:--'}
              </div>
            </div>
          </div>

          <button
            onClick={() => activeSession ? handleCheckOut() : handleCheckIn()}
            disabled={loading || (!activeSession && !selectedCenter)}
            className={cn(
              "w-full py-6 md:py-10 rounded-2xl md:rounded-[2.5rem] font-black text-xl md:text-3xl shadow-xl transition-all flex items-center justify-center gap-4",
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

function AttendanceEditModal({ 
  record, 
  employee, 
  center, 
  onClose, 
  onSave, 
  currentUser 
}: { 
  record: AttendanceRecord, 
  employee: Employee | undefined, 
  center: WorkCenter | undefined, 
  onClose: () => void, 
  onSave: (updated: Partial<AttendanceRecord>) => void,
  currentUser: Employee | null
}) {
  const [checkIn, setCheckIn] = useState(record.checkIn.substring(0, 16));
  const [checkOut, setCheckOut] = useState(record.checkOut ? record.checkOut.substring(0, 16) : '');
  const [error, setError] = useState<string | null>(null);

  const cIn = safeParseISO(checkIn);
  const cOut = safeParseISO(checkOut);
  const hours = (cIn && cOut) ? differenceInHours(cOut, cIn) : 0;
  const stdHours = employee?.standardHours || 8;
  const extraHours = hours > stdHours ? hours - stdHours : 0;
  const lessHours = hours < stdHours ? stdHours - hours : 0;

  const handleSave = () => {
    if (checkOut && new Date(checkOut) <= new Date(checkIn)) {
      setError("La fecha de salida debe ser posterior a la de entrada.");
      return;
    }
    onSave({
      id: record.id,
      checkIn: new Date(checkIn).toISOString(),
      checkOut: checkOut ? new Date(checkOut).toISOString() : null,
      status: checkOut ? 'completed' : 'active',
      modifiedBy: currentUser?.name || 'Admin',
      modifiedAt: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl border border-slate-100 overflow-y-auto max-h-[90vh]"
      >
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Editar Registro</h3>
            <p className="text-slate-500 font-bold">Detalles de jornada de {employee?.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="font-bold text-xs">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Empleado</div>
              <div className="font-bold text-slate-900">{employee?.name} ({employee?.dni})</div>
              {record.backupRealName && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <div className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Identificado como</div>
                  <div className="text-sm font-black text-amber-700">{record.backupRealName}</div>
                </div>
              )}
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Centro</div>
              <div className="font-bold text-slate-900">{center?.name}</div>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado</div>
              <div className={cn(
                "font-black uppercase text-xs",
                record.status === 'active' ? "text-emerald-600" : "text-slate-500"
              )}>
                {record.status === 'active' ? 'Activo' : 'Cerrado'}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
              <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Horas</div>
              <div className="text-2xl font-black text-tipsa-blue">{hours.toFixed(1)}h</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Extras</div>
                <div className="text-xl font-black text-emerald-600">+{extraHours.toFixed(1)}h</div>
              </div>
              <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Menos</div>
                <div className="text-xl font-black text-red-600">-{lessHours.toFixed(1)}h</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada</label>
            <input 
              type="datetime-local" 
              value={checkIn}
              onChange={e => setCheckIn(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salida</label>
            <input 
              type="datetime-local" 
              value={checkOut}
              onChange={e => setCheckOut(e.target.value)}
              className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm outline-none focus:ring-2 focus:ring-tipsa-blue"
            />
          </div>
        </div>

        {record.modifiedBy && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-50 border border-amber-100 flex items-center gap-3">
            <History className="w-5 h-5 text-amber-500" />
            <div className="text-xs font-bold text-amber-700">
              Última modificación por <span className="font-black">{record.modifiedBy}</span> el {safeFormatDate(record.modifiedAt!, 'd MMM, HH:mm')}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 px-6 rounded-2xl font-black text-sm text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-4 px-6 rounded-2xl font-black text-sm bg-tipsa-blue text-white shadow-lg shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" /> Guardar Cambios
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AdminDashboard({ employees, centers, currentUser }: { employees: Employee[], centers: WorkCenter[], currentUser: Employee | null }) {
  const { theme } = useTheme();
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [selectedLog, setSelectedLog] = useState<AttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [recordsLimit, setRecordsLimit] = useState(10);
  const [dateRange, setDateRange] = useState({
    from: format(new Date(), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsub = subscribeToAttendanceRange(dateRange.from, dateRange.to, setLogs);
    return () => unsub();
  }, [dateRange.from, dateRange.to]);

  const filteredLogs = logs;

  const stats = React.useMemo(() => {
    let totalHours = 0;
    let extraHours = 0;
    let lessHours = 0;

    filteredLogs.forEach(log => {
      if (log.checkOut) {
        const cIn = safeParseISO(log.checkIn);
        const cOut = safeParseISO(log.checkOut);
        const hours = (cIn && cOut) ? differenceInHours(cOut, cIn) : 0;
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

  const chartData = filteredLogs.slice(0, 10).reverse().map(log => {
    const cIn = safeParseISO(log.checkIn);
    const cOut = safeParseISO(log.checkOut);
    return {
      name: log.employeeName,
      hours: (cIn && cOut) ? differenceInHours(cOut, cIn) : 0
    };
  });

  const logsByCenter = React.useMemo(() => {
    const grouped: { [key: string]: AttendanceRecord[] } = {};
    const search = searchTerm.trim().toLowerCase();
    const isSearching = search.length >= 3;

    filteredLogs.forEach(log => {
      if (isSearching && !log.employeeName.toLowerCase().includes(search)) {
        return;
      }
      if (!grouped[log.centerId]) grouped[log.centerId] = [];
      grouped[log.centerId].push(log);
    });

    // Sort by checkIn ascending (oldest first)
    Object.keys(grouped).forEach(centerId => {
      grouped[centerId].sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());
    });

    return grouped;
  }, [filteredLogs, searchTerm]);

  const handleUpdateRecord = async (updated: Partial<AttendanceRecord>) => {
    try {
      await updateAttendanceRecord(updated);
      setSelectedLog(null);
    } catch (err) {
      console.error("Error updating record:", err);
    }
  };

  return (
    <div className="space-y-8">
      {selectedLog && (
        <AttendanceEditModal 
          record={selectedLog}
          employee={employees.find(e => e.id === selectedLog.employeeId)}
          center={centers.find(c => c.id === selectedLog.centerId)}
          onClose={() => setSelectedLog(null)}
          onSave={handleUpdateRecord}
          currentUser={currentUser}
        />
      )}

      <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col md:flex-row gap-6 items-end">
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desde</label>
          <input 
            type="date" 
            value={dateRange.from} 
            onChange={e => setDateRange({...dateRange, from: e.target.value})}
            className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-sm outline-none dark:text-white"
          />
        </div>
        <div className="flex-1 space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hasta</label>
          <input 
            type="date" 
            value={dateRange.to} 
            onChange={e => setDateRange({...dateRange, to: e.target.value})}
            className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-sm outline-none dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={<Users className="text-blue-600" />} label="Empleados" value={stats?.totalEmployees || 0} color="blue" />
        <StatCard icon={<Clock className="text-tipsa-blue" />} label="Total Horas" value={(stats?.totalHours || 0).toFixed(1) + 'h'} color="tipsa-blue" />
        <StatCard icon={<TrendingUp className="text-emerald-600" />} label="Horas Extras" value={'+' + (stats?.extraHours || 0).toFixed(1) + 'h'} color="emerald" />
        <StatCard icon={<TrendingDown className="text-red-600" />} label="Menos Horas" value={'-' + (stats?.lessHours || 0).toFixed(1) + 'h'} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-800 p-4 md:p-8 rounded-2xl md:rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-xl font-black text-slate-900 dark:text-white mb-8">Rendimiento Últimas Jornadas</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 700 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 700 }} />
                <Tooltip cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff', color: theme === 'dark' ? '#ffffff' : '#000000' }} />
                <Bar dataKey="hours" radius={[6, 6, 0, 0]} fill="#004A99" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
            <h3 className="text-xl font-black text-slate-900 dark:text-white">Actividad por Centro</h3>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Buscar mozo..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-xs outline-none focus:ring-2 focus:ring-tipsa-blue transition-all dark:text-white"
                />
              </div>
              <select 
                value={recordsLimit}
                onChange={e => setRecordsLimit(Number(e.target.value))}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-black text-[10px] outline-none focus:ring-2 focus:ring-tipsa-blue transition-all uppercase tracking-widest dark:text-white"
              >
                <option value={10}>10 Reg.</option>
                <option value={25}>25 Reg.</option>
                <option value={50}>50 Reg.</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 max-h-[500px] overflow-auto pr-2 custom-scrollbar">
            {centers.map(center => {
              const centerLogs = logsByCenter[center.id] || [];
              if (centerLogs.length === 0) return null;

              return (
                <div key={center.id} className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-tipsa-blue/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-tipsa-blue" />
                      </div>
                      <h4 className="font-black text-slate-900 dark:text-white">{center.name}</h4>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase">
                      {centerLogs.length} Registros
                    </span>
                  </div>
                  <div className="space-y-3">
                    {centerLogs.slice(0, recordsLimit).map(log => (
                      <button 
                        key={log.id} 
                        onClick={() => setSelectedLog(log)}
                        className={cn(
                          "w-full p-4 rounded-2xl border flex justify-between items-center transition-all group",
                          log.status === 'active' 
                            ? "bg-slate-200/70 dark:bg-slate-700/70 border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700" 
                            : "bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-slate-400 group-hover:border-tipsa-blue group-hover:text-tipsa-blue transition-colors">
                            {log.employeeName[0]}
                          </div>
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <div className="font-bold text-slate-900 dark:text-white text-sm">
                                {log.employeeName}
                              </div>
                              {log.backupRealName && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[7px] font-black uppercase">Backup</span>
                              )}
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                                log.status === 'active' ? "bg-emerald-500 text-white" : "bg-slate-300 text-slate-900"
                              )}>
                                {log.status === 'active' ? 'Activo' : 'Inactivo'}
                              </span>
                            </div>
                            {log.backupRealName && (
                              <div className="text-[10px] font-black text-amber-600 uppercase tracking-tight">
                                {log.backupRealName}
                              </div>
                            )}
                            <div className="text-[10px] font-bold text-slate-400 uppercase">
                              {safeFormatDate(log.checkIn, 'HH:mm')} - {log.checkOut ? safeFormatDate(log.checkOut, 'HH:mm') : '...'}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-tipsa-blue transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeeManagement({ employees, centers, contractors, roles, onUpdate, showSuccess, showError, confirm }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[], roles: CustomRole[], onUpdate: () => void, showSuccess: (m: string) => void, showError: (m: string) => void, confirm: (m: string, c: () => void) => void }) {
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [centerFilter, setCenterFilter] = useState('');
  const [contractorFilter, setContractorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         emp.dni.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCenter = !centerFilter || emp.centerIds.includes(centerFilter);
    const matchesContractor = !contractorFilter || emp.contractorId === contractorFilter;
    
    let matchesStatus = true;
    if (statusFilter !== 'all') {
      const isCurrentlyActive = !emp.terminationDate || new Date(emp.terminationDate) >= new Date();
      matchesStatus = statusFilter === 'active' ? isCurrentlyActive : !isCurrentlyActive;
    }

    return matchesSearch && matchesCenter && matchesContractor && matchesStatus;
  });

  // Sort by name
  const sortedEmployees = [...filteredEmployees].sort((a, b) => a.name.localeCompare(b.name));

  const [displayLimit, setDisplayLimit] = useState(50);
  const displayedEmployees = sortedEmployees.slice(0, displayLimit);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!editing) return;

      const isBackup = editing.name?.toLowerCase().includes('backup') && editing.dni?.toLowerCase() === 'backup';

      // 1. Validate DNI/NIE
      if (!isBackup && editing.dni && !validateDNI(editing.dni)) {
        throw new Error("El DNI o NIE introducido no es válido (formato o letra incorrecta).");
      }

      // 2. Check for duplicate DNI
      if (editing.dni) {
        if (isBackup) {
          // One backup per contractor per center
          const contractorId = editing.contractorId || '';
          const centerIds = editing.centerIds || [];
          
          for (const centerId of centerIds) {
            const existingBackup = employees.find(emp => 
              emp.id !== editing.id &&
              emp.dni.toLowerCase() === 'backup' &&
              emp.name.toLowerCase().includes('backup') &&
              (emp.contractorId || '') === contractorId &&
              emp.centerIds.includes(centerId)
            );
            if (existingBackup) {
              const centerName = centers.find(c => c.id === centerId)?.name || centerId;
              throw new Error(`Ya existe un empleado de Backup para esta contrata en el centro ${centerName}.`);
            }
          }
        } else {
          const GENERIC_DNI = '12345678Z';
          if (editing.dni.toUpperCase() === GENERIC_DNI) {
            const genericCount = employees.filter(emp => emp.dni === GENERIC_DNI && emp.id !== editing.id).length;
            if (genericCount >= 2) {
              throw new Error(`El DNI genérico ${GENERIC_DNI} ya está siendo usado por 2 empleados. Debes usar el DNI real.`);
            }
          } else {
            const isDuplicateDni = employees.some(emp => emp.dni === editing.dni && emp.id !== editing.id);
            if (isDuplicateDni) {
              throw new Error("El DNI/NIE ya está registrado en otro empleado.");
            }
          }
        }
      }

      // 3. Check for name similarity (80% threshold)
      if (!isBackup && editing.name) {
        const similarEmployee = employees.find(emp => 
          emp.id !== editing.id && 
          calculateSimilarity(emp.name, editing.name!) >= 0.8
        );
        if (similarEmployee) {
          throw new Error(`El nombre es demasiado similar al empleado existente: ${similarEmployee.name} (Similitud >= 80%)`);
        }
      }

      await saveEmployee(editing!);
      showSuccess("Empleado guardado correctamente");
      setEditing(null);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirm("¿Estás seguro de que deseas eliminar este empleado?", async () => {
      try {
        await deleteEmployee(id);
        showSuccess("Empleado eliminado correctamente");
        if (editing?.id === id) setEditing(null);
      } catch (err: any) {
        showError(err.message);
      }
    });
  };

  const selectedRole = roles.find(r => r.id === editing?.roleId);
  const isEditingAdmin = editing?.role === 'admin' || Boolean(selectedRole?.isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Empleados</h3>
        <button 
          onClick={() => setEditing({ id: `emp${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, name: '', dni: '', role: 'employee', centerIds: [], area: '', shift: '', standardHours: 8 })}
          className="bg-tipsa-blue text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="w-5 h-5" /> Nuevo Empleado
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o DNI..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
          />
        </div>
        <select 
          value={centerFilter} 
          onChange={e => setCenterFilter(e.target.value)}
          className="p-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
        >
          <option value="">Todos los Centros</option>
          {centers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select 
          value={contractorFilter} 
          onChange={e => setContractorFilter(e.target.value)}
          className="p-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
        >
          <option value="">Todas las Contratas</option>
          {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value as any)}
          className="p-2 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none"
        >
          <option value="all">Todos los Estados</option>
          <option value="active">Solo Activos</option>
          <option value="inactive">Solo Bajas</option>
        </select>
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
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              {editing.id && (
                <button 
                  type="button" 
                  onClick={() => handleDelete(editing.id!)} 
                  className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Eliminar Empleado
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
              <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
                <Save className="w-5 h-5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-100 overflow-x-auto shadow-sm">
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
            {displayedEmployees.map(emp => (
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
                  <div className="text-[10px] font-bold text-slate-700">Alta: {safeFormatDate(emp.hireDate)}</div>
                  <div className="text-[10px] font-bold text-red-600">Baja: {safeFormatDate(emp.terminationDate)}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {emp.centerIds.map((cid, idx) => (
                      <span key={`${emp.id}-${cid}-${idx}`} className="px-2 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-600">
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

      {sortedEmployees.length > displayLimit && (
        <div className="flex justify-center pt-4">
          <button 
            onClick={() => setDisplayLimit(prev => prev + 50)}
            className="px-8 py-3 bg-white border-2 border-slate-100 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            Mostrar más empleados ({sortedEmployees.length - displayLimit} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

function CenterManagement({ centers, onUpdate, showSuccess, showError, confirm }: { centers: WorkCenter[], onUpdate: () => void, showSuccess: (m: string) => void, showError: (m: string) => void, confirm: (m: string, c: () => void) => void }) {
  const [editing, setEditing] = useState<Partial<WorkCenter> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCenter(editing!);
      showSuccess("Centro guardado correctamente");
      setEditing(null);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirm("¿Estás seguro de que deseas eliminar este centro?", async () => {
      try {
        await deleteCenter(id);
        showSuccess("Centro eliminado correctamente");
        if (editing?.id === id) setEditing(null);
      } catch (err: any) {
        showError(err.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Centros de Trabajo</h3>
        <button 
          onClick={() => setEditing({ id: `cent${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, name: '', address: '', latitude: 0, longitude: 0, radius: 100 })}
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
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              {editing.id && (
                <button 
                  type="button" 
                  onClick={() => handleDelete(editing.id!)} 
                  className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Eliminar Centro
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
              <button type="submit" className="bg-red-800 hover:bg-red-900 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-900/20 transition-colors">
                <Save className="w-5 h-5" /> Guardar Centro
              </button>
            </div>
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

function ContractorManagement({ contractors, onUpdate, showSuccess, showError, confirm }: { contractors: Contractor[], onUpdate: () => void, showSuccess: (m: string) => void, showError: (m: string) => void, confirm: (m: string, c: () => void) => void }) {
  const [editing, setEditing] = useState<Partial<Contractor> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveContractor(editing!);
      showSuccess("Contrata guardada correctamente");
      setEditing(null);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirm("¿Estás seguro de que deseas eliminar esta contrata?", async () => {
      try {
        await deleteContractor(id);
        showSuccess("Contrata eliminada correctamente");
        if (editing?.id === id) setEditing(null);
      } catch (err: any) {
        showError(err.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Contratas</h3>
        <button 
          onClick={() => setEditing({ id: `cont${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, name: '' })}
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
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              {editing.id && (
                <button 
                  type="button" 
                  onClick={() => handleDelete(editing.id!)} 
                  className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Eliminar Contrata
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
              <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
                <Save className="w-5 h-5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-100 overflow-x-auto shadow-sm">
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

function RoleManagement({ roles, onUpdate, showSuccess, showError, confirm }: { roles: CustomRole[], onUpdate: () => void, showSuccess: (m: string) => void, showError: (m: string) => void, confirm: (m: string, c: () => void) => void }) {
  const [editing, setEditing] = useState<Partial<CustomRole> | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveRole(editing!);
      showSuccess("Rol guardado correctamente");
      setEditing(null);
    } catch (err: any) {
      showError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirm("¿Estás seguro de que deseas eliminar este rol?", async () => {
      try {
        await deleteRole(id);
        showSuccess("Rol eliminado correctamente");
        if (editing?.id === id) setEditing(null);
      } catch (err: any) {
        showError(err.message);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-black text-slate-900">Gestión de Roles</h3>
        <button 
          onClick={() => setEditing({ id: `role${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, name: '', isAdmin: false })}
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
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              {editing.id && (
                <button 
                  type="button" 
                  onClick={() => handleDelete(editing.id!)} 
                  className="px-6 py-3 font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-5 h-5" /> Eliminar Rol
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditing(null)} className="px-6 py-3 font-bold text-slate-500">Cancelar</button>
              <button type="submit" className="bg-tipsa-blue text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-100">
                <Save className="w-5 h-5" /> Guardar Cambios
              </button>
            </div>
          </div>
        </motion.form>
      )}

      <div className="bg-white rounded-2xl md:rounded-[2rem] border border-slate-100 overflow-x-auto shadow-sm">
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
                <td className="px-6 py-4 flex gap-2">
                  <button onClick={() => setEditing(r)} className="p-2 hover:bg-blue-50 text-tipsa-blue rounded-lg transition-colors">
                    <Settings className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors">
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

function ReportsView({ employees, centers, contractors, currentUser }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[], currentUser: Employee | null }) {
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [selectedLog, setSelectedLog] = useState<AttendanceRecord | null>(null);
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
    const logDate = safeFormatDate(log.checkIn, 'yyyy-MM-dd');
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
    const cIn = safeParseISO(log.checkIn);
    const cOut = safeParseISO(log.checkOut);
    const workedHours = (cIn && cOut) ? differenceInHours(cOut, cIn) : 0;
    const diff = workedHours - stdHours;
    return { workedHours, stdHours, diff, emp };
  };

  const handleUpdateRecord = async (updated: Partial<AttendanceRecord>) => {
    try {
      await updateAttendanceRecord(updated);
      setSelectedLog(null);
    } catch (err) {
      console.error("Error updating record:", err);
    }
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
    const centerName = filter.centerId ? centers.find(c => c.id === filter.centerId)?.name : 'TODOS LOS CENTROS';
    const contractorName = filter.contractorId ? contractors.find(c => c.id === filter.contractorId)?.name : 'TODAS LAS CONTRATAS';
    doc.text(`INFORME DE ASISTENCIA: ${filter.startDate} al ${filter.endDate}`, 14, 40);
    doc.text(`CENTRO: ${centerName} | CONTRATA: ${contractorName}`, 14, 44);
    
    const tableData = filteredLogs.map(log => {
      const { workedHours, stdHours, diff, emp } = getLogData(log);
      const displayName = log.backupRealName ? `${log.employeeName} (${log.backupRealName})` : log.employeeName;
      return [
        safeFormatDate(log.checkIn, 'dd/MM/yy'),
        safeFormatDate(log.checkIn, 'HH:mm'),
        log.checkOut ? safeFormatDate(log.checkOut, 'dd/MM/yy') : '-',
        log.checkOut ? safeFormatDate(log.checkOut, 'HH:mm') : 'En curso',
        displayName,
        emp?.shift || '-',
        stdHours + 'h',
        workedHours.toFixed(1) + 'h',
        diff > 0 ? '+' + diff.toFixed(1) + 'h' : '-',
        diff < 0 ? diff.toFixed(1) + 'h' : '-'
      ];
    });

    autoTable(doc, {
      head: [['F. ENTRADA', 'H. ENTRADA', 'F. SALIDA', 'H. SALIDA', 'EMPLEADO', 'TURNO', 'JORNADA', 'TOTAL', 'EXTRAS', 'MENOS']],
      body: tableData,
      startY: 50,
      styles: { font: 'helvetica', fontSize: 7 },
      headStyles: { 
        fillColor: [0, 74, 153], 
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center' },
        8: { halign: 'center', textColor: [0, 150, 0] },
        9: { halign: 'center', textColor: [200, 0, 0] }
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
      const displayName = log.backupRealName ? `${log.employeeName} (${log.backupRealName})` : log.employeeName;
      return {
        'Fecha Entrada': safeFormatDate(log.checkIn, 'dd/MM/yyyy'),
        'Hora Entrada': safeFormatDate(log.checkIn, 'HH:mm'),
        'Fecha Salida': log.checkOut ? safeFormatDate(log.checkOut, 'dd/MM/yyyy') : '-',
        'Hora Salida': log.checkOut ? safeFormatDate(log.checkOut, 'HH:mm') : 'En curso',
        Empleado: displayName,
        Turno: emp?.shift || '-',
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
      {selectedLog && (
        <AttendanceEditModal 
          record={selectedLog}
          employee={employees.find(e => e.id === selectedLog.employeeId)}
          center={centers.find(c => c.id === selectedLog.centerId)}
          onClose={() => setSelectedLog(null)}
          onSave={handleUpdateRecord}
          currentUser={currentUser}
        />
      )}
      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-end mb-8">
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

        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">F. Entrada</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">H. Entrada</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">F. Salida</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">H. Salida</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Turno</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Jornada</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Total</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-emerald-600">Extras</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-red-600">Menos</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.map(log => {
                const { workedHours, stdHours, diff, emp } = getLogData(log);
                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {safeFormatDate(log.checkIn, 'dd/MM/yy')}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {safeFormatDate(log.checkIn, 'HH:mm')}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {log.checkOut ? safeFormatDate(log.checkOut, 'dd/MM/yy') : '-'}
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500">
                      {log.checkOut ? safeFormatDate(log.checkOut, 'HH:mm') : 'En curso'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">
                        {log.employeeName}
                        {log.backupRealName && (
                          <span className="text-slate-400 font-medium ml-1">({log.backupRealName})</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {emp?.shift || '-'}
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500">
                      {contractors.find(c => c.id === emp?.contractorId)?.name || 'Interno'}
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
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedLog(log)}
                        className="p-2 hover:bg-tipsa-blue/10 rounded-xl transition-colors group"
                        title="Editar registro"
                      >
                        <Edit2 className="w-4 h-4 text-tipsa-blue group-hover:scale-110 transition-transform" />
                      </button>
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
  const [showAbsenteeismList, setShowAbsenteeismList] = useState(false);
  const [showExtrasList, setShowExtrasList] = useState(false);
  const [filter, setFilter] = useState({ 
    centerId: '', 
    contractorId: '',
    isActive: 'all',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    const unsub = subscribeToAttendanceRange(filter.startDate, filter.endDate, setLogs);
    return () => unsub();
  }, [filter.startDate, filter.endDate]);

  const filteredLogs = logs.filter(log => {
    const emp = employees.find(e => e.id === log.employeeId);
    
    let isActiveMatch = true;
    if (filter.isActive !== 'all' && emp) {
      const isCurrentlyActive = !emp.terminationDate || new Date(emp.terminationDate) >= new Date();
      isActiveMatch = filter.isActive === 'active' ? isCurrentlyActive : !isCurrentlyActive;
    }

    return (
      (!filter.centerId || log.centerId === filter.centerId) &&
      (!filter.contractorId || emp?.contractorId === filter.contractorId) &&
      isActiveMatch
    );
  });

  // Calculate KPIs
  const totalEmployees = new Set(filteredLogs.map(l => l.employeeId)).size;
  const totalHours = filteredLogs.reduce((acc, log) => {
    if (log.checkOut) {
      const checkIn = safeParseISO(log.checkIn);
      const checkOut = safeParseISO(log.checkOut);
      if (checkIn && checkOut) {
        return acc + differenceInHours(checkOut, checkIn);
      }
    }
    return acc;
  }, 0);
  const totalExtraHours = filteredLogs.reduce((acc, log) => {
    const emp = employees.find(e => e.id === log.employeeId);
    const stdHours = emp?.standardHours || 8;
    if (log.checkOut) {
      const checkIn = safeParseISO(log.checkIn);
      const checkOut = safeParseISO(log.checkOut);
      if (checkIn && checkOut) {
        const worked = differenceInHours(checkOut, checkIn);
        if (worked > stdHours) {
          return acc + (worked - stdHours);
        }
      }
    }
    return acc;
  }, 0);
  
  // Calculate Absenteeism
  // This is a simplified calculation: (Expected Hours - Actual Hours) / Expected Hours * 100
  // In a real scenario, this would involve checking schedules and leaves.
  const sDate = safeParseISO(filter.startDate);
  const eDate = safeParseISO(filter.endDate);
  const expectedHours = (sDate && eDate) ? totalEmployees * 8 * (differenceInHours(eDate, sDate) / 24 + 1) : 0;
  const absenteeism = expectedHours > 0 ? Math.max(0, ((expectedHours - totalHours) / expectedHours) * 100).toFixed(1) : "0.0";

  // Calculate Turnover KPIs for the selected period
  const periodEmployees = employees.filter(emp => {
    const matchesCenter = !filter.centerId || emp.centerIds.includes(filter.centerId);
    const matchesContractor = !filter.contractorId || emp.contractorId === filter.contractorId;
    return matchesCenter && matchesContractor;
  });

  const departuresInPeriod = periodEmployees.filter(emp => {
    if (!emp.terminationDate) return false;
    const termDate = safeFormatDate(emp.terminationDate, 'yyyy-MM-dd');
    return termDate >= filter.startDate && termDate <= filter.endDate;
  }).length;

  const hiresInPeriod = periodEmployees.filter(emp => {
    if (!emp.hireDate) return false;
    const hireDate = safeFormatDate(emp.hireDate, 'yyyy-MM-dd');
    return hireDate >= filter.startDate && hireDate <= filter.endDate;
  }).length;

  const activeAtEnd = periodEmployees.filter(emp => {
    if (!emp.terminationDate) return true;
    return safeFormatDate(emp.terminationDate, 'yyyy-MM-dd') > filter.endDate;
  }).length;

  const activeAtStart = activeAtEnd + departuresInPeriod - hiresInPeriod;
  const avgEmployees = (activeAtStart + activeAtEnd) / 2;
  const turnoverRate = avgEmployees > 0 ? (departuresInPeriod / avgEmployees) * 100 : 0;

  // Evolution Data
  const evolutionData = React.useMemo(() => {
    const days = [];
    let current = safeParseISO(filter.startDate);
    const end = safeParseISO(filter.endDate);
    
    if (!current || !end) return [];

    while (current <= end) {
      const dateStr = format(current, 'yyyy-MM-dd');
      const dayLogs = filteredLogs.filter(l => safeFormatDate(l.checkIn, 'yyyy-MM-dd') === dateStr);
      
      const dayHours = dayLogs.reduce((acc, l) => {
        const cIn = safeParseISO(l.checkIn);
        const cOut = safeParseISO(l.checkOut);
        return acc + (cIn && cOut ? differenceInHours(cOut, cIn) : 0);
      }, 0);
      const dayExtra = dayLogs.reduce((acc, l) => {
        const emp = employees.find(e => e.id === l.employeeId);
        const std = emp?.standardHours || 8;
        const cIn = safeParseISO(l.checkIn);
        const cOut = safeParseISO(l.checkOut);
        if (cIn && cOut) {
          const worked = differenceInHours(cOut, cIn);
          return acc + (worked > std ? worked - std : 0);
        }
        return acc;
      }, 0);

      const dayActive = new Set(dayLogs.map(l => l.employeeId)).size;
      
      days.push({
        date: format(current, 'dd/MM'),
        horas: parseFloat(dayHours.toFixed(1)),
        extras: parseFloat(dayExtra.toFixed(1)),
        empleados: dayActive
      });
      
      current = new Date(current.setDate(current.getDate() + 1));
    }
    return days;
  }, [filteredLogs, filter.startDate, filter.endDate, employees]);

  const missingEmployees = React.useMemo(() => {
    const clockedInIds = new Set(filteredLogs.map(l => l.employeeId));
    return employees.filter(emp => {
      const matchesCenter = !filter.centerId || emp.centerIds.includes(filter.centerId);
      const matchesContractor = !filter.contractorId || emp.contractorId === filter.contractorId;
      const isActive = !emp.terminationDate || new Date(emp.terminationDate) >= new Date(filter.startDate);
      return matchesCenter && matchesContractor && isActive && !clockedInIds.has(emp.id);
    });
  }, [employees, filteredLogs, filter.centerId, filter.contractorId, filter.startDate]);

  const extraHoursLogs = React.useMemo(() => {
    return filteredLogs.filter(log => {
      if (!log.checkOut) return false;
      const emp = employees.find(e => e.id === log.employeeId);
      const stdHours = emp?.standardHours || 8;
      const cIn = safeParseISO(log.checkIn);
      const cOut = safeParseISO(log.checkOut);
      if (!cIn || !cOut) return false;
      const worked = differenceInHours(cOut, cIn);
      return worked > stdHours;
    }).map(log => {
      const emp = employees.find(e => e.id === log.employeeId);
      const stdHours = emp?.standardHours || 8;
      const cIn = safeParseISO(log.checkIn);
      const cOut = safeParseISO(log.checkOut);
      const worked = (cIn && cOut) ? differenceInHours(cOut, cIn) : 0;
      const extra = worked - stdHours;
      return {
        ...log,
        employee: emp,
        date: safeFormatDate(log.checkIn, 'dd/MM/yyyy'),
        dayOfWeek: cIn ? format(cIn, 'EEEE', { locale: es }) : '-',
        contractHours: stdHours,
        extraHours: extra.toFixed(1)
      };
    });
  }, [filteredLogs, employees]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end mb-8">
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

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-12">
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
            onDoubleClick={() => setShowExtrasList(!showExtrasList)}
          />
          <StatCard
            icon={<UserCog className="text-red-600" />}
            label="Absentismo"
            value={`${absenteeism}%`}
            color="red"
            onDoubleClick={() => setShowAbsenteeismList(!showAbsenteeismList)}
          />
          <StatCard
            icon={<LogOut className="text-orange-600" />}
            label="Bajas Periodo"
            value={departuresInPeriod}
            color="orange"
          />
          <StatCard
            icon={<RefreshCw className="text-purple-600" />}
            label="Rotación"
            value={`${turnoverRate.toFixed(1)}%`}
            color="purple"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100">
            <h4 className="text-sm font-black text-slate-900 mb-6 uppercase tracking-widest">Evolución de Horas</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 700 }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase' }} />
                  <Line type="monotone" dataKey="horas" stroke="#1e40af" strokeWidth={3} dot={{ r: 4, fill: '#1e40af' }} activeDot={{ r: 6 }} name="Horas Totales" />
                  <Line type="monotone" dataKey="extras" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} name="Horas Extras" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-100">
            <h4 className="text-sm font-black text-slate-900 mb-6 uppercase tracking-widest">Participación de Empleados</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolutionData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 700, fill: '#64748b'}} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 700 }}
                  />
                  <Line type="stepAfter" dataKey="empleados" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4, fill: '#8b5cf6' }} name="Empleados Activos" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {showAbsenteeismList && (
          <div className="mt-8 bg-white p-6 rounded-3xl border border-red-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" /> Personal sin marcajes en el periodo
              </h4>
              <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                {missingEmployees.length} Empleados
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {missingEmployees.map(emp => (
                <div key={emp.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-slate-400 text-xs text-center">
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{emp.name}</div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {contractors.find(c => c.id === emp.contractorId)?.name || 'Interno'}
                    </div>
                  </div>
                </div>
              ))}
              {missingEmployees.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 font-bold italic">
                  No se encontraron empleados sin marcajes.
                </div>
              )}
            </div>
          </div>
        )}

        {showExtrasList && (
          <div className="mt-8 bg-white p-6 rounded-3xl border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" /> Detalle de Horas Extras
              </h4>
              <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                {extraHoursLogs.length} Registros
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Día</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Contrata</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Turno</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Centro</th>
                    <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Contrato</th>
                    <th className="px-4 py-3 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Extras</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {extraHoursLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-bold text-slate-900">{log.employeeName}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{log.date}</td>
                      <td className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{log.dayOfWeek}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">
                        {contractors.find(c => c.id === log.employee?.contractorId)?.name || 'Interno'}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{log.employee?.shift || '-'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">
                        {centers.find(c => c.id === log.centerId)?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-xs font-black text-slate-400 text-center">{log.contractHours}h</td>
                      <td className="px-4 py-3 text-xs font-black text-emerald-600 text-center">+{log.extraHours}h</td>
                    </tr>
                  ))}
                  {extraHoursLogs.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold italic">
                        No se encontraron registros con horas extras.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataUploadView({ employees, centers, contractors, roles, onUpdate, showSuccess, showError }: { employees: Employee[], centers: WorkCenter[], contractors: Contractor[], roles: CustomRole[], onUpdate: () => void, showSuccess: (m: string) => void, showError: (m: string) => void }) {
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number, errors: { row: number, name: string, reason: string }[] } | null>(null);

  const downloadTemplate = () => {
    const template = [
      {
        Nombre: 'Juan Pérez',
        DNI_NIE: '12345678Z',
        Area: 'Almacén',
        Turno: 'Mañana',
        Horas_Jornada: 8,
        Fecha_Alta: '2024-01-01',
        Fecha_Baja: '',
        Contrata: 'Nombre Contrata (o vacío para Interno)',
        Rol: 'Nombre del Rol (opcional)',
        Centro_Trabajo: 'Zal, Tarragona, Barbera...',
        Tipo_Acceso: 'employee'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    XLSX.writeFile(wb, "plantilla_importacion_personal.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResults(null);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let successCount = 0;
        const errors: { row: number, name: string, reason: string }[] = [];

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2; // +1 for 0-index, +1 for header row
          const name = row.Nombre || 'Desconocido';
          const dni = String(row.DNI_NIE || '').trim();

          try {
            if (!name || name === 'Desconocido') throw new Error("Nombre es obligatorio");
            if (!dni) throw new Error("DNI/NIE es obligatorio");

            // 1. Validate DNI/NIE
            if (!validateDNI(dni)) {
              throw new Error("DNI o NIE no válido");
            }

            // 2. Check for duplicate DNI
            if (employees.some(emp => emp.dni === dni)) {
              throw new Error("DNI/NIE ya registrado");
            }

            // 3. Check for name similarity
            const similar = employees.find(emp => calculateSimilarity(emp.name, name) >= 0.8);
            if (similar) {
              throw new Error(`Nombre demasiado similar a ${similar.name} (>= 80%)`);
            }

            // Find contractor and role by name
            const contractor = contractors.find(c => c.name.toLowerCase() === String(row.Contrata || '').toLowerCase());
            const role = roles.find(r => r.name.toLowerCase() === String(row.Rol || '').toLowerCase());

            // Partial matching for Work Centers
            const centerNameInput = String(row.Centro_Trabajo || '').toLowerCase().trim();
            const matchedCenters = centerNameInput 
              ? centers.filter(c => c.name.toLowerCase().includes(centerNameInput))
              : [];

            const newEmployee: Employee = {
              id: `emp_${Date.now()}_${i}`,
              name,
              dni,
              area: row.Area || '',
              shift: row.Turno || '',
              standardHours: parseFloat(row.Horas_Jornada) || 8,
              hireDate: parseExcelDate(row.Fecha_Alta) || format(new Date(), 'yyyy-MM-dd'),
              terminationDate: parseExcelDate(row.Fecha_Baja) || '',
              contractorId: contractor?.id || null,
              roleId: role?.id || null,
              role: (row.Tipo_Acceso === 'admin' ? 'admin' : 'employee'),
              centerIds: matchedCenters.map(c => c.id)
            };

            await saveEmployee(newEmployee);
            successCount++;
          } catch (err: any) {
            errors.push({ row: rowNum, name, reason: err.message });
          }
        }

        setImportResults({ success: successCount, errors });
        if (successCount > 0) {
          onUpdate();
          showSuccess(`Importación finalizada: ${successCount} registros importados.`);
        }
      } catch (err: any) {
        showError("Error al procesar el archivo Excel");
      } finally {
        setImporting(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm">
        <h3 className="text-2xl font-black text-slate-900 mb-6">Subida Masiva de Datos</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
              <Download className="w-8 h-8 text-tipsa-blue" />
            </div>
            <h4 className="font-black text-slate-900 mb-2">1. Descargar Plantilla</h4>
            <p className="text-sm text-slate-500 mb-6">Descarga el archivo Excel con el formato correcto para rellenar los datos de los empleados.</p>
            <button 
              onClick={downloadTemplate}
              className="bg-white text-tipsa-blue border-2 border-tipsa-blue px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors"
            >
              Descargar Excel
            </button>
          </div>

          <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
              <Upload className="w-8 h-8 text-emerald-600" />
            </div>
            <h4 className="font-black text-slate-900 mb-2">2. Importar Datos</h4>
            <p className="text-sm text-slate-500 mb-6">Sube el archivo Excel completado. El sistema validará DNI y similitud de nombres automáticamente.</p>
            <label className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold cursor-pointer hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-100">
              {importing ? 'Procesando...' : 'Seleccionar Archivo'}
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" disabled={importing} />
            </label>
          </div>
        </div>

        {importResults && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mt-12 space-y-6">
            <div className="flex items-center gap-4 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <div>
                <div className="font-black text-emerald-900">Importación Completada</div>
                <div className="text-sm text-emerald-700 font-bold">{importResults.success} empleados añadidos correctamente.</div>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="bg-white border border-red-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <span className="font-black text-red-900 uppercase text-xs tracking-widest">Informe de Errores ({importResults.errors.length})</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fila</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</th>
                        <th className="px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Motivo del Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {importResults.errors.map((err, idx) => (
                        <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                          <td className="px-6 py-4 text-xs font-bold text-slate-500">{err.row}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{err.name}</td>
                          <td className="px-6 py-4 text-xs font-bold text-red-600">{err.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}
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
        className="w-full p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-bold text-sm focus:ring-2 focus:ring-tipsa-blue outline-none transition-all dark:text-white"
      />
    </div>
  );
}

function StatCard({ icon, label, value, color, onDoubleClick }: { icon: React.ReactNode, label: string, value: number | string, color: string, onDoubleClick?: () => void }) {
  const colors: any = {
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/30",
    "tipsa-blue": "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30",
    red: "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30",
    orange: "bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-900/30",
    purple: "bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-900/30"
  };

  return (
    <div 
      onDoubleClick={onDoubleClick}
      className={cn("p-4 rounded-[1.5rem] border shadow-sm flex flex-col justify-center min-h-[90px] cursor-pointer active:scale-95 transition-transform", colors[color])}
    >
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm flex-shrink-0">
          {React.cloneElement(icon as React.ReactElement, { className: "w-5 h-5 dark:text-white" })}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5 truncate">{label}</div>
          <div className="text-lg font-black text-slate-900 dark:text-white leading-none whitespace-nowrap overflow-hidden text-ellipsis">{value}</div>
        </div>
      </div>
    </div>
  );
}
