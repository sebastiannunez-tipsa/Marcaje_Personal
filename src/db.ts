import { collection, doc, setDoc, getDocs, onSnapshot, query, addDoc, updateDoc, deleteDoc, getDocFromServer } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './firebase';
import { Employee, WorkCenter, Contractor, CustomRole, AttendanceRecord } from './types';

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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connect to Firestore and authenticate anonymously
export const initDB = async () => {
  try {
    await signInAnonymously(auth);
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
};

export const subscribeToCollection = <T>(
  collectionName: string,
  callback: (data: T[]) => void
) => {
  const q = query(collection(db, collectionName));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, collectionName);
  });
};

export const saveEmployee = async (employee: Partial<Employee>) => {
  try {
    if (employee.id && !employee.id.startsWith('emp')) {
      await setDoc(doc(db, 'employees', employee.id), employee, { merge: true });
    } else {
      const newId = `emp_${Date.now()}`;
      await setDoc(doc(db, 'employees', newId), { ...employee, id: newId });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'employees');
  }
};

export const saveCenter = async (center: Partial<WorkCenter>) => {
  try {
    if (center.id && !center.id.startsWith('wc')) {
      await setDoc(doc(db, 'centers', center.id), center, { merge: true });
    } else {
      const newId = `wc_${Date.now()}`;
      await setDoc(doc(db, 'centers', newId), { ...center, id: newId });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'centers');
  }
};

export const saveContractor = async (contractor: Partial<Contractor>) => {
  try {
    if (contractor.id && !contractor.id.startsWith('cont')) {
      await setDoc(doc(db, 'contractors', contractor.id), contractor, { merge: true });
    } else {
      const newId = `cont_${Date.now()}`;
      await setDoc(doc(db, 'contractors', newId), { ...contractor, id: newId });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'contractors');
  }
};

export const saveRole = async (role: Partial<CustomRole>) => {
  try {
    if (role.id && !role.id.startsWith('role')) {
      await setDoc(doc(db, 'roles', role.id), role, { merge: true });
    } else {
      const newId = `role_${Date.now()}`;
      await setDoc(doc(db, 'roles', newId), { ...role, id: newId });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'roles');
  }
};

export const deleteEmployee = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'employees', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `employees/${id}`);
  }
};

export const deleteCenter = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'centers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `centers/${id}`);
  }
};

export const deleteContractor = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'contractors', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `contractors/${id}`);
  }
};

export const deleteRole = async (id: string) => {
  try {
    await deleteDoc(doc(db, 'roles', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `roles/${id}`);
  }
};

export const checkIn = async (record: Omit<AttendanceRecord, 'id'>) => {
  try {
    const newId = `att_${Date.now()}`;
    await setDoc(doc(db, 'attendance', newId), { ...record, id: newId });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'attendance');
  }
};

export const checkOut = async (recordId: string, checkOutTime: string) => {
  try {
    await updateDoc(doc(db, 'attendance', recordId), {
      checkOut: checkOutTime,
      status: 'completed'
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `attendance/${recordId}`);
  }
};

export const subscribeToActiveSession = (
  employeeId: string,
  callback: (session: AttendanceRecord | null) => void
) => {
  const q = query(
    collection(db, 'attendance')
  );
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
    const active = data.find(r => r.employeeId === employeeId && r.status === 'active');
    callback(active || null);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'attendance');
  });
};
