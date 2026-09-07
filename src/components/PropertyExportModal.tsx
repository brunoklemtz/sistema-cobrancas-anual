import React, { useState, useMemo } from 'react';
import { Property } from '../types';
import { 
  X, Download, FileSpreadsheet, FileText, Copy, Check, Filter, 
  Building2, Home, CheckCircle2, XCircle, Search, Printer, 
  Settings2, DollarSign, ShieldCheck, Phone, User, Calendar
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { parseDate } from '../utils/firestore';

interface PropertyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  properties: Property[];
  initialCondoFilter?: string;
  initialStatusFilter?: 'all' | 'active' | 'inactive';
}

export interface ColumnOption {
  id: string;
  label: string;
  category: 'basic' | 'financial' | 'readings' | 'tenant';
  defaultSelected: boolean;
  getValue: (p: Property) => string | number;
}

export const DEFAULT_PROPERTY_COLUMNS: ColumnOption[] = [
  {
    id: 'propertyCode',
    label: 'Código do Imóvel',
    category: 'basic',
    defaultSelected: true,
    getValue: (p) => p.propertyCode || '-'
  },
  {
    id: 'condominium',
    label: 'Condomínio / Edifício',
    category: 'basic',
    defaultSelected: true,
    getValue: (p) => p.condominium || 'Sem Condomínio'
  },
  {
    id: 'status',
    label: 'Status do Imóvel',
    category: 'basic',
    defaultSelected: true,
    getValue: (p) => p.status === 'active' ? 'Ativo' : 'Inativo'
  },
  {
    id: 'tenantName',
    label: 'Nome do Inquilino',
    category: 'tenant',
    defaultSelected: true,
    getValue: (p) => p.ownerName || '-'
  },
  {
    id: 'phone',
    label: 'Telefone Principal',
    category: 'tenant',
    defaultSelected: true,
    getValue: (p) => p.phone || (p.phones && p.phones.length > 0 ? p.phones[0].number : '-')
  },
  {
    id: 'additionalPhones',
    label: 'Outros Telefones',
    category: 'tenant',
    defaultSelected: true,
    getValue: (p) => {
      if (!p.phones || p.phones.length <= 1) return '-';
      return p.phones.slice(1).map(ph => `${ph.label ? ph.label + ': ' : ''}${ph.number}`).join(' | ');
    }
  },
  {
    id: 'tenantCpf',
    label: 'CPF do Inquilino',
    category: 'tenant',
    defaultSelected: true,
    getValue: (p) => p.tenantCpf || '-'
  },
  {
    id: 'tenantEmail',
    label: 'E-mail do Inquilino',
    category: 'tenant',
    defaultSelected: false,
    getValue: (p) => p.tenantEmail || '-'
  },
  {
    id: 'rentAmount',
    label: 'Valor Aluguel (R$)',
    category: 'financial',
    defaultSelected: true,
    getValue: (p) => p.rentAmount ?? 0
  },
  {
    id: 'leaseStartDate',
    label: 'Início do Contrato',
    category: 'basic',
    defaultSelected: true,
    getValue: (p) => {
      const d = parseDate(p.leaseStartDate);
      return d ? format(d, 'dd/MM/yyyy') : '-';
    }
  },
  {
    id: 'securityDepositAmount',
    label: 'Valor Caução (R$)',
    category: 'financial',
    defaultSelected: true,
    getValue: (p) => p.securityDepositAmount ?? 0
  },
  {
    id: 'securityDepositPaid',
    label: 'Caução Paga?',
    category: 'financial',
    defaultSelected: true,
    getValue: (p) => p.securityDepositPaid ? 'Pago' : 'Pendente'
  },
  {
    id: 'initialWaterReading',
    label: 'Leitura Inicial Água',
    category: 'readings',
    defaultSelected: true,
    getValue: (p) => p.initialWaterReading !== undefined ? p.initialWaterReading : '-'
  },
  {
    id: 'initialElectricityReading',
    label: 'Leitura Inicial Luz',
    category: 'readings',
    defaultSelected: true,
    getValue: (p) => p.initialElectricityReading !== undefined ? p.initialElectricityReading : '-'
  },
  {
    id: 'isClean',
    label: 'Vistoria Limpo?',
    category: 'readings',
    defaultSelected: false,
    getValue: (p) => p.isClean ? 'Sim' : 'Não'
  },
  {
    id: 'hasUtensils',
    label: 'Possui Utensílios?',
    category: 'readings',
    defaultSelected: false,
    getValue: (p) => p.hasUtensils ? 'Sim' : 'Não'
  },
  {
    id: 'inspectionNotes',
    label: 'Obs / Vistoria',
    category: 'readings',
    defaultSelected: false,
    getValue: (p) => p.inspectionNotes || '-'
  }
];

export function exportPropertiesToExcel(
  propertiesList: Property[], 
  selectedColumns: ColumnOption[] = DEFAULT_PROPERTY_COLUMNS.filter(c => c.defaultSelected),
  filterSummary?: string
) {
  if (!propertiesList || propertiesList.length === 0) return;

  const headers = selectedColumns.map(col => col.label);

  let totalRent = 0;
  let totalDeposit = 0;
  let activeCount = 0;
  let inactiveCount = 0;

  propertiesList.forEach(p => {
    totalRent += p.rentAmount || 0;
    totalDeposit += p.securityDepositAmount || 0;
    if (p.status === 'active') activeCount++;
    else inactiveCount++;
  });

  const dataRows = propertiesList.map(prop => {
    return selectedColumns.map(col => {
      return col.getValue(prop);
    });
  });

  // Summary row at the bottom
  const summaryRow = selectedColumns.map(col => {
    if (col.id === 'propertyCode') return `TOTAL: ${propertiesList.length} Imóveis`;
    if (col.id === 'status') return `${activeCount} Ativos | ${inactiveCount} Inativos`;
    if (col.id === 'rentAmount') return totalRent;
    if (col.id === 'securityDepositAmount') return totalDeposit;
    return '';
  });

  const worksheetData = [
    ['RELATÓRIO GERAL DE IMÓVEIS E CONTRATOS DE ALUGUEL'],
    [`Data de Emissão: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`],
    [`Filtros Aplicados: ${filterSummary || 'Todos os Imóveis'}`],
    [`Resumo: ${propertiesList.length} imóveis (${activeCount} ativos, ${inactiveCount} inativos) | Aluguel Mensal Total: R$ ${totalRent.toFixed(2)} | Total Cauções: R$ ${totalDeposit.toFixed(2)}`],
    [],
    headers,
    ...dataRows,
    [],
    summaryRow
  ];

  const ws = XLSX.utils.aoa_to_sheet(worksheetData);

  // Column width calculations
  const colWidths = headers.map((header, colIndex) => {
    let maxLen = header.length;
    dataRows.forEach(row => {
      const cellVal = String(row[colIndex] ?? '');
      if (cellVal.length > maxLen) maxLen = cellVal.length;
    });
    return { wch: Math.min(Math.max(maxLen + 4, 14), 45) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Imóveis');

  const fileName = `tabela_imoveis_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

export default function PropertyExportModal({
  isOpen,
  onClose,
  properties,
  initialCondoFilter = 'all',
  initialStatusFilter = 'all',
}: PropertyExportModalProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(initialStatusFilter);
  const [condoFilter, setCondoFilter] = useState<string>(initialCondoFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);

  // Available column definitions
  const columns: ColumnOption[] = useMemo(() => [
    {
      id: 'propertyCode',
      label: 'Código do Imóvel',
      category: 'basic',
      defaultSelected: true,
      getValue: (p) => p.propertyCode || '-'
    },
    {
      id: 'condominium',
      label: 'Condomínio / Edifício',
      category: 'basic',
      defaultSelected: true,
      getValue: (p) => p.condominium || 'Sem Condomínio'
    },
    {
      id: 'status',
      label: 'Status do Imóvel',
      category: 'basic',
      defaultSelected: true,
      getValue: (p) => p.status === 'active' ? 'Ativo' : 'Inativo'
    },
    {
      id: 'tenantName',
      label: 'Nome do Inquilino',
      category: 'tenant',
      defaultSelected: true,
      getValue: (p) => p.ownerName || '-'
    },
    {
      id: 'phone',
      label: 'Telefone Principal',
      category: 'tenant',
      defaultSelected: true,
      getValue: (p) => p.phone || (p.phones && p.phones.length > 0 ? p.phones[0].number : '-')
    },
    {
      id: 'additionalPhones',
      label: 'Outros Telefones',
      category: 'tenant',
      defaultSelected: true,
      getValue: (p) => {
        if (!p.phones || p.phones.length <= 1) return '-';
        return p.phones.slice(1).map(ph => `${ph.label ? ph.label + ': ' : ''}${ph.number}`).join(' | ');
      }
    },
    {
      id: 'tenantCpf',
      label: 'CPF do Inquilino',
      category: 'tenant',
      defaultSelected: true,
      getValue: (p) => p.tenantCpf || '-'
    },
    {
      id: 'tenantEmail',
      label: 'E-mail do Inquilino',
      category: 'tenant',
      defaultSelected: false,
      getValue: (p) => p.tenantEmail || '-'
    },
    {
      id: 'rentAmount',
      label: 'Valor Aluguel (R$)',
      category: 'financial',
      defaultSelected: true,
      getValue: (p) => p.rentAmount ?? 0
    },
    {
      id: 'leaseStartDate',
      label: 'Início do Contrato',
      category: 'basic',
      defaultSelected: true,
      getValue: (p) => {
        const d = parseDate(p.leaseStartDate);
        return d ? format(d, 'dd/MM/yyyy') : '-';
      }
    },
    {
      id: 'securityDepositAmount',
      label: 'Valor Caução (R$)',
      category: 'financial',
      defaultSelected: true,
      getValue: (p) => p.securityDepositAmount ?? 0
    },
    {
      id: 'securityDepositPaid',
      label: 'Caução Paga?',
      category: 'financial',
      defaultSelected: true,
      getValue: (p) => p.securityDepositPaid ? 'Pago' : 'Pendente'
    },
    {
      id: 'initialWaterReading',
      label: 'Leitura Inicial Água',
      category: 'readings',
      defaultSelected: true,
      getValue: (p) => p.initialWaterReading !== undefined ? p.initialWaterReading : '-'
    },
    {
      id: 'initialElectricityReading',
      label: 'Leitura Inicial Luz',
      category: 'readings',
      defaultSelected: true,
      getValue: (p) => p.initialElectricityReading !== undefined ? p.initialElectricityReading : '-'
    },
    {
      id: 'isClean',
      label: 'Vistoria Limpo?',
      category: 'readings',
      defaultSelected: false,
      getValue: (p) => p.isClean ? 'Sim' : 'Não'
    },
    {
      id: 'hasUtensils',
      label: 'Possui Utensílios?',
      category: 'readings',
      defaultSelected: false,
      getValue: (p) => p.hasUtensils ? 'Sim' : 'Não'
    },
    {
      id: 'inspectionNotes',
      label: 'Obs / Vistoria',
      category: 'readings',
      defaultSelected: false,
      getValue: (p) => p.inspectionNotes || '-'
    }
  ], []);

  // Selected column IDs state
  const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>(() => 
    columns.filter(c => c.defaultSelected).map(c => c.id)
  );

  const toggleColumn = (id: string) => {
    setSelectedColumnIds(prev => 
      prev.includes(id) 
        ? prev.filter(colId => colId !== id)
        : [...prev, id]
    );
  };

  const selectAllColumns = () => {
    setSelectedColumnIds(columns.map(c => c.id));
  };

  const resetDefaultColumns = () => {
    setSelectedColumnIds(columns.filter(c => c.defaultSelected).map(c => c.id));
  };

  // Condos list
  const condosList = useMemo(() => {
    const list = new Set<string>();
    properties.forEach(p => {
      if (p.condominium?.trim()) list.add(p.condominium.trim());
    });
    return Array.from(list).sort();
  }, [properties]);

  // Filtered properties
  const filteredData = useMemo(() => {
    return properties.filter(p => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesCondo = condoFilter === 'all' || 
        (condoFilter === 'none' ? !p.condominium : (p.condominium || '').trim().toLowerCase() === condoFilter.toLowerCase());
      
      const search = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        p.propertyCode.toLowerCase().includes(search) ||
        (p.ownerName || '').toLowerCase().includes(search) ||
        (p.condominium || '').toLowerCase().includes(search) ||
        (p.phone || '').includes(search) ||
        (p.tenantCpf || '').includes(search);

      return matchesStatus && matchesCondo && matchesSearch;
    }).sort((a, b) => (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { numeric: true }));
  }, [properties, statusFilter, condoFilter, searchTerm]);

  // Totals calculations
  const totals = useMemo(() => {
    let totalRent = 0;
    let totalDeposit = 0;
    let activeCount = 0;
    let inactiveCount = 0;

    filteredData.forEach(p => {
      totalRent += p.rentAmount || 0;
      totalDeposit += p.securityDepositAmount || 0;
      if (p.status === 'active') activeCount++;
      else inactiveCount++;
    });

    return {
      totalProperties: filteredData.length,
      activeCount,
      inactiveCount,
      totalRent,
      totalDeposit
    };
  }, [filteredData]);

  // Active columns objects in current selection order
  const activeColumns = useMemo(() => {
    return columns.filter(c => selectedColumnIds.includes(c.id));
  }, [columns, selectedColumnIds]);

  // EXPORT TO EXCEL (.xlsx)
  const exportToExcel = () => {
    if (filteredData.length === 0) return;

    // Header row
    const headers = activeColumns.map(col => col.label);

    // Data rows
    const dataRows = filteredData.map(prop => {
      return activeColumns.map(col => {
        const val = col.getValue(prop);
        return val;
      });
    });

    // Create Worksheet
    const worksheetData = [
      ['RELATÓRIO GERAL DE IMÓVEIS E CONTRATOS'],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm:ss')}`],
      [`Filtro Status: ${statusFilter === 'all' ? 'Todos' : statusFilter === 'active' ? 'Ativos' : 'Inativos'} | Condomínio: ${condoFilter === 'all' ? 'Todos' : condoFilter}`],
      [`Total Imóveis: ${totals.totalProperties} (Ativos: ${totals.activeCount}, Inativos: ${totals.inactiveCount}) | Aluguel Total: R$ ${totals.totalRent.toFixed(2)} | Cauções: R$ ${totals.totalDeposit.toFixed(2)}`],
      [], // Empty row
      headers,
      ...dataRows
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Auto calculate column widths
    const colWidths = headers.map((header, colIndex) => {
      let maxLen = header.length;
      dataRows.forEach(row => {
        const cellVal = String(row[colIndex] ?? '');
        if (cellVal.length > maxLen) maxLen = cellVal.length;
      });
      return { wch: Math.min(Math.max(maxLen + 3, 12), 40) };
    });
    ws['!cols'] = colWidths;

    // Create Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Imóveis');

    const fileName = `tabela_imoveis_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // EXPORT TO CSV (.csv with UTF-8 BOM)
  const exportToCSV = () => {
    if (filteredData.length === 0) return;

    const headers = activeColumns.map(col => `"${col.label.replace(/"/g, '""')}"`).join(';');

    const rows = filteredData.map(prop => {
      return activeColumns.map(col => {
        let val = col.getValue(prop);
        if (typeof val === 'number') {
          return `"${val.toFixed(2).replace('.', ',')}"`;
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(';');
    });

    const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tabela_imoveis_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // EXPORT TO PDF (.pdf)
  const exportToPDF = () => {
    if (filteredData.length === 0) return;

    // Orientation: landscape if more than 6 columns, portrait otherwise
    const orientation = activeColumns.length > 6 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation });
    const currentDateStr = format(new Date(), 'dd/MM/yyyy HH:mm');

    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59);
    doc.text('Relatório e Cadastro Geral de Imóveis', 14, 16);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    
    let condoLabel = condoFilter === 'all' ? 'Todos os Condomínios' : condoFilter;
    let statusLabel = statusFilter === 'all' ? 'Todos (Ativos e Inativos)' : statusFilter === 'active' ? 'Apenas Ativos' : 'Apenas Inativos';
    
    doc.text(`Condomínio: ${condoLabel}  |  Status: ${statusLabel}  |  Emissão: ${currentDateStr}`, 14, 22);

    // Summary Box
    const pageWidth = orientation === 'landscape' ? 269 : 182;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 26, pageWidth, 16, 3, 3, 'FD');

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`TOTAL IMÓVEIS: ${totals.totalProperties} (${totals.activeCount} Ativos, ${totals.inactiveCount} Inativos)`, 20, 36);
    doc.setTextColor(16, 185, 129);
    doc.text(`ALUGUEL MENSAL TOTAL: R$ ${totals.totalRent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, orientation === 'landscape' ? 120 : 90, 36);
    doc.setTextColor(59, 130, 246);
    doc.text(`CAUÇÕES TOTAIS: R$ ${totals.totalDeposit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, orientation === 'landscape' ? 205 : 140, 36);

    // Table Content
    const tableHeaders = activeColumns.map(col => col.label);
    const tableRows = filteredData.map(prop => {
      return activeColumns.map(col => {
        const val = col.getValue(prop);
        if (typeof val === 'number' && (col.id === 'rentAmount' || col.id === 'securityDepositAmount')) {
          return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        }
        return String(val);
      });
    });

    autoTable(doc, {
      startY: 47,
      head: [tableHeaders],
      body: tableRows,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], fontSize: 8, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 2.5 },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(`Documento gerado automaticamente pelo Sistema de Gestão de Imóveis. Total: ${totals.totalProperties} registros.`, 14, finalY);

    doc.save(`relatorio_imoveis_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  // COPY TABLE TO CLIPBOARD (TSV for Excel / Google Sheets)
  const copyToClipboard = () => {
    if (filteredData.length === 0) return;

    const headers = activeColumns.map(col => col.label).join('\t');
    const rows = filteredData.map(prop => {
      return activeColumns.map(col => {
        const val = col.getValue(prop);
        if (typeof val === 'number') {
          return val.toFixed(2).replace('.', ',');
        }
        return String(val).replace(/\t/g, ' ').replace(/\n/g, ' ');
      }).join('\t');
    });

    const text = [headers, ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // PRINT TABLE
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col h-[92vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <FileSpreadsheet size={26} className="text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">Exportar Tabela de Imóveis</h2>
                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider rounded-full">
                  {filteredData.length} Imóveis Selecionados
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                Gere planilhas em Excel (.xlsx), relatórios em PDF, arquivos CSV ou copie diretamente para colar no Excel/Sheets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={onClose} 
              className="p-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Action Buttons & Export Bar */}
        <div className="bg-slate-50 border-b border-slate-200/80 p-4 px-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Download Excel (.xlsx) */}
            <button
              onClick={exportToExcel}
              disabled={filteredData.length === 0}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Baixar planilha nativa do Excel com formatação de colunas"
            >
              <FileSpreadsheet size={16} />
              <span>Baixar Excel (.xlsx)</span>
            </button>

            {/* Download PDF (.pdf) */}
            <button
              onClick={exportToPDF}
              disabled={filteredData.length === 0}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-98 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Baixar documento em PDF diagramado para impressão e arquivo"
            >
              <FileText size={16} />
              <span>Baixar PDF (.pdf)</span>
            </button>

            {/* Download CSV (.csv) */}
            <button
              onClick={exportToCSV}
              disabled={filteredData.length === 0}
              className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-98 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              title="Baixar arquivo de dados separado por ponto-e-vírgula"
            >
              <Download size={15} />
              <span>Baixar CSV</span>
            </button>

            {/* Copy Table to Clipboard */}
            <button
              onClick={copyToClipboard}
              disabled={filteredData.length === 0}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all cursor-pointer border ${
                copied 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                  : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-300'
              }`}
              title="Copiar dados formatados para colar diretamente no Excel ou Google Sheets (Ctrl+V)"
            >
              {copied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
              <span>{copied ? 'Copiado para Área de Transferência!' : 'Copiar Tabela (Colar no Excel)'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowColumnConfig(!showColumnConfig)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                showColumnConfig 
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Settings2 size={14} />
              <span>Personalizar Colunas ({selectedColumnIds.length}/{columns.length})</span>
            </button>
          </div>
        </div>

        {/* Column Config Dropdown Panel */}
        <AnimatePresence>
          {showColumnConfig && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-indigo-50/70 border-b border-indigo-100 p-4 px-6 overflow-hidden shrink-0"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Settings2 size={15} className="text-indigo-600" />
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wide">
                    Selecione quais colunas deseja incluir na exportação:
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllColumns}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={resetDefaultColumns}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 underline cursor-pointer"
                  >
                    Restaurar Padrão
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {columns.map(col => {
                  const isSelected = selectedColumnIds.includes(col.id);
                  return (
                    <label
                      key={col.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-white border-indigo-300 text-indigo-900 shadow-2xs font-bold' 
                          : 'bg-slate-100/60 border-slate-200 text-slate-500 hover:bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleColumn(col.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filters and Search Bar */}
        <div className="p-4 px-6 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'all', label: 'Todos os Imóveis', icon: Home },
                { id: 'active', label: 'Apenas Ativos', icon: CheckCircle2 },
                { id: 'inactive', label: 'Apenas Inativos', icon: XCircle },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs border border-slate-200/50'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <tab.icon size={13} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Condo Filter */}
            {condosList.length > 0 && (
              <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                <Building2 size={14} className="text-indigo-600" />
                <select
                  value={condoFilter}
                  onChange={(e) => setCondoFilter(e.target.value)}
                  className="bg-transparent outline-none cursor-pointer pr-1"
                >
                  <option value="all">Todos os Condomínios ({condosList.length})</option>
                  <option value="none">Sem Condomínio</option>
                  {condosList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por código, inquilino, CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 px-6 bg-slate-100/60 border-b border-slate-200 shrink-0">
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total de Imóveis</p>
            <p className="text-lg font-black text-slate-900">{totals.totalProperties}</p>
            <p className="text-[11px] text-slate-500 font-medium">{totals.activeCount} ativos • {totals.inactiveCount} inativos</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Aluguel Mensal Total</p>
            <p className="text-lg font-black text-emerald-700">
              R$ {totals.totalRent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-emerald-600 font-medium">Soma dos contratos listados</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[10px] font-black text-blue-600 uppercase tracking-wider">Total Cauções Registradas</p>
            <p className="text-lg font-black text-blue-700">
              R$ {totals.totalDeposit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-blue-600 font-medium">Garantias locatícias cadastradas</p>
          </div>

          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">Colunas na Tabela</p>
            <p className="text-lg font-black text-indigo-700">{activeColumns.length} de {columns.length}</p>
            <p className="text-[11px] text-indigo-600 font-medium">Campos ativos na exportação</p>
          </div>
        </div>

        {/* Live Table Preview */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            {filteredData.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Home size={36} className="mx-auto mb-2 opacity-40 text-slate-500" />
                <p className="text-sm font-bold text-slate-600">Nenhum imóvel encontrado com os filtros selecionados.</p>
                <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de status, condomínio ou busca acima.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/90 text-[10px] font-black uppercase tracking-wider text-slate-600 sticky top-0 z-10 shadow-2xs">
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      {activeColumns.map(col => (
                        <th key={col.id} className="py-3 px-4 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                    {filteredData.map((prop, index) => {
                      return (
                        <tr key={prop.id || index} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 text-center font-bold text-slate-400 text-[11px]">
                            {index + 1}
                          </td>
                          {activeColumns.map(col => {
                            const val = col.getValue(prop);

                            if (col.id === 'propertyCode') {
                              return (
                                <td key={col.id} className="py-2.5 px-4 font-black text-slate-900">
                                  {val}
                                </td>
                              );
                            }

                            if (col.id === 'status') {
                              return (
                                <td key={col.id} className="py-2.5 px-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    val === 'Ativo' 
                                      ? 'bg-emerald-100 text-emerald-800' 
                                      : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {val}
                                  </span>
                                </td>
                              );
                            }

                            if (col.id === 'rentAmount' || col.id === 'securityDepositAmount') {
                              const num = typeof val === 'number' ? val : 0;
                              return (
                                <td key={col.id} className="py-2.5 px-4 font-black text-slate-900 whitespace-nowrap">
                                  {num > 0 ? `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                              );
                            }

                            if (col.id === 'securityDepositPaid') {
                              return (
                                <td key={col.id} className="py-2.5 px-4">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    val === 'Pago' 
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}>
                                    {val}
                                  </span>
                                </td>
                              );
                            }

                            return (
                              <td key={col.id} className="py-2.5 px-4 whitespace-nowrap">
                                {String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-white border-t border-slate-200 p-4 px-6 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 font-medium">
            Exibindo <span className="font-bold text-slate-800">{filteredData.length}</span> de <span className="font-bold text-slate-800">{properties.length}</span> imóveis cadastrados.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Fechar
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <FileSpreadsheet size={15} />
              <span>Exportar Excel (.xlsx)</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
