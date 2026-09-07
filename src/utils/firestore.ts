import { supabase } from '../supabase';
import { OperationType, FirestoreErrorInfo } from '../types';

export function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {}
  }
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export async function getCurrentAuthInfo() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return {
    userId: user?.id,
    email: user?.email || undefined,
    emailVerified: !!user?.email_confirmed_at,
    isAnonymous: false,
    tenantId: null as string | null,
    providerInfo: (user?.app_metadata?.providers || []).map((providerId: string) => ({
      providerId,
      displayName: (user?.user_metadata?.full_name as string) || null,
      email: user?.email || null,
      photoUrl: (user?.user_metadata?.avatar_url as string) || null,
    })),
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  void getCurrentAuthInfo().then((authInfo) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo,
      operationType,
      path,
    };
    console.error('DB Error: ', JSON.stringify(errInfo));
  });

  const message = error instanceof Error ? error.message : String(error);
  throw new Error(message);
}

/** Alias mais claro */
export const handleDbError = handleFirestoreError;
