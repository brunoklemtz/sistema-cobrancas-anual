import React, { useState, useEffect } from 'react';
import { 
  updateDoc, 
  addDoc, serverTimestamp, getDocs, watchDocs 
} from '../lib/db';
import { 
  WhatsAppQueueItem, WhatsAppTemplate, WhatsAppSettings, 
  Property, BillingRecord, AuditLog, WhatsAppAlert, TenantPhone 
} from '../types';
import { NotificationQueueService, DEFAULT_TEMPLATES } from '../services/notificationQueueService';
import { UazapiService } from '../services/uazapiService';
import { logAudit } from '../utils/auditLogger';
import { 
  X, MessageSquare, Clock, CheckCircle2, CheckCheck, 
  AlertTriangle, RefreshCw, Send, ShieldAlert, Sparkles, 
  Eye, Trash2, Filter, Search, PlayCircle, PauseCircle, 
  Layers, Sliders, CheckCircle, RotateCcw, AlertCircle, 
  FileText, History, User, Building2, Phone, Calendar,
  Zap, Droplets, ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { parseDate } from '../utils/firestore';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

interface WhatsAppNotificationModalProps {
  properties: Property[];
  billings: BillingRecord[];
  onClose: () => void;
  onOpenSettings: () => void;
}

type TabType = 'queue' | 'templates' | 'homologation' | 'pilot' | 'logs';

export default function WhatsAppNotificationModal({
  properties,
  billings,
  onClose,
  onOpenSettings
}: WhatsAppNotificationModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('queue');
  const [queue, setQueue] = useState<WhatsAppQueueItem[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [alerts, setAlerts] = useState<WhatsAppAlert[]>([]);
  
  // UI states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppQueueItem | null>(null);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [generatingCadence, setGeneratingCadence] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  
  // Template Editor
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('due_date_reminder');
  const [editingTemplateText, setEditingTemplateText] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Homologation Simulation
  const [simTargetPhone, setSimTargetPhone] = useState('');
  const [simText, setSimText] = useState('Olá! Este é um teste da automação de cobranças imobiliárias via WhatsApp.');
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);
  
  // Interest Calculator Test
  const [calcBaseAmount, setCalcBaseAmount] = useState(1500);
  const [calcDaysLate, setCalcDaysLate] = useState(10);

  // Pilot Selection
  const [pilotSelectedIds, setPilotSelectedIds] = useState<string[]>([]);
  const [pilotSaving, setPilotSaving] = useState(false);
  const [creatingTestData, setCreatingTestData] = useState(false);

  // Create Fictitious Test Property and Billing for Homologation
  const handleCreateTestContractAndBilling = async (sendImmediately = false) => {
    if (!settings) return;
    setCreatingTestData(true);
    setSimResult(null);
    try {
      // 1. Check if TESTE-01 already exists or create it
      const snapProp = await getDocs('properties', {
        filters: [{ field: 'propertyCode', op: 'eq', value: 'TESTE-01' }],
        limit: 1,
      });
      
      let propertyId = '';
      const testPhones: TenantPhone[] = [
        { id: 'phone_test_2', number: '5547996527367', label: 'Principal (Teste 2)', isActiveForBilling: true },
        { id: 'phone_test_3', number: '5547988341417', label: 'Cônjuge (Teste 3)', isActiveForBilling: true },
        { id: 'phone_test_1', number: '5547992744455', label: 'Administrador 1', isActiveForBilling: true }
      ];

      const testPropertyData = {
        propertyCode: 'TESTE-01',
        condominium: 'Edifício Residencial Teste (Homologação)',
        ownerName: 'Inquilino Teste (Homologação)',
        tenantCpf: '000.000.000-00',
        tenantEmail: 'teste@remixcobrancas.com',
        phone: '5547996527367',
        phones: testPhones,
        rentAmount: 1500,
        leaseStartDate: '2026-01-01',
        initialWaterReading: 100,
        initialElectricityReading: 200,
        status: 'active',
        cadencePaused: false,
        colorTag: '#10b981',
        updatedAt: serverTimestamp(),
      };

      if (snapProp.length > 0) {
        propertyId = snapProp[0].id;
        await updateDoc('properties', propertyId, testPropertyData);
      } else {
        propertyId = await addDoc('properties', {
          ...testPropertyData,
          createdAt: serverTimestamp()
        });
      }

      // 2. Create Overdue Billing Record (5 days overdue to trigger 2% fine + 1% p.m. interest)
      const now = new Date();
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

      const billingData = {
        propertyId: propertyId,
        propertyCode: 'TESTE-01',
        tenantName: 'Inquilino Teste (Homologação)',
        tenantPhone: '5547996527367',
        readingDate: fifteenDaysAgo.toISOString().split('T')[0],
        dueDate: fiveDaysAgo.toISOString().split('T')[0],
        status: 'pending',
        items: [
          { type: 'rent', amount: 1500, notes: 'Aluguel Mensal Base' },
          { type: 'water', amount: 85, previousReading: 100, currentReading: 112, notes: 'Consumo de Água (12m³)' },
          { type: 'electricity', amount: 165, previousReading: 200, currentReading: 320, notes: 'Consumo de Luz (120kWh)' }
        ],
        totalAmount: 1750,
        paidAmount: 0,
        archived: false,
        colorTag: '#f59e0b',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const billDocId = await addDoc('billings', billingData);

      // 3. Compile the consolidated message
      const propObj: Property = {
        id: propertyId,
        propertyCode: 'TESTE-01',
        ownerName: 'Inquilino Teste (Homologação)',
        phones: testPhones,
        phone: '5547996527367',
        status: 'active',
        cadencePaused: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const billObj: BillingRecord = {
        id: billDocId,
        propertyId: propertyId,
        propertyCode: 'TESTE-01',
        tenantName: 'Inquilino Teste (Homologação)',
        dueDate: fiveDaysAgo.toISOString().split('T')[0],
        status: 'pending',
        items: billingData.items as any,
        totalAmount: 1750,
        paidAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const overdueTemplate = templates.find(t => t.key === 'overdue_cadence') || DEFAULT_TEMPLATES.find(t => t.key === 'overdue_cadence')!;

      // 4. Generate Queue Items for each test phone
      let sentCount = 0;
      const targetPhonesToSend = ['5547996527367', '5547988341417'];

      for (let i = 0; i < targetPhonesToSend.length; i++) {
        const phone = targetPhonesToSend[i];
        const label = i === 0 ? 'Principal (Teste 2)' : 'Cônjuge (Teste 3)';

        const compiled = NotificationQueueService.compileConsolidatedMessage({
          property: propObj,
          billings: [billObj],
          template: overdueTemplate,
          settings,
          isTestMode: true,
          recipientPhone: phone,
          phoneLabel: label
        });

        // Add to queue
        const qDocId = await addDoc('whatsapp_queue', {
          propertyId: propertyId,
          propertyCode: 'TESTE-01',
          tenantName: 'Inquilino Teste (Homologação)',
          recipientPhone: phone,
          phoneLabel: label,
          messageText: compiled.messageText,
          type: 'overdue_cadence',
          billingIds: [billDocId],
          competencies: compiled.competencies,
          totalCalculated: compiled.totalCalculated,
          principalAmount: compiled.principalAmount,
          fineAmount: compiled.fineAmount,
          interestAmount: compiled.interestAmount,
          paidAmount: 0,
          remainingAmount: compiled.totalCalculated,
          isTestMode: true,
          targetRealPhone: phone,
          status: sendImmediately ? 'processando' : 'agendada',
          scheduledFor: new Date().toISOString(),
          attempts: sendImmediately ? 1 : 0,
          maxAttempts: 3,
          logs: [
            {
              timestamp: new Date().toISOString(),
              status: sendImmediately ? 'processando' : 'agendada',
              detail: 'Faturamento de teste gerado com sucesso (5 dias de atraso simulados).'
            }
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        if (sendImmediately) {
          const res = await UazapiService.sendMessage(
            settings.primaryInstance,
            phone,
            compiled.messageText,
            settings.isTestModeActive && !settings.primaryInstance.token
          );

          if (res.success) {
            sentCount++;
            await updateDoc('whatsapp_queue', qDocId, {
              status: 'enviada',
              uazapiMessageId: res.messageId || 'sim_' + Date.now(),
              updatedAt: serverTimestamp(),
              logs: [
                {
                  timestamp: new Date().toISOString(),
                  status: 'enviada',
                  detail: `Disparo de teste imediato concluído com sucesso. (MsgID: ${res.messageId || 'simulado'})`
                }
              ]
            });
          } else {
            await updateDoc('whatsapp_queue', qDocId, {
              status: 'falhou',
              lastError: res.error,
              updatedAt: serverTimestamp(),
              logs: [
                {
                  timestamp: new Date().toISOString(),
                  status: 'falhou',
                  detail: `Falha no envio: ${res.error}`
                }
              ]
            });
          }
        }
      }

      await logAudit(
        'create_test_property_and_billing',
        'properties',
        propertyId,
        null,
        { propertyCode: 'TESTE-01', totalAmount: 1750, sendImmediately }
      );

      setActionFeedback('Imóvel TESTE-01 e fatura de aluguel criados com sucesso!');
      if (sendImmediately) {
        setSimResult(`Sucesso! Imóvel TESTE-01 e fatura em atraso criados. Cobrança enviada para os números de teste (47) 99652-7367 e (47) 98834-1417 (${sentCount} entregue(s)).`);
      } else {
        setSimResult(`Sucesso! Imóvel TESTE-01 e fatura com 5 dias de atraso inseridos. As mensagens foram calculadas e adicionadas à Fila de Envios.`);
      }
    } catch (e: any) {
      setSimResult(`Erro ao criar dados de teste: ${e.message}`);
    } finally {
      setCreatingTestData(false);
    }
  };

  // Realtime subscription to Queue
  useEffect(() => {
    const unsubscribe = watchDocs(
      'whatsapp_queue',
      { orderByField: 'createdAt', ascending: false, limit: 100 },
      (docs) => {
        setQueue(docs as WhatsAppQueueItem[]);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load Settings, Templates, and Logs
  useEffect(() => {
    const loadInitialData = async () => {
      const s = await NotificationQueueService.getSettings();
      setSettings(s);
      if (s.testAuthorizedPhones[0]) {
        setSimTargetPhone(s.testAuthorizedPhones[0]);
      }

      const t = await NotificationQueueService.getTemplates();
      setTemplates(t);
      const cur = t.find(item => item.key === selectedTemplateKey);
      if (cur) setEditingTemplateText(cur.content || cur.body || '');

      // Load Pilot
      if (s.pilotPropertyIds || s.pilotContractIds) {
        setPilotSelectedIds(s.pilotPropertyIds || s.pilotContractIds || []);
      }

      // Load Audit Logs
      try {
        const auditSnap = await getDocs('audit_logs', { orderByField: 'timestamp', ascending: false, limit: 30 });
        setAuditLogs(auditSnap as AuditLog[]);
      } catch (err) {
        console.warn('Audit logs query fallback:', err);
      }

      // Load Alerts
      try {
        const alertSnap = await getDocs('whatsapp_alerts', { orderByField: 'createdAt', ascending: false, limit: 20 });
        setAlerts(alertSnap as WhatsAppAlert[]);
      } catch (err) {
        console.warn('Alerts query fallback:', err);
      }
    };

    loadInitialData();
  }, [selectedTemplateKey]);

  // Actions
  const handleProcessQueueNow = async () => {
    setProcessingQueue(true);
    setActionFeedback(null);
    try {
      const res = await NotificationQueueService.processQueueBatch(15);
      setActionFeedback(`Fila processada: ${res.sent} enviada(s), ${res.failed} falha(s), ${res.pending} agendada(s).`);
      await logAudit('process_whatsapp_queue', 'whatsapp_queue', 'batch', null, res);
    } catch (err: any) {
      setActionFeedback(`Erro ao processar fila: ${err.message}`);
    } finally {
      setProcessingQueue(false);
    }
  };

  const handleGenerateCadenceNow = async () => {
    setGeneratingCadence(true);
    setActionFeedback(null);
    try {
      const activeProperties = properties.filter(p => p.status === 'active');
      const count = await NotificationQueueService.generateOverdueCadenceMessages(activeProperties, billings);
      setActionFeedback(`Régua executada com sucesso! ${count} nova(s) mensagem(ns) adicionada(s) à fila.`);
      await logAudit('generate_cadence_messages', 'whatsapp_queue', 'daily_sweep', null, { messagesGenerated: count });
    } catch (err: any) {
      setActionFeedback(`Erro ao executar régua: ${err.message}`);
    } finally {
      setGeneratingCadence(false);
    }
  };

  const handleCancelQueueItem = async (item: WhatsAppQueueItem) => {
    if (!item.id) return;
    try {
      await updateDoc('whatsapp_queue', item.id, {
        status: 'cancelada',
        logs: [
          ...(item.logs || []),
          {
            timestamp: new Date().toISOString(),
            status: 'cancelada',
            detail: 'Cancelamento manual pelo operador.'
          }
        ],
        updatedAt: serverTimestamp()
      });
      await logAudit('cancel_whatsapp_queue_item', 'whatsapp_queue', item.id, item, { status: 'cancelada' });
    } catch (err: any) {
      alert('Erro ao cancelar: ' + err.message);
    }
  };

  const handleResendQueueItem = async (item: WhatsAppQueueItem) => {
    if (!item.id) return;
    try {
      await updateDoc('whatsapp_queue', item.id, {
        status: 'agendada',
        attempts: 0,
        logs: [
          ...(item.logs || []),
          {
            timestamp: new Date().toISOString(),
            status: 'agendada',
            detail: 'Reagendamento manual para novo envio.'
          }
        ],
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      alert('Erro ao reenviar: ' + err.message);
    }
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      const current = templates.find(t => t.key === selectedTemplateKey);
      if (!current) return;

      const updated = templates.map(t => t.key === selectedTemplateKey ? { ...t, content: editingTemplateText, body: editingTemplateText } : t);
      setTemplates(updated);

      await updateDoc('settings', 'whatsapp_config', {
        templates: updated,
        updatedAt: serverTimestamp()
      });
      await logAudit('update_whatsapp_template', 'settings', selectedTemplateKey, { old: current.content || current.body }, { new: editingTemplateText });
      setActionFeedback('Modelo atualizado com sucesso!');
    } catch (err: any) {
      alert('Erro ao salvar modelo: ' + err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleResetTemplates = async () => {
    if (!confirm('Deseja restaurar todos os modelos de mensagem para o padrão original?')) return;
    try {
      setTemplates(DEFAULT_TEMPLATES);
      const cur = DEFAULT_TEMPLATES.find(t => t.key === selectedTemplateKey);
      if (cur) setEditingTemplateText(cur.content || cur.body || '');

      await updateDoc('settings', 'whatsapp_config', {
        templates: DEFAULT_TEMPLATES,
        updatedAt: serverTimestamp()
      });
      setActionFeedback('Modelos restaurados para os padrões originais.');
    } catch (err: any) {
      alert('Erro ao restaurar modelos: ' + err.message);
    }
  };

  // Homologation Simulation handlers
  const handleRunDirectTest = async () => {
    if (!settings) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const targetNumber = simTargetPhone || settings.testAuthorizedPhones[0];
      if (!targetNumber) {
        throw new Error('Configure ao menos um número autorizado de teste nas Configurações.');
      }

      const res = await UazapiService.sendMessage(
        settings.primaryInstance,
        targetNumber,
        `[TESTE HOMOLOGAÇÃO]\n\n${simText}\n\nEnviado em: ${new Date().toLocaleTimeString('pt-BR')}`,
        settings.isTestModeActive && !settings.primaryInstance.token
      );

      if (res.success) {
        setSimResult(`Mensagem de teste enviada com sucesso para ${targetNumber}! (MessageID: ${res.messageId || 'simulado'})`);
      } else {
        setSimResult(`Falha no envio: ${res.error}`);
      }
    } catch (e: any) {
      setSimResult(`Erro: ${e.message}`);
    } finally {
      setSimRunning(false);
    }
  };

  const handleSimulateFailAndContingencyAlert = async () => {
    if (!settings) return;
    setSimRunning(true);
    setSimResult('Simulando falha de conexão na instância primária...');
    try {
      const alertMessage = `⚠️ [ALERTA DE CONTINGÊNCIA UAZAPI]\nInstância primária ("${settings.primaryInstance.instanceName || 'principal'}") desconectou ou falhou nas tentativas.\nVerifique com urgência o WhatsApp Web ou painel da UAZAPI.`;
      
      const adminTargets = settings.adminAlertPhones.filter(Boolean);
      const fallbackTarget = adminTargets.length > 0 ? adminTargets : settings.testAuthorizedPhones.filter(Boolean);

      let successCount = 0;
      for (const phone of fallbackTarget) {
        const res = await UazapiService.sendMessage(
          settings.contingencyInstance,
          phone,
          alertMessage,
          settings.isTestModeActive && !settings.contingencyInstance.token
        );
        if (res.success) successCount++;
      }

      // Record alert
      await addDoc('whatsapp_alerts', {
        trigger: 'simulacao_manual_falha_instancia',
        primaryInstanceName: settings.primaryInstance.instanceName || 'principal',
        contingencyInstanceName: settings.contingencyInstance.instanceName || 'contingencia',
        message: alertMessage,
        recipients: fallbackTarget,
        status: successCount > 0 ? 'sent' : 'failed',
        createdAt: serverTimestamp()
      });

      setSimResult(`Simulação concluída! Alerta disparado com sucesso via Instância Antiga de Contingência para ${successCount} administrador(es).`);
    } catch (e: any) {
      setSimResult(`Erro na simulação de contingência: ${e.message}`);
    } finally {
      setSimRunning(false);
    }
  };

  const handleSavePilot = async () => {
    if (!settings) return;
    setPilotSaving(true);
    try {
      await updateDoc('settings', 'whatsapp_config', {
        pilotPropertyIds: pilotSelectedIds,
        updatedAt: serverTimestamp()
      });
      await logAudit('update_whatsapp_pilot', 'settings', 'whatsapp_config', { old: settings.pilotPropertyIds }, { new: pilotSelectedIds });
      setActionFeedback(`Lote piloto atualizado com ${pilotSelectedIds.length} imóvel(is) selecionado(s).`);
    } catch (err: any) {
      alert('Erro ao salvar lote piloto: ' + err.message);
    } finally {
      setPilotSaving(false);
    }
  };

  // Filtered Queue
  const filteredQueue = queue.filter(item => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesSearch = !searchTerm || 
      item.propertyCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.recipientPhone.includes(searchTerm) ||
      (item.targetRealPhone && item.targetRealPhone.includes(searchTerm));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-3xl w-full max-w-6xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col h-[94vh]"
      >
        {/* Top Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <MessageSquare size={24} className="text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-tight">Central de Cobrança WhatsApp (UAZAPI)</h2>
                {settings?.isTestModeActive ? (
                  <span className="px-2.5 py-0.5 bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider rounded-full shadow-2xs">
                    Modo Homologação Ativo
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider rounded-full shadow-2xs">
                    Produção
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-200/90 font-medium">
                Fila de Envios, Modelos, Régua de Atraso e Central de Homologação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders size={14} /> Configurações UAZAPI
            </button>
            <button 
              onClick={onClose} 
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100/90 border-b border-slate-200 px-6 pt-3 flex items-center gap-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'queue' 
                ? 'bg-white text-emerald-950 border-t-2 border-emerald-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock size={15} />
            <span>Fila de Envios ({queue.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('homologation')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'homologation' 
                ? 'bg-white text-amber-950 border-t-2 border-amber-500 shadow-xs' 
                : 'text-amber-900 bg-amber-100/60 hover:bg-amber-100'
            }`}
          >
            <Sparkles size={15} className="text-amber-600" />
            <span>Central de Homologação (Testes)</span>
            <span className="text-[9px] bg-amber-500 text-white font-black px-1.5 py-0.5 rounded-full uppercase">Novo</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'templates' 
                ? 'bg-white text-emerald-950 border-t-2 border-emerald-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            <span>Modelos de Mensagem</span>
          </button>

          <button
            onClick={() => setActiveTab('pilot')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pilot' 
                ? 'bg-white text-emerald-950 border-t-2 border-emerald-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers size={15} />
            <span>Lote Piloto (5 Contratos)</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2.5 text-xs font-black rounded-t-xl transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'logs' 
                ? 'bg-white text-emerald-950 border-t-2 border-emerald-600 shadow-xs' 
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History size={15} />
            <span>Auditoria & Alertas</span>
          </button>
        </div>

        {/* Global Action Feedback Alert */}
        {actionFeedback && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs font-bold text-emerald-800 flex items-center justify-between">
            <span>{actionFeedback}</span>
            <button onClick={() => setActionFeedback(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: FILA DE ENVIOS */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              {/* Controls bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar por imóvel, inquilino ou fone..."
                      className="pl-8 pr-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none w-56 sm:w-64"
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="agendada">Agendadas</option>
                    <option value="enviada">Enviadas</option>
                    <option value="entregue">Entregues</option>
                    <option value="lida">Lidas</option>
                    <option value="falha">Falhas</option>
                    <option value="cancelada">Canceladas</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCreateTestContractAndBilling(true)}
                    disabled={creatingTestData}
                    className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    title="Cria o imóvel TESTE-01 com faturamento em atraso e envia agora pelo WhatsApp"
                  >
                    <Sparkles size={13} className={creatingTestData ? 'animate-spin' : ''} />
                    <span>{creatingTestData ? 'Gerando Teste...' : '⚡ Testar com Aluguel Fictício (TESTE-01)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateCadenceNow}
                    disabled={generatingCadence}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                    title="Escaneia aluguéis vencidos/a vencer e agenda lembretes conforme a régua"
                  >
                    <RefreshCw size={13} className={generatingCadence ? 'animate-spin' : ''} />
                    <span>{generatingCadence ? 'Escaneando...' : 'Gerar Régua Hoje'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleProcessQueueNow}
                    disabled={processingQueue}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <Send size={13} className={processingQueue ? 'animate-pulse' : ''} />
                    <span>{processingQueue ? 'Processando Fila...' : 'Processar Fila Agora'}</span>
                  </button>
                </div>
              </div>

              {/* Queue List Table */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                {filteredQueue.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <MessageSquare size={36} className="mx-auto mb-2 opacity-40 text-emerald-600" />
                    <p className="text-sm font-bold text-slate-600">Nenhuma mensagem na fila com os filtros selecionados.</p>
                    <p className="text-xs text-slate-400 mt-1">Clique em "Gerar Régua Hoje" para escanear cobranças pendentes.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <th className="py-3 px-4">Tipo & Imóvel</th>
                          <th className="py-3 px-4">Destinatário & Fone</th>
                          <th className="py-3 px-4">Saldo / Valores</th>
                          <th className="py-3 px-4">Status & Tentativas</th>
                          <th className="py-3 px-4">Agendado Para</th>
                          <th className="py-3 px-4 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                        {filteredQueue.map(item => {
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-black text-slate-900 flex items-center gap-1.5">
                                  <Building2 size={13} className="text-blue-600" />
                                  <span>{item.propertyCode || 'Geral'}</span>
                                </div>
                                <div className="text-[11px] font-bold text-emerald-700 capitalize mt-0.5">
                                  {item.type === 'due_date_reminder' && 'Lembrete Vencimento'}
                                  {item.type === 'overdue_cadence' && 'Atraso com Multa/Juros'}
                                  {item.type === 'variable_charges_updated' && 'Taxas Lançadas'}
                                  {item.type === 'variable_charges_pending' && 'Taxas Pendentes'}
                                  {item.type === 'partial_payment_receipt' && 'Recibo Pagto Parcial'}
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-800">{item.tenantName}</div>
                                <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                                  <Phone size={10} />
                                  <span>{item.recipientPhone}</span>
                                  {item.isTestMode && (
                                    <span className="text-[9px] bg-amber-100 text-amber-900 px-1 py-0.2 rounded font-black">
                                      TESTE
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-4 font-semibold">
                                {item.totalCalculated !== undefined ? (
                                  <div>
                                    <span className="font-black text-slate-900">
                                      R$ {item.totalCalculated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    {((item.fineAmount || 0) > 0 || (item.interestAmount || 0) > 0) && (
                                      <div className="text-[10px] text-rose-600 font-bold">
                                        +{((item.fineAmount || 0) + (item.interestAmount || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (multa/juros)
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>

                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  {item.status === 'agendada' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                                      <Clock size={10} /> Agendada
                                    </span>
                                  )}
                                  {item.status === 'processando' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
                                      <RefreshCw size={10} className="animate-spin" /> Processando
                                    </span>
                                  )}
                                  {item.status === 'enviada' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle size={10} /> Enviada
                                    </span>
                                  )}
                                  {item.status === 'entregue' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-50 text-teal-700 border border-teal-200">
                                      <CheckCheck size={10} /> Entregue
                                    </span>
                                  )}
                                  {item.status === 'lida' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      <CheckCheck size={10} className="text-indigo-600" /> Lida
                                    </span>
                                  )}
                                  {item.status === 'falha' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                      <AlertTriangle size={10} /> Falha ({item.attempts || 1}/{item.maxAttempts || 3})
                                    </span>
                                  )}
                                  {item.status === 'cancelada' && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                                      Cancelada
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                                {item.scheduledFor ? format(new Date(item.scheduledFor), "dd/MM 'às' HH:mm", { locale: ptBR }) : '-'}
                              </td>

                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedMessage(item)}
                                    className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                    title="Ver Mensagem & Logs"
                                  >
                                    <Eye size={14} />
                                  </button>

                                  {item.status === 'agendada' && (
                                    <button
                                      type="button"
                                      onClick={() => handleCancelQueueItem(item)}
                                      className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Cancelar envio"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}

                                  {(item.status === 'falha' || item.status === 'cancelada') && (
                                    <button
                                      type="button"
                                      onClick={() => handleResendQueueItem(item)}
                                      className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                      title="Reagendar envio"
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: MODELOS DE MENSAGEM */}
          {activeTab === 'templates' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Template selector */}
              <div className="lg:col-span-4 space-y-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-2">
                  Selecione o Modelo
                </h3>
                {templates.map(tmpl => (
                  <button
                    key={tmpl.key}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateKey(tmpl.key);
                      setEditingTemplateText(tmpl.body);
                    }}
                    className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      selectedTemplateKey === tmpl.key
                        ? 'bg-emerald-50 border-emerald-500 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900">{tmpl.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{tmpl.description}</div>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleResetTemplates}
                  className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-rose-600 py-2 border border-dashed border-slate-300 hover:border-rose-300 rounded-xl transition-colors cursor-pointer"
                >
                  Restaurar Modelos Originais
                </button>
              </div>

              {/* Editor and preview */}
              <div className="lg:col-span-8 space-y-4">
                <div className="bg-white p-4 border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Editor de Texto do Modelo
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <span>Tags:</span>
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700">{"{nome}"}</code>
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700">{"{imovel}"}</code>
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700">{"{saldo}"}</code>
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700">{"{multa}"}</code>
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-emerald-700">{"{juros}"}</code>
                    </div>
                  </div>

                  <textarea
                    rows={8}
                    value={editingTemplateText}
                    onChange={(e) => setEditingTemplateText(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none leading-relaxed"
                  />

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveTemplate}
                      disabled={savingTemplate}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    >
                      <CheckCircle size={14} />
                      <span>{savingTemplate ? 'Salvando...' : 'Salvar Este Modelo'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Preview Box */}
                <div className="bg-emerald-950 p-4 rounded-2xl text-emerald-50 space-y-2 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300">
                    <MessageSquare size={14} />
                    <span>Prévia de Renderização no WhatsApp</span>
                  </div>
                  <div className="bg-emerald-900/60 border border-emerald-700/50 p-3 rounded-xl text-xs font-sans whitespace-pre-wrap leading-relaxed">
                    {editingTemplateText
                      .replace(/\{nome\}/g, 'Carlos Silva')
                      .replace(/\{imovel\}/g, 'APTO 302 - Residencial Mar Azul')
                      .replace(/\{vencimento\}/g, '10/08/2026')
                      .replace(/\{itens\}/g, '• Aluguel: R$ 1.500,00\n• Água: R$ 85,00\n• Luz: R$ 140,00')
                      .replace(/\{multa\}/g, 'R$ 30,00 (2%)')
                      .replace(/\{juros\}/g, 'R$ 5,00 (0,33%)')
                      .replace(/\{dias_atraso\}/g, '10')
                      .replace(/\{saldo\}/g, 'R$ 1.760,00')
                      .replace(/\{valor_pago\}/g, 'R$ 800,00')
                      .replace(/\{saldo_anterior\}/g, 'R$ 1.760,00')
                      .replace(/\{saldo_remanescente\}/g, 'R$ 960,00')}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CENTRAL DE HOMOLOGAÇÃO / SIMULAÇÕES */}
          {activeTab === 'homologation' && (
            <div className="space-y-6">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 flex items-start gap-3">
                <ShieldAlert size={24} className="text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Ambiente Controlado de Homologação
                  </h3>
                  <p className="text-xs font-medium mt-1 leading-relaxed">
                    Aqui você pode simular todos os cenários operacionais da régua antes da liberação final: disparos de teste para números autorizados, criação de dados fictícios, simulação de leitura (Enviada ➔ Entregue ➔ Lida), simulação de falhas e o acionamento de contingência da instância antiga.
                  </p>
                </div>
              </div>

              {/* CARD DE CADASTRO FICTÍCIO PARA TESTES */}
              <div className="p-5 bg-gradient-to-br from-emerald-50 via-teal-50/40 to-slate-50 border-2 border-emerald-300 rounded-3xl space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                        Gerador de Cadastro Fictício para Homologação (TESTE-01)
                        <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Recomendado
                        </span>
                      </h4>
                      <p className="text-xs text-slate-600">
                        Cria automaticamente o imóvel fictício <strong className="text-emerald-900">TESTE-01</strong> com aluguel, água e luz em atraso vinculado aos seus números autorizados.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Detalhes do Faturamento Fictício */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 bg-white border border-emerald-200/80 rounded-2xl space-y-1 text-xs">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Building2 size={13} className="text-emerald-600" /> Imóvel & Inquilino
                    </div>
                    <div className="font-black text-slate-800">TESTE-01 (Residencial Teste)</div>
                    <div className="text-slate-600">Inquilino: Inquilino Teste (Homologação)</div>
                  </div>

                  <div className="p-3 bg-white border border-emerald-200/80 rounded-2xl space-y-1 text-xs">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Calendar size={13} className="text-emerald-600" /> Valores & Atraso
                    </div>
                    <div className="font-black text-emerald-800">Total: R$ 1.750,00 + Multa & Juros</div>
                    <div className="text-slate-600 text-[11px]">
                      Aluguel R$ 1.500 | Água R$ 85 | Luz R$ 165 (5 dias de atraso)
                    </div>
                  </div>

                  <div className="p-3 bg-white border border-emerald-200/80 rounded-2xl space-y-1 text-xs">
                    <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                      <Phone size={13} className="text-emerald-600" /> Destinatários do Teste
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 font-bold rounded-lg text-[10px]">
                        (47) 99652-7367 (Teste 2)
                      </span>
                      <span className="px-2 py-0.5 bg-teal-100 text-teal-900 font-bold rounded-lg text-[10px]">
                        (47) 98834-1417 (Teste 3)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Ações Rápidas */}
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCreateTestContractAndBilling(true)}
                    disabled={creatingTestData}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-black rounded-2xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
                  >
                    <Send size={14} />
                    <span>{creatingTestData ? 'Criando e Disparando...' : '⚡ Criar Dados e Disparar Imediatamente no WhatsApp'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCreateTestContractAndBilling(false)}
                    disabled={creatingTestData}
                    className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-800 border border-slate-300 text-xs font-black rounded-2xl transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <Clock size={14} className="text-slate-600" />
                    <span>Criar Dados e Adicionar à Fila de Envios</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. DISPARO DE MENSAGEM DE TESTE */}
                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Send size={14} className="text-emerald-600" />
                    1. Envio de Teste Direto para Número Autorizado
                  </h4>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Número de Destino Autorizado</label>
                    <input
                      type="tel"
                      value={simTargetPhone}
                      onChange={(e) => setSimTargetPhone(e.target.value)}
                      placeholder="(47) 99274-4455"
                      className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    {settings?.testAuthorizedPhones && settings.testAuthorizedPhones.filter(Boolean).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {settings.testAuthorizedPhones.filter(Boolean).map((phone, pIdx) => (
                          <button
                            key={`quick-p-${pIdx}`}
                            type="button"
                            onClick={() => setSimTargetPhone(phone)}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-100/70 text-amber-900 hover:bg-amber-200 transition-colors cursor-pointer"
                          >
                            {phone}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Texto de Teste</label>
                    <textarea
                      rows={3}
                      value={simText}
                      onChange={(e) => setSimText(e.target.value)}
                      className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleRunDirectTest}
                    disabled={simRunning}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Send size={13} />
                    <span>{simRunning ? 'Disparando...' : 'Enviar Mensagem de Teste Agora'}</span>
                  </button>
                </div>

                {/* 2. SIMULAÇÃO DE CONTINGÊNCIA */}
                <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-rose-600" />
                    2. Simulação de Desconexão & Alerta de Contingência
                  </h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Testa se a Instância Antiga de Contingência dispara o aviso urgente aos 2 administradores caso a instância principal falhe.
                  </p>

                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle size={13} /> Alerta disparado para:
                    </div>
                    <div>
                      {settings?.adminAlertPhones.filter(Boolean).join(', ') || 'Nenhum administrador cadastrado'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSimulateFailAndContingencyAlert}
                    disabled={simRunning}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <AlertTriangle size={13} />
                    <span>{simRunning ? 'Simulando Alerta...' : 'Simular Queda da Instância & Testar Alerta'}</span>
                  </button>
                </div>
              </div>

              {/* SIMULADOR DE CÁLCULO DE MULTA E JUROS */}
              <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Sliders size={14} className="text-indigo-600" />
                  Simulador de Cálculo: Multa de 2% e Juros de 1% a.m. (Pro-rata Dia)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Valor do Aluguel / Base (R$)</label>
                    <input
                      type="number"
                      value={calcBaseAmount}
                      onChange={(e) => setCalcBaseAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Dias de Atraso</label>
                    <input
                      type="number"
                      value={calcDaysLate}
                      onChange={(e) => setCalcDaysLate(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Resultado Calculado</label>
                    {(() => {
                      const fine = calcDaysLate > 0 ? calcBaseAmount * 0.02 : 0;
                      const dailyInterestRate = 0.01 / 30;
                      const interest = calcDaysLate > 0 ? calcBaseAmount * (dailyInterestRate * calcDaysLate) : 0;
                      const total = calcBaseAmount + fine + interest;

                      return (
                        <div className="p-2 bg-slate-100 rounded-xl text-xs">
                          <div className="font-black text-emerald-700">Total: R$ {total.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Multa: R$ {fine.toFixed(2)} | Juros: R$ {interest.toFixed(2)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {simResult && (
                <div className="p-4 bg-slate-900 text-emerald-400 rounded-2xl font-mono text-xs shadow-md">
                  <div className="font-bold text-white mb-1">Resultado da Operação:</div>
                  <div>{simResult}</div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LOTE PILOTO (5 CONTRATOS) */}
          {activeTab === 'pilot' && (
            <div className="space-y-4">
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl text-indigo-950 flex items-start gap-3">
                <Layers size={22} className="text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider">
                    Lote Piloto Controlado (Máximo 5 Contratos)
                  </h3>
                  <p className="text-xs font-medium mt-1 leading-relaxed">
                    Selecione até 5 contratos para testar a régua com inquilinos reais de forma gradual. Antes de ativar disparos reais, revise a lista e confirme a autorização.
                  </p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800">
                    Contratos Selecionados: {pilotSelectedIds.length} / 5
                  </span>
                  <button
                    type="button"
                    onClick={handleSavePilot}
                    disabled={pilotSaving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <CheckCircle size={14} />
                    <span>{pilotSaving ? 'Salvando...' : 'Salvar Lote Piloto'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto pt-2">
                  {properties.filter(p => p.status === 'active').map(prop => {
                    const isSelected = pilotSelectedIds.includes(prop.id);
                    const activePhones = (prop.phones || []).filter(p => p.isActiveForBilling && p.number);

                    return (
                      <div
                        key={prop.id}
                        onClick={() => {
                          if (isSelected) {
                            setPilotSelectedIds(prev => prev.filter(id => id !== prop.id));
                          } else {
                            if (pilotSelectedIds.length >= 5) {
                              alert('O Lote Piloto é limitado a no máximo 5 contratos para segurança.');
                              return;
                            }
                            setPilotSelectedIds(prev => [...prev, prop.id]);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 border-indigo-500 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-black text-xs text-slate-900 flex items-center gap-1.5">
                            <Building2 size={13} className="text-indigo-600" />
                            <span>{prop.propertyCode}</span>
                            {prop.condominium && (
                              <span className="text-[10px] text-slate-500 font-bold">({prop.condominium})</span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-slate-700 mt-0.5">{prop.ownerName || 'Sem Inquilino'}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone size={11} />
                            <span>{activePhones[0]?.number || prop.phone || 'Sem telefone'}</span>
                            {activePhones.length > 0 && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded">
                                {activePhones.length} ativo{activePhones.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="w-4 h-4 text-indigo-600 rounded border-gray-300 cursor-pointer pointer-events-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDITORIA & ALERTAS */}
          {activeTab === 'logs' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Audit Logs */}
              <div className="bg-white p-4 border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <History size={15} className="text-blue-600" />
                  Registro de Auditoria do Sistema
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {auditLogs.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum registro de auditoria encontrado.</p>
                  ) : (
                    auditLogs.map(log => (
                      <div key={log.id} className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{log.action}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {log.timestamp ? format(new Date(log.timestamp), 'dd/MM HH:mm:ss') : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Operador: <span className="font-semibold text-slate-800">{log.userEmail}</span> ({log.entity} #{log.entityId})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Alerts of Contingency */}
              <div className="bg-white p-4 border border-slate-200 rounded-2xl space-y-3 shadow-2xs">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert size={15} className="text-rose-600" />
                  Histórico de Alertas de Contingência
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {alerts.length === 0 ? (
                    <p className="text-xs text-slate-400">Nenhum alerta de contingência disparado.</p>
                  ) : (
                    alerts.map(a => (
                      <div key={a.id} className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1 text-rose-950">
                        <div className="flex items-center justify-between font-bold">
                          <span>Gatilho: {a.trigger}</span>
                          <span className="text-[10px] font-mono text-rose-700">
                            {(() => {
                              const d = parseDate(a.createdAt);
                              return d ? format(d, 'dd/MM HH:mm') : '';
                            })()}
                          </span>
                        </div>
                        <div className="text-[11px] whitespace-pre-wrap">{a.message}</div>
                        <div className="text-[10px] text-rose-800 font-semibold">
                          Destinatários: {a.recipients?.join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* DETAILS MODAL FOR A SINGLE QUEUE ITEM */}
        <AnimatePresence>
          {selectedMessage && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-60">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                    <MessageSquare size={16} className="text-emerald-600" />
                    Detalhes do Envio ({selectedMessage.propertyCode})
                  </h3>
                  <button onClick={() => setSelectedMessage(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="font-bold text-slate-500">Inquilino / Contrato:</span>
                    <p className="font-bold text-slate-900">{selectedMessage.tenantName} ({selectedMessage.propertyCode})</p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-500">Telefone:</span>
                    <p className="font-mono font-bold text-slate-800">
                      {selectedMessage.recipientPhone} 
                      {selectedMessage.targetRealPhone && selectedMessage.isTestMode && (
                        <span className="text-[11px] text-amber-700 block font-sans">
                          (Redirecionado do número real: {selectedMessage.targetRealPhone})
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <span className="font-bold text-slate-500">Texto da Mensagem:</span>
                    <div className="mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-sans whitespace-pre-wrap text-slate-800 max-h-48 overflow-y-auto leading-relaxed">
                      {selectedMessage.messageText}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-500">Histórico de Tentativas & Logs:</span>
                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {(selectedMessage.logs || []).map((l, i) => (
                        <div key={i} className="text-[11px] p-1.5 bg-slate-100 rounded-lg flex items-center justify-between text-slate-700">
                          <span>{l.detail}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {format(new Date(l.timestamp), 'HH:mm:ss')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedMessage(null)}
                    className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-black hover:bg-slate-900 cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
