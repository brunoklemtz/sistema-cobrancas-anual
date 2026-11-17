import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CalendarRange,
  MessageCircle,
  Phone,
  Plus,
  Save,
  Search,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { getDoc, setDoc } from '../lib/db';
import { RESERVAS_FOLHA } from '../data/reservasListaPapel';
import {
  RESERVATIONS_DOC_ID,
  RESERVATIONS_LOCAL_KEY,
  RESERVATIONS_SOURCE,
  Reservation,
  ReservationChannel,
  compareReservations,
  displayPhone,
  formatBrDate,
  mergeMissingFromSheet,
  newReservationId,
  nightsBetween,
  normalizePhone,
  reservationWhatsappLink,
} from '../utils/reservations';

type Origin = 'cloud' | 'local' | 'sheet';
type ChannelFilter = 'direto' | 'outra' | 'todas';
type PhoneFilter = 'todos' | 'sem' | 'com';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function readLocal(): Reservation[] | null {
  try {
    const raw = localStorage.getItem(RESERVATIONS_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as Reservation[];
  } catch {
    return null;
  }
}

function writeLocal(items: Reservation[]) {
  try {
    localStorage.setItem(RESERVATIONS_LOCAL_KEY, JSON.stringify(items));
  } catch {
    /* navegador sem espaço ou bloqueado */
  }
}

function monthLabel(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  const label = format(date, 'MMMM yyyy', { locale: ptBR });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function blankReservation(): Reservation {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  return {
    id: newReservationId(),
    guestName: '',
    checkIn: iso,
    checkOut: iso,
    channel: 'direto',
    status: 'confirmada',
  };
}

interface BoardProps {
  items: Reservation[];
  onChange: (items: Reservation[]) => void;
  externalQuery: string;
  origin: Origin;
  saving: boolean;
  saveError: string | null;
  loadWarning: string | null;
  onSave: () => void;
}

export function ReservationBoard({
  items,
  onChange,
  externalQuery,
  origin,
  saving,
  saveError,
  loadWarning,
  onSave,
}: BoardProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('direto');
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>('todos');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Reservation | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const direto = items.filter((item) => item.channel === 'direto' && item.status !== 'cancelada');
  const diretoSemTelefone = direto.filter((item) => !item.phone).length;

  const visible = useMemo(() => {
    const terms = [externalQuery, query].map((value) => value.trim().toLowerCase()).filter(Boolean);
    return [...items].sort(compareReservations).filter((item) => {
      if (channelFilter !== 'todas' && item.channel !== channelFilter) return false;
      if (phoneFilter === 'sem' && item.phone) return false;
      if (phoneFilter === 'com' && !item.phone) return false;
      if (terms.length === 0) return true;
      const haystack = [
        item.guestName,
        item.phone,
        displayPhone(item.phone),
        item.propertyHint,
        item.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [items, channelFilter, phoneFilter, query, externalQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const item of visible) {
      const key = /^\d{4}-\d{2}/.test(item.checkIn) ? item.checkIn.slice(0, 7) : 'revisar';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [visible]);

  const patch = (id: string, partial: Partial<Reservation>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...partial } : item)));
  };

  const remove = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
    setPendingDelete(null);
  };

  const addDraft = () => {
    if (!draft) return;
    const guestName = draft.guestName.trim();
    if (!guestName) {
      setDraftError('Informe o nome do hóspede.');
      return;
    }
    if (nightsBetween(draft.checkIn, draft.checkOut) <= 0) {
      setDraftError('A saída precisa ser depois da entrada.');
      return;
    }
    setDraftError(null);
    onChange(
      [...items, { ...draft, guestName, phone: draft.phone ? normalizePhone(draft.phone) : undefined }].sort(
        compareReservations
      )
    );
    setDraft(null);
    setChannelFilter('direto');
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="bg-amber-50 text-amber-700 p-3 rounded-2xl">
              <CalendarRange size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">Reservas de contato direto</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                Folha impressa · nov/2026 a fev/2027
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setDraftError(null);
                setDraft(blankReservation());
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm text-xs cursor-pointer"
            >
              <Plus size={16} />
              Nova reserva direta
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-sm text-xs cursor-pointer"
            >
              <Save size={16} />
              {saving ? 'Salvando...' : 'Salvar lista'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Contato direto" value={String(direto.length)} tone="amber" />
          <Stat label="Sem telefone" value={String(diretoSemTelefone)} tone={diretoSemTelefone ? 'rose' : 'emerald'} />
          <Stat label="Com telefone" value={String(direto.length - diretoSemTelefone)} tone="emerald" />
          <Stat label="Outra origem" value={String(items.filter((item) => item.channel === 'outra').length)} tone="slate" />
        </div>

        {origin !== 'cloud' && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-medium">
            A lista ainda está só nesta tela. Salve para gravar no sistema, junto com o backup.
            {origin === 'local' ? ' Há uma cópia neste navegador.' : ''}
          </div>
        )}
        {loadWarning && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {loadWarning}
          </div>
        )}
        {saveError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            Não consegui gravar no banco ({saveError}). A alteração ficou neste navegador.
          </div>
        )}

        <p className="text-sm text-slate-500 leading-relaxed">
          O marca-texto amarelo da folha entrou como contato direto. Unidade só quando o nome trazia o imóvel
          (Apto 202 e Ch 25). “Fechos 1900” da Terezinha foi lido como valor fechado de R$ 1.900,00. A Michelli
          ficou numa reserva só, com R$ 4.000,00 e o telefone do Paraguai. Isabel Gadonski tem a anotação IMPUM,
          e o e-mail do Diogo não deu para ler.
        </p>
      </div>

      {draft && (
        <div className="bg-white rounded-3xl border border-blue-200 p-5 shadow-sm space-y-3">
          <p className="text-sm font-black text-slate-900">Nova reserva de contato direto</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Field label="Hóspede">
              <input
                value={draft.guestName}
                onChange={(event) => setDraft({ ...draft, guestName: event.target.value })}
                className={inputClass}
                placeholder="Nome"
              />
            </Field>
            <Field label="Telefone">
              <input
                value={draft.phone || ''}
                onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                className={inputClass}
                placeholder="DDD + número"
              />
            </Field>
            <Field label="Entrada">
              <input
                type="date"
                value={draft.checkIn}
                onChange={(event) => setDraft({ ...draft, checkIn: event.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="Saída">
              <input
                type="date"
                value={draft.checkOut}
                onChange={(event) => setDraft({ ...draft, checkOut: event.target.value })}
                className={inputClass}
              />
            </Field>
          </div>
          {draftError && <p className="text-sm font-bold text-rose-600">{draftError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addDraft}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold cursor-pointer"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setDraftError(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={channelFilter === 'direto'} onClick={() => setChannelFilter('direto')}>
            Contato direto
          </FilterChip>
          <FilterChip active={channelFilter === 'outra'} onClick={() => setChannelFilter('outra')}>
            Outra origem
          </FilterChip>
          <FilterChip active={channelFilter === 'todas'} onClick={() => setChannelFilter('todas')}>
            Todas
          </FilterChip>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={phoneFilter === 'todos'} onClick={() => setPhoneFilter('todos')}>
            Todos
          </FilterChip>
          <FilterChip active={phoneFilter === 'sem'} onClick={() => setPhoneFilter('sem')}>
            Sem telefone
          </FilterChip>
          <FilterChip active={phoneFilter === 'com'} onClick={() => setPhoneFilter('com')}>
            Com telefone
          </FilterChip>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone ou unidade"
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(mergeMissingFromSheet(items, RESERVAS_FOLHA))}
          className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer px-2"
        >
          Trazer faltantes da folha
        </button>
      </div>

      {groups.length === 0 && (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center text-slate-400 font-bold">
          Nenhuma reserva nesse filtro.
        </div>
      )}

      {groups.map(([month, rows]) => (
        <section key={month} className="space-y-3">
          <h4 className="text-sm font-black uppercase tracking-widest text-slate-500 px-1">
            {month === 'revisar' ? 'Datas a revisar' : monthLabel(`${month}-01`)}
            <span className="ml-2 text-slate-300">{rows.length}</span>
          </h4>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {rows.map((item) => (
              <div key={item.id} className="contents">
                <ReservationCard
                  item={item}
                  pendingDelete={pendingDelete === item.id}
                  onPatch={(partial) => patch(item.id, partial)}
                  onAskDelete={() => setPendingDelete(item.id)}
                  onCancelDelete={() => setPendingDelete(null)}
                  onDelete={() => remove(item.id)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ReservationCard({
  item,
  pendingDelete,
  onPatch,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  item: Reservation;
  pendingDelete: boolean;
  onPatch: (partial: Partial<Reservation>) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const nights = nightsBetween(item.checkIn, item.checkOut);
  const link = reservationWhatsappLink(item);
  const direto = item.channel === 'direto';
  const cancelled = item.status === 'cancelada';

  return (
    <article
      className={`rounded-2xl border bg-white p-4 shadow-sm border-l-4 ${
        cancelled
          ? 'border-l-slate-300 opacity-70'
          : direto
            ? 'border-l-amber-400'
            : 'border-l-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <input
          value={item.guestName}
          onChange={(event) => onPatch({ guestName: event.target.value })}
          className={`flex-1 min-w-0 bg-transparent font-black text-slate-900 outline-none ${
            cancelled ? 'line-through' : ''
          }`}
          aria-label="Hóspede"
        />
        <button
          type="button"
          onClick={() => onPatch({ channel: (direto ? 'outra' : 'direto') as ReservationChannel })}
          className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide cursor-pointer ${
            direto ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {direto ? 'Contato direto' : 'Outra origem'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Field label="Entrada">
          <input
            type="date"
            value={item.checkIn}
            onChange={(event) => onPatch({ checkIn: event.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Saída">
          <input
            type="date"
            value={item.checkOut}
            onChange={(event) => onPatch({ checkOut: event.target.value })}
            className={inputClass}
          />
        </Field>
      </div>
      <p className={`text-[11px] font-bold mt-1 ${nights > 0 ? 'text-slate-400' : 'text-rose-600'}`}>
        {nights > 0 ? `${nights} ${nights === 1 ? 'noite' : 'noites'} · ${formatBrDate(item.checkIn)} a ${formatBrDate(item.checkOut)}` : 'A saída precisa ser depois da entrada.'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <Field label="Telefone">
          <PhoneInput
            value={item.phone}
            onCommit={(phone) => onPatch({ phone })}
          />
        </Field>
        <Field label="Unidade">
          <input
            value={item.propertyHint || ''}
            onChange={(event) => onPatch({ propertyHint: event.target.value || undefined })}
            placeholder="Se souber o imóvel"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <Field label="Valor">
          <input
            value={item.amount != null ? String(item.amount).replace('.', ',') : ''}
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onPatch({ amount: undefined });
                return;
              }
              const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
              onPatch({ amount: Number.isFinite(parsed) ? parsed : item.amount });
            }}
            placeholder="Opcional"
            className={inputClass}
          />
        </Field>
        <Field label="Obs">
          <input
            value={item.notes || ''}
            onChange={(event) => onPatch({ notes: event.target.value || undefined })}
            className={inputClass}
          />
        </Field>
      </div>

      {item.amount != null && (
        <p className="text-xs font-black text-emerald-700 mt-2">{money.format(item.amount)}</p>
      )}
      {!item.phone && !cancelled && (
        <p className="text-[11px] font-bold text-rose-500 mt-2 flex items-center gap-1">
          <Phone size={12} /> Sem telefone
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold"
          >
            <MessageCircle size={14} />
            WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={() => onPatch({ status: cancelled ? 'confirmada' : 'cancelada' })}
          className="px-3 py-2 rounded-xl bg-slate-50 text-slate-500 text-xs font-bold cursor-pointer"
        >
          {cancelled ? 'Reativar' : 'Marcar cancelada'}
        </button>
        {pendingDelete ? (
          <>
            <button type="button" onClick={onDelete} className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer">
              Confirmar exclusão
            </button>
            <button type="button" onClick={onCancelDelete} className="px-3 py-2 rounded-xl text-slate-500 text-xs font-bold cursor-pointer">
              Voltar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAskDelete}
            className="ml-auto inline-flex items-center gap-1 px-2 py-2 text-slate-400 hover:text-rose-600 text-xs font-bold cursor-pointer"
          >
            <Trash2 size={14} />
            Excluir
          </button>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'rose' | 'emerald' | 'slate' }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className={`rounded-2xl px-4 py-3 ${tones[tone]}`}>
      <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
      <p className="text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-xs font-black cursor-pointer ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function PhoneInput({ value, onCommit }: { value?: string; onCommit: (phone?: string) => void }) {
  const [text, setText] = useState(value ? displayPhone(value) : '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value ? displayPhone(value) : '');
  }, [value, focused]);

  return (
    <input
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(event) => {
        const next = event.target.value;
        setText(next);
        onCommit(normalizePhone(next));
      }}
      onBlur={(event) => {
        const phone = normalizePhone(event.target.value);
        setFocused(false);
        onCommit(phone);
        setText(phone ? displayPhone(phone) : '');
      }}
      placeholder="Sem telefone na folha"
      className={inputClass}
      inputMode="tel"
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500';

function initialReservations(): { items: Reservation[]; origin: Origin } {
  const local = readLocal();
  if (local) return { items: [...local].sort(compareReservations), origin: 'local' };
  return { items: [...RESERVAS_FOLHA].sort(compareReservations), origin: 'sheet' };
}

export default function ReservationList({ searchTerm = '' }: { searchTerm?: string }) {
  const initial = useRef(initialReservations());
  const [items, setItems] = useState<Reservation[]>(initial.current.items);
  const [origin, setOrigin] = useState<Origin>(initial.current.origin);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);
  const itemsRef = useRef<Reservation[]>(initial.current.items);
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await getDoc('settings', RESERVATIONS_DOC_ID);
        const saved = Array.isArray(doc?.items) ? (doc.items as Reservation[]) : [];
        if (cancelled || dirtyRef.current || saved.length === 0) return;
        const sorted = [...saved].sort(compareReservations);
        itemsRef.current = sorted;
        setItems(sorted);
        setOrigin('cloud');
        writeLocal(sorted);
      } catch (error: any) {
        if (!cancelled) {
          setLoadWarning(
            `Não deu para ler as reservas salvas (${error?.message || 'falha de rede'}). A folha está na tela. Evite salvar por cima se essa lista já estava no sistema.`
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = async (list: Reservation[]) => {
    const snapshot = JSON.stringify(list);
    writeLocal(list);
    setSaving(true);
    try {
      await setDoc(
        'settings',
        RESERVATIONS_DOC_ID,
        {
          items: list,
          importedFrom: RESERVATIONS_SOURCE,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setOrigin('cloud');
      setSaveError(null);
      setLoadWarning(null);
      if (JSON.stringify(itemsRef.current) === snapshot) setDirty(false);
    } catch (error: any) {
      setSaveError(error?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      persist(itemsRef.current);
    }, 700);
    return () => clearTimeout(timer);
  }, [dirty, items]);

  const onChange = (next: Reservation[]) => {
    const sorted = [...next].sort(compareReservations);
    itemsRef.current = sorted;
    dirtyRef.current = true;
    setItems(sorted);
    setDirty(true);
  };

  return (
    <ReservationBoard
      items={items}
      onChange={onChange}
      externalQuery={searchTerm}
      origin={origin}
      saving={saving}
      saveError={saveError}
      loadWarning={loadWarning}
      onSave={() => persist(itemsRef.current)}
    />
  );
}
