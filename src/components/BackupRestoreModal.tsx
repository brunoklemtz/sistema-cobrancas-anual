import React, { useState } from 'react';
import { getDocs, setDoc, Timestamp } from '../lib/db';

import { X, Download, Upload, Database, FileJson, CheckCircle2, AlertTriangle, RefreshCw, FileText, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface BackupRestoreModalProps {
  onClose: () => void;
  onRefreshData?: () => void;
}

export default function BackupRestoreModal({ onClose, onRefreshData }: BackupRestoreModalProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{ properties: number; condominiums: number; billings: number } | null>(null);

  // Helper to convert date values (legacy Firestore Timestamps or ISO) to JSON serializable structures
  const convertTimestampsToJSON = (data: any): any => {
    if (!data || typeof data !== 'object') return data;

    // Check if it's a Firestore Timestamp or object with seconds/nanoseconds
    if (typeof data.toDate === 'function') {
      return { __type: 'Timestamp', iso: data.toDate().toISOString() };
    }
    if (data.seconds !== undefined && data.nanoseconds !== undefined && typeof data.seconds === 'number') {
      return { __type: 'Timestamp', iso: new Date(data.seconds * 1000).toISOString() };
    }

    if (Array.isArray(data)) {
      return data.map(item => convertTimestampsToJSON(item));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = convertTimestampsToJSON(value);
    }
    return result;
  };

  // Helper to restore JSON structures back into ISO date strings (db Timestamp)
  const convertJSONToTimestamps = (data: any): any => {
    if (!data || typeof data !== 'object') return data;

    if (data.__type === 'Timestamp' && data.iso) {
      return Timestamp.fromDate(new Date(data.iso));
    }

    if (Array.isArray(data)) {
      return data.map(item => convertJSONToTimestamps(item));
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Auto-detect ISO date strings for common date fields
      if (typeof value === 'string' && (key.toLowerCase().includes('date') || key === 'paidAt' || key === 'createdAt' || key === 'updatedAt')) {
        const parsedDate = new Date(value);
        if (!isNaN(parsedDate.getTime()) && value.length >= 10 && (value.includes('-') || value.includes('T'))) {
          result[key] = Timestamp.fromDate(parsedDate);
          continue;
        }
      }
      result[key] = convertJSONToTimestamps(value);
    }
    return result;
  };

  const handleExportBackup = async () => {
    setExporting(true);
    setError(null);
    setExportSuccess(null);

    try {
      // 1. Fetch properties
      const propsSnap = await getDocs('properties');
      const properties = propsSnap.map(({ id, ...rest }) => ({
        id,
        ...convertTimestampsToJSON(rest)
      }));

      // 2. Fetch condominiums
      const condosSnap = await getDocs('condominiums');
      const condominiums = condosSnap.map(({ id, ...rest }) => ({
        id,
        ...convertTimestampsToJSON(rest)
      }));

      // 3. Fetch billings
      const billingsSnap = await getDocs('billings');
      const billings = billingsSnap.map(({ id, ...rest }) => ({
        id,
        ...convertTimestampsToJSON(rest)
      }));

      // 4. Fetch global settings
      const settingsSnap = await getDocs('settings');
      const settings = settingsSnap.map(({ id, ...rest }) => ({
        id,
        ...convertTimestampsToJSON(rest)
      }));

      const backupData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        appName: 'Gestao Billing',
        counts: {
          properties: properties.length,
          condominiums: condominiums.length,
          billings: billings.length,
          settings: settings.length
        },
        data: {
          properties,
          condominiums,
          billings,
          settings
        }
      };

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.setAttribute('download', `backup_gestao_billing_${dateStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccess(`Backup concluído! Exportados: ${properties.length} imóveis, ${condominiums.length} condomínios e ${billings.length} cobranças.`);
    } catch (err: any) {
      console.error('Error exporting backup:', err);
      setError('Falha ao exportar backup: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setImportSuccess(null);
    setImportStats(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (!parsed.data || (!parsed.data.properties && !parsed.data.billings && !parsed.data.condominiums)) {
          throw new Error('Arquivo de backup inválido ou em formato incompatível.');
        }

        setImporting(true);

        let importedProps = 0;
        let importedCondos = 0;
        let importedBillings = 0;

        // 1. Restore Properties
        if (Array.isArray(parsed.data.properties)) {
          for (const item of parsed.data.properties) {
            const { id, ...itemData } = item;
            if (id) {
              const restoredData = convertJSONToTimestamps(itemData);
              await setDoc('properties', id, restoredData, { merge: true });
              importedProps++;
            }
          }
        }

        // 2. Restore Condominiums
        if (Array.isArray(parsed.data.condominiums)) {
          for (const item of parsed.data.condominiums) {
            const { id, ...itemData } = item;
            if (id) {
              const restoredData = convertJSONToTimestamps(itemData);
              await setDoc('condominiums', id, restoredData, { merge: true });
              importedCondos++;
            }
          }
        }

        // 3. Restore Billings
        if (Array.isArray(parsed.data.billings)) {
          for (const item of parsed.data.billings) {
            const { id, ...itemData } = item;
            if (id) {
              const restoredData = convertJSONToTimestamps(itemData);
              await setDoc('billings', id, restoredData, { merge: true });
              importedBillings++;
            }
          }
        }

        // 4. Restore Settings
        if (Array.isArray(parsed.data.settings)) {
          for (const item of parsed.data.settings) {
            const { id, ...itemData } = item;
            if (id) {
              const restoredData = convertJSONToTimestamps(itemData);
              await setDoc('settings', id, restoredData, { merge: true });
            }
          }
        }

        setImportStats({
          properties: importedProps,
          condominiums: importedCondos,
          billings: importedBillings
        });

        setImportSuccess(`Importação concluída com sucesso! ${importedProps} imóveis, ${importedCondos} condomínios e ${importedBillings} cobranças restaurados.`);
        
        if (onRefreshData) {
          onRefreshData();
        }
      } catch (err: any) {
        console.error('Error importing backup:', err);
        setError('Erro ao importar arquivo: ' + (err.message || 'Arquivo corrompido ou formato inválido.'));
      } finally {
        setImporting(false);
        // Reset file input
        e.target.value = '';
      }
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-[36px] w-full max-w-2xl p-8 shadow-2xl border border-slate-100 my-8"
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-indigo-600 p-3 rounded-2xl text-white shadow-md shadow-blue-200">
              <Database size={24} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Backup e Exportação dos Dados</h2>
              <p className="text-xs font-semibold text-slate-400">Exporte ou importe todos os lançamentos e configurações para o Remix</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="py-6 space-y-6">
          {/* Section 1: Export Data */}
          <div className="p-6 bg-slate-50 border border-slate-200/60 rounded-3xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                  Passo 1: Baixar Dados do Banco
                </span>
                <h3 className="text-base font-black text-slate-900 pt-1">Exportar arquivo de Backup (.JSON)</h3>
                <p className="text-xs font-medium text-slate-500 leading-relaxed">
                  Gera um arquivo contendo todos os cadastros de <strong className="text-slate-800">Imóveis</strong>, <strong className="text-slate-800">Condomínios</strong>, <strong className="text-slate-800">Cobranças/Histórico</strong> e <strong className="text-slate-800">Tarifas</strong>.
                </p>
              </div>
              <FileJson size={36} className="text-blue-500 shrink-0" />
            </div>

            <button
              onClick={handleExportBackup}
              disabled={exporting}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3.5 px-6 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 disabled:opacity-50 cursor-pointer"
            >
              {exporting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Gerando Backup JSON...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Baixar Backup de Dados (.json)
                </>
              )}
            </button>

            {exportSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{exportSuccess}</span>
              </div>
            )}
          </div>

          {/* Section 2: Import Data */}
          <div className="p-6 bg-amber-50/50 border border-amber-200/60 rounded-3xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200">
                  Passo 2: Restaurar ou Subir no Remix
                </span>
                <h3 className="text-base font-black text-slate-900 pt-1">Importar arquivo de Backup (.JSON)</h3>
                <p className="text-xs font-medium text-slate-600 leading-relaxed">
                  Se você abriu uma nova versão ou remix do aplicativo, selecione o arquivo <strong className="text-slate-900">.json</strong> baixado no Passo 1 para restaurar todos os seus dados instantaneamente.
                </p>
              </div>
              <Upload size={36} className="text-amber-600 shrink-0" />
            </div>

            <label className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3.5 px-6 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-100 cursor-pointer text-center">
              {importing ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Importando Lançamentos...
                </>
              ) : (
                <>
                  <Upload size={18} />
                  Selecionar e Importar Arquivo Backup (.json)
                </>
              )}
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                disabled={importing}
                className="hidden"
              />
            </label>

            {importSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>{importSuccess}</span>
              </div>
            )}
          </div>

          {/* Section 3: Remixt & Source Code Info */}
          <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl space-y-3 shadow-md">
            <div className="flex items-center gap-2 text-indigo-300 font-extrabold text-xs uppercase tracking-wider">
              <Sparkles size={16} />
              <span>Como exportar os Códigos/Arquivos da Aplicação</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Para baixar o código-fonte completo deste projeto (arquivos React, Vite e CSS) para utilizar no seu computador ou no GitHub/Remix:
            </p>
            <ul className="text-xs text-slate-200 space-y-1.5 font-medium list-disc list-inside bg-white/5 p-3 rounded-2xl border border-white/10">
              <li>Clique no menu superior do AI Studio (ícone de engrenagem ou menu de opções do applet).</li>
              <li>Selecione <strong className="text-amber-300">"Export"</strong> ou <strong className="text-amber-300">"Download ZIP"</strong> ou <strong className="text-amber-300">"Export to GitHub"</strong>.</li>
              <li>Após subir o código em uma nova versão, utilize o botão de **Importar Backup** acima para carregar todos os seus dados salvos!</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-100 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
