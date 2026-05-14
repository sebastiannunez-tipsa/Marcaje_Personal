import { collection, doc, setDoc, getDocs, onSnapshot, query, addDoc, updateDoc, deleteDoc, getDoc, getDocFromServer, where, limit, orderBy } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './firebase';
import { Employee, WorkCenter, Contractor, CustomRole, AttendanceRecord, Note, SecurityLog } from './types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const isQuotaExceeded = error instanceof Error && (
    error.message.includes('Quota exceeded') || 
    error.message.includes('quota metric') ||
    error.message.includes('billing instrument')
  );

  const errInfo: FirestoreErrorInfo = {
    error: isQuotaExceeded ? "QUOTA_EXCEEDED" : (error instanceof Error ? error.message : String(error)),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  
  if (isQuotaExceeded) {
    console.error('CRITICAL: Firestore Quota Exceeded. The app will stop making requests for this session.');
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
  
  throw new Error(JSON.stringify(errInfo));
}

// Connect to Firestore and authenticate anonymously
export const initDB = async () => {
  try {
    // Just a connection test
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection test successful");
  } catch (error: any) {
    console.warn("Firestore connection test failed (this is normal if collection doesn't exist yet):", error.message);
  }
};

export const subscribeToCollection = <T>(
  collectionName: string,
  callback: (data: T[]) => void,
  onLoaded?: () => void,
  onError?: (error: any) => void
) => {
  const q = query(collection(db, collectionName));
  let isFirstLoad = true;
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    callback(data);
    if (isFirstLoad && onLoaded) {
      isFirstLoad = false;
      onLoaded();
    }
  }, (error) => {
    if (onError) {
      onError(error);
    } else {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  });
};

const cleanData = (data: any) => {
  const clean: any = {};
  Object.keys(data).forEach(key => {
    if (data[key] !== undefined) {
      clean[key] = data[key];
    }
  });
  return clean;
};

export const saveEmployee = async (employee: Partial<Employee>) => {
  try {
    console.log("Saving employee:", employee);
    if (!employee.id) throw new Error("ID de empleado requerido");
    await setDoc(doc(db, 'employees', employee.id), cleanData(employee), { merge: true });
    console.log("Employee saved successfully");
  } catch (error) {
    console.error("Error saving employee:", error);
    handleFirestoreError(error, OperationType.WRITE, 'employees');
  }
};

export const deleteEmployee = async (id: string) => {
  try {
    console.log("Deleting employee:", id);
    await deleteDoc(doc(db, 'employees', id));
    console.log("Employee deleted successfully");
  } catch (error) {
    console.error("Error deleting employee:", error);
    handleFirestoreError(error, OperationType.DELETE, 'employees');
  }
};

export const saveCenter = async (center: Partial<WorkCenter>) => {
  try {
    console.log("Saving center:", center);
    if (!center.id) throw new Error("ID de centro requerido");
    await setDoc(doc(db, 'centers', center.id), cleanData(center), { merge: true });
    console.log("Center saved successfully");
  } catch (error) {
    console.error("Error saving center:", error);
    handleFirestoreError(error, OperationType.WRITE, 'centers');
  }
};

export const deleteCenter = async (id: string) => {
  try {
    console.log("Deleting center:", id);
    await deleteDoc(doc(db, 'centers', id));
    console.log("Center deleted successfully");
  } catch (error) {
    console.error("Error deleting center:", error);
    handleFirestoreError(error, OperationType.DELETE, 'centers');
  }
};

export const saveContractor = async (contractor: Partial<Contractor>) => {
  try {
    console.log("Saving contractor:", contractor);
    if (!contractor.id) throw new Error("ID de contrata requerido");
    await setDoc(doc(db, 'contractors', contractor.id), cleanData(contractor), { merge: true });
    console.log("Contractor saved successfully");
  } catch (error) {
    console.error("Error saving contractor:", error);
    handleFirestoreError(error, OperationType.WRITE, 'contractors');
  }
};

export const deleteContractor = async (id: string) => {
  try {
    console.log("Deleting contractor:", id);
    await deleteDoc(doc(db, 'contractors', id));
    console.log("Contractor deleted successfully");
  } catch (error) {
    console.error("Error deleting contractor:", error);
    handleFirestoreError(error, OperationType.DELETE, 'contractors');
  }
};

export const saveRole = async (role: Partial<CustomRole>) => {
  try {
    console.log("Saving role:", role);
    if (!role.id) throw new Error("ID de rol requerido");
    await setDoc(doc(db, 'roles', role.id), cleanData(role), { merge: true });
    console.log("Role saved successfully");
  } catch (error) {
    console.error("Error saving role:", error);
    handleFirestoreError(error, OperationType.WRITE, 'roles');
  }
};

export const deleteRole = async (id: string) => {
  try {
    console.log("Deleting role:", id);
    await deleteDoc(doc(db, 'roles', id));
    console.log("Role deleted successfully");
  } catch (error) {
    console.error("Error deleting role:", error);
    handleFirestoreError(error, OperationType.DELETE, 'roles');
  }
};

export const checkIn = async (record: Omit<AttendanceRecord, 'id'>) => {
  try {
    const newId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // IMPORTANT: explicitly set checkOut to null so Firestore indexes it
    // and the where('checkOut', '==', null) query in subscribeToActiveSession works
    const data = cleanData({ ...record, id: newId });
    data.checkOut = null; // Force null even if cleanData would have removed it
    await setDoc(doc(db, 'attendance', newId), data);
    
    // Update lastAttendance on employee
    await updateDoc(doc(db, 'employees', record.employeeId), {
      lastAttendance: record.checkIn
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }
};

export const checkOut = async (recordId: string, checkOutTime: string) => {
  try {
    const attDoc = await getDocFromServer(doc(db, 'attendance', recordId));
    const attData = attDoc.data() as AttendanceRecord;

    await updateDoc(doc(db, 'attendance', recordId), cleanData({
      checkOut: checkOutTime,
      status: 'completed'
    }));

    if (attData && attData.employeeId) {
      // Update lastAttendance on employee (though checkIn already did it, double check for consistency)
      await updateDoc(doc(db, 'employees', attData.employeeId), {
        lastAttendance: checkOutTime
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `attendance/${recordId}`);
  }
};

export const deleteAttendanceRecord = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'attendance', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `attendance/${id}`);
  }
};

export const saveSecurityLog = async (log: Omit<SecurityLog, 'id'>) => {
  try {
    const newId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await setDoc(doc(db, 'security_logs', newId), cleanData({ ...log, id: newId }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'security_logs');
  }
};

export const updateAttendanceRecord = async (record: Partial<AttendanceRecord>) => {
  try {
    if (!record.id) throw new Error("ID de registro requerido");
    const { id, ...data } = record;
    await updateDoc(doc(db, 'attendance', id.toString()), cleanData(data));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `attendance/${record.id}`);
  }
};

export const saveNote = async (note: Partial<Note>) => {
  try {
    const id = note.id || `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    await setDoc(doc(db, 'notes', id), cleanData({ ...note, id }), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notes');
  }
};

export const deleteNote = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'notes', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'notes');
  }
};

export const hasBackupToday = async (employeeId: string) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startISO = today.toISOString();
    
    const q = query(
      collection(db, 'attendance'),
      where('employeeId', '==', employeeId),
      where('checkIn', '>=', startISO)
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'attendance');
    return false;
  }
};

export const subscribeToActiveSession = (
  employeeId: string,
  callback: (session: AttendanceRecord | null) => void
) => {
  // Primary query: look for records with status 'active' (more reliable than checkOut == null)
  const q = query(
    collection(db, 'attendance'),
    where('employeeId', '==', employeeId),
    where('status', '==', 'active'),
    limit(1)
  );
  return onSnapshot(q, (snapshot) => {
    console.log("DEBUG: subscribeToActiveSession snapshot empty:", snapshot.empty, "employeeId:", employeeId);
    if (snapshot.empty) {
      callback(null);
    } else {
      const doc = snapshot.docs[0];
      console.log("DEBUG: Active session found:", doc.id, doc.data());
      callback({ id: doc.id, ...doc.data() } as unknown as AttendanceRecord);
    }
  }, (error) => {
    // Don't crash the app - just log and return null
    console.error('subscribeToActiveSession error:', error.message);
    callback(null);
  });
};

export const subscribeToAttendanceRange = (
  startDate: string,
  endDate: string,
  callback: (data: AttendanceRecord[]) => void
) => {
  // We use ISO strings for comparison. 
  // Since we want the whole day, we set start to 00:00:00 and end to 23:59:59
  const startISO = `${startDate}T00:00:00.000Z`;
  const endISO = `${endDate}T23:59:59.999Z`;

  const q = query(
    collection(db, 'attendance'),
    where('checkIn', '>=', startISO),
    where('checkIn', '<=', endISO)
  );

  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as unknown as AttendanceRecord));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'attendance');
  });
};

// Efficient query: subscribe only to the last completed session for an employee
// instead of downloading the entire attendance collection
export const subscribeToLastCompletedSession = (
  employeeId: string,
  callback: (session: AttendanceRecord | null) => void
) => {
  const q = query(
    collection(db, 'attendance'),
    where('employeeId', '==', employeeId),
    where('status', '==', 'completed'),
    orderBy('checkIn', 'desc'),
    limit(1)
  );
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
    } else {
      const docSnap = snapshot.docs[0];
      callback({ id: docSnap.id, ...docSnap.data() } as unknown as AttendanceRecord);
    }
  }, (error) => {
    // Silently handle - the composite index may not exist yet
    console.warn('subscribeToLastCompletedSession error (index may be needed):', error.message);
    callback(null);
  });
};
