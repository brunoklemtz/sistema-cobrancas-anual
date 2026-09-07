import React, { useState, useEffect } from 'react';
import { getDoc, setDoc } from '../lib/db';
import { Settings, OperationType, Tier } from '../types';
import { handleFirestoreError } from '../utils/firestore';
import { X, Save, Droplets, Zap, Plus, Trash2, RotateCcw, ArrowUpDown, Database } from 'lucide-react';
import BackupRestoreModal from './BackupRestoreModal';

interface SettingsFormProps {
  onClose: () => void;
}

const DEFAULT_WATER_TIERS: Tier[] = [
  { min: 5, max: 10, rate: 12.85 },
  { min: 10, max: 15, rate: 14.47 },
  { min: 15, max: 20, rate: 24.45 },
  { min: 20, max: 25, rate: 24.99 },
  { min: 25, max: null, rate: 24.62 },
];

const DEFAULT_ELECTRICITY_TIERS: Tier[] = [
  { min: 0, max: null, rate: 0.88 },
];

export default function SettingsForm({ onClose }: SettingsFormProps) {
  const [waterBasePrice, setWaterBasePrice] = useState('56.00');
  const [waterBaseLimit, setWaterBaseLimit] = useState('5');
  const [waterTiers, setWaterTiers] = useState<Tier[]>(DEFAULT_WATER_TIERS);
  
  const [electricityBasePrice, setElectricityBasePrice] = useState('0.00');
  const [electricityBaseLimit, setElectricityBaseLimit] = useState('0');
  const [electricityTiers, setElectricityTiers] = useState<Tier[]>(DEFAULT_ELECTRICITY_TIERS);
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showBackupModal, setShowBackupModal] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc('settings', 'global');
        if (docSnap) {
          const data = docSnap as unknown as Settings;
          setWaterBasePrice(data.waterBasePrice.toString());
          setWaterBaseLimit(data.waterBaseLimit.toString());
          setWaterTiers(data.waterTiers || []);
          setElectricityBasePrice(data.electricityBasePrice.toString());
          setElectricityBaseLimit(data.electricityBaseLimit.toString());
          setElectricityTiers(data.electricityTiers || []);
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setFetching(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const path = 'settings/global';

    const parseValue = (val: string) => {
      // Replace comma with dot for internationalization (Brazil uses comma)
      const sanitized = val.replace(',', '.');
      return parseFloat(sanitized) || 0;
    };

    const parseField = (val: any) => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      return parseFloat(val.toString().replace(',', '.')) || 0;
    };

    try {
      await setDoc('settings', 'global', {
        waterBasePrice: parseValue(waterBasePrice),
        waterBaseLimit: parseValue(waterBaseLimit),
        waterTiers: [...waterTiers]
          .map(t => ({ 
            ...t, 
            min: parseField(t.min),
            max: t.max === null || t.max === '' ? null : parseField(t.max),
            rate: parseField(t.rate)
          }))
          .sort((a, b) => a.min - b.min),
        electricityBasePrice: parseValue(electricityBasePrice),
        electricityBaseLimit: parseValue(electricityBaseLimit),
        electricityTiers: [...electricityTiers]
          .map(t => ({ 
            ...t, 
            min: parseField(t.min),
            max: t.max === null || t.max === '' ? null : parseField(t.max),
            rate: parseField(t.rate)
          }))
          .sort((a, b) => a.min - b.min),
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    } finally {
      setLoading(false);
    }
  };

  const addTier = (type: 'water' | 'electricity') => {
    const newTier: Tier = { min: 0, max: null, rate: 0 };
    if (type === 'water') setWaterTiers([...waterTiers, newTier]);
    else setElectricityTiers([...electricityTiers, newTier]);
  };

  const removeTier = (type: 'water' | 'electricity', index: number) => {
    if (type === 'water') setWaterTiers(waterTiers.filter((_, i) => i !== index));
    else setElectricityTiers(electricityTiers.filter((_, i) => i !== index));
  };

  const sortTiers = (type: 'water' | 'electricity') => {
    const parseVal = (val: any) => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      return parseFloat(val.toString().replace(',', '.')) || 0;
    };

    if (type === 'water') {
      const sorted = [...waterTiers].sort((a, b) => parseVal(a.min) - parseVal(b.min));
      setWaterTiers(sorted);
    } else {
      const sorted = [...electricityTiers].sort((a, b) => parseVal(a.min) - parseVal(b.min));
      setElectricityTiers(sorted);
    }
  };

  const updateTier = (type: 'water' | 'electricity', index: number, field: keyof Tier, value: string) => {
    const tiers = type === 'water' ? [...waterTiers] : [...electricityTiers];
    // Keep as string for input handling, parse on submit
    (tiers[index] as any)[field] = value === '' ? null : value;
    if (type === 'water') setWaterTiers(tiers);
    else setElectricityTiers(tiers);
  };

  if (fetching) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl my-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Configurações de Tarifas</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Water Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-blue-600 font-semibold">
                <Droplets size={20} />
                <h3>Tarifa de Água</h3>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (window.confirm('Deseja restaurar as tarifas de água para os valores padrão?')) {
                    setWaterBasePrice('56.00');
                    setWaterBaseLimit('5');
                    setWaterTiers(DEFAULT_WATER_TIERS);
                  }
                }}
                className="text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} />
                Restaurar Padrões
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Preço Base (Mínimo)</label>
                <input
                  type="text" inputMode="decimal" value={waterBasePrice}
                  onChange={(e) => setWaterBasePrice(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Valor fixo cobrado mesmo sem consumo.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Limite Base (m³)</label>
                <input
                  type="text" inputMode="decimal" value={waterBaseLimit}
                  onChange={(e) => setWaterBaseLimit(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Consumo incluso no preço base.</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Faixas Adicionais</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => sortTiers('water')} className="text-gray-400 text-[10px] uppercase font-bold flex items-center gap-1 hover:text-blue-600 transition-colors">
                    <ArrowUpDown size={12} /> Ordenar
                  </button>
                  <button type="button" onClick={() => addTier('water')} className="text-blue-600 text-xs flex items-center gap-1 hover:underline font-medium">
                    <Plus size={14} /> Adicionar Faixa
                  </button>
                </div>
              </div>
              
              {waterTiers.map((tier, index) => (
                <div key={index} className="grid grid-cols-4 gap-2 items-end bg-gray-50 p-3 rounded-xl">
                  <div>
                    <label className="block text-[10px] text-gray-400">De (m³)</label>
                    <input
                      type="text" inputMode="decimal" value={tier.min}
                      onChange={(e) => updateTier('water', index, 'min', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Até (m³)</label>
                    <input
                      type="text" inputMode="decimal" value={tier.max || ''}
                      onChange={(e) => updateTier('water', index, 'max', e.target.value)}
                      placeholder="∞"
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Valor/m³</label>
                    <input
                      type="text" inputMode="decimal" value={tier.rate}
                      onChange={(e) => updateTier('water', index, 'rate', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <button type="button" onClick={() => removeTier('water', index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Electricity Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-yellow-600 font-semibold">
                <Zap size={20} />
                <h3>Tarifa de Luz</h3>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  if (window.confirm('Deseja restaurar as tarifas de luz para os valores padrão?')) {
                    setElectricityBasePrice('0.00');
                    setElectricityBaseLimit('0');
                    setElectricityTiers(DEFAULT_ELECTRICITY_TIERS);
                  }
                }}
                className="text-[10px] uppercase tracking-widest font-bold text-slate-400 hover:text-yellow-600 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} />
                Restaurar Padrões
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Preço Base</label>
                <input
                  type="text" inputMode="decimal" value={electricityBasePrice}
                  onChange={(e) => setElectricityBasePrice(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Deixe em 0,00 se cobrar apenas por kWh.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Limite Base</label>
                <input
                  type="text" inputMode="decimal" value={electricityBaseLimit}
                  onChange={(e) => setElectricityBaseLimit(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Consumo incluso no preço base.</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Faixas Adicionais</span>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => sortTiers('electricity')} className="text-gray-400 text-[10px] uppercase font-bold flex items-center gap-1 hover:text-yellow-600 transition-colors">
                    <ArrowUpDown size={12} /> Ordenar
                  </button>
                  <button type="button" onClick={() => addTier('electricity')} className="text-yellow-600 text-xs flex items-center gap-1 hover:underline font-medium">
                    <Plus size={14} /> Adicionar Faixa
                  </button>
                </div>
              </div>
              
              {electricityTiers.map((tier, index) => (
                <div key={index} className="grid grid-cols-4 gap-2 items-end bg-gray-50 p-3 rounded-xl">
                  <div>
                    <label className="block text-[10px] text-gray-400">De</label>
                    <input
                      type="text" inputMode="decimal" value={tier.min}
                      onChange={(e) => updateTier('electricity', index, 'min', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Até</label>
                    <input
                      type="text" inputMode="decimal" value={tier.max || ''}
                      onChange={(e) => updateTier('electricity', index, 'max', e.target.value)}
                      placeholder="∞"
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400">Valor/unid</label>
                    <input
                      type="text" inputMode="decimal" value={tier.rate}
                      onChange={(e) => updateTier('electricity', index, 'rate', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg"
                    />
                  </div>
                  <button type="button" onClick={() => removeTier('electricity', index)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between border-t pt-4 mt-2 gap-4">
            <button
              type="button"
              onClick={() => setShowBackupModal(true)}
              className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer w-full sm:w-auto justify-center"
            >
              <Database size={16} />
              <span>Backup / Importar Dados JSON</span>
            </button>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              <div className="text-[9px] text-slate-400 font-mono hidden md:block">
                DB: Supabase
              </div>
              <button
                disabled={loading}
                type="submit"
                className="px-8 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100 w-full sm:w-auto"
              >
                <Save size={18} />
                {loading ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showBackupModal && (
        <BackupRestoreModal
          onClose={() => setShowBackupModal(false)}
          onRefreshData={() => window.location.reload()}
        />
      )}
    </div>
  );
}
