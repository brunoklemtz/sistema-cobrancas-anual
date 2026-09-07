import React, { useState, useMemo } from 'react';
import { BillingRecord, Property } from '../types';
import { 
  X, Building2, FileText, FileDown, Copy, Check, DollarSign, 
  CheckCircle, Clock, AlertCircle, Calendar, Filter, Users, Percent, UserCheck,
  ArrowUpDown, ArrowUp, ArrowDown, UserX, UserMinus, AlertTriangle
} from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseDate } from '../utils/firestore';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CondoRentReportModalProps {
  billings: BillingRecord[];
  properties: Property[];
  onClose: () => void;
  initialCondoName?: string;
  initialTab?: 'general' | 'former_debts' | 'commission';
}

// Helper function to check if a billing belongs to an ACTIVE tenant currently living on an active property
function isBillingFromActiveTenant(b: BillingRecord, prop: Property | undefined): boolean {
  if (!prop) return false;
  if (prop.status !== 'active') return false;

  const propTenant = prop.ownerName?.trim().toLowerCase() || '';
  const billingTenant = b.tenantName?.trim().toLowerCase() || '';

  if (!propTenant) return false;

  // Check if billing due date is before the current property tenant's lease start date
  const leaseStart = parseDate(prop.leaseStartDate);
  const bDueDate = parseDate(b.dueDate);

  if (leaseStart && bDueDate && isBefore(bDueDate, leaseStart)) {
    return false;
  }

  if (!billingTenant) return true;

  if (billingTenant === propTenant || propTenant.includes(billingTenant) || billingTenant.includes(propTenant)) {
    return true;
  }

  return false;
}

// Helper functions to safely extract YYYY-MM and format dates from any date format
function extractYearMonth(dateVal: any): string {
  const d = parseDate(dateVal);
  if (d) return format(d, 'yyyy-MM');
  return '';
}

function formatDateStr(dateVal: any): string {
  const d = parseDate(dateVal);
  if (d) return format(d, 'dd/MM/yyyy');
  return '-';
}

export default function CondoRentReportModal({ 
  billings, 
  properties, 
  onClose,
  initialCondoName = 'all',
  initialTab = 'general'
}: CondoRentReportModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'former_debts' | 'commission'>(initialTab);
  
  // General Report State
  const [selectedCondo, setSelectedCondo] = useState<string>(initialCondoName);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'paid' | 'pending_overdue'>('all');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedFormerText, setCopiedFormerText] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'propertyCode',
    direction: 'asc'
  });

  // Commission Specific State
  const [commCondo, setCommCondo] = useState<string>(initialCondoName !== 'all' ? initialCondoName : 'all');
  const [commMonth, setCommMonth] = useState<string>('all');
  const [commSyndicName, setCommSyndicName] = useState<string>('Ana');
  const [commRate, setCommRate] = useState<number>(5); // default 5%
  const [copiedCommText, setCopiedCommText] = useState(false);
  const [commSortConfig, setCommSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'propertyCode',
    direction: 'asc'
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleCommSort = (key: string) => {
    setCommSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderSortHeader = (label: string, fieldKey: string, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortConfig.key === fieldKey;
    return (
      <th 
        onClick={() => handleSort(fieldKey)}
        className={`px-4 py-3 cursor-pointer select-none transition-colors hover:bg-slate-200/80 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
        title={`Ordenar por ${label} (${isActive && sortConfig.direction === 'asc' ? 'Decrescente' : 'Crescente'})`}
      >
        <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isActive ? (
            sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-indigo-600" /> : <ArrowDown size={12} className="text-indigo-600" />
          ) : (
            <ArrowUpDown size={11} className="text-slate-400 opacity-60 hover:opacity-100" />
          )}
        </div>
      </th>
    );
  };

  const renderCommSortHeader = (label: string, fieldKey: string, align: 'left' | 'right' | 'center' = 'left', extraClass: string = '') => {
    const isActive = commSortConfig.key === fieldKey;
    return (
      <th 
        onClick={() => handleCommSort(fieldKey)}
        className={`px-4 py-3 cursor-pointer select-none transition-colors hover:bg-emerald-800 ${extraClass} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
        title={`Ordenar por ${label} (${isActive && commSortConfig.direction === 'asc' ? 'Decrescente' : 'Crescente'})`}
      >
        <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
          <span>{label}</span>
          {isActive ? (
            commSortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-emerald-300" /> : <ArrowDown size={12} className="text-emerald-300" />
          ) : (
            <ArrowUpDown size={11} className="text-emerald-200/50 hover:text-emerald-100" />
          )}
        </div>
      </th>
    );
  };

  // Map propertyId -> Property for easy lookup
  const propertyMap = useMemo(() => {
    const map = new Map<string, Property>();
    properties.forEach(p => map.set(p.id, p));
    return map;
  }, [properties]);

  // Unique Condominiums list
  const condoList = useMemo(() => {
    const set = new Set<string>();
    properties.forEach(p => {
      if (p.condominium?.trim()) {
        set.add(p.condominium.trim());
      }
    });
    return Array.from(set).sort();
  }, [properties]);

  // Unique Month/Year list from billings and payment histories (guaranteeing July 2026 and current dates)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();

    // Always guarantee recent / current months so they are selectable
    const now = new Date();
    set.add(format(now, 'yyyy-MM'));
    set.add('2026-07'); // Explicitly include Julho/2026
    set.add('2026-08'); // Explicitly include Agosto/2026

    billings.forEach(b => {
      const dueM = extractYearMonth(b.dueDate);
      if (dueM) set.add(dueM);

      const readM = extractYearMonth(b.readingDate);
      if (readM) set.add(readM);

      const createdM = extractYearMonth(b.createdAt);
      if (createdM) set.add(createdM);

      if (b.paymentHistory && Array.isArray(b.paymentHistory)) {
        b.paymentHistory.forEach(ph => {
          const pm = extractYearMonth(ph.date);
          if (pm) set.add(pm);
        });
      }
    });

    return Array.from(set).filter(Boolean).sort().reverse();
  }, [billings]);

  // General Filtered billings (APENAS CONTRATOS ATIVOS / MORADORES ATUAIS)
  const reportData = useMemo(() => {
    const list: any[] = [];

    billings.forEach(b => {
      const prop = propertyMap.get(b.propertyId);
      
      // EXCLUIR SAÍRAM DEVENDO / CONTRATOS INATIVOS DO BALANÇO MENSAL PRINCIPAL
      if (!isBillingFromActiveTenant(b, prop)) return;

      const condoName = prop?.condominium?.trim() || 'Sem Condomínio';

      // 1. Condominium filter
      if (selectedCondo !== 'all') {
        if (selectedCondo === 'none' && prop?.condominium) return;
        if (selectedCondo !== 'none' && condoName.toLowerCase() !== selectedCondo.toLowerCase()) return;
      }

      const propCode = prop?.propertyCode || b.propertyCode || 'Removido';
      const tenant = b.tenantName || prop?.ownerName || '-';

      const items = b.items || [];
      const rentItem = items.find(i => i.type === 'rent');
      const rentAmount = rentItem ? rentItem.amount : (b.totalAmount || 0);
      const otherAmount = items.filter(i => i.type !== 'rent').reduce((sum, i) => sum + i.amount, 0);
      const totalAmount = b.totalAmount || (rentAmount + otherAmount);

      // Do not include empty/vacant properties without billings
      if (totalAmount === 0 && (b.paidAmount || 0) === 0) return;

      const dueMonth = extractYearMonth(b.dueDate);
      const dueDateStr = formatDateStr(b.dueDate);

      // Check payment history in selected month
      let sumInPeriod = 0;
      let hasPaymentsInPeriod = false;

      if (b.paymentHistory && Array.isArray(b.paymentHistory) && b.paymentHistory.length > 0) {
        b.paymentHistory.forEach(ph => {
          if (ph.date) {
            const pMonth = extractYearMonth(ph.date);
            if (selectedMonth === 'all' || pMonth === selectedMonth) {
              sumInPeriod += (ph.amount || 0);
              hasPaymentsInPeriod = true;
            }
          }
        });
      } else {
        let paidVal = b.paidAmount || 0;
        if (b.status === 'paid' && paidVal < totalAmount) {
          paidVal = totalAmount;
        }
        if (paidVal > 0) {
          if (selectedMonth === 'all' || dueMonth === selectedMonth) {
            sumInPeriod = paidVal;
            hasPaymentsInPeriod = true;
          }
        }
      }

      // Determine inclusion in selectedMonth
      let shouldInclude = false;
      if (selectedMonth === 'all') {
        shouldInclude = true;
      } else {
        if (hasPaymentsInPeriod) {
          // Paid or partially paid in selectedMonth (regime de caixa)
          shouldInclude = true;
        } else if (dueMonth && dueMonth <= selectedMonth && b.status !== 'paid') {
          // Due in or before selectedMonth and still unpaid (inadimplente ao encerrar o mês)
          shouldInclude = true;
        }
      }

      if (!shouldInclude) return;

      // Calculate paid amount in period
      let paidInPeriod = 0;
      if (selectedMonth === 'all') {
        paidInPeriod = b.paidAmount || (b.status === 'paid' ? totalAmount : 0);
        if (b.status === 'paid' && paidInPeriod < totalAmount) paidInPeriod = totalAmount;
      } else {
        paidInPeriod = sumInPeriod;
        if (paidInPeriod === 0 && b.status === 'paid' && dueMonth === selectedMonth) {
          paidInPeriod = b.paidAmount || totalAmount;
        }
      }

      const balance = Math.max(0, totalAmount - (b.paidAmount || 0));
      const rentPaidAmount = Math.min(rentAmount, paidInPeriod);
      const rentBalance = Math.max(0, rentAmount - rentPaidAmount);

      // Status filter
      if (selectedStatus === 'paid' && paidInPeriod <= 0 && b.status !== 'paid') return;
      if (selectedStatus === 'pending_overdue' && b.status === 'paid' && balance <= 0) return;

      list.push({
        id: b.id,
        propertyCode: propCode,
        condominium: condoName,
        tenantName: tenant,
        dueDate: b.dueDate,
        dueDateStr,
        status: b.status,
        rentAmount,
        otherAmount,
        totalAmount,
        paidAmount: paidInPeriod,
        balance,
        rentPaidAmount,
        rentBalance,
        billingRecord: b
      });
    });

    return list.sort((a, b) => {
      let aVal: any = a[sortConfig.key as keyof typeof a];
      let bVal: any = b[sortConfig.key as keyof typeof b];

      if (sortConfig.key === 'dueDate') {
        aVal = a.dueDate?.toDate ? a.dueDate.toDate().getTime() : (a.dueDate ? new Date(a.dueDate).getTime() : 0);
        bVal = b.dueDate?.toDate ? b.dueDate.toDate().getTime() : (b.dueDate ? new Date(b.dueDate).getTime() : 0);
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [billings, propertyMap, selectedCondo, selectedMonth, selectedStatus, sortConfig]);

  // General Totals
  const totals = useMemo(() => {
    let totalRent = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let countPaid = 0;
    let countPending = 0;

    reportData.forEach(item => {
      totalRent += item.rentAmount;
      totalPaid += item.paidAmount;
      totalPending += item.balance;
      if (item.status === 'paid' || item.balance <= 0.01) {
        countPaid++;
      } else {
        countPending++;
      }
    });

    return {
      totalRent,
      totalPaid,
      totalPending,
      countPaid,
      countPending,
      totalRecords: reportData.length
    };
  }, [reportData]);

  // --- RELATÓRIO DE SAÍRAM DEVENDO / EX-INQUILINOS / CONTRATOS INATIVOS ---
  const formerDebtData = useMemo(() => {
    const list: any[] = [];

    billings.forEach(b => {
      const prop = propertyMap.get(b.propertyId);

      // Incluir apenas SE NÃO FOR inquilino ativo
      if (isBillingFromActiveTenant(b, prop)) return;

      const condoName = prop?.condominium?.trim() || 'Sem Condomínio';

      // Condominium filter
      if (selectedCondo !== 'all') {
        if (selectedCondo === 'none' && prop?.condominium) return;
        if (selectedCondo !== 'none' && condoName.toLowerCase() !== selectedCondo.toLowerCase()) return;
      }

      const items = b.items || [];
      const rentItem = items.find(i => i.type === 'rent');
      const rentAmount = rentItem ? rentItem.amount : (b.totalAmount || 0);
      const otherAmount = items.filter(i => i.type !== 'rent').reduce((sum, i) => sum + i.amount, 0);
      const totalAmount = b.totalAmount || (rentAmount + otherAmount);
      const paidVal = b.paidAmount || (b.status === 'paid' ? totalAmount : 0);
      const balance = Math.max(0, totalAmount - paidVal);

      // Somente aqueles com débitos/saldo pendente
      if (balance <= 0.01 && b.status === 'paid') return;

      const propCode = prop?.propertyCode || b.propertyCode || 'Removido';
      const tenant = b.tenantName || 'Ex-Inquilino';
      const dueDateStr = formatDateStr(b.dueDate);

      list.push({
        id: b.id,
        propertyCode: propCode,
        condominium: condoName,
        tenantName: tenant,
        dueDate: b.dueDate,
        dueDateStr,
        status: b.status,
        rentAmount,
        otherAmount,
        totalAmount,
        paidAmount: paidVal,
        balance,
        notes: b.notes || 'Contrato encerrado / Inativo com pendência',
        billingRecord: b
      });
    });

    return list.sort((a, b) => b.balance - a.balance); // Maior débito primeiro
  }, [billings, propertyMap, selectedCondo]);

  const formerTotals = useMemo(() => {
    let totalDebt = 0;
    let totalPaid = 0;
    let totalOriginal = 0;

    formerDebtData.forEach(item => {
      totalDebt += item.balance;
      totalPaid += item.paidAmount;
      totalOriginal += item.totalAmount;
    });

    return {
      totalDebt,
      totalPaid,
      totalOriginal,
      countRecords: formerDebtData.length
    };
  }, [formerDebtData]);

  // --- COMMISSION CALCULATIONS (APENAS ALUGUEL PAGO DE CONTRATOS ATIVOS E DATA DA BAIXA) ---
  const commissionData = useMemo(() => {
    const results: any[] = [];

    billings.forEach(b => {
      const prop = propertyMap.get(b.propertyId);

      // Filtrar apenas contratos ativos para comissão do condomínio
      if (!isBillingFromActiveTenant(b, prop)) return;

      const condoName = prop?.condominium?.trim() || 'Sem Condomínio';

      // 1. Filter by Condo
      if (commCondo !== 'all') {
        if (commCondo === 'none' && prop?.condominium) return;
        if (commCondo !== 'none' && condoName.toLowerCase() !== commCondo.toLowerCase()) return;
      }

      const propCode = prop?.propertyCode || b.propertyCode || 'Removido';
      const tenant = b.tenantName || prop?.ownerName || '-';

      const items = b.items || [];
      const rentItem = items.find(i => i.type === 'rent');
      const rentAmount = rentItem ? rentItem.amount : (b.totalAmount || 0);

      const dueMonth = extractYearMonth(b.dueDate);
      const dueDateStr = formatDateStr(b.dueDate);

      // 2. Check payment history entries
      if (b.paymentHistory && Array.isArray(b.paymentHistory) && b.paymentHistory.length > 0) {
        const matchingPayments = b.paymentHistory.filter(ph => {
          if (!ph.amount || ph.amount <= 0) return false;
          if (commMonth === 'all') return true;
          const pM = extractYearMonth(ph.date);
          return pM === commMonth || (ph.date && ph.date.startsWith(commMonth));
        });

        if (matchingPayments.length > 0) {
          matchingPayments.forEach((ph, idx) => {
            let payDateFormatted = '-';
            try {
              if (ph.date) {
                const parts = ph.date.split('-');
                if (parts.length === 3) {
                  payDateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
                } else {
                  payDateFormatted = ph.date;
                }
              }
            } catch (e) {}

            const rentPaidAmount = Math.min(rentAmount, ph.amount);
            if (rentPaidAmount <= 0) return;

            const commissionValue = Math.round((rentPaidAmount * (commRate / 100) + Number.EPSILON) * 100) / 100;

            results.push({
              id: `${b.id}-p${ph.id || idx}`,
              propertyCode: propCode,
              condominium: condoName,
              tenantName: tenant,
              dueDateStr,
              payDateStr: payDateFormatted !== '-' ? payDateFormatted : dueDateStr,
              rentAmount,
              rentPaidAmount,
              commissionValue,
              status: 'paid',
            });
          });
        }
      } else {
        // Fallback for records without paymentHistory array
        const totalPaid = b.paidAmount || (b.status === 'paid' ? (b.totalAmount || 0) : 0);
        let payMonth = dueMonth;
        let lastPayDateStr = formatDateStr(b.updatedAt || b.dueDate);

        if (totalPaid > 0 && (b.status === 'paid' || (b.paidAmount && b.paidAmount > 0))) {
          payMonth = dueMonth;
        }

        const isPaidInPeriod = totalPaid > 0 && (commMonth === 'all' || payMonth === commMonth);

        if (isPaidInPeriod) {
          const rentPaidAmount = Math.min(rentAmount, totalPaid);
          if (rentPaidAmount > 0) {
            const commissionValue = Math.round((rentPaidAmount * (commRate / 100) + Number.EPSILON) * 100) / 100;

            results.push({
              id: b.id,
              propertyCode: propCode,
              condominium: condoName,
              tenantName: tenant,
              dueDateStr,
              payDateStr: lastPayDateStr,
              rentAmount,
              rentPaidAmount,
              commissionValue,
              status: 'paid',
            });
          }
        }
      }
    });

    return results.sort((a, b) => {
      let aVal: any = a[commSortConfig.key as keyof typeof a];
      let bVal: any = b[commSortConfig.key as keyof typeof b];

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }

      if (aVal < bVal) return commSortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return commSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [billings, propertyMap, commCondo, commMonth, commRate, commSortConfig]);

  // Commission Totals
  const commTotals = useMemo(() => {
    let totalRentPaid = 0;
    let totalCommission = 0;
    let countPaidItems = 0;

    commissionData.forEach(cd => {
      totalRentPaid += cd.rentPaidAmount;
      totalCommission += cd.commissionValue;
      if (cd.rentPaidAmount > 0) countPaidItems++;
    });

    return {
      totalRentPaid,
      totalCommission,
      countPaidItems,
      totalRecords: commissionData.length
    };
  }, [commissionData]);

  // PDF Export for General Report
  const generatePDF = () => {
    const doc = new jsPDF();
    const currentDateStr = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text('Relatório de Pagamento de Aluguéis por Condomínio', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    
    let condoLabel = selectedCondo === 'all' ? 'Todos os Condomínios' : selectedCondo === 'none' ? 'Sem Condomínio' : selectedCondo;
    let monthLabel = selectedMonth === 'all' ? 'Todos os Períodos' : format(new Date(selectedMonth + '-02T00:00:00'), 'MMMM/yyyy', { locale: ptBR });

    doc.text(`Condomínio: ${condoLabel}  |  Mês/Ano: ${monthLabel}  |  Emissão: ${currentDateStr}`, 14, 25);

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 30, 182, 22, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`TOTAL ALUGUÉIS: R$ ${totals.totalRent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, 42);
    doc.setTextColor(22, 163, 74);
    doc.text(`TOTAL QUITADO: R$ ${totals.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 85, 42);
    doc.setTextColor(220, 38, 38);
    doc.text(`TOTAL PENDENTE: R$ ${totals.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 145, 42);

    const tableRows = reportData.map(r => [
      r.condominium,
      r.propertyCode,
      r.tenantName,
      r.dueDateStr,
      `R$ ${r.rentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${r.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      r.status === 'paid' ? 'Pago' : r.status === 'overdue' ? 'Atrasado' : 'Pendente'
    ]);

    autoTable(doc, {
      startY: 58,
      head: [['Condomínio', 'Imóvel', 'Inquilino', 'Vencimento', 'Aluguel (R$)', 'Total (R$)', 'Status']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 3 },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Resumo: ${totals.totalRecords} cobranças listadas (${totals.countPaid} pagas, ${totals.countPending} pendentes).`, 14, finalY);

    doc.save(`relatorio_alugueis_condominio_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // PDF Export for Commission
  const generateCommissionPDF = () => {
    const doc = new jsPDF();
    const currentDateStr = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text(`Demonstrativo de Comissão - Síndico(a)`, 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);

    let condoLabel = commCondo === 'all' ? 'Todos os Condomínios' : commCondo;
    let monthLabel = commMonth === 'all' ? 'Todos os Períodos' : format(new Date(commMonth + '-02T00:00:00'), 'MMMM/yyyy', { locale: ptBR });

    doc.text(`Condomínio: ${condoLabel}  |  Síndico(a): ${commSyndicName}  |  Período: ${monthLabel}`, 14, 25);
    doc.text(`Taxa de Comissão: ${commRate}%  |  Emissão: ${currentDateStr}`, 14, 31);

    // Summary Box
    doc.setDrawColor(199, 210, 254);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(14, 36, 182, 20, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 27, 75);
    doc.text(`TOTAL ALUGUÉIS PAGOS: R$ ${commTotals.totalRentPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, 48);
    doc.setTextColor(79, 70, 229);
    doc.text(`TAXA: ${commRate}%`, 105, 48);
    doc.setTextColor(16, 185, 129);
    doc.text(`COMISSÃO A PAGAR: R$ ${commTotals.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 135, 48);

    const tableRows = commissionData.map(r => [
      r.condominium,
      r.propertyCode,
      r.tenantName,
      r.payDateStr,
      `R$ ${r.rentPaidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${r.commissionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 62,
      head: [['Condomínio', 'Imóvel', 'Inquilino', 'Data da Baixa', 'Aluguel Pago', `Comissão (${commRate}%)`]],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 3 },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`Total a pagar para ${commSyndicName}: R$ ${commTotals.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${commTotals.countPaidItems} aluguéis pagos).`, 14, finalY);

    doc.save(`demonstrativo_comissao_${commSyndicName.toLowerCase()}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // PDF Export for Former Debts (Saíram Devendo)
  const generateFormerDebtsPDF = () => {
    const doc = new jsPDF();
    const currentDateStr = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(18);
    doc.setTextColor(159, 18, 57);
    doc.text('Relatório de Ex-Inquilinos - Saíram Devendo', 14, 18);

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);

    let condoLabel = selectedCondo === 'all' ? 'Todos os Condomínios' : selectedCondo === 'none' ? 'Sem Condomínio' : selectedCondo;

    doc.text(`Condomínio: ${condoLabel}  |  Emissão: ${currentDateStr}`, 14, 25);

    doc.setDrawColor(254, 205, 211);
    doc.setFillColor(255, 241, 242);
    doc.roundedRect(14, 30, 182, 22, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(159, 18, 57);
    doc.text(`EX-INQUILINOS EM DÉBITO: ${formerTotals.countRecords}`, 20, 42);
    doc.setTextColor(225, 29, 72);
    doc.text(`TOTAL PENDENTE (SAÍRAM DEVENDO): R$ ${formerTotals.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 85, 42);

    const tableRows = formerDebtData.map(r => [
      r.condominium,
      r.propertyCode,
      r.tenantName,
      r.dueDateStr,
      `R$ ${r.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${r.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      `R$ ${r.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 58,
      head: [['Condomínio', 'Imóvel', 'Ex-Inquilino', 'Vencimento', 'Total Fatura', 'Pago', 'Saldo Devedor']],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [225, 29, 72], fontSize: 9, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 3 },
      margin: { left: 14, right: 14 }
    });

    doc.save(`relatorio_sairam_devendo_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // Copy Former Debts Text for WhatsApp/Email
  const copyFormerDebtsText = () => {
    let condoLabel = selectedCondo === 'all' ? 'Todos os Condomínios' : selectedCondo === 'none' ? 'Sem Condomínio' : selectedCondo;

    let msg = `*RELATÓRIO DE EX-INQUILINOS (SAÍRAM DEVENDO)*\n`;
    msg += `🏢 *Condomínio:* ${condoLabel}\n\n`;

    msg += `📊 *RESUMO DE DÉBITOS DE EX-INQUILINOS*\n`;
    msg += `• Quantidade de Ex-Inquilinos devedores: ${formerTotals.countRecords}\n`;
    msg += `• Total Devido em Aberto: R$ ${formerTotals.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;

    msg += `📋 *LISTA DE EX-INQUILINOS EM DÉBITO:*\n`;
    formerDebtData.forEach(r => {
      msg += `• *${r.propertyCode}* (${r.tenantName}) - Venc: ${r.dueDateStr} | Total: R$ ${r.totalAmount.toFixed(2)} | Pago: R$ ${r.paidAmount.toFixed(2)} | *Saldo Devedor: R$ ${r.balance.toFixed(2)}*\n`;
    });

    navigator.clipboard.writeText(msg).then(() => {
      setCopiedFormerText(true);
      setTimeout(() => setCopiedFormerText(false), 2000);
    });
  };

  // Copy Summary Text for WhatsApp/Email
  const copySummaryText = () => {
    let condoLabel = selectedCondo === 'all' ? 'Todos os Condomínios' : selectedCondo === 'none' ? 'Sem Condomínio' : selectedCondo;
    let monthLabel = selectedMonth === 'all' ? 'Todos os Períodos' : format(new Date(selectedMonth + '-02T00:00:00'), 'MMMM/yyyy', { locale: ptBR });

    let msg = `*RELATÓRIO DE ALUGUÉIS POR CONDOMÍNIO*\n`;
    msg += `🏢 *Condomínio:* ${condoLabel}\n`;
    msg += `📅 *Período:* ${monthLabel}\n\n`;

    msg += `📊 *RESUMO FINANCEIRO*\n`;
    msg += `• Total Aluguéis: R$ ${totals.totalRent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `• Total Quitado: R$ ${totals.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `• Total Pendente: R$ ${totals.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n`;

    msg += `📋 *DETALHAMENTO DOS IMÓVEIS:*\n`;
    reportData.forEach(r => {
      const statusSymbol = r.status === 'paid' ? '✅ Quitado' : r.status === 'overdue' ? '❌ Atrasado' : '⏳ Pendente';
      msg += `• *${r.propertyCode}* (${r.tenantName}) - Aluguel: R$ ${r.rentAmount.toFixed(2)} | Pago: R$ ${r.paidAmount.toFixed(2)} | Saldo Devedor: R$ ${r.balance.toFixed(2)} | Venc: ${r.dueDateStr} | ${statusSymbol}\n`;
    });

    navigator.clipboard.writeText(msg).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  };

  // Copy Commission Text for WhatsApp/Email
  const copyCommissionText = () => {
    let condoLabel = commCondo === 'all' ? 'Todos os Condomínios' : commCondo;
    let monthLabel = commMonth === 'all' ? 'Todos os Períodos' : format(new Date(commMonth + '-02T00:00:00'), 'MMMM/yyyy', { locale: ptBR });

    let msg = `*DEMONSTRATIVO DE COMISSÃO - SÍNDICO(A)*\n`;
    msg += `🏢 *Condomínio:* ${condoLabel}\n`;
    msg += `👤 *Síndico(a):* ${commSyndicName}\n`;
    msg += `📅 *Período:* ${monthLabel}\n`;
    msg += `📊 *Taxa de Comissão:* ${commRate}%\n\n`;

    msg += `📋 *ALUGUÉIS QUITADOS:*\n`;
    if (commissionData.length === 0) {
      msg += `• Nenhum pagamento de aluguel registrado no período.\n\n`;
    } else {
      commissionData.forEach(cd => {
        msg += `• *${cd.propertyCode}* (${cd.tenantName}) - Baixa: ${cd.payDateStr} | Aluguel Pago: R$ ${cd.rentPaidAmount.toFixed(2)} | Comissão: R$ ${cd.commissionValue.toFixed(2)}\n`;
      });
      msg += `\n`;
    }

    msg += `💰 *RESUMO FINANCEIRO:*\n`;
    msg += `• Total Aluguéis Pagos: R$ ${commTotals.totalRentPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    msg += `• *TOTAL DA COMISSÃO:* R$ ${commTotals.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;

    navigator.clipboard.writeText(msg).then(() => {
      setCopiedCommText(true);
      setTimeout(() => setCopiedCommText(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <Building2 size={26} className="text-indigo-300" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Relatórios por Condomínio</h2>
              <p className="text-xs text-indigo-200 font-medium">Relatórios financeiros e comissões de síndicos/gestores</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 pt-3 flex items-center gap-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2.5 rounded-t-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'general'
                ? 'bg-white text-indigo-900 shadow-xs border-t border-x border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText size={15} />
            <span>1. Contratos Ativos / Moradores</span>
          </button>

          <button
            onClick={() => setActiveTab('former_debts')}
            className={`px-4 py-2.5 rounded-t-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'former_debts'
                ? 'bg-white text-rose-900 shadow-xs border-t border-x border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserMinus size={15} className="text-rose-600" />
            <span>2. Saíram Devendo / Inativos</span>
            {formerTotals.countRecords > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">
                {formerTotals.countRecords}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('commission')}
            className={`px-4 py-2.5 rounded-t-2xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === 'commission'
                ? 'bg-white text-emerald-900 shadow-xs border-t border-x border-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Percent size={15} className="text-emerald-600" />
            <span>3. Comissão do Síndico (Ana / Gestor)</span>
          </button>
        </div>

        {/* TAB 1: GENERAL CONDOS REPORT */}
        {activeTab === 'general' && (
          <div>
            {/* Filter Controls Bar */}
            <div className="p-5 bg-slate-50 border-b border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Condominium Selector */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Building2 size={14} className="text-indigo-600" /> Condomínio
                </label>
                <select
                  value={selectedCondo}
                  onChange={(e) => setSelectedCondo(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Condomínios ({condoList.length})</option>
                  {condoList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="none">Sem Condomínio Atribuído</option>
                </select>
              </div>

              {/* Month Selector */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={14} className="text-indigo-600" /> Período (Mês / Ano)
                </label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Períodos</option>
                  {availableMonths.map(m => {
                    const label = format(new Date(m + '-02T00:00:00'), 'MMMM / yyyy', { locale: ptBR });
                    return <option key={m} value={m}>{label.toUpperCase()}</option>;
                  })}
                </select>
              </div>

              {/* Status Selector */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <Filter size={14} className="text-indigo-600" /> Status do Pagamento
                </label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Status</option>
                  <option value="paid">Somente Pagos (Quitados)</option>
                  <option value="pending_overdue">Somente Pendentes / Atrasados</option>
                </select>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 bg-white">
              <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700">Total Aluguéis</span>
                <p className="text-lg font-black text-indigo-950 mt-1">
                  R$ {totals.totalRent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-indigo-600 font-bold mt-1">{totals.totalRecords} lançamentos</span>
              </div>

              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Total Quitado</span>
                <p className="text-lg font-black text-emerald-950 mt-1">
                  R$ {totals.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-emerald-600 font-bold mt-1">{totals.countPaid} pagos</span>
              </div>

              <div className="p-4 bg-rose-50/60 rounded-2xl border border-rose-100 flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-700">Saldo Pendente</span>
                <p className="text-lg font-black text-rose-950 mt-1">
                  R$ {totals.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-rose-600 font-bold mt-1">{totals.countPending} pendentes</span>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Ações Rápidas</span>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={generatePDF}
                    className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <FileDown size={14} /> PDF
                  </button>
                  <button
                    onClick={copySummaryText}
                    className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {copiedText ? <Check size={14} /> : <Copy size={14} />} 
                    {copiedText ? 'Copiado!' : 'Texto'}
                  </button>
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="p-5 pt-0 max-h-[350px] overflow-y-auto">
              {reportData.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Building2 className="mx-auto text-slate-300 mb-2" size={36} />
                  <p className="text-slate-500 font-bold text-sm">Nenhuma cobrança encontrada com os filtros selecionados.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-[10px] font-black uppercase tracking-wider text-slate-600 border-b border-slate-200">
                        {renderSortHeader('Condomínio', 'condominium')}
                        {renderSortHeader('Imóvel', 'propertyCode')}
                        {renderSortHeader('Inquilino', 'tenantName')}
                        {renderSortHeader('Vencimento', 'dueDate')}
                        {renderSortHeader('Aluguel', 'rentAmount', 'right')}
                        {renderSortHeader('Total Fatura', 'totalAmount', 'right')}
                        {renderSortHeader('Valor Pago', 'paidAmount', 'right')}
                        {renderSortHeader('Saldo Devedor', 'balance', 'right')}
                        {renderSortHeader('Status', 'status', 'center')}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {reportData.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-bold text-indigo-950">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100 text-[11px]">
                              <Building2 size={12} />
                              {row.condominium}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-900">{row.propertyCode}</td>
                          <td className="px-4 py-3 font-semibold text-slate-600">{row.tenantName}</td>
                          <td className="px-4 py-3 font-mono text-slate-600">{row.dueDateStr}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                            R$ {row.rentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            R$ {row.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            R$ {row.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                            R$ {row.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.status === 'paid' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-100">
                                <CheckCircle size={10} /> Quitado
                              </span>
                            ) : row.status === 'overdue' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-100">
                                <AlertCircle size={10} /> Atrasado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                <Clock size={10} /> Pendente
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SAÍRAM DEVENDO / CONTRATOS INATIVOS */}
        {activeTab === 'former_debts' && (
          <div>
            {/* Filter Bar */}
            <div className="p-5 bg-rose-50/50 border-b border-rose-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1 max-w-xs">
                <label className="block text-xs font-black uppercase text-rose-900 mb-1.5 flex items-center gap-1.5">
                  <Building2 size={14} className="text-rose-600" /> Condomínio
                </label>
                <select
                  value={selectedCondo}
                  onChange={(e) => setSelectedCondo(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Condomínios ({condoList.length})</option>
                  {condoList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="none">Sem Condomínio Atribuído</option>
                </select>
              </div>

              <div className="text-left sm:text-right">
                <span className="text-[11px] font-bold text-slate-500 block">Ex-inquilinos / Contratos Inativos</span>
                <span className="text-xs font-extrabold text-rose-700">Dívidas separadas que não constam no balanço de moradores atuais</span>
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Ex-Inquilinos Devendo
                </span>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {formerTotals.countRecords} registro(s)
                </p>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Pessoas que saíram do imóvel com dívida em aberto
                </span>
              </div>

              <div className="p-4 bg-rose-600 text-white rounded-2xl shadow-md flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-100 flex items-center gap-1">
                    <AlertTriangle size={12} /> Total que Saíram Devendo
                  </span>
                  <p className="text-2xl font-black mt-1">
                    R$ {formerTotals.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={generateFormerDebtsPDF}
                    className="flex-1 py-1.5 px-3 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <FileDown size={14} /> PDF
                  </button>
                  <button
                    onClick={copyFormerDebtsText}
                    className="flex-1 py-1.5 px-3 bg-white text-rose-900 hover:bg-rose-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    {copiedFormerText ? <Check size={14} /> : <Copy size={14} />}
                    {copiedFormerText ? 'Copiado!' : 'Texto'}
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Total já Pago por Ex-Inquilinos
                </span>
                <p className="text-xl font-black text-emerald-700 mt-1">
                  R$ {formerTotals.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-500 font-semibold">
                  Pagamentos parciais feitos antes da saída
                </span>
              </div>
            </div>

            {/* Table of Former Debts */}
            <div className="p-5 pt-0 max-h-[350px] overflow-y-auto">
              {formerDebtData.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <UserCheck className="mx-auto text-emerald-500 mb-2" size={36} />
                  <p className="text-slate-700 font-bold text-sm">Nenhum ex-inquilino devendo no condomínio!</p>
                  <p className="text-slate-400 text-xs mt-1">Todos os moradores anteriores quitaram suas obrigações ao sair.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-rose-900 text-white text-[10px] font-black uppercase tracking-wider">
                        <th className="px-4 py-3">Condomínio</th>
                        <th className="px-4 py-3">Imóvel</th>
                        <th className="px-4 py-3">Ex-Inquilino</th>
                        <th className="px-4 py-3">Vencimento</th>
                        <th className="px-4 py-3 text-right">Total Fatura</th>
                        <th className="px-4 py-3 text-right">Valor Pago</th>
                        <th className="px-4 py-3 text-right bg-rose-950">Saldo Devedor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {formerDebtData.map((row) => (
                        <tr key={row.id} className="hover:bg-rose-50/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[11px]">
                              {row.condominium}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{row.propertyCode}</td>
                          <td className="px-4 py-3 font-semibold text-rose-950">
                            <span className="flex items-center gap-1 font-bold">
                              <UserMinus size={13} className="text-rose-600 flex-shrink-0" />
                              {row.tenantName}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">{row.dueDateStr}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">
                            R$ {row.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            R$ {row.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-rose-700 bg-rose-50">
                            R$ {row.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: COMMISSION REPORT (ANA / SÍNDICO) */}
        {activeTab === 'commission' && (
          <div>
            {/* Filter Bar for Commission */}
            <div className="p-5 bg-emerald-50/50 border-b border-emerald-100 grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* Condo Selector */}
              <div>
                <label className="block text-xs font-black uppercase text-emerald-900 mb-1.5 flex items-center gap-1.5">
                  <Building2 size={14} className="text-emerald-700" /> Condomínio
                </label>
                <select
                  value={commCondo}
                  onChange={(e) => setCommCondo(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Condomínios ({condoList.length})</option>
                  {condoList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Month Selector */}
              <div>
                <label className="block text-xs font-black uppercase text-emerald-900 mb-1.5 flex items-center gap-1.5">
                  <Calendar size={14} className="text-emerald-700" /> Mês do Recebimento
                </label>
                <select
                  value={commMonth}
                  onChange={(e) => setCommMonth(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all"
                >
                  <option value="all">Todos os Mêses</option>
                  {availableMonths.map(m => {
                    const label = format(new Date(m + '-02T00:00:00'), 'MMMM / yyyy', { locale: ptBR });
                    return <option key={m} value={m}>{label.toUpperCase()}</option>;
                  })}
                </select>
              </div>

              {/* Syndic Name */}
              <div>
                <label className="block text-xs font-black uppercase text-emerald-900 mb-1.5 flex items-center gap-1.5">
                  <UserCheck size={14} className="text-emerald-700" /> Síndico(a) / Gestor
                </label>
                <input
                  type="text"
                  value={commSyndicName}
                  onChange={(e) => setCommSyndicName(e.target.value)}
                  placeholder="Ex: Ana"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                />
              </div>

              {/* Commission Percentage */}
              <div>
                <label className="block text-xs font-black uppercase text-emerald-900 mb-1.5 flex items-center gap-1.5">
                  <Percent size={14} className="text-emerald-700" /> Taxa de Comissão (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={commRate}
                  onChange={(e) => setCommRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                />
              </div>
            </div>

            {/* Metrics Cards */}
            <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Aluguéis Recebidos no Período
                </span>
                <p className="text-xl font-black text-slate-900 mt-1">
                  R$ {commTotals.totalRentPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[10px] text-slate-500 font-semibold">
                  {commTotals.countPaidItems} pagamento(s) de aluguel quitado(s)
                </span>
              </div>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  Taxa de Comissão Aplicada
                </span>
                <p className="text-xl font-black text-emerald-950 mt-1">
                  {commRate}%
                </p>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Calculada sobre os aluguéis quitados/pagos
                </span>
              </div>

              <div className="p-4 bg-emerald-600 text-white rounded-2xl shadow-md flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-100">
                    Comissão a Pagar ({commSyndicName})
                  </span>
                  <p className="text-2xl font-black mt-1">
                    R$ {commTotals.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={generateCommissionPDF}
                    className="flex-1 py-1.5 px-3 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <FileDown size={14} /> PDF
                  </button>
                  <button
                    onClick={copyCommissionText}
                    className="flex-1 py-1.5 px-3 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs"
                  >
                    {copiedCommText ? <Check size={14} /> : <Copy size={14} />}
                    {copiedCommText ? 'Copiado!' : 'Texto'}
                  </button>
                </div>
              </div>
            </div>

            {/* Table of Commission Items */}
            <div className="p-5 pt-0 max-h-[350px] overflow-y-auto">
              {commissionData.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Building2 className="mx-auto text-slate-300 mb-2" size={36} />
                  <p className="text-slate-500 font-bold text-sm">Nenhum aluguel encontrado no período selecionado.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-emerald-900 text-white text-[10px] font-black uppercase tracking-wider">
                        {renderCommSortHeader('Condomínio', 'condominium')}
                        {renderCommSortHeader('Imóvel', 'propertyCode')}
                        {renderCommSortHeader('Inquilino', 'tenantName')}
                        {renderCommSortHeader('Data da Baixa', 'payDateStr')}
                        {renderCommSortHeader('Aluguel Pago', 'rentPaidAmount', 'right')}
                        {renderCommSortHeader(`Comissão (${commRate}%)`, 'commissionValue', 'right', 'bg-emerald-950')}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                      {commissionData.map((cd) => (
                        <tr key={cd.id} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md text-[11px]">
                              {cd.condominium}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-extrabold text-slate-900">{cd.propertyCode}</td>
                          <td className="px-4 py-3 font-semibold text-slate-600">{cd.tenantName}</td>
                          <td className="px-4 py-3 font-mono text-emerald-700 font-bold">
                            {cd.payDateStr}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                            R$ {cd.rentPaidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-black text-emerald-900 bg-emerald-50/70">
                            R$ {cd.commissionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100/70 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500">
            {activeTab === 'general'
              ? `Exibindo ${reportData.length} cobranças de contratos ativos`
              : activeTab === 'former_debts'
              ? `Exibindo ${formerDebtData.length} pendências de ex-inquilinos (Total devendo: R$ ${formerTotals.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
              : `Total de comissão para ${commSyndicName}: R$ ${commTotals.totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            }
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
