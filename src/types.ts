export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  checkIn: string;
  checkOut: string | null;
  latitude: number;
  longitude: number;
  distance: number | null;
  status: 'active' | 'completed';
  centerId: string;
  modifiedBy?: string;
  modifiedAt?: string;
  backupRealName?: string;
}

export interface Employee {
  id: string;
  name: string;
  dni: string;
  role: 'admin' | 'employee';
  roleId?: string;
  contractorId?: string;
  centerIds: string[]; // Can belong to multiple centers
  area: string;
  shift: string;
  hireDate?: string;
  terminationDate?: string;
  standardHours?: number;
  password?: string;
  firebaseUid?: string;
}

export interface Contractor {
  id: string;
  name: string;
}

export interface CustomRole {
  id: string;
  name: string;
  isAdmin: boolean;
}

export interface WorkCenter {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export interface Note {
  id: string;
  createdAt: string;
  createdBy: string;
  contractorId: string;
  employeeId: string;
  complementType: string;
  content: string;
}
