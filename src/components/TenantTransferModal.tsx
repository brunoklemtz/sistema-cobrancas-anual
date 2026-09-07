import React, { useState } from 'react';
import { Property, BillingRecord, OperationType } from '../types';
import { updateDoc, serverTimestamp, addDoc, Timestamp } from '../lib/db';
import { handleFirestoreError, parseDate } from '../utils/firestore';
import { X, ArrowRightLeft, MoveRight, Home, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface TenantTransferModalProps {
  properties: Property[];
  billings: BillingRecord[];
  onClose: () => void;
}

export default function TenantTransferModal({ properties, billings, onClose }: TenantTransferModalProps) {
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [mode, setMode] = useState<'move' | 'swap'>('move');
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sourceDebtReason, setSourceDebtReason] = useState('Transferência de saldo devedor');
  const [destDebtReason, setDestDebtReason] = useState('Transferência de saldo devedor');

  const [generateFirstRent, setGenerateFirstRent] = useState(true);
  const [customSourceDebt, setCustomSourceDebt] = useState<string | null>(null);
  const [customDestDebt, setCustomDestDebt] = useState<string | null>(null);

  const sourceProperty = properties.find(p => p.id === sourceId);
  const destProperty = properties.find(p => p.id === destId);

  const getPropertyDebtInfo = (propertyId: string) => {
    if (!propertyId) return { debt: 0, unpaidBillings: [] as BillingRecord[] };

    const prop = properties.find(p => p.id === propertyId);
    const tenantName = prop?.ownerName?.trim().toLowerCase();

    // Match billings by propertyId OR tenantName
    const propBillings = billings.filter(b => {
      if (b.archived) return false;
      if (b.propertyId === propertyId) return true;
      if (tenantName && tenantName.length > 2 && b.tenantName?.trim().toLowerCase() === tenantName) return true;
      return false;
    });

    const unpaidBillings = propBillings.filter(b => {
      const total = b.totalAmount || 0;
      const paid = b.paidAmount || 0;
      return b.status !== 'paid' && (total - paid) > 0.01;
    });

    const debt = unpaidBillings.reduce((sum, b) => {
      const total = b.totalAmount || 0;
      const paid = b.paidAmount || 0;
      return sum + Math.max(0, total - paid);
    }, 0);

    return { debt, unpaidBillings };
  };

  const { debt: calculatedSourceDebt, unpaidBillings: sourceUnpaid } = getPropertyDebtInfo(sourceId);
  const { debt: calculatedDestDebt, unpaidBillings: destUnpaid } = getPropertyDebtInfo(destId);

  const sourceDebt = customSourceDebt !== null ? (parseFloat(customSourceDebt) || 0) : calculatedSourceDebt;
  const destDebt = customDestDebt !== null ? (parseFloat(customDestDebt) || 0) : calculatedDestDebt;

  const getLatestReadings = (propertyId: string) => {
    const getTime = (b: BillingRecord) => {
      const readD = parseDate(b.readingDate);
      if (readD) return readD.getTime();
      const dueD = parseDate(b.dueDate);
      if (dueD) return dueD.getTime();
      const createD = parseDate(b.createdAt);
      if (createD) return createD.getTime();
      return 0;
    };

    const propBillings = [...billings]
      .filter(b => b.propertyId === propertyId)
      .sort((a, b) => getTime(b) - getTime(a));
    
    let waterReading: number | undefined = undefined;
    let electricityReading: number | undefined = undefined;

    for (const b of propBillings) {
      if (waterReading !== undefined && electricityReading !== undefined) break;
      
      if (b.items && Array.isArray(b.items)) {
        const waterItem = b.items.find(item => item.type === 'water');
        if (waterReading === undefined && waterItem) {
          if (typeof waterItem.currentReading === 'number' && !isNaN(waterItem.currentReading) && waterItem.currentReading > 0) {
            waterReading = waterItem.currentReading;
          } else if (typeof waterItem.previousReading === 'number' && !isNaN(waterItem.previousReading) && waterItem.previousReading > 0) {
            waterReading = waterItem.previousReading;
          }
        }

        const elecItem = b.items.find(item => item.type === 'electricity');
        if (electricityReading === undefined && elecItem) {
          if (typeof elecItem.currentReading === 'number' && !isNaN(elecItem.currentReading) && elecItem.currentReading > 0) {
            electricityReading = elecItem.currentReading;
          } else if (typeof elecItem.previousReading === 'number' && !isNaN(elecItem.previousReading) && elecItem.previousReading > 0) {
            electricityReading = elecItem.previousReading;
          }
        }
      }

      const legacyB = b as any;
      if (waterReading === undefined && legacyB.type === 'water') {
        if (typeof legacyB.currentReading === 'number' && !isNaN(legacyB.currentReading) && legacyB.currentReading > 0) {
          waterReading = legacyB.currentReading;
        }
      }

      if (electricityReading === undefined && legacyB.type === 'electricity') {
        if (typeof legacyB.currentReading === 'number' && !isNaN(legacyB.currentReading) && legacyB.currentReading > 0) {
          electricityReading = legacyB.currentReading;
        }
      }
    }

    return { waterReading, electricityReading };
  };

  const handleExecute = async () => {
    if (!sourceProperty || !destProperty) return;
    
    setIsProcessing(true);
    try {
      // Buscar as últimas leituras de água e luz de cada imóvel
      const sourceLatest = getLatestReadings(sourceId);
      const destLatest = getLatestReadings(destId);

      if (mode === 'move') {
        // 1. Atualizar Imóveis
        // Destino recebe dados do Origem (incluindo caução, CPF, Email, aluguel, data de início/vencimento).
        // Também puxa automaticamente a última leitura de água e luz do imóvel destino como inicial.
        const destWater = destLatest.waterReading !== undefined ? destLatest.waterReading : (destProperty.initialWaterReading || 0);
        const destElectricity = destLatest.electricityReading !== undefined ? destLatest.electricityReading : (destProperty.initialElectricityReading || 0);

        await updateDoc('properties', destId, {
          ownerName: sourceProperty.ownerName,
          phone: sourceProperty.phone || '',
          tenantCpf: sourceProperty.tenantCpf || '',
          tenantEmail: sourceProperty.tenantEmail || '',
          rentAmount: sourceProperty.rentAmount || 0,
          leaseStartDate: sourceProperty.leaseStartDate || null,
          securityDepositAmount: sourceProperty.securityDepositAmount || 0,
          securityDepositPaid: sourceProperty.securityDepositPaid || false,
          initialWaterReading: destWater,
          initialElectricityReading: destElectricity,
          status: 'active',
          updatedAt: serverTimestamp()
        });

        // Record initial rent billing for destination property if requested and rentAmount > 0
        if (generateFirstRent && sourceProperty.rentAmount && sourceProperty.rentAmount > 0) {
          const startDate = parseDate(sourceProperty.leaseStartDate) || new Date();
          const initDueDate = Timestamp.fromDate(startDate);
          
          await addDoc('billings', {
            propertyId: destId,
            propertyCode: destProperty.propertyCode,
            tenantName: sourceProperty.ownerName,
            tenantPhone: sourceProperty.phone || '',
            items: [{
              type: 'rent',
              amount: sourceProperty.rentAmount,
              notes: `1º Aluguel - Transferido de ${sourceProperty.propertyCode}`
            }],
            totalAmount: sourceProperty.rentAmount,
            paidAmount: 0,
            status: 'pending',
            readingDate: initDueDate,
            dueDate: initDueDate,
            paymentHistory: [],
            notes: `Cobrança do 1º aluguel gerada após transferência do imóvel ${sourceProperty.propertyCode}.`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }

        // Origem fica vazio, inativo, com caução zerado, mas mantém salva a sua última leitura para não confundir.
        const sourceWater = sourceLatest.waterReading !== undefined ? sourceLatest.waterReading : (sourceProperty.initialWaterReading || 0);
        const sourceElectricity = sourceLatest.electricityReading !== undefined ? sourceLatest.electricityReading : (sourceProperty.initialElectricityReading || 0);

        await updateDoc('properties', sourceId, {
          ownerName: '',
          phone: '',
          tenantCpf: '',
          tenantEmail: '',
          rentAmount: 0,
          leaseStartDate: null,
          securityDepositAmount: 0, // Caução zerado para o imóvel vazio
          securityDepositPaid: false, // Status do caução zerado
          initialWaterReading: sourceWater, // Última leitura de água salva
          initialElectricityReading: sourceElectricity, // Última leitura de luz salva
          status: 'inactive',
          updatedAt: serverTimestamp()
        });

        // 2. Transferência de saldo devedor se houver
        if (sourceDebt > 0) {
          // Criar cobrança de saldo no destino
          await addDoc('billings', {
            propertyId: destId,
            propertyCode: destProperty.propertyCode,
            tenantName: sourceProperty.ownerName,
            tenantPhone: sourceProperty.phone || '',
            items: [{
              type: 'other',
              amount: sourceDebt,
              notes: `${sourceDebtReason} (Ref. ${sourceProperty.propertyCode})`
            }],
            totalAmount: sourceDebt,
            paidAmount: 0,
            readingDate: Timestamp.fromDate(new Date()),
            dueDate: Timestamp.fromDate(new Date()),
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          // Quitar cobranças anteriores na origem informando a transferência
          await Promise.all(sourceUnpaid.map(b => {
            if (!b.id) return Promise.resolve();
            const currentNotes = b.notes || '';
            const remaining = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
            const transferNote = `\n[Saldo de R$ ${remaining.toFixed(2)} transferido para imóvel ${destProperty.propertyCode}]`;
            
            return updateDoc('billings', b.id, {
              paidAmount: b.totalAmount,
              status: 'paid',
              notes: currentNotes + transferNote,
              updatedAt: serverTimestamp()
            });
          }));
        }
      } else {
        // Trocar: Eles permutam os nomes e telefones. Ajustamos o status conforme o novo conteúdo.
        // Cada um recebe as últimas leituras de água e luz de seu novo respectivo imóvel.
        const destWater = destLatest.waterReading !== undefined ? destLatest.waterReading : (destProperty.initialWaterReading || 0);
        const destElectricity = destLatest.electricityReading !== undefined ? destLatest.electricityReading : (destProperty.initialElectricityReading || 0);

        const sourceWater = sourceLatest.waterReading !== undefined ? sourceLatest.waterReading : (sourceProperty.initialWaterReading || 0);
        const sourceElectricity = sourceLatest.electricityReading !== undefined ? sourceLatest.electricityReading : (sourceProperty.initialElectricityReading || 0);

        await updateDoc('properties', destId, {
          ownerName: sourceProperty.ownerName,
          phone: sourceProperty.phone || '',
          tenantCpf: sourceProperty.tenantCpf || '',
          tenantEmail: sourceProperty.tenantEmail || '',
          rentAmount: sourceProperty.rentAmount || 0,
          leaseStartDate: sourceProperty.leaseStartDate || null,
          securityDepositAmount: sourceProperty.securityDepositAmount || 0,
          securityDepositPaid: sourceProperty.securityDepositPaid || false,
          initialWaterReading: destWater,
          initialElectricityReading: destElectricity,
          status: sourceProperty.ownerName.trim() === '' ? 'inactive' : 'active',
          updatedAt: serverTimestamp()
        });

        await updateDoc('properties', sourceId, {
          ownerName: destProperty.ownerName,
          phone: destProperty.phone || '',
          tenantCpf: destProperty.tenantCpf || '',
          tenantEmail: destProperty.tenantEmail || '',
          rentAmount: destProperty.rentAmount || 0,
          leaseStartDate: destProperty.leaseStartDate || null,
          securityDepositAmount: destProperty.securityDepositAmount || 0,
          securityDepositPaid: destProperty.securityDepositPaid || false,
          initialWaterReading: sourceWater,
          initialElectricityReading: sourceElectricity,
          status: destProperty.ownerName.trim() === '' ? 'inactive' : 'active',
          updatedAt: serverTimestamp()
        });

        // 2. Transferência de saldo devedor cruzado se houver
        // Origem -> Destino
        if (sourceDebt > 0) {
          await addDoc('billings', {
            propertyId: destId,
            propertyCode: destProperty.propertyCode,
            tenantName: sourceProperty.ownerName,
            tenantPhone: sourceProperty.phone || '',
            items: [{
              type: 'other',
              amount: sourceDebt,
              notes: `${sourceDebtReason} (Ref. ${sourceProperty.propertyCode})`
            }],
            totalAmount: sourceDebt,
            paidAmount: 0,
            readingDate: Timestamp.fromDate(new Date()),
            dueDate: Timestamp.fromDate(new Date()),
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await Promise.all(sourceUnpaid.map(b => {
            if (!b.id) return Promise.resolve();
            const currentNotes = b.notes || '';
            const remaining = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
            const transferNote = `\n[Saldo de R$ ${remaining.toFixed(2)} transferido para imóvel ${destProperty.propertyCode}]`;
            
            return updateDoc('billings', b.id, {
              paidAmount: b.totalAmount,
              status: 'paid',
              notes: currentNotes + transferNote,
              updatedAt: serverTimestamp()
            });
          }));
        }

        // Destino -> Origem
        if (destDebt > 0) {
          await addDoc('billings', {
            propertyId: sourceId,
            propertyCode: sourceProperty.propertyCode,
            tenantName: destProperty.ownerName,
            tenantPhone: destProperty.phone || '',
            items: [{
              type: 'other',
              amount: destDebt,
              notes: `${destDebtReason} (Ref. ${destProperty.propertyCode})`
            }],
            totalAmount: destDebt,
            paidAmount: 0,
            readingDate: Timestamp.fromDate(new Date()),
            dueDate: Timestamp.fromDate(new Date()),
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });

          await Promise.all(destUnpaid.map(b => {
            if (!b.id) return Promise.resolve();
            const currentNotes = b.notes || '';
            const remaining = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
            const transferNote = `\n[Saldo de R$ ${remaining.toFixed(2)} transferido para imóvel ${sourceProperty.propertyCode}]`;
            
            return updateDoc('billings', b.id, {
              paidAmount: b.totalAmount,
              status: 'paid',
              notes: currentNotes + transferNote,
              updatedAt: serverTimestamp()
            });
          }));
        }
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'properties');
    } finally {
      setIsProcessing(false);
    }
  };

  // Mostrar todos os imóveis para permitir transferências para unidades vazias ou com contratos encerrados
  const availableProperties = [...properties].sort((a, b) => 
    a.propertyCode.localeCompare(b.propertyCode, undefined, { numeric: true, sensitivity: 'base' })
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600 shadow-sm">
                <ArrowRightLeft size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Troca Rápida de Inquilinos</h2>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Mova ou permute nomes entre imóveis</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
              <X size={24} />
            </button>
          </div>

          {!success ? (
            <div className="space-y-8">
              {/* Selector Logic */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative">
                {/* Source */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Imóvel de Origem</label>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all appearance-none"
                  >
                    <option value="">Selecionar...</option>
                    {availableProperties.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.propertyCode} - {p.ownerName || '(Vazio)'} 
                        {p.status === 'inactive' ? ' [INATIVO]' : ''}
                      </option>
                    ))}
                  </select>
                  {sourceProperty && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50/50 rounded-xl border border-amber-100/50">
                      <User size={14} className="text-amber-500" />
                      <span className="text-xs font-bold text-amber-700">{sourceProperty.ownerName || 'Vazio'}</span>
                    </div>
                  )}
                </div>

                {/* Mode Switcher in middle */}
                <div className="md:absolute md:left-1/2 md:top-[60%] md:-translate-x-1/2 md:-translate-y-1/2 z-10 flex justify-center">
                  <button 
                    onClick={() => setMode(mode === 'move' ? 'swap' : 'move')}
                    className="p-3 bg-white border-2 border-slate-100 shadow-lg rounded-2xl hover:scale-110 active:scale-95 transition-all group"
                  >
                    {mode === 'move' ? (
                      <MoveRight size={24} className="text-blue-600 group-hover:rotate-12 transition-transform" />
                    ) : (
                      <ArrowRightLeft size={24} className="text-amber-600 group-hover:rotate-180 transition-transform duration-500" />
                    )}
                  </button>
                </div>

                {/* Destination */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Imóvel de Destino</label>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all appearance-none"
                  >
                    <option value="">Selecionar...</option>
                    {availableProperties.map(p => (
                      <option key={p.id} value={p.id} disabled={p.id === sourceId}>
                        {p.propertyCode} - {p.ownerName || '(Vazio)'}
                        {p.status === 'inactive' ? ' [INATIVO]' : ''}
                      </option>
                    ))}
                  </select>
                  {destProperty && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                      <User size={14} className="text-blue-500" />
                      <span className="text-xs font-bold text-blue-700">{destProperty.ownerName || 'Vazio'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Seção de Transferência de Saldo Devedor */}
              {(sourceDebt > 0 || (mode === 'swap' && destDebt > 0)) && (
                <div className="space-y-4 p-6 bg-rose-50/40 rounded-[24px] border border-rose-100/60">
                  <div className="flex items-center gap-2 text-rose-700">
                    <AlertCircle size={20} className="shrink-0" />
                    <span className="font-extrabold text-xs uppercase tracking-wider">Saldos Devedores Detectados</span>
                  </div>
                  
                  {sourceDebt > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 font-medium">
                        O inquilino <strong className="text-slate-800">{sourceProperty?.ownerName}</strong> possui pendências no imóvel <strong className="text-slate-800">{sourceProperty?.propertyCode}</strong>.
                      </p>

                      {/* Lista de faturas pendentes detectadas */}
                      {sourceUnpaid.length > 0 && (
                        <div className="bg-white/80 p-3 rounded-xl border border-rose-100 text-[11px] space-y-1.5">
                          <span className="font-bold text-rose-900 block text-[10px] uppercase">Faturas Pendentes ({sourceUnpaid.length}):</span>
                          {sourceUnpaid.map((b, idx) => {
                            const rem = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
                            const dateStr = (() => {
                              const d = parseDate(b.dueDate);
                              return d ? format(d, 'dd/MM/yyyy') : 'Sem data';
                            })();
                            const notesStr = b.items?.map(i => i.notes || i.type).join(', ') || b.notes || 'Cobrança em aberto';
                            return (
                              <div key={b.id || idx} className="flex items-center justify-between py-1 border-b border-rose-50 last:border-0 text-slate-700">
                                <span className="truncate max-w-[280px]" title={notesStr}>
                                  • {notesStr} <span className="text-slate-400 font-mono">({dateStr})</span>
                                </span>
                                <span className="font-mono font-bold text-rose-700">R$ {rem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-0.5 mb-1">
                            Valor total do saldo a transferir:
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={customSourceDebt !== null ? customSourceDebt : sourceDebt}
                            onChange={(e) => setCustomSourceDebt(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-700 focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-0.5 mb-1">
                            Motivo/Descrição na nova fatura:
                          </label>
                          <input
                            type="text"
                            value={sourceDebtReason}
                            onChange={(e) => setSourceDebtReason(e.target.value)}
                            placeholder="Ex: Saldo devedor residual"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {mode === 'swap' && destDebt > 0 && (
                    <div className="space-y-3 pt-3 border-t border-rose-100/60">
                      <p className="text-xs text-slate-600 font-medium">
                        O inquilino <strong className="text-slate-800">{destProperty?.ownerName}</strong> possui pendências no imóvel <strong className="text-slate-800">{destProperty?.propertyCode}</strong>.
                      </p>

                      {destUnpaid.length > 0 && (
                        <div className="bg-white/80 p-3 rounded-xl border border-rose-100 text-[11px] space-y-1.5">
                          <span className="font-bold text-rose-900 block text-[10px] uppercase">Faturas Pendentes ({destUnpaid.length}):</span>
                          {destUnpaid.map((b, idx) => {
                            const rem = Math.max(0, (b.totalAmount || 0) - (b.paidAmount || 0));
                            const dateStr = (() => {
                              const d = parseDate(b.dueDate);
                              return d ? format(d, 'dd/MM/yyyy') : 'Sem data';
                            })();
                            const notesStr = b.items?.map(i => i.notes || i.type).join(', ') || b.notes || 'Cobrança em aberto';
                            return (
                              <div key={b.id || idx} className="flex items-center justify-between py-1 border-b border-rose-50 last:border-0 text-slate-700">
                                <span className="truncate max-w-[280px]" title={notesStr}>
                                  • {notesStr} <span className="text-slate-400 font-mono">({dateStr})</span>
                                </span>
                                <span className="font-mono font-bold text-rose-700">R$ {rem.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-0.5 mb-1">
                            Valor total do saldo a transferir:
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={customDestDebt !== null ? customDestDebt : destDebt}
                            onChange={(e) => setCustomDestDebt(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-rose-700 focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block ml-0.5 mb-1">
                            Motivo/Descrição na nova fatura:
                          </label>
                          <input
                            type="text"
                            value={destDebtReason}
                            onChange={(e) => setDestDebtReason(e.target.value)}
                            placeholder="Ex: Saldo devedor residual"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Opção do 1º Aluguel no Destino */}
              {mode === 'move' && sourceProperty?.rentAmount && sourceProperty.rentAmount > 0 ? (
                <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="genFirstRentToggle"
                    checked={generateFirstRent}
                    onChange={(e) => setGenerateFirstRent(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="genFirstRentToggle" className="text-xs font-bold text-slate-800 cursor-pointer select-none">
                    Gerar cobrança do 1º aluguel do novo contrato (R$ {sourceProperty.rentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) no imóvel de destino
                  </label>
                </div>
              ) : null}

              {/* Info Box */}
              <div className="bg-slate-50 p-6 rounded-[24px] border border-slate-100 flex gap-4">
                <AlertCircle className="text-slate-400 shrink-0" size={24} />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-700">
                    {mode === 'move' ? 'Modo: Mover Inquilino' : 'Modo: Permutar Inquilinos'}
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {mode === 'move' 
                      ? 'O inquilino do imóvel de origem será movido para o destino. O registro do imóvel de origem ficará com o nome em branco.' 
                      : 'Os inquilinos serão trocados entre os dois imóveis selecionados. Ideal para quando dois moradores mudam de unidade entre si.'}
                  </p>
                </div>
              </div>

              {/* Action */}
              <div className="flex gap-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  disabled={!sourceId || !destId || isProcessing}
                  onClick={handleExecute}
                  className={`flex-[2] px-6 py-4 rounded-2xl font-black text-white shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 ${
                    !sourceId || !destId || isProcessing
                      ? 'bg-slate-200 cursor-not-allowed'
                      : mode === 'move' ? 'bg-blue-600 shadow-blue-200 hover:bg-blue-700' : 'bg-amber-600 shadow-amber-200 hover:bg-amber-700'
                  }`}
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      {mode === 'move' ? <MoveRight size={20} /> : <ArrowRightLeft size={20} />}
                      Executar {mode === 'move' ? 'Transferência' : 'Troca'}
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto"
              >
                <CheckCircle2 size={48} />
              </motion.div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Sucesso!</h3>
                <p className="text-slate-500 font-bold">Os inquilinos foram atualizados nos imóveis.</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
