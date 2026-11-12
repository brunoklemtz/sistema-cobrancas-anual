export type ReservationChannel = 'direto' | 'outra';
export type ReservationStatus = 'confirmada' | 'cancelada';

/** Reserva lida da folha impressa ou cadastrada na aba Reservas. */
export interface Reservation {
  id: string;
  sourceKey?: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  channel: ReservationChannel;
  status: ReservationStatus;
  phone?: string;
  propertyHint?: string;
  amount?: number;
  notes?: string;
}

export const RESERVATIONS_DOC_ID = 'direct_reservations';
export const RESERVATIONS_LOCAL_KEY = 'gestao-billing-reservas-contato-direto-v1';
export const RESERVATIONS_SOURCE = 'folha-2026-11-12';

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Guarda só dígitos, com DDI. Número brasileiro de 10 ou 11 dígitos ganha 55. */
export function normalizePhone(raw: string): string | undefined {
  const digits = onlyDigits(raw);
  if (!digits) return undefined;
  if (digits.startsWith('595')) return digits;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function displayPhone(phone?: string): string {
  if (!phone) return '';
  const digits = onlyDigits(phone);
  if (!digits) return phone;
  if (digits.startsWith('595')) return `+595 ${digits.slice(3)}`;

  let local = digits;
  if (local.startsWith('55') && local.length > 11) local = local.slice(2);
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return phone;
}

export function whatsappUrl(phone?: string): string | null {
  const digits = phone ? onlyDigits(phone) : '';
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / 86400000);
}

export function formatBrDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function compareReservations(a: Reservation, b: Reservation): number {
  if (a.checkIn !== b.checkIn) return a.checkIn < b.checkIn ? -1 : 1;
  return a.guestName.localeCompare(b.guestName, 'pt-BR');
}

export function mergeMissingFromSheet(current: Reservation[], sheet: Reservation[]): Reservation[] {
  const keys = new Set(current.map((item) => item.sourceKey).filter(Boolean));
  const missing = sheet.filter((item) => item.sourceKey && !keys.has(item.sourceKey));
  return [...current, ...missing].sort(compareReservations);
}

export function reservationWhatsappLink(reservation: Reservation): string | null {
  const base = whatsappUrl(reservation.phone);
  if (!base) return null;
  const firstName = reservation.guestName.trim().split(/\s+/)[0] || reservation.guestName;
  const text = `Olá, ${firstName}! Aqui é sobre a sua reserva de ${formatBrDate(reservation.checkIn)} a ${formatBrDate(reservation.checkOut)}.`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function newReservationId(): string {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
