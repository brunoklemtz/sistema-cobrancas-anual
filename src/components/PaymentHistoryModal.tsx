import React, { useState } from 'react';
import { updateDoc, addDoc, serverTimestamp, getDoc } from '../lib/db';
import { BillingRecord, PaymentEntry, OperationType, Property, WhatsAppQueueItem } from '../types';
import { handleFirestoreError, parseDate } from '../utils/firestore';
import { syncSubsequentBillingsBalances, isDepositItem } from '../utils/billingUtils';
import { NotificationQueueService } from '../services/notificationQueueService';
import { logAudit } from '../utils/auditLogger';
import { 
  X, DollarSign, Calendar, Plus, Trash2, CheckCircle, Clock, 
  AlertCircle, CreditCard, FileText, Save, CheckCheck, MessageSquare
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'motion/react';

const parseValue = (val: string): number => {
  if (!val) return 0;
  let clean = val.trim().replace(/[^\d.,-]/g, '');
  if (clean.includes(',') && clean.includes('.')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    clean = clean.replace(',', '.');
  }
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

interface PaymentHistoryModalProps {
  billing: BillingRecord;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PaymentHistoryModal({ billing, onClose, onSaved }: PaymentHistoryModalProps) {
  const [history, setHistory] = useState<PaymentEntry[]>(billing.paymentHistory || []);
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const totalAmount = billing.totalAmount || 0;
  const currentPaid = history.reduce((sum, h) => sum + (h.amount || 0), 0);
  const remaining = Math.max(0, totalAmount - currentPaid);

  const [payAmount, setPayAmount] = useState<string>(remaining > 0 ? remaining.toString() : '');
  const [payNotes, setPayNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAddPayment = () => {
    const val = parseValue(payAmount);
    if (val <= 0) {
      setError('Por favor, informe um valor de pagamento válido maior que zero.');
      return;
    }

    if (!payDate) {
      setError('Por favor, informe a data do pagamento.');
      return;
    }

    setError(null);
    const newEntry: PaymentEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      amount: Math.round((val + Number.EPSILON) * 100) / 100,
      date: payDate,
      notes: payNotes.trim(),
      registeredAt: new Date().toISOString(),
    };

    const updatedHistory = [...history, newEntry];
    setHistory(updatedHistory);

    // Reset input fields
    const newTotalPaid = updatedHistory.reduce((sum, h) => sum + (h.amount || 0), 0);
    const newRemaining = Math.max(0, totalAmount - newTotalPaid);
    setPayAmount(newRemaining > 0 ? newRemaining.toString() : '');
    setPayNotes('');
  };

  const handlePayRemaining = () => {
    if (remaining <= 0) return;
    if (!payDate) {
      setError('Por favor, informe a data do pagamento.');
      return;
    }

    setError(null);
    const newEntry: PaymentEntry = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      amount: Math.round((remaining + Number.EPSILON) * 100) / 100,
      date: payDate,
      notes: payNotes.trim() || 'Quitação total',
      registeredAt: new Date().toISOString(),
    };

    const updatedHistory = [...history, newEntry];
    setHistory(updatedHistory);
    setPayAmount('');
    setPayNotes('');
  };

  const handleRemovePayment = (id: string) => {
    const updatedHistory = history.filter(h => h.id !== id);
    setHistory(updatedHistory);
    
    const newTotalPaid = updatedHistory.reduce((sum, h) => sum + (h.amount || 0), 0);
    const newRemaining = Math.max(0, totalAmount - newTotalPaid);
    setPayAmount(newRemaining > 0 ? newRemaining.toString() : '');
  };

  const handleSaveAll = async () => {
    setLoading(true);
    setError(null);

    const finalHistory = [...history];

    const calculatedPaidAmount = Math.round((finalHistory.reduce((sum, h) => sum + (h.amount || 0), 0) + Number.EPSILON) * 100) / 100;
    const previousPaid = billing.paidAmount || 0;
    const newlyAddedPaymentAmount = Math.max(0, calculatedPaidAmount - previousPaid);
    const remainingVal = Math.max(0, totalAmount - calculatedPaidAmount);
    let newStatus: 'paid' | 'pending' | 'overdue' = 'pending';

    if (calculatedPaidAmount >= totalAmount - 0.01 && totalAmount > 0) {
      newStatus = 'paid';
    } else if (billing.dueDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = parseDate(billing.dueDate) || new Date(billing.dueDate as any);
      if (due < today) {
        newStatus = 'overdue';
      } else {
        newStatus = 'pending';
      }
    }

    const isVirtual = billing.id?.startsWith('virtual_') || (billing as any).isVirtual;

    try {
      if (isVirtual) {
        const { id: _, isVirtual: __, groupKey: ___, ids: ____, ...billingData } = billing as any;
        const newDocData = {
          ...billingData,
          paidAmount: calculatedPaidAmount,
          paymentHistory: finalHistory,
          status: newStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await addDoc('billings', newDocData);
      } else {
        const idsToUpdate = billing.ids && billing.ids.length > 0 ? billing.ids : [billing.id!];
        const perDocPaid = idsToUpdate.length > 1 ? Math.round((calculatedPaidAmount / idsToUpdate.length + Number.EPSILON) * 100) / 100 : calculatedPaidAmount;

        const updatePromises = idsToUpdate.map(docId => 
          updateDoc('billings', docId, {
            paidAmount: perDocPaid,
            paymentHistory: finalHistory,
            status: newStatus,
            updatedAt: serverTimestamp(),
          })
        );
        await Promise.all(updatePromises);
      }

      if (billing.propertyId) {
        if (billing.items?.some(isDepositItem) && (newStatus === 'paid' || calculatedPaidAmount >= billing.totalAmount)) {
          await updateDoc('properties', billing.propertyId, {
            securityDepositPaid: true
          });
        }
        await syncSubsequentBillingsBalances(billing.propertyId);

        // If completely paid, cancel pending overdue reminders for this property
        if (newStatus === 'paid' || remainingVal === 0) {
          await NotificationQueueService.cancelPendingMessagesForProperty(billing.propertyId, 'Saldo zerado (quitação integral)');
        } else if (newlyAddedPaymentAmount > 0) {
          // If partial payment was made, generate WhatsApp confirmation receipt
          try {
            const propSnap = await getDoc('properties', billing.propertyId);
            if (propSnap) {
              const propData = propSnap as Property;
              const settings = await NotificationQueueService.getSettings();
              const templates = await NotificationQueueService.getTemplates();
              const partialTemplate = templates.find(t => t.key === 'partial_payment_receipt') || templates[0];
              const activePhones = NotificationQueueService.getActiveBillingPhones(propData);

              const prevBal = Math.max(0, billing.totalAmount - (billing.paidAmount || 0));
              const newRemBal = Math.max(0, billing.totalAmount - calculatedPaidAmount);

              for (const phoneItem of activePhones) {
                const targetRealPhone = phoneItem.number;
                const targetSendPhone = settings.isTestModeActive 
                  ? (settings.testAuthorizedPhones[0] || targetRealPhone)
                  : targetRealPhone;

                const msgText = NotificationQueueService.compilePartialPaymentReceipt({
                  property: propData,
                  billing,
                  amountPaid: newlyAddedPaymentAmount,
                  previousBalance: prevBal,
                  remainingBalance: newRemBal,
                  paymentDate: payDate,
                  template: partialTemplate,
                  isTestMode: settings.isTestModeActive,
                  recipientPhone: targetRealPhone,
                  phoneLabel: phoneItem.label
                });

                const dueParsed = parseDate(billing.dueDate) || new Date();
                await addDoc('whatsapp_queue', {
                  propertyId: propData.id,
                  propertyCode: propData.propertyCode || '',
                  tenantName: propData.ownerName || '',
                  recipientPhone: targetSendPhone,
                  phoneLabel: phoneItem.label || 'Principal',
                  messageText: msgText,
                  type: 'partial_payment_receipt',
                  billingIds: [billing.id || ''],
                  competencies: [format(dueParsed, 'MM/yyyy')],
                  totalCalculated: newRemBal,
                  principalAmount: newRemBal,
                  fineAmount: 0,
                  interestAmount: 0,
                  paidAmount: newlyAddedPaymentAmount,
                  remainingAmount: newRemBal,
                  isTestMode: settings.isTestModeActive,
                  targetRealPhone,
                  status: 'agendada',
                  scheduledFor: new Date().toISOString(),
                  attempts: 0,
                  maxAttempts: 3,
                  logs: [
                    {
                      timestamp: new Date().toISOString(),
                      status: 'agendada',
                      detail: `Recibo de pagamento parcial de R$ ${newlyAddedPaymentAmount.toFixed(2)} agendado.`
                    }
                  ],
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp()
                });
              }
            }
          } catch (notifErr) {
            console.warn('Erro não bloqueante ao enfileirar confirmação WhatsApp:', notifErr);
          }
        }
      }

      // Audit Log
      await logAudit(
        'update_payment_history',
        'billings',
        billing.id || 'grouped',
        { paidAmount: billing.paidAmount, history: billing.paymentHistory },
        { paidAmount: calculatedPaidAmount, history: finalHistory }
      );

      setHistory(finalHistory);
      setPayAmount('');
      setPayNotes('');
      setSuccess(true);
      setTimeout(() => {
        if (onSaved) onSaved();
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Erro ao salvar histórico de pagamentos:', err);
      setError('Erro ao salvar: ' + (err.message || 'Erro desconhecido'));
      handleFirestoreError(err, OperationType.UPDATE, 'billings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-900 via-teal-800 to-slate-900 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <CreditCard size={24} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Pagamentos Parciais</h2>
              <p className="text-xs text-emerald-200 font-medium">
                {billing.propertyCode} • {billing.tenantName}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle size={16} className="shrink-0" />
              <span>Pagamentos atualizados com sucesso!</span>
            </div>
          )}

          {/* Billing Overview Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor Total</span>
              <p className="text-sm font-black text-slate-900 mt-0.5">
                R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">Total Pago</span>
              <p className="text-sm font-black text-emerald-700 mt-0.5">
                R$ {currentPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div>
              {currentPaid > totalAmount ? (
                <>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-600">Saldo Positivo</span>
                  <p className="text-sm font-black text-teal-700 mt-0.5">
                    + R$ {(currentPaid - totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Saldo Restante</span>
                  <p className="text-sm font-black text-rose-700 mt-0.5">
                    R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </>
              )}
            </div>
          </div>

          {currentPaid > totalAmount && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl text-xs text-teal-800 font-bold flex items-center gap-2">
              <CheckCircle size={16} className="text-teal-600 shrink-0" />
              <span>
                Pagamento excede o valor da cobrança. O saldo positivo de <strong>R$ {(currentPaid - totalAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> será lançado como crédito na próxima fatura.
              </span>
            </div>
          )}

          {/* Form: Add New Partial Payment */}
          <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
              <Plus size={14} className="text-emerald-700" /> Registrar Recebimento Parcial / Total
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar size={12} className="text-emerald-600" /> Data do Pagamento *
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <DollarSign size={12} className="text-emerald-600" /> Valor Pago (R$) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                <FileText size={12} className="text-emerald-600" /> Forma / Observação (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: PIX, Dinheiro, 1ª parcela..."
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleAddPayment}
                className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Plus size={14} /> Adicionar Pagamento
              </button>
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={handlePayRemaining}
                  className="py-2.5 px-3 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  title="Dar baixa no valor total do saldo restante"
                >
                  <CheckCheck size={14} className="text-emerald-300" /> Quitar Restante (R$ {remaining.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                </button>
              )}
            </div>
          </div>

          {/* Recorded Payments List */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center justify-between">
              <span>Histórico de Recebimentos</span>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {history.length} registro(s)
              </span>
            </h4>

            {history.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                Nenhum pagamento registrado ainda nesta cobrança.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {history.map((entry) => {
                  let formattedDate = entry.date;
                  try {
                    const [y, m, d] = entry.date.split('-');
                    if (y && m && d) formattedDate = `${d}/${m}/${y}`;
                  } catch (e) {}

                  return (
                    <div 
                      key={entry.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-2 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg shrink-0">
                          <CheckCircle size={14} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900">
                            R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium flex items-center gap-2">
                            <span>Data: <strong>{formattedDate}</strong></span>
                            {entry.notes && <span className="text-slate-600 italic">• {entry.notes}</span>}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePayment(entry.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Remover este pagamento"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSaveAll}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Save size={15} />
              <span>{loading ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
