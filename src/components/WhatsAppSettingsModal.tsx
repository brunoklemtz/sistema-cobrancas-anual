import React, { useState, useEffect } from 'react';
import { setDoc, serverTimestamp } from '../lib/db';
import { WhatsAppSettings, InstanceConfig } from '../types';
import { DEFAULT_WHATSAPP_SETTINGS, NotificationQueueService } from '../services/notificationQueueService';
import { UazapiService } from '../services/uazapiService';
import { logAudit } from '../utils/auditLogger';
import { 
  X, Save, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, 
  Send, Phone, Settings, Sparkles, Sliders, CheckCircle, Clock, 
  Layers, Lock, AlertCircle, Info, Radio
} from 'lucide-react';
import { motion } from 'motion/react';

interface WhatsAppSettingsModalProps {
  onClose: () => void;
  onSaved?: () => void;
}

export default function WhatsAppSettingsModal({ onClose, onSaved }: WhatsAppSettingsModalProps) {
  const [settings, setSettings] = useState<WhatsAppSettings>(DEFAULT_WHATSAPP_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingPrimary, setTestingPrimary] = useState(false);
  const [testingContingency, setTestingContingency] = useState(false);
  const [primaryTestResult, setPrimaryTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [contingencyTestResult, setContingencyTestResult] = useState<{ connected: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const s = await NotificationQueueService.getSettings();
        setSettings(s);
      } catch (err) {
        console.error('Erro ao carregar configurações:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleTestPrimary = async () => {
    setTestingPrimary(true);
    setPrimaryTestResult(null);
    try {
      const res = await UazapiService.checkInstanceStatus(settings.primaryInstance, settings.isTestModeActive && !settings.primaryInstance.token);
      if (res.connected) {
        setPrimaryTestResult({ connected: true, message: 'Conexão estabelecida com sucesso! Instância ativa e pronta.' });
        setSettings(prev => ({
          ...prev,
          primaryInstance: { ...prev.primaryInstance, status: 'connected', lastChecked: new Date().toISOString() }
        }));
      } else {
        setPrimaryTestResult({ connected: false, message: `Desconectada: ${res.error || 'Verifique o Token e URL da UAZAPI'}` });
        setSettings(prev => ({
          ...prev,
          primaryInstance: { ...prev.primaryInstance, status: 'disconnected', lastChecked: new Date().toISOString() }
        }));
      }
    } catch (e: any) {
      setPrimaryTestResult({ connected: false, message: e.message || 'Erro de conexão' });
    } finally {
      setTestingPrimary(false);
    }
  };

  const handleTestContingency = async () => {
    setTestingContingency(true);
    setContingencyTestResult(null);
    try {
      const res = await UazapiService.checkInstanceStatus(settings.contingencyInstance, settings.isTestModeActive && !settings.contingencyInstance.token);
      if (res.connected) {
        setContingencyTestResult({ connected: true, message: 'Instância antiga de contingência online e pronta para alertas!' });
        setSettings(prev => ({
          ...prev,
          contingencyInstance: { ...prev.contingencyInstance, status: 'connected', lastChecked: new Date().toISOString() }
        }));
      } else {
        setContingencyTestResult({ connected: false, message: `Desconectada: ${res.error || 'Verifique o Token e URL'}` });
        setSettings(prev => ({
          ...prev,
          contingencyInstance: { ...prev.contingencyInstance, status: 'disconnected', lastChecked: new Date().toISOString() }
        }));
      }
    } catch (e: any) {
      setContingencyTestResult({ connected: false, message: e.message || 'Erro de conexão' });
    } finally {
      setTestingContingency(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: WhatsAppSettings = {
        ...settings,
        adminAlertPhones: settings.adminAlertPhones.map(p => p.trim()).filter(Boolean),
        testAuthorizedPhones: settings.testAuthorizedPhones.map(p => p.trim()).filter(Boolean),
        updatedAt: serverTimestamp(),
      };

      // Guarantee 2 entries in array structure
      while (payload.adminAlertPhones.length < 2) payload.adminAlertPhones.push('');
      while (payload.testAuthorizedPhones.length < 2) payload.testAuthorizedPhones.push('');

      await setDoc('settings', 'whatsapp_config', payload, { merge: true });
      await logAudit('update_whatsapp_settings', 'settings', 'whatsapp_config', null, payload);

      setSaveSuccess(true);
      setTimeout(() => {
        if (onSaved) onSaved();
        onClose();
      }, 900);
    } catch (err: any) {
      console.error('Erro ao salvar configurações do WhatsApp:', err);
      setError(err.message || 'Falha ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <Settings size={24} className="text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Configurações do WhatsApp (UAZAPI)</h2>
              <p className="text-xs text-emerald-200/90 font-medium">
                Instâncias UAZAPI, Regras de Homologação, Alertas e Parâmetros
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

        {/* Form */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle size={16} className="shrink-0" />
              <span>Configurações salvas com sucesso!</span>
            </div>
          )}

          {/* BANNER DE MODO DE HOMOLOGAÇÃO / TESTE */}
          <div className={`p-4 rounded-2xl border transition-all ${
            settings.isTestModeActive 
              ? 'bg-amber-50/90 border-amber-300 text-amber-900 shadow-2xs' 
              : 'bg-rose-50/90 border-rose-300 text-rose-900 shadow-2xs'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl shrink-0 ${settings.isTestModeActive ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black uppercase tracking-wider">
                      {settings.isTestModeActive ? 'Modo de Homologação (Testes) Ativo' : 'Atenção: Modo de Produção Ativo'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      settings.isTestModeActive ? 'bg-amber-200 text-amber-900' : 'bg-rose-200 text-rose-900'
                    }`}>
                      {settings.isTestModeActive ? 'Seguro' : 'Disparos Reais'}
                    </span>
                  </div>
                  <p className="text-xs font-medium mt-1 leading-relaxed">
                    {settings.isTestModeActive 
                      ? 'Nenhuma mensagem será enviada aos números reais dos inquilinos. Todos os envios são redirecionados para os 2 números autorizados com cabeçalho identificador.'
                      : 'Cuidado! Mensagens serão disparadas para os telefones reais dos inquilinos cadastrados nos contratos ativos.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, isTestModeActive: !prev.isTestModeActive }))}
                  className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm ${
                    settings.isTestModeActive 
                      ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                      : 'bg-rose-600 hover:bg-rose-700 text-white'
                  }`}
                >
                  {settings.isTestModeActive ? 'Alternar p/ Produção' : 'Voltar p/ Modo Homologação'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* INSTÂNCIA PRIMÁRIA */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-emerald-600" />
                  Instância Nova (Cobranças & Clientes)
                </h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  settings.primaryInstance.status === 'connected' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {settings.primaryInstance.status === 'connected' ? 'Online' : 'Desconectada'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">URL Base da API</label>
                <input
                  type="text"
                  value={settings.primaryInstance.url}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    primaryInstance: { ...prev.primaryInstance, url: e.target.value }
                  }))}
                  placeholder="https://api.uazapi.com"
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome / ID da Instância</label>
                  <input
                    type="text"
                    value={settings.primaryInstance.instanceName}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      primaryInstance: { ...prev.primaryInstance, instanceName: e.target.value }
                    }))}
                    placeholder="cobranca_principal"
                    className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Token de Acesso</label>
                  <input
                    type="password"
                    value={settings.primaryInstance.token}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      primaryInstance: { ...prev.primaryInstance, token: e.target.value }
                    }))}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestPrimary}
                  disabled={testingPrimary}
                  className="text-xs font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={testingPrimary ? 'animate-spin' : ''} />
                  {testingPrimary ? 'Testando...' : 'Testar Conexão'}
                </button>
              </div>

              {primaryTestResult && (
                <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  primaryTestResult.connected ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {primaryTestResult.connected ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                  <span>{primaryTestResult.message}</span>
                </div>
              )}
            </div>

            {/* INSTÂNCIA DE CONTINGÊNCIA */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert size={15} className="text-indigo-600" />
                  Instância Antiga (Somente Alertas de Contingência)
                </h3>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  settings.contingencyInstance.status === 'connected' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
                }`}>
                  {settings.contingencyInstance.status === 'connected' ? 'Online' : 'Desconectada'}
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">URL Base da API</label>
                <input
                  type="text"
                  value={settings.contingencyInstance.url}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    contingencyInstance: { ...prev.contingencyInstance, url: e.target.value }
                  }))}
                  placeholder="https://api.uazapi.com"
                  className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Nome / ID da Instância</label>
                  <input
                    type="text"
                    value={settings.contingencyInstance.instanceName}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      contingencyInstance: { ...prev.contingencyInstance, instanceName: e.target.value }
                    }))}
                    placeholder="contingencia_alertas"
                    className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Token de Acesso</label>
                  <input
                    type="password"
                    value={settings.contingencyInstance.token}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      contingencyInstance: { ...prev.contingencyInstance, token: e.target.value }
                    }))}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestContingency}
                  disabled={testingContingency}
                  className="text-xs font-bold text-indigo-700 bg-indigo-100/70 hover:bg-indigo-100 px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={testingContingency ? 'animate-spin' : ''} />
                  {testingContingency ? 'Testando...' : 'Testar Contingência'}
                </button>
              </div>

              {contingencyTestResult && (
                <div className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  contingencyTestResult.connected ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {contingencyTestResult.connected ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
                  <span>{contingencyTestResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* TELEFONES DE TESTE E ADMINISTRADORES */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* TELEFONES DE HOMOLOGAÇÃO (TESTE) */}
            <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Phone size={15} className="text-amber-700" />
                Números Autorizados p/ Modo de Teste
              </h3>
              <p className="text-[11px] text-amber-800 font-medium">
                No Modo de Teste (Homologação), todas as mensagens da régua são enviadas exclusivamente para estes números com etiqueta do inquilino real.
              </p>
              
              <div className="space-y-2">
                {[0, 1, 2].map((idx) => (
                  <div key={`test-phone-${idx}`}>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Número de Teste {idx + 1} {idx === 2 ? '(Opcional)' : ''}
                    </label>
                    <input
                      type="tel"
                      value={settings.testAuthorizedPhones[idx] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettings(prev => {
                          const copy = [...(prev.testAuthorizedPhones || [])];
                          copy[idx] = val;
                          return { ...prev, testAuthorizedPhones: copy };
                        });
                      }}
                      placeholder={idx === 0 ? '(47) 99274-4455' : idx === 1 ? '(47) 99652-7367' : '(47) 98834-1417'}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* TELEFONES DE ADMINISTRADORES (ALERTAS) */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <ShieldAlert size={15} className="text-rose-600" />
                Telefones de Administrador (Alertas de Falha)
              </h3>
              <p className="text-[11px] text-slate-600 font-medium">
                Recebem alertas pela instância antiga caso a instância principal desconecte ou falhe criticamente no envio.
              </p>

              <div className="space-y-2">
                {[0, 1, 2].map((idx) => (
                  <div key={`admin-phone-${idx}`}>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Administrador {idx + 1} {idx === 2 ? '(Opcional)' : ''}
                    </label>
                    <input
                      type="tel"
                      value={settings.adminAlertPhones[idx] || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSettings(prev => {
                          const copy = [...(prev.adminAlertPhones || [])];
                          copy[idx] = val;
                          return { ...prev, adminAlertPhones: copy };
                        });
                      }}
                      placeholder={idx === 0 ? '(47) 99274-4455' : idx === 1 ? '(47) 99652-7367' : '(47) 98834-1417'}
                      className="w-full px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-slate-500 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PARÂMETROS DA RÉGUA DE COBRANÇA */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Sliders size={15} className="text-emerald-600" />
              Parâmetros de Cálculo & Janela de Envio
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Multa Única Pós-Vencimento</label>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={settings.finePercent}
                    onChange={(e) => setSettings(prev => ({ ...prev, finePercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full text-xs font-bold outline-none"
                  />
                  <span className="text-xs font-bold text-slate-400">%</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Juros ao Mês (Pro-Rata Dia)</label>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <input
                    type="number"
                    step="0.1"
                    value={settings.monthlyInterestPercent}
                    onChange={(e) => setSettings(prev => ({ ...prev, monthlyInterestPercent: parseFloat(e.target.value) || 0 }))}
                    className="w-full text-xs font-bold outline-none"
                  />
                  <span className="text-xs font-bold text-slate-400">% a.m.</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Carência Taxas Variáveis</label>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <input
                    type="number"
                    value={settings.variableChargesDebounceMinutes}
                    onChange={(e) => setSettings(prev => ({ ...prev, variableChargesDebounceMinutes: parseInt(e.target.value) || 0 }))}
                    className="w-full text-xs font-bold outline-none"
                  />
                  <span className="text-xs font-bold text-slate-400">min</span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Janela de Envio Automático</label>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
                  <Clock size={13} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-700">08:00 às 09:00 (Seg-Sáb)</span>
                </div>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-700/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
