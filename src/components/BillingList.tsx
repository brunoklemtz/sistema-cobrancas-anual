import React from 'react';
import { BillingRecord, Property } from '../types';
import { 
  Edit2, Trash2, Droplets, Zap, Calendar, DollarSign, CheckCircle, Clock, 
  AlertCircle, Plus, FileText, MessageSquare, FileDown, Copy, Check,
  ChevronUp, ChevronDown, Archive, Palette
} from 'lucide-react';
import { format, isBefore, addDays, startOfDay } from 'date-fns';
import { parseDate } from '../utils/firestore';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface BillingListProps {
  billings: BillingRecord[];
  properties: Property[];
  onEdit: (billing: BillingRecord) => void;
  onDelete: (ids: string[]) => void;
  onArchive: (ids: string[]) => void;
  onUpdateColor: (ids: string[], color: string | null) => void;
  onUpdateStatus: (ids: string[], status: 'pending' | 'paid' | 'overdue' | 'cancelled') => void;
  onUpdateNotes: (ids: string[], notes: string) => void;
}

type SortKey = 'property' | 'tenant' | 'phone' | 'dueDate' | 'totalAmount' | 'status' | 'notes';
type SortDirection = 'asc' | 'desc';
type SituationFilter = 'all' | 'awaiting' | 'paid' | 'overdue' | 'cancelled';

const SITUATION_FILTER_OPTIONS: { value: SituationFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'awaiting', label: 'Aguardando Pagamento' },
  { value: 'paid', label: 'Paga' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'cancelled', label: 'Cancelada' },
];

const COLOR_OPTIONS = [
  { name: 'Limpar Cor', value: '', class: 'bg-white border-slate-300' },
  { name: 'Azul', value: '#3b82f6', class: 'bg-blue-500 border-blue-600' },
  { name: 'Verde', value: '#22c55e', class: 'bg-emerald-500 border-emerald-600' },
  { name: 'Amarelo', value: '#eab308', class: 'bg-amber-500 border-amber-600' },
  { name: 'Vermelho', value: '#ef4444', class: 'bg-rose-500 border-rose-600' },
  { name: 'Roxo', value: '#a855f7', class: 'bg-purple-500 border-purple-600' },
  { name: 'Laranja', value: '#f97316', class: 'bg-orange-500 border-orange-600' },
];

export default function BillingList({ billings, properties, onEdit, onDelete, onArchive, onUpdateColor, onUpdateStatus, onUpdateNotes }: BillingListProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [copiedSummaryId, setCopiedSummaryId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [activeColorPicker, setActiveColorPicker] = React.useState<string | null>(null);
  const [activeStatusPicker, setActiveStatusPicker] = React.useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = React.useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = React.useState<string>('');
  const [situationFilter, setSituationFilter] = React.useState<SituationFilter>('awaiting');
  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: SortDirection }>({
    key: 'dueDate',
    direction: 'asc'
  });

  const getDueDateObject = (dueDate: any): Date => {
    const d = parseDate(dueDate);
    return d || new Date(0);
  };

  const formatDisplayDate = (val: any): string => {
    const d = parseDate(val);
    return d ? format(d, 'dd/MM/yyyy') : '-';
  };

  const isOverdue = (date: any, status?: string) => {
    if (status === 'paid' || status === 'cancelled') return false;
    if (status === 'overdue') return true;
    if (status !== 'pending') return false;
    const today = startOfDay(new Date());
    const dueDateObj = getDueDateObject(date);
    return isBefore(dueDateObj, today);
  };

  const isDueSoon = (date: any, status?: string) => {
    if (status !== 'pending' || isOverdue(date, status)) return false;
    const today = startOfDay(new Date());
    const warningDate = addDays(today, 3);
    const dueDateObj = getDueDateObject(date);
    return isBefore(dueDateObj, warningDate);
  };

  const matchesSituationFilter = (record: BillingRecord, filter: SituationFilter) => {
    const st = record.status || 'pending';
    if (filter === 'all') return true;
    if (filter === 'cancelled') return st === 'cancelled';
    if (filter === 'paid') return st === 'paid';
    if (filter === 'overdue') {
      return st !== 'paid' && st !== 'cancelled' && (st === 'overdue' || isOverdue(record.dueDate, st));
    }
    // awaiting = Aguardando Pagamento
    return st === 'pending' && !isOverdue(record.dueDate, st);
  };

  const getStatusWeight = (record: BillingRecord) => {
    const st = record.status || 'pending';
    if (st === 'cancelled') return 5;
    if (st === 'overdue' || isOverdue(record.dueDate, st)) return 1; // Vencida
    if (isDueSoon(record.dueDate, st)) return 2; // Vence Logo
    if (st === 'pending') return 3; // Aguardando Pagamento
    if (st === 'paid') return 4; // Paga
    return 6;
  };

  const getPropertyInfo = (billing: BillingRecord) => {
    const p = properties.find(p => p.id === billing.propertyId);
    const code = p ? p.propertyCode : (billing.propertyCode || 'Removido');
    
    let tenant = billing.tenantName;

    if (p) {
      const leaseStart = parseDate(p.leaseStartDate);
      const bDueDate = getDueDateObject(billing.dueDate);

      if (leaseStart && bDueDate && isBefore(bDueDate, leaseStart)) {
        if (!tenant || tenant.trim().toLowerCase() === p.ownerName?.trim().toLowerCase()) {
          tenant = `Ex-Inquilino (${code})`;
        }
      }
    }

    if (!tenant) {
      tenant = p ? p.ownerName : '-';
    }

    const phone = billing.tenantPhone || (p ? p.phone : '');
    return { code, tenant, phone };
  };

  // Group billings by propertyId and dueDate
  const groupedBillings = React.useMemo(() => {
    const groups: Record<string, BillingRecord & { ids: string[] }> = {};

    billings.forEach(billing => {
      const dateObj = getDueDateObject(billing.dueDate);
      const dateStr = format(dateObj, 'yyyy-MM-dd');
      const key = `${billing.propertyId}_${dateStr}`;

      const billingItems = billing.items || [{
        type: (billing as any).type,
        amount: (billing as any).amount || 0,
        previousReading: (billing as any).previousReading,
        currentReading: (billing as any).currentReading,
        notes: (billing as any).notes
      }];

      if (groups[key]) {
        // Merge items
        const existingItems = groups[key].items || [];
        groups[key].items = [...existingItems, ...billingItems];
        groups[key].totalAmount = (groups[key].totalAmount || 0) + (billing.totalAmount || (billing as any).amount || 0);
        groups[key].paidAmount = (groups[key].paidAmount || 0) + (billing.paidAmount || 0);
        groups[key].ids.push(billing.id!);
        
        // Status priority: overdue > pending > cancelled > paid
        if (billing.status === 'overdue') {
          groups[key].status = 'overdue';
        } else if (billing.status === 'pending' && groups[key].status !== 'overdue') {
          groups[key].status = 'pending';
        } else if (billing.status === 'cancelled' && groups[key].status === 'paid') {
          groups[key].status = 'cancelled';
        }
      } else {
        groups[key] = {
          ...billing,
          items: billingItems,
          totalAmount: billing.totalAmount || (billing as any).amount || 0,
          ids: [billing.id!]
        };
      }
    });

    const result = Object.values(groups).filter(b => matchesSituationFilter(b, situationFilter));

    // Apply sorting
    result.sort((a, b) => {
      let comparison = 0;
      
      switch (sortConfig.key) {
        case 'property': {
          const propA = (getPropertyInfo(a).code || '').toString();
          const propB = (getPropertyInfo(b).code || '').toString();
          comparison = propA.localeCompare(propB, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'tenant': {
          const tenantA = (getPropertyInfo(a).tenant || '').toString();
          const tenantB = (getPropertyInfo(b).tenant || '').toString();
          comparison = tenantA.localeCompare(tenantB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'phone': {
          const phoneA = (getPropertyInfo(a).phone || '').toString();
          const phoneB = (getPropertyInfo(b).phone || '').toString();
          comparison = phoneA.localeCompare(phoneB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'dueDate': {
          comparison = getDueDateObject(a.dueDate).getTime() - getDueDateObject(b.dueDate).getTime();
          break;
        }
        case 'totalAmount': {
          comparison = (a.totalAmount || 0) - (b.totalAmount || 0);
          break;
        }
        case 'status': {
          const weightA = getStatusWeight(a);
          const weightB = getStatusWeight(b);
          if (weightA !== weightB) {
            comparison = weightA - weightB;
          } else {
            const codeA = (getPropertyInfo(a).code || '').toString();
            const codeB = (getPropertyInfo(b).code || '').toString();
            comparison = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
          }
          break;
        }
        case 'notes': {
          const notesA = (a.notes || '').toString();
          const notesB = (b.notes || '').toString();
          comparison = notesA.localeCompare(notesB, undefined, { sensitivity: 'base' });
          break;
        }
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [billings, sortConfig, properties, situationFilter]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
  };

  const getStatusBadge = (status: string, dueDate: any) => {
    if (status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100 uppercase tracking-wider">
          <CheckCircle size={10} />
          Paga
        </span>
      );
    }

    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200 uppercase tracking-wider">
          <AlertCircle size={10} />
          Cancelada
        </span>
      );
    }

    const overdue = isOverdue(dueDate, status);
    const soon = isDueSoon(dueDate, status);
    
    if (overdue || status === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-100 uppercase tracking-wider">
          <AlertCircle size={10} />
          Vencida
        </span>
      );
    }

    if (soon) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-100 uppercase tracking-wider animate-pulse">
          <AlertCircle size={10} />
          Vence Logo
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100 uppercase tracking-wider">
        <Clock size={10} />
        Aguardando Pagamento
      </span>
    );
  };

  const toggleSelect = (ids: string[]) => {
    const newSelected = new Set(selectedIds);
    const allSelected = ids.every(id => newSelected.has(id));
    
    if (allSelected) {
      ids.forEach(id => newSelected.delete(id));
    } else {
      ids.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    const allBillingIds = groupedBillings.flatMap(b => b.ids);
    if (selectedIds.size === allBillingIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allBillingIds));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size > 0) {
      onDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const copyBillingText = (billing: BillingRecord) => {
    const prop = getPropertyInfo(billing);
    const dueDate = formatDisplayDate(billing.dueDate);
    const readingParsed = parseDate(billing.readingDate);
    const readingDate = readingParsed ? format(readingParsed, 'dd/MM/yyyy') : null;

    const total = (billing.totalAmount || (billing as any).amount || 0);
    const paid = (billing.paidAmount || 0);
    const remaining = Math.max(0, total - paid).toFixed(2);
    const surplus = paid > total ? (paid - total).toFixed(2) : null;
    const totalStr = total.toFixed(2);
    const paidStr = paid.toFixed(2);
    
    let message = `*COBRANÇA - ${prop.code}*\n`;
    message += `Olá, ${prop.tenant}.\n\n`;
    if (readingDate) {
      message += `Data da Leitura: ${readingDate}\n`;
    }
    message += `Vencimento: *${dueDate}*\n\n`;
    message += `Detalhamento:\n`;

    const items = billing.items || [];

    items.forEach(item => {
      let typeLabel = '';
      switch(item.type) {
        case 'water': typeLabel = 'Água'; break;
        case 'electricity': typeLabel = 'Luz'; break;
        case 'rent': typeLabel = 'Aluguel'; break;
        case 'other': typeLabel = item.notes ? item.notes : 'Outro'; break;
        default: typeLabel = 'Item';
      }

      if (item.amount < 0) {
        message += `• *${typeLabel}:* -R$ ${Math.abs(item.amount).toFixed(2)}\n`;
      } else {
        message += `• *${typeLabel}:* R$ ${item.amount.toFixed(2)}\n`;
      }
      
      if (item.type === 'water' || item.type === 'electricity') {
        if (item.previousReading !== undefined && item.currentReading !== undefined && item.previousReading !== null && item.currentReading !== null) {
          message += `  Leitura: ${item.previousReading} → ${item.currentReading} (${(item.currentReading - item.previousReading).toFixed(2)} consumidos)\n`;
        }
      }
      
      if (item.type !== 'other' && item.notes) {
        message += `  Obs: ${item.notes}\n`;
      }
    });

    message += `\n*TOTAL DA COBRANÇA: R$ ${totalStr}*\n`;

    if (billing.paymentHistory && billing.paymentHistory.length > 0) {
      message += `\n*Pagamentos/Baixas Realizadas:*\n`;
      billing.paymentHistory.forEach((ph, idx) => {
        const dateFmt = formatDisplayDate(ph.date);
        message += `• ${idx + 1}º Pagto: R$ ${ph.amount.toFixed(2)} em ${dateFmt}${ph.notes ? ` (${ph.notes})` : ''}\n`;
      });
      message += `\n*Total Pago:* R$ ${paidStr}\n`;
    }
    
    message += `\n`;
    if (billing.status === 'cancelled') {
      message += `*STATUS: CANCELADA*\n`;
    } else if (surplus && parseFloat(surplus) > 0) {
      message += `*STATUS: QUITADO (SALDO POSITIVO / CRÉDITO: R$ ${surplus})*\n`;
    } else if (billing.status === 'paid') {
      message += `*STATUS: QUITADO*\n`;
    } else if (paid > 0) {
      message += `*SALDO DEVEDOR / FALTA: R$ ${remaining}*\n`;
    } else {
      message += `*STATUS: PENDENTE*\n`;
    }
    
    navigator.clipboard.writeText(message).then(() => {
      setCopiedId(billing.id || billing.groupKey || 'copied');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const copyBillingTextSummary = (billing: BillingRecord) => {
    const prop = getPropertyInfo(billing);
    const dueDate = formatDisplayDate(billing.dueDate);

    const total = (billing.totalAmount || (billing as any).amount || 0);
    const paid = (billing.paidAmount || 0);
    const remaining = Math.max(0, total - paid);

    const totalStr = total.toFixed(2);
    const paidStr = paid.toFixed(2);
    const remainingStr = remaining.toFixed(2);
    
    let message = `*Fatura - ${prop.code}*\n`;
    message += `Inquilino: ${prop.tenant}\n\n`;

    const items = billing.items || [];
    items.forEach(item => {
      let typeLabel = '';
      switch(item.type) {
        case 'water': typeLabel = 'Água'; break;
        case 'electricity': typeLabel = 'Luz'; break;
        case 'rent': typeLabel = 'Aluguel'; break;
        case 'other': typeLabel = item.notes ? item.notes : 'Outro'; break;
        default: typeLabel = 'Item';
      }
      
      if (item.amount < 0) {
        message += `• *${typeLabel}:* -R$ ${Math.abs(item.amount).toFixed(2)}\n`;
      } else {
        message += `• *${typeLabel}:* R$ ${item.amount.toFixed(2)}\n`;
      }
    });

    message += `\n*Vencimento:* ${dueDate}\n`;
    message += `*Total:* R$ ${totalStr}\n`;
    message += `*Valor Pago:* R$ ${paidStr}\n`;
    message += `*Saldo Devedor:* R$ ${remainingStr}\n`;
    
    navigator.clipboard.writeText(message).then(() => {
      setCopiedSummaryId(billing.id || billing.groupKey || 'copied-summary');
      setTimeout(() => setCopiedSummaryId(null), 2000);
    });
  };

  const generatePDF = (billing: BillingRecord) => {
    const prop = getPropertyInfo(billing);
    const dueDate = formatDisplayDate(billing.dueDate);

    const totalAmount = (billing.totalAmount || (billing as any).amount || 0);
    const total = totalAmount.toFixed(2);
    
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text('Relatório de Cobrança', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Imóvel: ${prop.code}`, 20, 40);
    doc.text(`Inquilino: ${prop.tenant}`, 20, 48);
    if (billing.readingDate) {
      const rDate = formatDisplayDate(billing.readingDate);
      doc.text(`Data da Leitura: ${rDate}`, 20, 56);
      doc.text(`Vencimento: ${dueDate}`, 20, 64);
    } else {
      doc.text(`Vencimento: ${dueDate}`, 20, 56);
    }
    
    const items = billing.items || [];

    const tableData = items.map(item => {
      let typeLabel = '';
      switch(item.type) {
        case 'water': typeLabel = 'Água'; break;
        case 'electricity': typeLabel = 'Luz'; break;
        case 'rent': typeLabel = 'Aluguel'; break;
        case 'other': typeLabel = item.notes ? item.notes : 'Outro'; break;
        default: typeLabel = 'Item';
      }

      const readingInfo = item.previousReading !== undefined && item.currentReading !== undefined && item.previousReading !== null && item.currentReading !== null 
        ? `${item.previousReading} → ${item.currentReading} (${(item.currentReading - item.previousReading).toFixed(2)})`
        : '-';

      const itemValStr = item.amount < 0 ? `-R$ ${Math.abs(item.amount).toFixed(2)}` : `R$ ${item.amount.toFixed(2)}`;
      return [typeLabel, readingInfo, itemValStr];
    });

    autoTable(doc, {
      startY: billing.readingDate ? 75 : 70,
      head: [['Descrição', 'Leituras/Consumo', 'Valor']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      margin: { left: 20, right: 20 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    // Insert Partial Payments table if present
    if (billing.paymentHistory && billing.paymentHistory.length > 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 185, 129);
      doc.text('Histórico de Pagamentos Parciais / Baixas:', 20, finalY);

      const historyData = billing.paymentHistory.map(ph => {
        return [formatDisplayDate(ph.date), `R$ ${ph.amount.toFixed(2)}`, ph.notes || '-'];
      });

      autoTable(doc, {
        startY: finalY + 4,
        head: [['Data do Pagamento', 'Valor Pago', 'Observação / Método']],
        body: historyData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        margin: { left: 20, right: 20 }
      });

      finalY = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`TOTAL DA COBRANÇA: R$ ${total}`, 190, finalY, { align: 'right' });

    const paid = billing.paidAmount || 0;
    const surplus = paid > totalAmount ? paid - totalAmount : 0;
    if (billing.status === 'cancelled') {
      doc.setFontSize(14);
      doc.setTextColor(100, 116, 139);
      doc.text('STATUS: CANCELADA', 190, finalY + 8, { align: 'right' });
    } else if (surplus > 0) {
      doc.setFontSize(14);
      doc.setTextColor(22, 163, 74);
      doc.text('STATUS: QUITADO', 190, finalY + 8, { align: 'right' });
      doc.setFontSize(12);
      doc.setTextColor(13, 148, 136);
      doc.text(`SALDO POSITIVO / CRÉDITO: R$ ${surplus.toFixed(2)}`, 190, finalY + 16, { align: 'right' });
    } else if (billing.status === 'paid') {
      doc.setFontSize(14);
      doc.setTextColor(22, 163, 74);
      doc.text('STATUS: QUITADO', 190, finalY + 8, { align: 'right' });
    } else if (paid > 0) {
      const remaining = Math.max(0, (billing.totalAmount || 0) - paid).toFixed(2);
      doc.setFontSize(12);
      doc.setTextColor(22, 163, 74);
      doc.text(`TOTAL PAGO: R$ ${paid.toFixed(2)}`, 190, finalY + 8, { align: 'right' });
      doc.setTextColor(220, 38, 38);
      doc.text(`SALDO PENDENTE: R$ ${remaining}`, 190, finalY + 16, { align: 'right' });
    } else {
      doc.setFontSize(12);
      doc.setTextColor(220, 38, 38);
      doc.text('STATUS: PENDENTE', 190, finalY + 8, { align: 'right' });
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 105, 285, { align: 'center' });

    doc.save(`cobranca_${prop.code}_${dueDate.replace(/\//g, '-')}.pdf`);
  };

  if (billings.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
        <DollarSign className="mx-auto text-slate-300 mb-4" size={48} />
        <p className="text-slate-500 font-medium">Nenhuma cobrança registrada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm px-4 py-3 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <label className="block text-xs font-bold text-slate-600 mb-1.5">
            Situação da fatura
          </label>
          <select
            value={situationFilter}
            onChange={(e) => {
              setSituationFilter(e.target.value as SituationFilter);
              setSelectedIds(new Set());
            }}
            className="w-full px-3 py-2.5 bg-white border border-emerald-500/80 rounded-xl text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30 cursor-pointer"
          >
            {SITUATION_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="text-xs text-slate-500 font-medium pb-2.5">
          {groupedBillings.length} fatura(s) exibida(s)
        </div>
      </div>

      {selectedIds.size > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between bg-blue-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-blue-100"
        >
          <div className="flex items-center gap-3">
            <CheckCircle size={20} />
            <span className="font-bold">{selectedIds.size} selecionados</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-1.5 hover:bg-white/10 rounded-xl transition-colors text-sm font-bold"
            >
              Cancelar
            </button>
            <button 
              onClick={() => {
                onArchive(Array.from(selectedIds));
                setSelectedIds(new Set());
              }}
              className="px-4 py-1.5 bg-purple-500 hover:bg-purple-600 rounded-xl transition-all text-sm font-bold shadow-sm"
            >
              Arquivar Selecionados
            </button>
            <button 
              onClick={handleDeleteSelected}
              className="px-4 py-1.5 bg-red-500 hover:bg-red-600 rounded-xl transition-all text-sm font-bold shadow-sm"
            >
              Excluir Selecionados
            </button>
          </div>
        </motion.div>
      )}

      {groupedBillings.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-200">
          <DollarSign className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-500 font-medium">Nenhuma fatura nesta situação.</p>
        </div>
      ) : (
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm">
        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse min-w-[950px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100 relative z-0">
                <th className="px-4 py-3 w-10">
                  <input 
                    type="checkbox" 
                    className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500/20 transition-all cursor-pointer"
                    checked={selectedIds.size > 0 && groupedBillings.every(b => (b.ids || [b.id!]).every(id => selectedIds.has(id)))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th 
                  className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[12%] min-w-[120px]"
                  onClick={() => handleSort('property')}
                >
                  <div className="flex items-center gap-1.5">
                    Imóvel
                    <SortIcon column="property" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[15%] min-w-[160px]"
                  onClick={() => handleSort('tenant')}
                >
                  <div className="flex items-center gap-1.5">
                    Inquilino
                    <SortIcon column="tenant" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[12%] min-w-[120px]"
                  onClick={() => handleSort('phone')}
                >
                  <div className="flex items-center gap-1.5">
                    Telefone
                    <SortIcon column="phone" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[11%] min-w-[110px]"
                  onClick={() => handleSort('dueDate')}
                >
                  <div className="flex items-center gap-1.5">
                    Vencimento
                    <SortIcon column="dueDate" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[14%] min-w-[140px]"
                  onClick={() => handleSort('totalAmount')}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Saldo Devedor
                    <SortIcon column="totalAmount" />
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-center text-[11px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-blue-600 transition-colors w-[12%] min-w-[110px]"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    Status
                    <SortIcon column="status" />
                  </div>
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 uppercase tracking-widest w-[140px] min-w-[140px] h-[45.8px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {groupedBillings.map((billing, index) => (
                <motion.tr
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  key={billing.groupKey || billing.id}
                  className={`group transition-all duration-200 border-l-4 hover:brightness-[0.98] ${
                    (billing.ids || [billing.id!]).every(id => selectedIds.has(id)) ? 'bg-blue-50/40' : ''
                  }`}
                  style={{ 
                    backgroundColor: billing.colorTag ? `${billing.colorTag}66` : 'white',
                    borderLeftColor: billing.colorTag || 'transparent',
                    zIndex: activeStatusPicker === (billing.id || billing.groupKey) || activeColorPicker === (billing.id || billing.groupKey) ? 50 : 0,
                    position: 'relative'
                  }}
                >
                  <td className="px-4 py-3.5">
                    <input 
                      type="checkbox" 
                      className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500/20 transition-all cursor-pointer"
                      checked={(billing.ids || [billing.id!]).every(id => selectedIds.has(id))}
                      onChange={() => toggleSelect(billing.ids || [billing.id!])}
                    />
                  </td>
                  <td className="px-4 py-3.5 font-bold text-sm text-slate-900 tracking-tight">
                    <div className="flex items-center gap-2">
                      <span>{getPropertyInfo(billing).code}</span>
                      {(billing as any).isVirtual && (
                        <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 uppercase tracking-tighter shrink-0">
                          Aguardando Leitura
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700 font-semibold">
                    {getPropertyInfo(billing).tenant}
                  </td>
                  <td className="px-4 py-3.5">
                    {getPropertyInfo(billing).phone ? (
                      <span className="inline-flex text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100/50">
                        {getPropertyInfo(billing).phone}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-xs font-mono font-bold ${isOverdue(billing.dueDate, billing.status) ? 'text-rose-600' : 'text-slate-700'}`}>
                        {format(getDueDateObject(billing.dueDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-mono font-bold ${billing.status === 'paid' ? 'text-emerald-600' : 'text-slate-900'}`}>
                        R$ {Math.max(0, (billing.totalAmount || 0) - (billing.paidAmount || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      {(billing.paidAmount || 0) > (billing.totalAmount || 0) ? (
                        <span className="text-[10px] text-teal-700 font-bold bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-100/50">
                          Crédito: + R$ {((billing.paidAmount || 0) - (billing.totalAmount || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ) : billing.status === 'paid' ? (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100/50">
                          Quitado
                        </span>
                      ) : (
                        (billing.paidAmount || 0) > 0 && (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100/50">
                            Pago: R$ {(billing.paidAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <div className="flex flex-col items-center gap-1 relative">
                      <button
                        onClick={() => setActiveStatusPicker(activeStatusPicker === (billing.id || billing.groupKey) ? null : (billing.id || billing.groupKey || null))}
                        className="transition-transform hover:scale-105 active:scale-95"
                      >
                        {getStatusBadge(billing.status, billing.dueDate)}
                      </button>

                      <AnimatePresence>
                        {activeStatusPicker === (billing.id || billing.groupKey) && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 10 }}
                            className="absolute bottom-full mb-2 p-2 bg-white rounded-2xl shadow-2xl border border-slate-100 flex flex-col gap-1 z-[100] min-w-[120px]"
                          >
                            {[
                              { id: 'pending', label: 'Aguardando Pagamento', icon: Clock, class: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
                              { id: 'paid', label: 'Paga', icon: CheckCircle, class: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
                              { id: 'overdue', label: 'Vencida', icon: AlertCircle, class: 'text-rose-600 bg-rose-50 hover:bg-rose-100' },
                              { id: 'cancelled', label: 'Cancelada', icon: AlertCircle, class: 'text-slate-600 bg-slate-50 hover:bg-slate-100' },
                            ].map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  onUpdateStatus(billing.ids || [billing.id!], s.id as 'pending' | 'paid' | 'overdue' | 'cancelled');
                                  setActiveStatusPicker(null);
                                }}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors ${s.class} ${billing.status === s.id ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                              >
                                <s.icon size={12} />
                                {s.label}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {billing.archived && (
                        <span className="text-[7px] font-bold text-purple-500 uppercase tracking-tighter bg-purple-50 px-1 rounded">Arquivado</span>
                      )}
                    </div>
                  </td>
                   <td className="px-4 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => copyBillingText(billing)}
                        className={`p-2 rounded-xl transition-all ${
                          copiedId === (billing.id || billing.groupKey) 
                            ? 'text-emerald-600 bg-emerald-50' 
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title="Copiar texto completo"
                      >
                        {copiedId === (billing.id || billing.groupKey) ? <Check size={16} /> : <MessageSquare size={16} />}
                      </button>
                      <button
                        onClick={() => copyBillingTextSummary(billing)}
                        className={`p-2 rounded-xl transition-all ${
                          copiedSummaryId === (billing.id || billing.groupKey) 
                            ? 'text-emerald-600 bg-emerald-50' 
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title="Copiar texto resumido"
                      >
                        {copiedSummaryId === (billing.id || billing.groupKey) ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                      <button
                        onClick={() => generatePDF(billing)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                        title="Gerar PDF"
                      >
                        <FileDown size={16} />
                      </button>
                      
                      <div className="relative">
                        <button
                          onClick={() => setActiveColorPicker(activeColorPicker === (billing.id || billing.groupKey) ? null : (billing.id || billing.groupKey || null))}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title="Destacar linha"
                        >
                          <Palette size={16} />
                        </button>
                        
                        <AnimatePresence>
                          {activeColorPicker === (billing.id || billing.groupKey) && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 10 }}
                              className="absolute right-0 bottom-full mb-2 p-2 bg-white rounded-2xl shadow-2xl border border-slate-100 flex gap-1.5 z-[100]"
                            >
                              {COLOR_OPTIONS.map((color) => (
                                <button
                                  key={color.name}
                                  onClick={() => {
                                    onUpdateColor(billing.ids || [billing.id!], color.value);
                                    setActiveColorPicker(null);
                                  }}
                                  className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-sm relative ${color.class} ${
                                    (billing.colorTag === color.value || (!billing.colorTag && color.value === '')) 
                                      ? 'ring-2 ring-offset-2 ring-blue-500 scale-110 z-10' 
                                      : 'border-slate-200'
                                  }`}
                                  title={color.name}
                                >
                                  {(billing.colorTag === color.value || (!billing.colorTag && color.value === '')) && (
                                    <Check size={14} className={`absolute inset-0 m-auto ${!color.value ? 'text-slate-400' : 'text-white drop-shadow-sm'}`} />
                                  )}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <button
                        onClick={() => onEdit(billing)}
                        className={`p-2 rounded-xl transition-all ${
                          (billing as any).isVirtual 
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' 
                            : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                        }`}
                        title={(billing as any).isVirtual ? "Registrar Leituras" : "Editar"}
                      >
                        {(billing as any).isVirtual ? <Plus size={16} /> : <Edit2 size={16} />}
                      </button>
                      <button
                        onClick={() => onArchive(billing.ids || [billing.id!])}
                        className={`p-2 rounded-xl transition-all ${
                          billing.archived 
                            ? 'text-purple-600 bg-purple-50 hover:bg-purple-100' 
                            : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50'
                        }`}
                        title={billing.archived ? "Desarquivar" : "Arquivar"}
                      >
                        <Archive size={16} />
                      </button>
                      <button
                        disabled={(billing as any).isVirtual}
                        onClick={() => onDelete(billing.ids || [billing.id!])}
                        className={`p-2 rounded-xl transition-all ${
                          (billing as any).isVirtual 
                            ? 'text-slate-200 cursor-not-allowed' 
                            : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                        }`}
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
