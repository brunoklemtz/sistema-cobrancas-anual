import React, { useState, useEffect } from 'react';
import { 
  addDoc, 
  setDoc, 
  serverTimestamp,
  Timestamp,
  getDocs,
  writeBatch,
  DocTable
} from '../lib/db';
import { supabase } from '../supabase';
import { Property, OperationType, TenantPhone } from '../types';
import { handleFirestoreError, parseDate } from '../utils/firestore';
import { logAudit } from '../utils/auditLogger';
import { assertPropertyAvailableForContract } from '../utils/propertyAvailability';
import { X, Home, User, Phone, Save, Droplets, Zap, Calendar, DollarSign, Mail, IdCard, CheckCircle, AlertCircle, Building2, Plus, Trash2, MessageSquare, PauseCircle, PlayCircle, ClipboardCheck, Sparkles, Utensils } from 'lucide-react';
import { format, isBefore } from 'date-fns';
import CondoFormModal from './CondoFormModal';

interface PropertyFormProps {
  property?: Property | null;
  properties?: Property[];
  onClose: () => void;
}

export default function PropertyForm({ property, properties = [], onClose }: PropertyFormProps) {
  const [propertyCode, setPropertyCode] = useState(property?.propertyCode || '');
  const [condominium, setCondominium] = useState(property?.condominium || '');
  const [ownerName, setOwnerName] = useState(property?.ownerName || '');
  const [tenantCpf, setTenantCpf] = useState(property?.tenantCpf || '');
  const [tenantEmail, setTenantEmail] = useState(property?.tenantEmail || '');
  
  // Multiple phone numbers with active for WhatsApp billing
  const getInitialPhones = (p: Property | null | undefined): TenantPhone[] => {
    if (p?.phones && p.phones.length > 0) {
      return p.phones;
    }
    if (p?.phone && p.phone.trim()) {
      return [{
        id: 'phone_1',
        number: p.phone.trim(),
        label: 'Principal',
        isActiveForBilling: true
      }];
    }
    return [{
      id: 'phone_1',
      number: '',
      label: 'Principal',
      isActiveForBilling: true
    }];
  };

  const [phones, setPhones] = useState<TenantPhone[]>(getInitialPhones(property));
  const [cadencePaused, setCadencePaused] = useState<boolean>(property?.cadencePaused || false);
  const [phone, setPhone] = useState(property?.phone || '');
  const [rentAmount, setRentAmount] = useState(property?.rentAmount?.toString() || '');
  const getInitialLeaseDate = (p: Property | null | undefined) => {
    if (!p || !p.leaseStartDate) return format(new Date(), 'yyyy-MM-dd');
    const d = parseDate(p.leaseStartDate);
    if (!d || isNaN(d.getTime())) return format(new Date(), 'yyyy-MM-dd');
    return format(d, 'yyyy-MM-dd');
  };

  const [leaseStartDate, setLeaseStartDate] = useState(getInitialLeaseDate(property));
  const [initialWaterReading, setInitialWaterReading] = useState(property?.initialWaterReading?.toString() || '');
  const [initialElectricityReading, setInitialElectricityReading] = useState(property?.initialElectricityReading?.toString() || '');
  const [securityDepositAmount, setSecurityDepositAmount] = useState(property?.securityDepositAmount?.toString() || '');
  const [securityDepositPaid, setSecurityDepositPaid] = useState(property?.securityDepositPaid || false);
  const [status, setStatus] = useState<'active' | 'inactive'>(property?.status || 'active');
  
  // Inspection / Vistoria Básica
  const [isClean, setIsClean] = useState(property?.isClean ?? true);
  const [hasUtensils, setHasUtensils] = useState(property?.hasUtensils ?? false);
  const [inspectionNotes, setInspectionNotes] = useState(property?.inspectionNotes || '');

  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeWarning, setCodeWarning] = useState<string | null>(null);
  const [condoList, setCondoList] = useState<string[]>([]);
  const [isQuickCondoModalOpen, setIsQuickCondoModalOpen] = useState(false);

  useEffect(() => {
    // Fetch registered condominiums + properties' condominiums for complete list
    const fetchCondos = async () => {
      try {
        const condosSet = new Set<string>();

        // From registered condominiums collection
        const condoSnap = await getDocs('condominiums');
        condoSnap.forEach(d => {
          const name = d?.name;
          if (name && typeof name === 'string' && name.trim()) {
            condosSet.add(name.trim());
          }
        });

        // From properties collection
        const propSnap = await getDocs('properties');
        propSnap.forEach(d => {
          const c = d?.condominium;
          if (c && typeof c === 'string' && c.trim()) {
            condosSet.add(c.trim());
          }
        });

        setCondoList(Array.from(condosSet).sort());
      } catch (err) {
        console.error('Error fetching condo list:', err);
      }
    };
    fetchCondos();
  }, []);

  const [previousReadings, setPreviousReadings] = useState<{ water?: number; electricity?: number } | null>(null);
  const [isFetchingPreviousReadings, setIsFetchingPreviousReadings] = useState(false);

  const fetchPreviousReadings = async (propId: string) => {
    if (!propId) return null;
    setIsFetchingPreviousReadings(true);
    try {
      const snap = await getDocs('billings', {
        filters: [{ field: 'propertyId', op: 'eq', value: propId }],
      });
      
      let waterReading: number | undefined = undefined;
      let electricityReading: number | undefined = undefined;
      let latestWaterDate: Date | null = null;
      let latestElecDate: Date | null = null;

      snap.forEach((docSnap) => {
        const b = docSnap;
        const bDate = parseDate(b.dueDate) || parseDate(b.createdAt) || new Date(0);

        if (b.items && Array.isArray(b.items)) {
          const waterItem = b.items.find((item: any) => item.type === 'water');
          if (waterItem) {
            const r = typeof waterItem.currentReading === 'number' && !isNaN(waterItem.currentReading) && waterItem.currentReading > 0
              ? waterItem.currentReading
              : (typeof waterItem.previousReading === 'number' && !isNaN(waterItem.previousReading) && waterItem.previousReading > 0 ? waterItem.previousReading : null);
            if (r !== null && (!latestWaterDate || bDate >= latestWaterDate)) {
              waterReading = r;
              latestWaterDate = bDate;
            }
          }

          const elecItem = b.items.find((item: any) => item.type === 'electricity');
          if (elecItem) {
            const r = typeof elecItem.currentReading === 'number' && !isNaN(elecItem.currentReading) && elecItem.currentReading > 0
              ? elecItem.currentReading
              : (typeof elecItem.previousReading === 'number' && !isNaN(elecItem.previousReading) && elecItem.previousReading > 0 ? elecItem.previousReading : null);
            if (r !== null && (!latestElecDate || bDate >= latestElecDate)) {
              electricityReading = r;
              latestElecDate = bDate;
            }
          }
        }

        const legacyB = b as any;
        if (legacyB.type === 'water' || legacyB.waterReading) {
          const r = typeof legacyB.currentReading === 'number' && !isNaN(legacyB.currentReading) && legacyB.currentReading > 0
            ? legacyB.currentReading
            : (typeof legacyB.waterReading === 'number' && !isNaN(legacyB.waterReading) && legacyB.waterReading > 0 ? legacyB.waterReading : null);
          if (r !== null && (!latestWaterDate || bDate >= latestWaterDate)) {
            waterReading = r;
            latestWaterDate = bDate;
          }
        }

        if (legacyB.type === 'electricity' || legacyB.electricityReading) {
          const r = typeof legacyB.currentReading === 'number' && !isNaN(legacyB.currentReading) && legacyB.currentReading > 0
            ? legacyB.currentReading
            : (typeof legacyB.electricityReading === 'number' && !isNaN(legacyB.electricityReading) && legacyB.electricityReading > 0 ? legacyB.electricityReading : null);
          if (r !== null && (!latestElecDate || bDate >= latestElecDate)) {
            electricityReading = r;
            latestElecDate = bDate;
          }
        }
      });

      const res = { water: waterReading, electricity: electricityReading };
      setPreviousReadings(res);
      return res;
    } catch (err) {
      console.error('Error fetching previous readings for property:', err);
      return null;
    } finally {
      setIsFetchingPreviousReadings(false);
    }
  };

  useEffect(() => {
    setPropertyCode(property?.propertyCode || '');
    setCondominium(property?.condominium || '');
    setOwnerName(property?.ownerName || '');
    setTenantCpf(property?.tenantCpf || '');
    setTenantEmail(property?.tenantEmail || '');
    setPhone(property?.phone || '');
    setRentAmount(property?.rentAmount?.toString() || '');
    setLeaseStartDate(getInitialLeaseDate(property));
    setInitialWaterReading(property?.initialWaterReading?.toString() || '');
    setInitialElectricityReading(property?.initialElectricityReading?.toString() || '');
    setSecurityDepositAmount(property?.securityDepositAmount?.toString() || '');
    setSecurityDepositPaid(property?.securityDepositPaid || false);
    setIsClean(property?.isClean ?? true);
    setHasUtensils(property?.hasUtensils ?? false);
    setInspectionNotes(property?.inspectionNotes || '');
    setStatus(property?.status || 'active');
    setShowSuccess(false);
    setError(null);
    setCodeWarning(null);

    if (property?.id) {
      fetchPreviousReadings(property.id).then(readings => {
        if (readings) {
          const currentWater = parseFloat(property.initialWaterReading?.toString() || '0');
          const currentElec = parseFloat(property.initialElectricityReading?.toString() || '0');

          if (readings.water !== undefined && (currentWater === 0 || !property.ownerName)) {
            setInitialWaterReading(readings.water.toString());
          }
          if (readings.electricity !== undefined && (currentElec === 0 || !property.ownerName)) {
            setInitialElectricityReading(readings.electricity.toString());
          }
        }
      });
    } else {
      setPreviousReadings(null);
    }
  }, [property]);

  const checkPropertyCodeAvailability = (code: string, intendedStatus: 'active' | 'inactive') => {
    return assertPropertyAvailableForContract({
      properties,
      propertyCode: code,
      currentId: property?.id,
      intendedStatus,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const path: DocTable = 'properties';

    try {
      let catalog: Property[] = properties;
      try {
        const fresh = await getDocs('properties');
        if (fresh.length > 0) catalog = fresh as Property[];
      } catch {
        // Usa a lista já carregada na tela se a consulta extra falhar
      }

      const availability = assertPropertyAvailableForContract({
        properties: catalog,
        propertyCode,
        currentId: property?.id,
        intendedStatus: status,
      });
      if (!availability.ok) {
        setError(availability.message);
        return;
      }

      const parseInput = (val: string | number) => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        
        // Handle Brazilian format (1.234,56) or standard (1234.56)
        const sanitized = val.includes(',') 
          ? val.replace(/\./g, '').replace(',', '.') 
          : val;
          
        const parsed = parseFloat(sanitized);
        const result = isNaN(parsed) ? 0 : parsed;
        return Math.round((result + Number.EPSILON) * 100) / 100;
      };

      const validLeaseStr = leaseStartDate || format(new Date(), 'yyyy-MM-dd');
      const leaseDateObjForStamp = new Date(validLeaseStr + 'T12:00:00');
      const leaseTimestamp = isNaN(leaseDateObjForStamp.getTime()) ? Timestamp.now() : Timestamp.fromDate(leaseDateObjForStamp);

      // Clean phones list
      const cleanPhones = phones
        .filter(p => p.number && p.number.trim() !== '')
        .map(p => ({
          id: p.id || `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          number: p.number.trim(),
          label: p.label || 'Principal',
          isActiveForBilling: p.isActiveForBilling ?? true,
          notes: p.notes || ''
        }));

      // Active phone for legacy field
      const primaryActivePhone = cleanPhones.find(p => p.isActiveForBilling)?.number || cleanPhones[0]?.number || (phone || '').trim();

      const data: any = {
        propertyCode: propertyCode || '',
        condominium: (condominium || '').trim(),
        ownerName: ownerName || '',
        tenantCpf: tenantCpf || '',
        tenantEmail: tenantEmail || '',
        phone: primaryActivePhone,
        phones: cleanPhones,
        cadencePaused: cadencePaused ?? false,
        rentAmount: parseInput(rentAmount),
        leaseStartDate: leaseTimestamp,
        initialWaterReading: parseInput(initialWaterReading),
        initialElectricityReading: parseInput(initialElectricityReading),
        securityDepositAmount: parseInput(securityDepositAmount),
        securityDepositPaid: !!securityDepositPaid,
        isClean: isClean ?? true,
        hasUtensils: hasUtensils ?? false,
        inspectionNotes: (inspectionNotes || '').trim(),
        status: status || 'active',
        updatedAt: serverTimestamp(),
      };

      const { data: authData } = await supabase.auth.getUser();
      const userEmail = authData.user?.email?.toLowerCase();
      const isAdminFrontend = userEmail === 'temporadaitapema2@gmail.com';
      console.log(`Attempting to save property. User: ${userEmail}, isAdmin (frontend): ${isAdminFrontend}`);
      console.log('Data to save:', data);

      let savedPropertyId = property?.id || '';
      if (property && property.id) {
        console.log(`Updating property with ID: ${property.id}`);
        await setDoc(path, property.id, data, { merge: true });
        
        // Audit log
        await logAudit('update_property', 'properties', property.id, property, data);

        // Update active/open billings if property details (tenant name, phone, or propertyCode) changed
        if (
          (property.ownerName || '') !== ownerName || 
          (property.phone || '') !== primaryActivePhone || 
          (property.propertyCode || '') !== propertyCode
        ) {
          console.log('Contract details changed. Checking active billings...');
          const prevOwnerName = (property.ownerName || '').trim().toLowerCase();
          const newOwnerName = (ownerName || '').trim().toLowerCase();
          const isNewTenant = prevOwnerName !== newOwnerName;
          const leaseStartObj = validLeaseStr ? new Date(validLeaseStr + 'T00:00:00') : null;

          const billingsSnap = await getDocs('billings', {
            filters: [{ field: 'propertyId', op: 'eq', value: property.id }],
          });
          
          const batchOps: any[] = [];
          
          billingsSnap.forEach((billingDoc) => {
            const billingData = billingDoc;
            
            if (billingData.status !== 'paid') {
              const bDueDate = parseDate(billingData.dueDate);
              
              // If a new tenant was entered, do NOT overwrite tenantName on billings prior to the new leaseStartDate
              const isPriorToNewLease = isNewTenant && leaseStartObj && bDueDate && isBefore(bDueDate, leaseStartObj);

              const updatePayload: any = {
                propertyCode: propertyCode || '',
                updatedAt: serverTimestamp()
              };

              // Only update tenantName & phone if it belongs to the current tenant contract
              if (!isPriorToNewLease) {
                updatePayload.tenantName = ownerName || '';
                updatePayload.tenantPhone = primaryActivePhone || '';
              }

              batchOps.push({ type: 'update', table: 'billings', id: billingDoc.id, data: updatePayload });
            }
          });
          
          if (batchOps.length > 0) {
            await writeBatch(batchOps);
            console.log('Successfully updated active billings safely.');
          }
        }
      } else {
        console.log('Creating new property');
        savedPropertyId = await addDoc(path, {
          ...data,
          createdAt: serverTimestamp(),
        });
        await logAudit('create_property', 'properties', savedPropertyId, null, data);
      }

      // Record initial rent billing for tracking & partial payments if contract is active
      const rentAmountVal = parseInput(rentAmount);

      if (status === 'active' && ownerName.trim() !== '' && rentAmountVal > 0 && savedPropertyId) {
        const leaseDateObj = new Date(leaseStartDate + 'T12:00:00');
        const initDueDate = Timestamp.fromDate(leaseDateObj);
        const monthKey = format(leaseDateObj, 'yyyy-MM');

        // Check if there is already a billing for this property & tenant in this month
        const billingsSnap = await getDocs('billings', {
          filters: [{ field: 'propertyId', op: 'eq', value: savedPropertyId }],
        });

        const hasExistingBillingForMonth = billingsSnap.some(d => {
          const b = d;
          if (!b.dueDate) return false;
          const bd = parseDate(b.dueDate);
          if (!bd) return false;
          return format(bd, 'yyyy-MM') === monthKey && b.tenantName?.trim().toLowerCase() === ownerName.trim().toLowerCase();
        });

        if (!hasExistingBillingForMonth) {
          await addDoc('billings', {
            propertyId: savedPropertyId,
            propertyCode: propertyCode.trim(),
            tenantName: ownerName.trim(),
            tenantPhone: phone.trim() || '',
            items: [
              {
                type: 'rent',
                amount: rentAmountVal,
                notes: '1º Aluguel - Contrato Ativado'
              }
            ],
            totalAmount: rentAmountVal,
            paidAmount: 0,
            status: 'pending',
            dueDate: initDueDate,
            readingDate: initDueDate,
            paymentHistory: [],
            notes: 'Cobrança do 1º aluguel do contrato gerada em aberto.',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          console.log('Initial rent billing generated as pending successfully.');
        }
      }
      
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error saving property:', err);
      let message = 'Ocorreu um erro ao salvar o imóvel.';
      
      const isPermissionError = 
        err.code === 'permission-denied' || 
        err.message?.toLowerCase().includes('permission') ||
        err.message?.toLowerCase().includes('insufficient');

      if (isPermissionError) {
        message = 'Você não tem permissão para realizar esta ação. Verifique se você é um administrador.';
      } else if (err.message) {
        message = `Erro: ${err.message}`;
      }
      
      setError(message);
      try {
        handleFirestoreError(err, property ? OperationType.UPDATE : OperationType.CREATE, path);
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl p-4 sm:p-6 shadow-xl max-h-[92vh] flex flex-col my-auto">
        <div className="flex justify-between items-center pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {property ? 'Editar Imóvel / Contrato' : 'Ativação de Novo Contrato'}
            </h2>
            <p className="text-xs text-gray-500 font-medium">Preencha os dados organizados em colunas de fácil visualização</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors cursor-pointer">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pt-4 pr-1 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* COLUNA ESQUERDA: Dados do Imóvel & Locatário */}
            <div className="space-y-4">
              <div className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Home size={15} className="text-blue-600" /> Dados do Imóvel
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Identificação do Imóvel
                    </label>
                    <input
                      required
                      type="text"
                      value={propertyCode}
                      onChange={(e) => {
                        setPropertyCode(e.target.value);
                        if (codeWarning) setCodeWarning(null);
                      }}
                      onBlur={() => {
                        const result = checkPropertyCodeAvailability(propertyCode, status);
                        setCodeWarning(result.ok ? null : result.message);
                      }}
                      placeholder="Ex: Apt 101, Casa 05"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-semibold"
                    />
                    {codeWarning && (
                      <p className="mt-1.5 text-[11px] font-semibold text-amber-700 leading-snug">
                        {codeWarning}
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-700">
                        Condomínio
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsQuickCondoModalOpen(true)}
                        className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus size={11} /> Novo
                      </button>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        list="condos-datalist"
                        value={condominium}
                        onChange={(e) => setCondominium(e.target.value)}
                        placeholder="Selecione condomínio"
                        className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs font-semibold"
                      />
                      <datalist id="condos-datalist">
                        {condoList.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </div>
              </div>

              {/* LOCATÁRIO */}
              <div className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <User size={15} className="text-blue-600" /> Dados do Locatário (Inquilino)
                </h3>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Nome Completo do Locatário
                  </label>
                  <input
                    required
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Nome do locatário"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      CPF (Opcional)
                    </label>
                    <input
                      type="text"
                      value={tenantCpf}
                      onChange={(e) => setTenantCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-medium"
                    />
                  </div>
                </div>

                {/* GESTÃO DE TELEFONES / WHATSAPP */}
                <div className="pt-1 border-t border-slate-200/60">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Phone size={14} className="text-emerald-600" />
                      <span>Telefones do Locatário</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPhones(prev => [...prev, {
                        id: `phone_${Date.now()}`,
                        number: '',
                        label: 'Adicional',
                        isActiveForBilling: true
                      }])}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus size={12} /> Adicionar Telefone
                    </button>
                  </div>

                  <div className="space-y-2">
                    {phones.map((pItem, idx) => (
                      <div key={pItem.id || idx} className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6 sm:col-span-7">
                            <input
                              type="tel"
                              value={pItem.number}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPhones(prev => prev.map((item, i) => i === idx ? { ...item, number: val } : item));
                              }}
                              placeholder="(47) 99999-9999"
                              className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                          <div className="col-span-4 sm:col-span-4">
                            <select
                              value={pItem.label || 'Principal'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setPhones(prev => prev.map((item, i) => i === idx ? { ...item, label: val } : item));
                              }}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[11px] font-medium bg-slate-50 focus:ring-2 focus:ring-emerald-500 outline-none"
                            >
                              <option value="Principal">Principal</option>
                              <option value="Cônjuge">Cônjuge</option>
                              <option value="Comercial">Comercial</option>
                              <option value="Financeiro">Financeiro</option>
                              <option value="Recado">Recado</option>
                              <option value="Outro">Outro</option>
                            </select>
                          </div>
                          <div className="col-span-2 sm:col-span-1 flex justify-end">
                            {phones.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setPhones(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Remover telefone"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={pItem.isActiveForBilling}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPhones(prev => prev.map((item, i) => i === idx ? { ...item, isActiveForBilling: checked } : item));
                              }}
                              className="w-3.5 h-3.5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 cursor-pointer"
                            />
                            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                              <MessageSquare size={11} className={pItem.isActiveForBilling ? "text-emerald-600" : "text-slate-400"} />
                              Ativo para cobrança no WhatsApp
                            </span>
                          </label>
                          {pItem.isActiveForBilling && (
                            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md">
                              Recebe Avisos
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {phones.filter(p => p.isActiveForBilling && p.number.trim()).length === 0 && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-[11px] font-semibold flex items-center gap-1.5">
                      <AlertCircle size={14} className="text-amber-600 shrink-0" />
                      <span>Aviso: Nenhum telefone ativo para envio automático de cobrança por WhatsApp.</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    E-mail (Opcional)
                  </label>
                  <input
                    type="email"
                    value={tenantEmail}
                    onChange={(e) => setTenantEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs"
                  />
                </div>

                {/* PAUSA MANUAL DA RÉGUA DE WHATSAPP */}
                <div className="p-3 bg-slate-100/90 border border-slate-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        {cadencePaused ? <PauseCircle size={15} className="text-amber-600" /> : <PlayCircle size={15} className="text-emerald-600" />}
                        Régua Automática do WhatsApp
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {cadencePaused 
                          ? 'Pausada manualmente. Nenhuma mensagem automática será gerada para este imóvel.' 
                          : 'Ativa. Mensagens de lembrete e atraso serão geradas conforme a régua.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCadencePaused(!cadencePaused)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        cadencePaused 
                          ? 'bg-amber-600 text-white hover:bg-amber-700' 
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {cadencePaused ? 'Despausar' : 'Pausar Régua'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Status do Contrato
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStatus('active');
                        const result = checkPropertyCodeAvailability(propertyCode, 'active');
                        setCodeWarning(result.ok ? null : result.message);
                      }}
                      className={`py-2 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                        status === 'active' 
                          ? 'bg-green-50 border-green-500 text-green-700 shadow-2xs' 
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatus('inactive');
                        const result = checkPropertyCodeAvailability(propertyCode, 'inactive');
                        setCodeWarning(result.ok ? null : result.message);
                      }}
                      className={`py-2 rounded-xl text-xs font-extrabold border-2 transition-all cursor-pointer ${
                        status === 'inactive' 
                          ? 'bg-red-50 border-red-500 text-red-700 shadow-2xs' 
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      Inativo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUNA DIREITA: Financeiro, Leituras & Vistoria */}
            <div className="space-y-4">
              <div className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <DollarSign size={15} className="text-emerald-600" /> Valores & Leituras Iniciais
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Valor Aluguel (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Início do Contrato
                    </label>
                    <input
                      required
                      type="date"
                      value={leaseStartDate}
                      onChange={(e) => setLeaseStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-medium"
                    />
                  </div>
                </div>

                {property?.id && (
                  <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-blue-900">
                      <span className="font-extrabold flex items-center gap-1 text-blue-800">
                        <Sparkles size={13} className="text-blue-600" /> Leitura Final Inquilino Anterior:
                      </span>
                      <div className="flex flex-wrap items-center gap-2 mt-1 font-mono font-bold text-slate-700">
                        <span className="text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-100">
                          Água: {previousReadings?.water !== undefined ? `${previousReadings.water} m³` : '-'}
                        </span>
                        <span className="text-amber-900 bg-white px-2 py-0.5 rounded border border-amber-100">
                          Luz: {previousReadings?.electricity !== undefined ? `${previousReadings.electricity} kWh` : '-'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (previousReadings) {
                          if (previousReadings.water !== undefined) setInitialWaterReading(previousReadings.water.toString());
                          if (previousReadings.electricity !== undefined) setInitialElectricityReading(previousReadings.electricity.toString());
                        } else {
                          fetchPreviousReadings(property.id);
                        }
                      }}
                      disabled={isFetchingPreviousReadings}
                      className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-extrabold transition-all shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      Usar Leituras
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                      <Droplets size={13} className="text-blue-500" /> Água Inicial (m³)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={initialWaterReading}
                      onChange={(e) => setInitialWaterReading(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                      <Zap size={13} className="text-yellow-500" /> Luz Inicial (kWh)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={initialElectricityReading}
                      onChange={(e) => setInitialElectricityReading(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Valor Caução (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={securityDepositAmount}
                      onChange={(e) => setSecurityDepositAmount(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-gray-200 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-bold text-purple-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Status Caução
                    </label>
                    <button
                      type="button"
                      onClick={() => setSecurityDepositPaid(!securityDepositPaid)}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        securityDepositPaid 
                          ? 'bg-green-50 border-green-500 text-green-700' 
                          : 'bg-orange-50 border-orange-200 text-orange-600 hover:border-orange-300'
                      }`}
                    >
                      {securityDepositPaid ? (
                        <>
                          <CheckCircle size={14} /> Pago
                        </>
                      ) : (
                        <>
                          <AlertCircle size={14} /> Pendente
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* VISTORIA BÁSICA */}
              <div className="bg-slate-50/80 border border-slate-200/80 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                  <ClipboardCheck size={16} className="text-blue-600" />
                  <span>Vistoria Básica de Entrega</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsClean(!isClean)}
                    className={`p-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      isClean
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <Sparkles size={14} className={isClean ? 'text-emerald-600' : 'text-slate-400'} />
                    <span>{isClean ? '✓ Limpo' : 'A Limpar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHasUtensils(!hasUtensils)}
                    className={`p-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      hasUtensils
                        ? 'bg-blue-50 border-blue-500 text-blue-800'
                        : 'bg-white border-slate-200 text-slate-500'
                    }`}
                  >
                    <Utensils size={14} className={hasUtensils ? 'text-blue-600' : 'text-slate-400'} />
                    <span>{hasUtensils ? '✓ Com Utensílios' : 'Sem Utensílios'}</span>
                  </button>
                </div>

                <div>
                  <textarea
                    rows={2}
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    placeholder="Observações da Vistoria (ex: pintura nova, 4 pratos, chave entregue...)"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3 border-t border-gray-200/80 flex items-center justify-end gap-3 mt-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-bold transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              disabled={loading || showSuccess}
              type="submit"
              className={`px-8 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer ${
                showSuccess ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {showSuccess ? (
                <>✓ Salvo com sucesso!</>
              ) : (
                <>
                  <Save size={16} />
                  {loading ? 'Salvando...' : 'Salvar Imóvel'}
                </>
              )}
            </button>
          </div>
        </form>

        {isQuickCondoModalOpen && (
          <CondoFormModal
            onClose={() => setIsQuickCondoModalOpen(false)}
            onSaved={(newCondoName) => {
              setCondominium(newCondoName);
              if (!condoList.includes(newCondoName)) {
                setCondoList(prev => [...prev, newCondoName].sort());
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
