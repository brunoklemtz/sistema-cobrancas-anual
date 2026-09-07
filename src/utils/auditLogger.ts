import { addDoc, serverTimestamp } from '../lib/db';
import { supabase } from '../supabase';
import { AuditLog } from '../types';

export async function logAudit(
  action: string,
  collectionName: string,
  entityId: string,
  previousData?: any,
  newData?: any
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const userEmail = user?.email || 'sistema@imobiliaria.com';
    const userName =
      (user?.user_metadata?.full_name as string) ||
      (user?.user_metadata?.name as string) ||
      userEmail.split('@')[0];

    const auditEntry: AuditLog = {
      userEmail,
      userName,
      action,
      collection: collectionName,
      entityId,
      previousData: previousData ? sanitizeForFirestore(previousData) : null,
      newData: newData ? sanitizeForFirestore(newData) : null,
      timestamp: serverTimestamp(),
    };

    await addDoc('audit_logs', auditEntry);
  } catch (err) {
    console.error('Falha ao gravar log de auditoria:', err);
    // Non-blocking: we don't throw to avoid disrupting the main user flow
  }
}

function sanitizeForFirestore(data: any): any {
  if (data === undefined) return null;
  if (data === null || typeof data !== 'object') return data;
  
  // If array, map
  if (Array.isArray(data)) {
    return data.slice(0, 50).map(sanitizeForFirestore);
  }

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    // Avoid circular or excessive data
    if (k.startsWith('_') || typeof v === 'function') continue;
    if (v === undefined) {
      clean[k] = null;
    } else {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}
