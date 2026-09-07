import React, { useState, useMemo, useEffect } from 'react';
import { Property, BillingRecord, TenantDocument, AdditionalTenantInfo } from '../types';
import { 
  Users, UserCheck, UserX, AlertTriangle, Search, Filter, 
  Phone, Mail, IdCard, Home, Building2, Calendar, DollarSign, 
  MessageCircle, ExternalLink, History, ArrowUpRight, CheckCircle2,
  Clock, Edit2, ShieldAlert, FileText, ChevronRight, Plus, Trash2, 
  Paperclip, Upload, Eye, Download, Save, MapPin, UserPlus, X, Check,
  Sparkles, RefreshCw, Utensils, ClipboardCheck
} from 'lucide-react';
import { format, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { updateDoc, getDocs, writeBatch, serverTimestamp } from '../lib/db';
import { isDepositItem, isBalanceItem } from '../utils/billingUtils';
import { parseDate } from '../utils/firestore';

export interface TenantItem {
  id: string;
  name: string;
  phone?: string;
  cpf?: string;
  email?: string;
  tenantAddress?: string;
  referencePhone?: string;
  referenceAddress?: string;
  documents?: TenantDocument[];
  additionalInfo?: AdditionalTenantInfo[];
  propertyId: string;
  propertyCode: string;
  condominium?: string;
  isActive: boolean; // Property status active & tenant matches current
  rentAmount?: number;
  leaseStartDate?: any;
  securityDepositAmount?: number;
  securityDepositPaid?: boolean;
  
  // Debt & Billings
  totalDebt: number;
  unpaidCount: number;
  unpaidBillings: BillingRecord[];
  allBillings: BillingRecord[];
  latestDueDateStr?: string;
  isExTenantWithDebt: boolean; // Inactive AND totalDebt > 0
  property?: Property;
}

interface TenantListProps {
  properties: Property[];
  billings: BillingRecord[];
  onViewPropertyHistory: (propertyId: string) => void;
  onEditProperty?: (property: Property) => void;
  onUpdateProperty?: (id: string, data: Partial<Property>) => Promise<void>;
}

type TenantFilter = 'all' | 'active' | 'inactive' | 'good' | 'debtors' | 'ex_debtors';

export default function TenantList({
  properties,
  billings,
  onViewPropertyHistory,
  onEditProperty,
  onUpdateProperty
}: TenantListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCondo, setSelectedCondo] = useState<string>('all');
  const [filterType, setFilterType] = useState<TenantFilter>('all');
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);

  // Form State for editing tenant details
  const [isEditing, setIsEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formRefPhone, setFormRefPhone] = useState('');
  const [formRefAddress, setFormRefAddress] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formAdditionalInfo, setFormAdditionalInfo] = useState<AdditionalTenantInfo[]>([]);
  const [formDocuments, setFormDocuments] = useState<TenantDocument[]>([]);

  // New Custom Field Inputs
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [showAddCustomField, setShowAddCustomField] = useState(false);

  // Loading & Feedback
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Extract unique condo names
  const condoList = useMemo(() => {
    const list = new Set<string>();
    properties.forEach(p => {
      if (p.condominium?.trim()) list.add(p.condominium.trim());
    });
    return Array.from(list).sort();
  }, [properties]);

  // Aggregate all tenants from properties & historical billings
  const tenantItems = useMemo(() => {
    const map = new Map<string, TenantItem>();

    // 1. Map current properties (active & inactive)
    properties.forEach(p => {
      const tenantName = p.ownerName?.trim();
      if (!tenantName) return;

      const key = `${tenantName.toLowerCase()}_${p.id}`;

      // Get billings for this property & tenant
      const propBillings = billings.filter(b => 
        b.propertyId === p.id || 
        (b.propertyCode && b.propertyCode.toLowerCase() === p.propertyCode.toLowerCase())
      );

      const leaseStart = parseDate(p.leaseStartDate);

      // Find unpaid billings for this tenant
      const unpaidBillings = propBillings.filter(b => {
        if (b.archived || b.status === 'paid') return false;

        const bDueDate = parseDate(b.dueDate);
        if (leaseStart && bDueDate && isBefore(bDueDate, leaseStart)) {
          return false;
        }

        if (b.tenantName && b.tenantName.toLowerCase() !== tenantName.toLowerCase()) {
          return false;
        }

        return true;
      });

      let totalBaseCharged = 0;
      let totalPaidForBase = 0;

      propBillings.forEach(b => {
        if (b.archived) return;
        const bDueDate = parseDate(b.dueDate);
        if (leaseStart && bDueDate && isBefore(bDueDate, leaseStart)) return;
        if (b.tenantName && b.tenantName.toLowerCase() !== tenantName.toLowerCase()) return;

        let baseAmount = 0;
        let depositAmount = 0;
        if (b.items && b.items.length > 0) {
          b.items.forEach(item => {
            if (isDepositItem(item)) {
              depositAmount += (item.amount || 0);
            } else if (!isBalanceItem(item)) {
              baseAmount += (item.amount || 0);
            }
          });
        } else {
          baseAmount = b.totalAmount || 0;
        }
        totalBaseCharged += baseAmount;

        const paid = b.paidAmount || 0;
        const paidForDeposit = Math.min(Math.max(0, paid - baseAmount), depositAmount);
        const paidForBase = paid - paidForDeposit;
        totalPaidForBase += paidForBase;
      });

      const totalDebt = Math.max(0, Math.round((totalBaseCharged - totalPaidForBase + Number.EPSILON) * 100) / 100);

      let latestDueDateStr = '-';
      if (unpaidBillings.length > 0) {
        const sorted = [...unpaidBillings].sort((a, b) => {
          const tA = parseDate(a.dueDate)?.getTime() || 0;
          const tB = parseDate(b.dueDate)?.getTime() || 0;
          return tA - tB;
        });
        const d = parseDate(sorted[0].dueDate);
        if (d) {
          latestDueDateStr = format(d, 'dd/MM/yyyy');
        }
      }

      const isActive = p.status === 'active';
      const isExTenantWithDebt = !isActive && totalDebt > 0;

      map.set(key, {
        id: key,
        name: tenantName,
        phone: p.phone,
        cpf: p.tenantCpf,
        email: p.tenantEmail,
        tenantAddress: p.tenantAddress,
        referencePhone: p.referencePhone,
        referenceAddress: p.referenceAddress,
        documents: p.documents || [],
        additionalInfo: p.additionalInfo || [],
        propertyId: p.id,
        propertyCode: p.propertyCode,
        condominium: p.condominium,
        isActive,
        rentAmount: p.rentAmount,
        leaseStartDate: p.leaseStartDate,
        securityDepositAmount: p.securityDepositAmount,
        securityDepositPaid: p.securityDepositPaid,
        totalDebt,
        unpaidCount: unpaidBillings.length,
        unpaidBillings,
        allBillings: propBillings,
        latestDueDateStr,
        isExTenantWithDebt,
        property: p
      });
    });

    // 2. Map historical tenants from billings that are not current on active properties
    billings.forEach(b => {
      const tenantName = b.tenantName?.trim();
      if (!tenantName) return;

      const matchedProp = properties.find(p => p.id === b.propertyId);
      const isCurrentActiveTenant = matchedProp && matchedProp.status === 'active' && matchedProp.ownerName?.trim().toLowerCase() === tenantName.toLowerCase();

      if (!isCurrentActiveTenant) {
        const key = `${tenantName.toLowerCase()}_${b.propertyId || b.propertyCode || 'hist'}`;
        
        if (!map.has(key)) {
          // Fetch all billings for this historical tenant
          const tenantBillings = billings.filter(item => 
            item.tenantName?.trim().toLowerCase() === tenantName.toLowerCase() &&
            (item.propertyId === b.propertyId || item.propertyCode === b.propertyCode)
          );

          const unpaidBillings = tenantBillings.filter(item => !item.archived && item.status !== 'paid');
          let totalBaseCharged = 0;
          let totalPaidForBase = 0;

          tenantBillings.forEach(item => {
            if (item.archived) return;

            let baseAmount = 0;
            let depositAmount = 0;
            if (item.items && item.items.length > 0) {
              item.items.forEach(i => {
                if (isDepositItem(i)) {
                  depositAmount += (i.amount || 0);
                } else if (!isBalanceItem(i)) {
                  baseAmount += (i.amount || 0);
                }
              });
            } else {
              baseAmount = item.totalAmount || 0;
            }
            totalBaseCharged += baseAmount;

            const paid = item.paidAmount || 0;
            const paidForDeposit = Math.min(Math.max(0, paid - baseAmount), depositAmount);
            const paidForBase = paid - paidForDeposit;
            totalPaidForBase += paidForBase;
          });

          const totalDebt = Math.max(0, Math.round((totalBaseCharged - totalPaidForBase + Number.EPSILON) * 100) / 100);

          let latestDueDateStr = '-';
          if (unpaidBillings.length > 0) {
            const sorted = [...unpaidBillings].sort((a, b) => {
              const tA = parseDate(a.dueDate)?.getTime() || 0;
              const tB = parseDate(b.dueDate)?.getTime() || 0;
              return tA - tB;
            });
            const d = parseDate(sorted[0].dueDate);
            if (d) {
              latestDueDateStr = format(d, 'dd/MM/yyyy');
            }
          }

          map.set(key, {
            id: key,
            name: tenantName,
            phone: b.tenantPhone || matchedProp?.phone,
            cpf: matchedProp?.tenantCpf,
            email: matchedProp?.tenantEmail,
            tenantAddress: matchedProp?.tenantAddress,
            referencePhone: matchedProp?.referencePhone,
            referenceAddress: matchedProp?.referenceAddress,
            documents: matchedProp?.documents || [],
            additionalInfo: matchedProp?.additionalInfo || [],
            propertyId: b.propertyId || matchedProp?.id || '',
            propertyCode: b.propertyCode || matchedProp?.propertyCode || 'S/N',
            condominium: matchedProp?.condominium,
            isActive: false, // Former tenant
            totalDebt,
            unpaidCount: unpaidBillings.length,
            unpaidBillings,
            allBillings: tenantBillings,
            latestDueDateStr,
            isExTenantWithDebt: totalDebt > 0,
            property: matchedProp
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      // Prioritize ex-tenants with debt first, then active debtors, then name
      if (a.isExTenantWithDebt && !b.isExTenantWithDebt) return -1;
      if (!a.isExTenantWithDebt && b.isExTenantWithDebt) return 1;
      if (a.totalDebt > 0 && b.totalDebt === 0) return -1;
      if (a.totalDebt === 0 && b.totalDebt > 0) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [properties, billings]);

  // Populate form state whenever selectedTenant changes
  useEffect(() => {
    if (selectedTenant) {
      setFormName(selectedTenant.name || '');
      setFormPhone(selectedTenant.phone || '');
      setFormCpf(selectedTenant.cpf || '');
      setFormEmail(selectedTenant.email || '');
      setFormAddress(selectedTenant.tenantAddress || selectedTenant.property?.tenantAddress || '');
      setFormRefPhone(selectedTenant.referencePhone || selectedTenant.property?.referencePhone || '');
      setFormRefAddress(selectedTenant.referenceAddress || selectedTenant.property?.referenceAddress || '');
      setFormStatus(selectedTenant.isActive ? 'active' : 'inactive');
      setFormAdditionalInfo(selectedTenant.additionalInfo || selectedTenant.property?.additionalInfo || []);
      setFormDocuments(selectedTenant.documents || selectedTenant.property?.documents || []);
      setIsEditing(false);
      setSaveSuccessMsg(null);
      setShowAddCustomField(false);
    }
  }, [selectedTenant]);

  // Overall metrics
  const metrics = useMemo(() => {
    let totalCount = tenantItems.length;
    let activeCount = 0;
    let inactiveCount = 0;
    let goodCount = 0;
    let debtorsCount = 0;
    let exDebtorsCount = 0;
    let totalDebtAmount = 0;
    let exDebtsAmount = 0;

    tenantItems.forEach(t => {
      if (t.isActive) activeCount++;
      else inactiveCount++;

      if (t.totalDebt > 0) {
        debtorsCount++;
        totalDebtAmount += t.totalDebt;
        if (!t.isActive) {
          exDebtorsCount++;
          exDebtsAmount += t.totalDebt;
        }
      } else {
        goodCount++;
      }
    });

    return {
      totalCount,
      activeCount,
      inactiveCount,
      goodCount,
      debtorsCount,
      exDebtorsCount,
      totalDebtAmount,
      exDebtsAmount
    };
  }, [tenantItems]);

  // Filtered tenants based on search & subtabs
  const filteredTenants = useMemo(() => {
    return tenantItems.filter(t => {
      // Search match
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || (
        t.name.toLowerCase().includes(term) ||
        t.propertyCode.toLowerCase().includes(term) ||
        (t.condominium && t.condominium.toLowerCase().includes(term)) ||
        (t.phone && t.phone.toLowerCase().includes(term)) ||
        (t.cpf && t.cpf.toLowerCase().includes(term)) ||
        (t.email && t.email.toLowerCase().includes(term))
      );

      // Condo filter
      const matchesCondo = selectedCondo === 'all' || t.condominium === selectedCondo;

      // Status/Category filter
      let matchesCategory = true;
      if (filterType === 'active') matchesCategory = t.isActive;
      else if (filterType === 'inactive') matchesCategory = !t.isActive;
      else if (filterType === 'good') matchesCategory = t.totalDebt === 0;
      else if (filterType === 'debtors') matchesCategory = t.totalDebt > 0;
      else if (filterType === 'ex_debtors') matchesCategory = t.isExTenantWithDebt;

      return matchesSearch && matchesCondo && matchesCategory;
    });
  }, [tenantItems, searchTerm, selectedCondo, filterType]);

  // Helper to open WhatsApp with debt reminder text
  const openWhatsAppDebtAlert = (tenant: TenantItem) => {
    if (!tenant.phone) {
      alert('Inquilino não possui telefone cadastrado.');
      return;
    }

    const cleanPhone = tenant.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length <= 11 ? `55${cleanPhone}` : cleanPhone;

    let msg = `Olá, *${tenant.name}*!\n\n`;
    msg += `Entramos em contato referente às pendências do imóvel *${tenant.propertyCode}*${tenant.condominium ? ` (${tenant.condominium})` : ''}.\n\n`;
    msg += `Consta no nosso sistema um saldo pendente de *R$ ${tenant.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}* referente a ${tenant.unpaidCount} fatura(s):\n`;

    tenant.unpaidBillings.forEach(b => {
      const d = parseDate(b.dueDate);
      const dueDateStr = d ? format(d, 'dd/MM/yyyy') : '-';

      const val = (b.totalAmount || 0) - (b.paidAmount || 0);
      msg += `• Vencimento: ${dueDateStr} | Valor Pendente: R$ ${val.toFixed(2)}\n`;
    });

    msg += `\nFavor entrar em contato para regularização. Obrigado!`;

    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Add document handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);

    fileList.forEach((file: File) => {
      if (file.size > 8 * 1024 * 1024) {
        alert(`O arquivo ${file.name} excede o limite de 8MB.`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const fileData = uploadEvent.target?.result as string;
        const newDocItem: TenantDocument = {
          id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: file.name,
          fileData: fileData,
          fileType: file.type,
          uploadedAt: new Date().toISOString(),
          size: file.size
        };
        setFormDocuments(prev => [...prev, newDocItem]);
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  // Remove document
  const handleRemoveDocument = (docId: string) => {
    setFormDocuments(prev => prev.filter(d => d.id !== docId));
  };

  // Add Custom Info Field
  const handleAddCustomField = () => {
    if (!newFieldLabel.trim() || !newFieldValue.trim()) {
      alert('Por favor, informe o nome e o valor do dado adicional.');
      return;
    }

    const newItem: AdditionalTenantInfo = {
      id: 'field_' + Date.now(),
      label: newFieldLabel.trim(),
      value: newFieldValue.trim()
    };

    setFormAdditionalInfo(prev => [...prev, newItem]);
    setNewFieldLabel('');
    setNewFieldValue('');
    setShowAddCustomField(false);
  };

  // Remove Custom Field
  const handleRemoveCustomField = (fieldId: string) => {
    setFormAdditionalInfo(prev => prev.filter(f => f.id !== fieldId));
  };

  // Open Document in browser or download
  const handleViewDocument = (docItem: TenantDocument) => {
    if (!docItem.fileData) return;
    const newTab = window.open();
    if (newTab) {
      if (docItem.fileType?.startsWith('image/')) {
        newTab.document.write(`
          <html>
            <head><title>${docItem.name}</title></head>
            <body style="margin:0; background:#0f172a; display:flex; align-items:center; justify-content:center; min-height:100vh;">
              <img src="${docItem.fileData}" style="max-width:95vw; max-height:95vh; object-fit:contain; border-radius:12px; shadow:0 20px 25px -5px rgba(0,0,0,0.5);" />
            </body>
          </html>
        `);
      } else {
        newTab.location.href = docItem.fileData;
      }
    }
  };

  // Save Tenant Modifications & Sync with Firestore Properties
  const handleSaveTenant = async () => {
    if (!selectedTenant) return;
    if (!formName.trim()) {
      alert('O nome do inquilino é obrigatório.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMsg(null);

    try {
      const updates: Partial<Property> = {
        ownerName: formName.trim(),
        phone: formPhone.trim(),
        tenantCpf: formCpf.trim(),
        tenantEmail: formEmail.trim(),
        tenantAddress: formAddress.trim(),
        referencePhone: formRefPhone.trim(),
        referenceAddress: formRefAddress.trim(),
        status: formStatus,
        additionalInfo: formAdditionalInfo,
        documents: formDocuments
      };

      if (selectedTenant.propertyId) {
        // 1. Update Property Document in Firestore
        if (onUpdateProperty) {
          await onUpdateProperty(selectedTenant.propertyId, updates);
        } else {
          await updateDoc('properties', selectedTenant.propertyId, {
            ...updates,
            updatedAt: serverTimestamp()
          });
        }

        // 2. Sync active/unpaid billings if tenant name or phone changed
        if (selectedTenant.name !== formName.trim() || selectedTenant.phone !== formPhone.trim()) {
          const billingsSnap = await getDocs('billings', {
            filters: [{ field: 'propertyId', op: 'eq', value: selectedTenant.propertyId }],
          });
          const batchOps = [];
          billingsSnap.forEach((bDoc) => {
            if (bDoc.status !== 'paid') {
              batchOps.push({
                type: 'update',
                table: 'billings',
                id: bDoc.id,
                data: {
                  tenantName: formName.trim(),
                  tenantPhone: formPhone.trim(),
                  updatedAt: serverTimestamp()
                }
              });
            }
          });
          if (batchOps.length > 0) {
            await writeBatch(batchOps);
          }
        }
      }

      setSaveSuccessMsg('Informações do inquilino sincronizadas com sucesso!');
      setIsEditing(false);

      // Update selected tenant in state
      setSelectedTenant(prev => prev ? {
        ...prev,
        name: formName.trim(),
        phone: formPhone.trim(),
        cpf: formCpf.trim(),
        email: formEmail.trim(),
        tenantAddress: formAddress.trim(),
        referencePhone: formRefPhone.trim(),
        referenceAddress: formRefAddress.trim(),
        isActive: formStatus === 'active',
        additionalInfo: formAdditionalInfo,
        documents: formDocuments
      } : null);

      setTimeout(() => {
        setSaveSuccessMsg(null);
      }, 3500);

    } catch (err) {
      console.error('Erro ao atualizar inquilino:', err);
      alert('Erro ao salvar as informações do inquilino. Verifique a conexão.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tenants */}
        <div 
          onClick={() => setFilterType('all')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            filterType === 'all'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-4 ring-blue-100'
              : 'bg-white border-slate-200/60 text-slate-800 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${filterType === 'all' ? 'text-blue-100' : 'text-slate-400'}`}>
              Total de Inquilinos
            </span>
            <div className={`p-2.5 rounded-2xl ${filterType === 'all' ? 'bg-blue-500/30 text-white' : 'bg-blue-50 text-blue-600'}`}>
              <Users size={20} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-3xl font-black tracking-tight">{metrics.totalCount}</h3>
            <span className={`text-xs font-semibold ${filterType === 'all' ? 'text-blue-100' : 'text-slate-500'}`}>
              {metrics.activeCount} ativos / {metrics.inactiveCount} ex
            </span>
          </div>
        </div>

        {/* Active Tenants */}
        <div 
          onClick={() => setFilterType('active')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            filterType === 'active'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-4 ring-emerald-100'
              : 'bg-white border-slate-200/60 text-slate-800 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${filterType === 'active' ? 'text-emerald-100' : 'text-slate-400'}`}>
              Inquilinos Ativos
            </span>
            <div className={`p-2.5 rounded-2xl ${filterType === 'active' ? 'bg-emerald-500/30 text-white' : 'bg-emerald-50 text-emerald-600'}`}>
              <UserCheck size={20} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-3xl font-black tracking-tight">{metrics.activeCount}</h3>
            <span className={`text-xs font-semibold ${filterType === 'active' ? 'text-emerald-100' : 'text-emerald-600'}`}>
              Com contrato vigente
            </span>
          </div>
        </div>

        {/* Good Tenants / Quitados */}
        <div 
          onClick={() => setFilterType('good')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            filterType === 'good'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-4 ring-indigo-100'
              : 'bg-white border-slate-200/60 text-slate-800 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${filterType === 'good' ? 'text-indigo-100' : 'text-slate-400'}`}>
              Em Dia (Bons Inquilinos)
            </span>
            <div className={`p-2.5 rounded-2xl ${filterType === 'good' ? 'bg-indigo-500/30 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <h3 className="text-3xl font-black tracking-tight">{metrics.goodCount}</h3>
            <span className={`text-xs font-semibold ${filterType === 'good' ? 'text-indigo-100' : 'text-indigo-600'}`}>
              Sem nenhuma pendência
            </span>
          </div>
        </div>

        {/* Ex-tenants with Debt */}
        <div 
          onClick={() => setFilterType('ex_debtors')}
          className={`p-5 rounded-3xl border transition-all cursor-pointer relative overflow-hidden ${
            filterType === 'ex_debtors'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md ring-4 ring-rose-100'
              : 'bg-gradient-to-br from-rose-50/80 to-red-100/50 border-rose-200/80 text-rose-950 hover:border-rose-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-black uppercase tracking-widest flex items-center gap-1.5 ${filterType === 'ex_debtors' ? 'text-rose-100' : 'text-rose-700'}`}>
              <ShieldAlert size={14} className="animate-pulse" />
              Saíram Devendo
            </span>
            <div className={`p-2.5 rounded-2xl ${filterType === 'ex_debtors' ? 'bg-rose-500/30 text-white' : 'bg-rose-600 text-white shadow-sm'}`}>
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <h3 className="text-3xl font-black tracking-tight">{metrics.exDebtorsCount}</h3>
              <p className={`text-[11px] font-bold mt-0.5 ${filterType === 'ex_debtors' ? 'text-rose-100' : 'text-rose-700'}`}>
                {metrics.debtorsCount} devendo no total
              </p>
            </div>
            <div className="text-right">
              <span className={`text-lg font-black block font-mono ${filterType === 'ex_debtors' ? 'text-white' : 'text-rose-700'}`}>
                R$ {metrics.exDebtsAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${filterType === 'ex_debtors' ? 'text-rose-200' : 'text-rose-500'}`}>
                Débito de ex-inquilinos
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Subtabs */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Subtab Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/30">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({metrics.totalCount})
            </button>

            <button
              onClick={() => setFilterType('active')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filterType === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ativos ({metrics.activeCount})
            </button>

            <button
              onClick={() => setFilterType('inactive')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filterType === 'inactive'
                  ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Inativos / Ex ({metrics.inactiveCount})
            </button>

            <button
              onClick={() => setFilterType('good')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                filterType === 'good'
                  ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Em Dia ({metrics.goodCount})
            </button>

            <button
              onClick={() => setFilterType('ex_debtors')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterType === 'ex_debtors'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-600 hover:bg-rose-50'
              }`}
            >
              <ShieldAlert size={14} />
              <span>Saíram Devendo ({metrics.exDebtorsCount})</span>
            </button>
          </div>

          {/* Search & Condo Select */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Condo Selector */}
            {condoList.length > 0 && (
              <div className="relative">
                <select
                  value={selectedCondo}
                  onChange={(e) => setSelectedCondo(e.target.value)}
                  className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 appearance-none cursor-pointer"
                >
                  <option value="all">Todos os Condomínios</option>
                  {condoList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              </div>
            )}

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Buscar por nome, imóvel, CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* Banner if filtering "Saíram Devendo" */}
        {filterType === 'ex_debtors' && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-800">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-rose-900">
                  Discriminando Ex-Inquilinos Inadimplentes (Saíram Devendo)
                </h4>
                <p className="text-xs text-rose-700 font-medium">
                  Estes inquilinos não possuem mais contrato ativo nos imóveis, mas deixaram saldos devedores em aberto no sistema.
                </p>
              </div>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-rose-200 text-right shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Devido por Ex-Inquilinos</span>
              <span className="text-base font-black text-rose-600 font-mono">
                R$ {metrics.exDebtsAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Tenants List Table */}
      <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[950px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                <th className="px-5 py-3.5">Inquilino / Contato</th>
                <th className="px-4 py-3.5 text-center">Status Contrato</th>
                <th className="px-4 py-3.5">Imóvel Onde Mora / Morou</th>
                <th className="px-4 py-3.5">Aluguel / Início</th>
                <th className="px-4 py-3.5 text-right">Situação Financeira</th>
                <th className="px-5 py-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users size={32} className="text-slate-300" />
                      <p className="text-sm font-bold text-slate-600">Nenhum inquilino encontrado com os filtros selecionados.</p>
                      <p className="text-xs text-slate-400">Tente ajustar o termo de busca ou selecione outro filtro acima.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => (
                  <tr 
                    key={t.id} 
                    className={`hover:bg-slate-50/80 transition-colors ${
                      t.isExTenantWithDebt ? 'bg-rose-50/20' : ''
                    }`}
                  >
                    {/* Inquilino & Contato */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-2xl font-black text-xs shrink-0 ${
                          t.isExTenantWithDebt 
                            ? 'bg-rose-100 text-rose-700' 
                            : t.isActive 
                              ? 'bg-emerald-100 text-emerald-700' 
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {t.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900 tracking-tight">{t.name}</span>
                            {t.isExTenantWithDebt && (
                              <span className="bg-rose-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                                <ShieldAlert size={10} />
                                Saiu Devendo
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 mt-0.5 font-medium text-[11px]">
                            {t.phone && (
                              <span className="flex items-center gap-1 text-slate-600">
                                <Phone size={11} className="text-slate-400" />
                                {t.phone}
                              </span>
                            )}
                            {t.cpf && (
                              <span className="flex items-center gap-1">
                                <IdCard size={11} className="text-slate-400" />
                                CPF: {t.cpf}
                              </span>
                            )}
                            {t.email && (
                              <span className="flex items-center gap-1 truncate max-w-[160px]" title={t.email}>
                                <Mail size={11} className="text-slate-400" />
                                {t.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Status do Contrato */}
                    <td className="px-4 py-4 text-center">
                      {t.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 size={12} />
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-200/60">
                          <UserX size={12} />
                          Inativo / Ex
                        </span>
                      )}
                    </td>

                    {/* Imóvel Vinculado */}
                    <td className="px-4 py-4">
                      <div>
                        <span className="font-extrabold text-slate-800 text-xs block">{t.propertyCode}</span>
                        {t.condominium ? (
                          <span className="text-[11px] text-slate-500 font-semibold block">{t.condominium}</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">Sem condomínio</span>
                        )}
                      </div>
                    </td>

                    {/* Aluguel / Início */}
                    <td className="px-4 py-4">
                      <div>
                        <span className="font-bold text-slate-800 text-xs block">
                          {t.rentAmount ? `R$ ${t.rentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </span>
                        {t.leaseStartDate && (
                          <span className="text-[10px] text-slate-400 font-semibold block">
                            Início: {format(
                              parseDate(t.leaseStartDate) || new Date(), 
                              'dd/MM/yyyy'
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Situação Financeira */}
                    <td className="px-4 py-4 text-right">
                      {t.totalDebt > 0 ? (
                        <div>
                          <span className={`inline-flex items-center gap-1 text-xs font-black font-mono px-2.5 py-1 rounded-xl ${
                            t.isExTenantWithDebt 
                              ? 'bg-rose-100 text-rose-800 border border-rose-200' 
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            <AlertTriangle size={12} className="shrink-0" />
                            R$ {t.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="block text-[10px] font-extrabold text-rose-600 mt-1">
                            {t.unpaidCount} fatura(s) pendente(s) {t.latestDueDateStr !== '-' && `(desde ${t.latestDueDateStr})`}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full">
                            <CheckCircle2 size={12} />
                            Quitado / Em Dia
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Ações */}
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Editar Inquilino */}
                        <button
                          onClick={() => {
                            setSelectedTenant(t);
                            setIsEditing(true);
                          }}
                          className="p-2 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all font-bold text-xs flex items-center gap-1 cursor-pointer border border-blue-200/50"
                          title="Editar Informações do Inquilino"
                        >
                          <Edit2 size={15} />
                          <span className="hidden xl:inline text-[11px]">Editar</span>
                        </button>

                        {/* Cobrar no WhatsApp se tiver débito */}
                        {t.totalDebt > 0 && t.phone && (
                          <button
                            onClick={() => openWhatsAppDebtAlert(t)}
                            className="p-2 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-all font-bold text-xs flex items-center gap-1 cursor-pointer border border-emerald-200/50"
                            title="Cobrar via WhatsApp"
                          >
                            <MessageCircle size={15} />
                            <span className="hidden xl:inline text-[11px]">Cobrar</span>
                          </button>
                        )}

                        {/* Details Drawer Trigger */}
                        <button
                          onClick={() => setSelectedTenant(t)}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                          title="Ver Detalhes Completos"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenant Detail & Edit Modal */}
      <AnimatePresence>
        {selectedTenant && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-6 space-y-6 overflow-hidden max-h-[92vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-2xl text-lg font-black ${
                    selectedTenant.isExTenantWithDebt ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {formName.charAt(0).toUpperCase() || 'I'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">
                        {formName || selectedTenant.name}
                      </h3>
                      {selectedTenant.isExTenantWithDebt && (
                        <span className="bg-rose-600 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <ShieldAlert size={12} />
                          Ex-Inquilino Devendo
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>Imóvel Atual/Histórico: <strong className="text-slate-800">{selectedTenant.propertyCode}</strong> {selectedTenant.condominium ? `(${selectedTenant.condominium})` : ''}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      isEditing
                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60'
                    }`}
                  >
                    <Edit2 size={14} />
                    <span>{isEditing ? 'Cancelar Edição' : 'Editar Dados'}</span>
                  </button>

                  <button 
                    onClick={() => {
                      setSelectedTenant(null);
                      setIsEditing(false);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Save Success Alert */}
              {saveSuccessMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-xs rounded-2xl flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}

              {/* Main Modal Body */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1">

                {/* Status perante o sistema & Onde está morando */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Status Perante o Sistema & Local de Moradia</span>
                    <p className="text-xs font-extrabold text-slate-800 mt-1 flex items-center gap-2">
                      <Home size={14} className="text-blue-600" />
                      Onde está morando: {selectedTenant.isActive ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 font-black">
                          {selectedTenant.propertyCode} {selectedTenant.condominium ? `- ${selectedTenant.condominium}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Sem contrato ativo (Ex-Inquilino)</span>
                      )}
                    </p>

                    {selectedTenant.property && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                          <ClipboardCheck size={12} className="text-blue-600" />
                          Vistoria do Imóvel:
                        </span>
                        {selectedTenant.property.isClean !== false && (
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60 flex items-center gap-1">
                            <Sparkles size={10} />
                            Limpo
                          </span>
                        )}
                        {selectedTenant.property.hasUtensils && (
                          <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60 flex items-center gap-1">
                            <Utensils size={10} />
                            Utensílios
                          </span>
                        )}
                        {selectedTenant.property.inspectionNotes && (
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 max-w-[280px] truncate" title={selectedTenant.property.inspectionNotes}>
                            Obs: {selectedTenant.property.inspectionNotes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-extrabold text-slate-700">Status:</label>
                      <select
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value as 'active' | 'inactive')}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="active">Ativo (Com Contrato)</option>
                        <option value="inactive">Inativo / Ex-Inquilino</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Section 1: Dados Pessoais do Inquilino */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <Users size={16} className="text-blue-600" />
                      Informações e Dados Pessoais
                    </h4>
                    {!isEditing && (
                      <span className="text-[11px] font-bold text-slate-400">Clique em "Editar Dados" para alterar</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nome */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 block">
                        Nome Completo *
                      </label>
                      {isEditing ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            placeholder="Nome do Inquilino"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                          />
                        </div>
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          {formName || 'Não informado'}
                        </p>
                      )}
                    </div>

                    {/* Telefone */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Telefone / WhatsApp</span>
                        {isEditing && formPhone && (
                          <button 
                            type="button" 
                            onClick={() => setFormPhone('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formPhone}
                          onChange={(e) => setFormPhone(e.target.value)}
                          placeholder="(00) 00000-0000"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-400" />
                          {formPhone || 'Não informado'}
                        </p>
                      )}
                    </div>

                    {/* CPF */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>CPF</span>
                        {isEditing && formCpf && (
                          <button 
                            type="button" 
                            onClick={() => setFormCpf('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formCpf}
                          onChange={(e) => setFormCpf(e.target.value)}
                          placeholder="000.000.000-00"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                          <IdCard size={13} className="text-slate-400" />
                          {formCpf || 'Não informado'}
                        </p>
                      )}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>E-mail</span>
                        {isEditing && formEmail && (
                          <button 
                            type="button" 
                            onClick={() => setFormEmail('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="email"
                          value={formEmail}
                          onChange={(e) => setFormEmail(e.target.value)}
                          placeholder="inquilino@email.com"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5 truncate">
                          <Mail size={13} className="text-slate-400" />
                          {formEmail || 'Não informado'}
                        </p>
                      )}
                    </div>

                    {/* Endereço do Inquilino */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Endereço Completo do Inquilino</span>
                        {isEditing && formAddress && (
                          <button 
                            type="button" 
                            onClick={() => setFormAddress('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formAddress}
                          onChange={(e) => setFormAddress(e.target.value)}
                          placeholder="Rua, Número, Bairro, Cidade, Estado, CEP"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          {formAddress || 'Não informado'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 2: Referências */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <Phone size={16} className="text-indigo-600" />
                      Telefone e Endereço de Referência
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Telefone Referencia */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Telefone de Referência</span>
                        {isEditing && formRefPhone && (
                          <button 
                            type="button" 
                            onClick={() => setFormRefPhone('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formRefPhone}
                          onChange={(e) => setFormRefPhone(e.target.value)}
                          placeholder="(00) 00000-0000 (Parente, Trabalho, Fador)"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                          <Phone size={13} className="text-slate-400" />
                          {formRefPhone || 'Não informado'}
                        </p>
                      )}
                    </div>

                    {/* Endereço Referência */}
                    <div>
                      <label className="text-[11px] font-extrabold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
                        <span>Endereço de Referência</span>
                        {isEditing && formRefAddress && (
                          <button 
                            type="button" 
                            onClick={() => setFormRefAddress('')}
                            className="text-[10px] text-rose-600 font-bold hover:underline"
                          >
                            Apagar
                          </button>
                        )}
                      </label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={formRefAddress}
                          onChange={(e) => setFormRefAddress(e.target.value)}
                          placeholder="Endereço comercial ou de familiar"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white"
                        />
                      ) : (
                        <p className="text-xs font-extrabold text-slate-800 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-1.5">
                          <MapPin size={13} className="text-slate-400 shrink-0" />
                          {formRefAddress || 'Não informado'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 3: Dados Pessoais Adicionais (Adicionar / Apagar) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-500" />
                      Dados Pessoais Adicionais / Campos Personalizados
                    </h4>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => setShowAddCustomField(true)}
                        className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus size={13} />
                        <span>Adicionar Dado</span>
                      </button>
                    )}
                  </div>

                  {/* Add Custom Field Form */}
                  {showAddCustomField && isEditing && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                      <span className="text-[10px] font-extrabold uppercase text-amber-800 block">Novo Campo Personalizado</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Nome do Campo (ex: Profissão, RG, Cônjuge)"
                          value={newFieldLabel}
                          onChange={(e) => setNewFieldLabel(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                        />
                        <input
                          type="text"
                          placeholder="Valor do Campo"
                          value={newFieldValue}
                          onChange={(e) => setNewFieldValue(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowAddCustomField(false)}
                          className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddCustomField}
                          className="px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold"
                        >
                          Confirmar Adição
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Custom Fields List */}
                  {formAdditionalInfo.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Nenhum dado pessoal adicional cadastrado.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {formAdditionalInfo.map(field => (
                        <div key={field.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">{field.label}</span>
                            <span className="text-xs font-extrabold text-slate-800">{field.value}</span>
                          </div>
                          {isEditing && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCustomField(field.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Apagar este dado"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 4: Documentação e Anexos */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <Paperclip size={16} className="text-emerald-600" />
                      Anexar Documentação do Inquilino
                    </h4>

                    {isEditing && (
                      <label className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm">
                        <Upload size={14} />
                        <span>Anexar Arquivo</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,application/pdf,.doc,.docx"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {formDocuments.length === 0 ? (
                    <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                      <Paperclip size={24} className="mx-auto text-slate-300 mb-1" />
                      <p className="text-xs font-bold text-slate-500">Nenhum documento anexado ainda.</p>
                      {isEditing && (
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Clique em "Anexar Arquivo" acima para enviar RG, CPF, Contrato ou Comprovantes (PDF ou imagens).
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {formDocuments.map(docItem => (
                        <div key={docItem.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 font-bold">
                              <FileText size={16} />
                            </div>
                            <div className="truncate">
                              <p className="font-black text-slate-900 truncate">{docItem.name}</p>
                              <span className="text-[10px] text-slate-400 font-semibold block">
                                Enviado em: {docItem.uploadedAt ? format(new Date(docItem.uploadedAt), 'dd/MM/yyyy HH:mm') : '-'} 
                                {docItem.size ? ` (${(docItem.size / 1024).toFixed(0)} KB)` : ''}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {docItem.fileData && (
                              <button
                                type="button"
                                onClick={() => handleViewDocument(docItem)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-xl font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                                title="Visualizar documento"
                              >
                                <Eye size={14} />
                                <span>Ver</span>
                              </button>
                            )}

                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDocument(docItem.id)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Remover documento"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 5: Cobranças e Débitos */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                      <DollarSign size={16} className="text-blue-600" />
                      Faturas e Pendências Financeiras
                    </h4>
                    <span className={`text-xs font-black font-mono px-3 py-1 rounded-xl ${
                      selectedTenant.totalDebt > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {selectedTenant.totalDebt > 0 
                        ? `Débito Total: R$ ${selectedTenant.totalDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                        : 'Quitado / Sem Débitos'}
                    </span>
                  </div>

                  {selectedTenant.unpaidBillings.length === 0 ? (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200/60 rounded-2xl text-center text-emerald-800 font-bold text-xs">
                      ✓ Não existem faturas pendentes em aberto para este inquilino!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedTenant.unpaidBillings.map(b => {
                        let dueDateStr = '-';
                        const parsedDue = parseDate(b.dueDate);
                        if (parsedDue) dueDateStr = format(parsedDue, 'dd/MM/yyyy');

                        const val = (b.totalAmount || 0) - (b.paidAmount || 0);

                        return (
                          <div key={b.id || Math.random()} className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-2xl flex items-center justify-between text-xs">
                            <div>
                              <span className="font-black text-slate-900 block">Vencimento: {dueDateStr}</span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Total: R$ {(b.totalAmount || 0).toFixed(2)} | Pago: R$ {(b.paidAmount || 0).toFixed(2)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="font-black text-rose-700 font-mono text-sm block">
                                R$ {val.toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-rose-600 uppercase">Pendente</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {selectedTenant.totalDebt > 0 && selectedTenant.phone && (
                  <button
                    type="button"
                    onClick={() => openWhatsAppDebtAlert(selectedTenant)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl transition-all text-xs flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <MessageCircle size={16} />
                    <span>Cobrar no WhatsApp</span>
                  </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={handleSaveTenant}
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl transition-all text-xs flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
                    >
                      <Save size={16} />
                      <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onViewPropertyHistory(selectedTenant.propertyId);
                        setSelectedTenant(null);
                      }}
                      className="px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-extrabold rounded-2xl transition-all text-xs flex items-center gap-2 cursor-pointer"
                    >
                      <History size={16} />
                      <span>Ver Histórico de Cobranças</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
