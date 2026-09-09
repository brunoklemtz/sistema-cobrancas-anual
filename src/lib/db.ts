import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';

export type DocTable =
  | 'properties'
  | 'billings'
  | 'condominiums'
  | 'settings'
  | 'whatsapp_queue'
  | 'whatsapp_templates'
  | 'whatsapp_alerts'
  | 'audit_logs'
  | 'contract_intakes';

export type DocRecord = Record<string, any> & { id: string };

function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function rowToDoc(row: { id: string; doc: Record<string, any> }): DocRecord {
  return { ...(row.doc || {}), id: row.id };
}

/** Compatível com Firestore Timestamp.now() / fromDate */
export const Timestamp = {
  now(): string {
    return new Date().toISOString();
  },
  fromDate(d: Date): string {
    return d.toISOString();
  },
};

export function serverTimestamp(): string {
  return new Date().toISOString();
}

export async function getDoc(table: DocTable, id: string): Promise<DocRecord | null> {
  const { data, error } = await supabase.from(table).select('id, doc').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToDoc(data as any);
}

export async function addDoc(table: DocTable, data: Record<string, any>): Promise<string> {
  const { id: _ignore, ...rest } = data;
  const doc = stripUndefined({ ...rest, createdAt: rest.createdAt ?? serverTimestamp(), updatedAt: rest.updatedAt ?? serverTimestamp() });
  const { data: inserted, error } = await supabase
    .from(table)
    .insert({ doc })
    .select('id')
    .single();
  if (error) throw error;
  return (inserted as any).id as string;
}

export async function setDoc(
  table: DocTable,
  id: string,
  data: Record<string, any>,
  options?: { merge?: boolean }
): Promise<void> {
  const { id: _ignore, ...rest } = data;
  const merge = options?.merge !== false;

  if (merge) {
    const existing = await getDoc(table, id);
    const merged = stripUndefined({
      ...(existing || {}),
      ...rest,
      id: undefined,
      updatedAt: rest.updatedAt ?? serverTimestamp(),
    });
    delete (merged as any).id;
    const { error } = await supabase.from(table).upsert({
      id,
      doc: merged,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return;
  }

  const doc = stripUndefined({ ...rest, updatedAt: rest.updatedAt ?? serverTimestamp() });
  const { error } = await supabase.from(table).upsert({
    id,
    doc,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function updateDoc(table: DocTable, id: string, data: Record<string, any>): Promise<void> {
  await setDoc(table, id, data, { merge: true });
}

export async function deleteDoc(table: DocTable, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
}

export async function getDocs(
  table: DocTable,
  options?: {
    orderByField?: string;
    ascending?: boolean;
    limit?: number;
    filters?: Array<{ field: string; op: 'eq' | 'in'; value: any }>;
  }
): Promise<DocRecord[]> {
  let q = supabase.from(table).select('id, doc');

  if (options?.filters) {
    for (const f of options.filters) {
      if (f.op === 'eq') {
        q = q.eq(`doc->>${f.field}`, String(f.value));
      } else if (f.op === 'in' && Array.isArray(f.value)) {
        q = q.in(`doc->>${f.field}`, f.value.map(String));
      }
    }
  }

  if (options?.orderByField) {
    // Ordenação por campo JSONB via coluna gerada não existe; ordenamos em memória
  }

  if (options?.limit) {
    q = q.limit(options.limit);
  }

  const { data, error } = await q;
  if (error) throw error;

  let docs = (data || []).map((row: any) => rowToDoc(row));

  if (options?.orderByField) {
    const field = options.orderByField;
    const asc = options.ascending !== false;
    docs = docs.sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }

  return docs;
}

export type Unsubscribe = () => void;

export function subscribeTable(
  table: DocTable,
  onChange: () => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let channel: RealtimeChannel | null = null;
  try {
    channel = supabase
      .channel(`rt-${table}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onChange()
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          onError?.(new Error(`Realtime channel error: ${table}`));
        }
      });
  } catch (e: any) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  return () => {
    if (channel) supabase.removeChannel(channel);
  };
}

/** Carrega + escuta mudanças (padrão onSnapshot) */
export function watchDocs(
  table: DocTable,
  options: {
    orderByField?: string;
    ascending?: boolean;
    limit?: number;
    filters?: Array<{ field: string; op: 'eq' | 'in'; value: any }>;
  },
  onData: (docs: DocRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  let cancelled = false;

  const load = async () => {
    try {
      const docs = await getDocs(table, options);
      if (!cancelled) onData(docs);
    } catch (e: any) {
      if (!cancelled) onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  };

  load();
  const unsub = subscribeTable(table, load, onError);

  return () => {
    cancelled = true;
    unsub();
  };
}

export async function writeBatch(
  ops: Array<
    | { type: 'update'; table: DocTable; id: string; data: Record<string, any> }
    | { type: 'set'; table: DocTable; id: string; data: Record<string, any>; merge?: boolean }
    | { type: 'delete'; table: DocTable; id: string }
  >
): Promise<void> {
  for (const op of ops) {
    if (op.type === 'update') await updateDoc(op.table, op.id, op.data);
    else if (op.type === 'set') await setDoc(op.table, op.id, op.data, { merge: op.merge });
    else if (op.type === 'delete') await deleteDoc(op.table, op.id);
  }
}
