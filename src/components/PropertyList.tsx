import React from 'react';
import { Property } from '../types';
import { 
  Edit2, Trash2, Phone, User, Home, History, Droplets, Zap, Calendar, 
  DollarSign, UserMinus, Plus, Filter, CheckCircle, XCircle, Palette, Check,
  ChevronUp, ChevronDown, Building2, Sparkles, Utensils, ClipboardCheck,
  MessageSquare, PauseCircle, PlayCircle, AlertCircle, FileSpreadsheet,
  Download, FileText, Copy
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { logAudit } from '../utils/auditLogger';
import PropertyExportModal, { exportPropertiesToExcel } from './PropertyExportModal';

type SortKey = 'property' | 'condominium' | 'tenant' | 'phone' | 'securityDeposit' | 'status';
type SortDirection = 'asc' | 'desc';

interface PropertyListProps {
  properties: Property[];
  onEdit: (property: Property) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: Partial<Property>) => void;
  onViewHistory: (property: Property) => void;
  onEndContract: (property: Property) => void;
  onNewBilling: (property: Property) => void;
  onNewContract: (property: Property) => void;
}

const SecurityDepositCell = ({ property, onUpdate }: { property: Property, onUpdate: (id: string, data: Partial<Property>) => void }) => {
  const [value, setValue] = React.useState(property.securityDepositAmount?.toString() || '');
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (!isEditing) {
      setValue(property.securityDepositAmount?.toString() || '');
    }
  }, [property.securityDepositAmount, isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
    const numValue = parseFloat(value.replace(',', '.'));
    if (!isNaN(numValue) && numValue !== property.securityDepositAmount) {
      onUpdate(property.id, { securityDepositAmount: numValue });
    } else if (value === '' && property.securityDepositAmount !== undefined) {
      onUpdate(property.id, { securityDepositAmount: 0 });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative group/input">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="0,00"
          className={`w-24 text-center text-xs font-bold bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-slate-50 outline-none transition-all py-1 rounded ${
            isEditing ? 'border-blue-500 bg-slate-50' : ''
          }`}
        />
        {!isEditing && value && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold pointer-events-none">
            R$
          </span>
        )}
      </div>
      <button 
        onClick={() => onUpdate(property.id, { securityDepositPaid: !property.securityDepositPaid })}
        className={`text-[9px] font-black uppercase tracking-widest mt-1 px-2 py-0.5 rounded-full transition-all ${
          property.securityDepositPaid 
            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
            : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
        }`}
      >
        {property.securityDepositPaid ? 'Pago' : 'Pendente'}
      </button>
    </div>
  );
};

const COLOR_OPTIONS = [
  { name: 'Limpar Cor', value: '', class: 'bg-white border-slate-300' },
  { name: 'Azul', value: '#3b82f6', class: 'bg-blue-500 border-blue-600' },
  { name: 'Verde', value: '#22c55e', class: 'bg-emerald-500 border-emerald-600' },
  { name: 'Amarelo', value: '#eab308', class: 'bg-amber-500 border-amber-600' },
  { name: 'Vermelho', value: '#ef4444', class: 'bg-rose-500 border-rose-600' },
  { name: 'Roxo', value: '#a855f7', class: 'bg-purple-500 border-purple-600' },
  { name: 'Laranja', value: '#f97316', class: 'bg-orange-500 border-orange-600' },
];

export default function PropertyList({ 
  properties, 
  onEdit, 
  onDelete, 
  onUpdate,
  onViewHistory, 
  onEndContract, 
  onNewBilling,
  onNewContract 
}: PropertyListProps) {
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [condoFilter, setCondoFilter] = React.useState<string>('all');
  const [localSearch, setLocalSearch] = React.useState('');
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: SortDirection }>({
    key: 'property',
    direction: 'asc'
  });

  const [activeColorPicker, setActiveColorPicker] = React.useState<string | null>(null);

  const condosList = React.useMemo(() => {
    const list = new Set<string>();
    properties.forEach(p => {
      if (p.condominium?.trim()) list.add(p.condominium.trim());
    });
    return Array.from(list).sort();
  }, [properties]);

  const filteredProperties = React.useMemo(() => {
    const list = properties.filter(p => {
      const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchesCondo = condoFilter === 'all' || (p.condominium || '').trim().toLowerCase() === condoFilter.toLowerCase();
      const matchesSearch = p.propertyCode.toLowerCase().includes(localSearch.toLowerCase()) ||
                          p.ownerName.toLowerCase().includes(localSearch.toLowerCase()) ||
                          (p.condominium || '').toLowerCase().includes(localSearch.toLowerCase());
      return matchesStatus && matchesCondo && matchesSearch;
    });

    list.sort((a, b) => {
      let comparison = 0;
      
      switch (sortConfig.key) {
        case 'property':
          comparison = (a.propertyCode || '').localeCompare(b.propertyCode || '', undefined, { numeric: true });
          break;
        case 'condominium':
          comparison = (a.condominium || '').localeCompare(b.condominium || '');
          break;
        case 'tenant':
          comparison = (a.ownerName || '').localeCompare(b.ownerName || '');
          break;
        case 'phone':
          comparison = (a.phone || '').localeCompare(b.phone || '');
          break;
        case 'securityDeposit':
          comparison = (a.securityDepositAmount || 0) - (b.securityDepositAmount || 0);
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return list;
  }, [properties, statusFilter, condoFilter, localSearch, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="inline ml-1" /> : <ChevronDown size={12} className="inline ml-1" />;
  };

  if (properties.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-slate-200 shadow-sm">
        <Home className="mx-auto text-slate-200 mb-6" size={64} />
        <p className="text-slate-500 font-bold text-lg">Nenhum imóvel cadastrado ainda.</p>
        <p className="text-slate-400 text-sm mt-1">Comece adicionando seu primeiro imóvel no botão superior.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[28px] border border-slate-200/60 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100/50 p-1 rounded-2xl">
            {[
              { id: 'all', label: 'Todos', icon: Home },
              { id: 'active', label: 'Ativos', icon: CheckCircle },
              { id: 'inactive', label: 'Inativos', icon: XCircle },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === f.id
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <f.icon size={14} />
                {f.label}
              </button>
            ))}
          </div>

          {condosList.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-2xl">
              <Building2 size={14} className="text-indigo-600" />
              <select
                value={condoFilter}
                onChange={(e) => setCondoFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer pr-1"
              >
                <option value="all">Todos Condomínios ({condosList.length})</option>
                {condosList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar imóvel, inquilino..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const summary = `Status: ${statusFilter === 'all' ? 'Todos' : statusFilter === 'active' ? 'Ativos' : 'Inativos'}${condoFilter !== 'all' ? ` | Condomínio: ${condoFilter}` : ''}${localSearch ? ` | Busca: "${localSearch}"` : ''}`;
                exportPropertiesToExcel(filteredProperties, undefined, summary);
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition-all cursor-pointer whitespace-nowrap"
              title="Baixar diretamente planilha formatada do Excel (.xlsx)"
            >
              <FileSpreadsheet size={15} />
              <span>Baixar Excel</span>
            </button>

            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap active:scale-95"
              title="Opções avançadas de exportação: PDF, CSV, Copiar e personalização de colunas"
            >
              <Download size={14} />
              <span>Mais Opções</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th 
                  className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('property')}
                >
                  <div className="flex items-center gap-1">
                    Imóvel
                    <SortIcon column="property" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('tenant')}
                >
                  <div className="flex items-center gap-1">
                    Inquilino
                    <SortIcon column="tenant" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('phone')}
                >
                  <div className="flex items-center gap-1">
                    Telefone
                    <SortIcon column="phone" />
                  </div>
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Leituras</th>
                <th 
                  className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('securityDeposit')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Caução
                    <SortIcon column="securityDeposit" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-pointer hover:text-blue-600 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Status
                    <SortIcon column="status" />
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <AnimatePresence mode="popLayout">
                {filteredProperties.map((property, index) => (
                  <motion.tr
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={property.id}
                    className={`group hover:bg-slate-50/50 transition-colors border-l-4 ${
                      property.status === 'inactive' ? 'bg-rose-50/10' : ''
                    }`}
                    style={{ 
                      backgroundColor: property.colorTag ? `${property.colorTag}33` : (property.status === 'inactive' ? undefined : 'white'),
                      borderLeftColor: property.colorTag || 'transparent',
                      zIndex: activeColorPicker === property.id ? 50 : 0,
                      position: 'relative'
                    }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl shrink-0 ${
                          property.status === 'inactive' ? 'bg-rose-100 text-rose-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          <Home size={18} />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 tracking-tight">{property.propertyCode}</p>
                          {property.condominium && (
                            <div className="flex items-center gap-1 text-[10px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/80 mt-0.5 w-fit">
                              <Building2 size={10} />
                              <span>{property.condominium}</span>
                            </div>
                          )}
                          {property.rentAmount !== undefined && property.rentAmount > 0 && (
                            <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                              R$ {property.rentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          )}

                          {/* Badges de Vistoria Básica */}
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {property.isClean !== false && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60" title="Entregue Limpo">
                                <Sparkles size={9} />
                                Limpo
                              </span>
                            )}
                            {property.hasUtensils && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60" title="Com Utensílios / Mobiliado">
                                <Utensils size={9} />
                                Utensílios
                              </span>
                            )}
                            {property.inspectionNotes && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200" title={`Obs Vistoria: ${property.inspectionNotes}`}>
                                <ClipboardCheck size={9} className="text-slate-500" />
                                <span className="max-w-[120px] truncate">{property.inspectionNotes}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <User size={12} className="text-slate-400" />
                        <span className={`text-sm font-bold tracking-tight ${property.status === 'inactive' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                          {property.ownerName || 'Sem Inquilino'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {(() => {
                        const activePhones = (property.phones || []).filter(p => p.isActiveForBilling && p.number);
                        const displayPhone = activePhones[0]?.number || property.phone;

                        if (!displayPhone && activePhones.length === 0) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md font-semibold border border-amber-100">
                              <AlertCircle size={11} /> Sem WhatsApp
                            </span>
                          );
                        }

                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Phone size={12} className="text-slate-400" />
                              <span className="text-xs font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md">
                                {displayPhone}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {activePhones.length > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100" title={`${activePhones.length} telefone(s) ativo(s) para cobrança`}>
                                  <MessageSquare size={9} className="text-emerald-600" />
                                  {activePhones.length} ativo{activePhones.length > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-amber-600">Sem WhatsApp</span>
                              )}

                              {property.cadencePaused && (
                                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200" title="Régua de cobrança pausada manualmente">
                                  <PauseCircle size={9} className="text-amber-600" />
                                  Pausada
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1.5" title="Água">
                          <Droplets size={14} className="text-blue-400" />
                          <span className="font-mono text-xs font-bold text-slate-600">{property.initialWaterReading || 0}</span>
                        </div>
                        <div className="flex items-center gap-1.5" title="Luz">
                          <Zap size={14} className="text-amber-400" />
                          <span className="font-mono text-xs font-bold text-slate-600">{property.initialElectricityReading || 0}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <SecurityDepositCell property={property} onUpdate={onUpdate} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      {property.status === 'inactive' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-100 text-rose-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                          <XCircle size={10} />
                          Inativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[9px] font-black uppercase tracking-widest">
                          <CheckCircle size={10} />
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {property.status !== 'inactive' ? (
                          <>
                            <button
                              onClick={() => onNewBilling(property)}
                              className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                              title="Nova Cobrança"
                            >
                              <DollarSign size={18} />
                            </button>
                            <button
                              onClick={() => onEndContract(property)}
                              className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                              title="Encerrar Contrato"
                            >
                              <UserMinus size={18} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => onNewContract(property)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                            title="Novo Contrato"
                          >
                            <Plus size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => onViewHistory(property)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Ver Histórico"
                        >
                          <History size={18} />
                        </button>
                        
                        <div className="relative">
                          <button
                            onClick={() => setActiveColorPicker(activeColorPicker === property.id ? null : property.id)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Destacar linha"
                          >
                            <Palette size={18} />
                          </button>
                          
                          <AnimatePresence>
                            {activeColorPicker === property.id && (
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
                                      onUpdate(property.id, { colorTag: color.value });
                                      setActiveColorPicker(null);
                                    }}
                                    className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95 shadow-sm relative ${color.class} ${
                                      (property.colorTag === color.value || (!property.colorTag && color.value === '')) 
                                        ? 'ring-2 ring-offset-2 ring-blue-500 scale-110 z-10' 
                                        : 'border-slate-200'
                                    }`}
                                    title={color.name}
                                  >
                                    {(property.colorTag === color.value || (!property.colorTag && color.value === '')) && (
                                      <Check size={14} className={`absolute inset-0 m-auto ${!color.value ? 'text-slate-400' : 'text-white drop-shadow-sm'}`} />
                                    )}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                        <button
                          onClick={() => onEdit(property)}
                          className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => onDelete(property.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filteredProperties.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-slate-400 font-bold">Nenhum imóvel encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>

      {/* Export Properties Modal */}
      <PropertyExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        properties={properties}
        initialCondoFilter={condoFilter}
        initialStatusFilter={statusFilter}
      />
    </div>
  );
}
