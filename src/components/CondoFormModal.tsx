import React, { useState, useEffect, useMemo } from 'react';
import { addDoc, updateDoc, serverTimestamp, getDocs } from '../lib/db';
import { Condominium, Property, OperationType } from '../types';
import { handleFirestoreError } from '../utils/firestore';
import { 
  X, Building2, MapPin, User, Phone, FileText, Save, CheckCircle, 
  AlertCircle, Home, Search, Check, Plus
} from 'lucide-react';
import { motion } from 'motion/react';

interface CondoFormModalProps {
  condo?: Condominium | null;
  allProperties?: Property[];
  onClose: () => void;
  onSaved?: (newCondoName: string) => void;
}

export default function CondoFormModal({ condo, allProperties: propsAllProperties, onClose, onSaved }: CondoFormModalProps) {
  const [name, setName] = useState(condo?.name || '');
  const [address, setAddress] = useState(condo?.address || '');
  const [syndicName, setSyndicName] = useState(condo?.syndicName || '');
  const [syndicPhone, setSyndicPhone] = useState(condo?.syndicPhone || '');
  const [notes, setNotes] = useState(condo?.notes || '');
  
  const [propertiesList, setPropertiesList] = useState<Property[]>(propsAllProperties || []);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<Set<string>>(new Set());
  const [propertySearch, setPropertySearch] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Load properties if not provided via props
  useEffect(() => {
    if (propsAllProperties && propsAllProperties.length > 0) {
      setPropertiesList(propsAllProperties);
    } else {
      const fetchProps = async () => {
        try {
          const snap = await getDocs('properties');
          const loaded: Property[] = snap.map(d => d as Property);
          setPropertiesList(loaded);
        } catch (err) {
          console.error('Error fetching properties:', err);
        }
      };
      fetchProps();
    }
  }, [propsAllProperties]);

  // Pre-select properties that belong to this condo
  useEffect(() => {
    setName(condo?.name || '');
    setAddress(condo?.address || '');
    setSyndicName(condo?.syndicName || '');
    setSyndicPhone(condo?.syndicPhone || '');
    setNotes(condo?.notes || '');

    if (condo?.name) {
      const condoNameLower = condo.name.trim().toLowerCase();
      const initialSelected = new Set<string>();
      propertiesList.forEach(p => {
        if ((p.condominium || '').trim().toLowerCase() === condoNameLower) {
          initialSelected.add(p.id);
        }
      });
      setSelectedPropertyIds(initialSelected);
    } else {
      setSelectedPropertyIds(new Set());
    }
  }, [condo, propertiesList]);

  const filteredProperties = useMemo(() => {
    return propertiesList.filter(p => {
      const search = propertySearch.toLowerCase();
      const codeMatch = p.propertyCode.toLowerCase().includes(search);
      const ownerMatch = (p.ownerName || '').toLowerCase().includes(search);
      const condoMatch = (p.condominium || '').toLowerCase().includes(search);
      return codeMatch || ownerMatch || condoMatch;
    });
  }, [propertiesList, propertySearch]);

  const toggleProperty = (id: string) => {
    setSelectedPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedPropertyIds(prev => {
      const next = new Set(prev);
      filteredProperties.forEach(p => next.add(p.id));
      return next;
    });
  };

  const handleDeselectAllFiltered = () => {
    setSelectedPropertyIds(prev => {
      const next = new Set(prev);
      filteredProperties.forEach(p => next.delete(p.id));
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const condoNameClean = name.trim();
    if (!condoNameClean) {
      setError('Por favor, informe o nome do condomínio.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      name: condoNameClean,
      address: address.trim(),
      syndicName: syndicName.trim(),
      syndicPhone: syndicPhone.trim(),
      notes: notes.trim(),
      updatedAt: serverTimestamp(),
    };

    try {
      if (condo?.id) {
        await updateDoc('condominiums', condo.id, payload);
      } else {
        await addDoc('condominiums', {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      // Sync property associations
      const oldCondoNameLower = (condo?.name || '').trim().toLowerCase();
      const updatesPromises: Promise<void>[] = [];

      propertiesList.forEach(prop => {
        const isSelected = selectedPropertyIds.has(prop.id);
        const currentCondoLower = (prop.condominium || '').trim().toLowerCase();

        if (isSelected) {
          // Property is selected to belong to this condo -> update if condo name differs
          if (prop.condominium !== condoNameClean) {
            updatesPromises.push(
              updateDoc('properties', prop.id, { condominium: condoNameClean })
            );
          }
        } else if (condo?.id && currentCondoLower === oldCondoNameLower) {
          // Property was linked to this condo previously, but user unselected it -> remove condo association
          updatesPromises.push(
            updateDoc('properties', prop.id, { condominium: '' })
          );
        }
      });

      if (updatesPromises.length > 0) {
        await Promise.all(updatesPromises);
      }

      setShowSuccess(true);
      setTimeout(() => {
        if (onSaved) onSaved(condoNameClean);
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Erro ao salvar condomínio:', err);
      setError('Erro ao salvar condomínio: ' + (err.message || 'Erro desconhecido'));
      handleFirestoreError(err, condo?.id ? OperationType.UPDATE : OperationType.CREATE, 'condominiums');
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
        className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden my-auto"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
              <Building2 size={24} className="text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                {condo ? 'Editar Condomínio' : 'Novo Condomínio'}
              </h2>
              <p className="text-xs text-indigo-200 font-medium">
                {condo ? 'Atualize as informações e vincule imóveis' : 'Cadastre o condomínio e vincule imóveis'}
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {showSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2">
              <CheckCircle size={16} className="shrink-0" />
              <span>Condomínio e imóveis vinculados salvos com sucesso!</span>
            </div>
          )}

          {/* Nome do Condomínio */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
              <Building2 size={14} className="text-indigo-600" /> Nome do Condomínio *
            </label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Edifício Sol, Residencial Flores"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
            />
          </div>

          {/* Endereço */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
              <MapPin size={14} className="text-indigo-600" /> Endereço / Localização
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Rua 250, nº 100 - Meia Praia"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
            />
          </div>

          {/* Grid: Síndico e Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <User size={14} className="text-indigo-600" /> Síndico / Admin
              </label>
              <input
                type="text"
                value={syndicName}
                onChange={(e) => setSyndicName(e.target.value)}
                placeholder="Ex: Carlos Silva"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
                <Phone size={14} className="text-indigo-600" /> Contato / Telefone
              </label>
              <input
                type="text"
                value={syndicPhone}
                onChange={(e) => setSyndicPhone(e.target.value)}
                placeholder="Ex: (47) 99999-9999"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* VINCULAR IMOVEIS SECAO */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Home size={15} className="text-indigo-600" /> Vincular Imóveis Cadastrados
              </label>
              <span className="text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full">
                {selectedPropertyIds.size} selecionado(s)
              </span>
            </div>

            {/* Search and select buttons */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filtrar imóveis..."
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[11px] font-bold transition-all shrink-0 cursor-pointer"
              >
                Marcar Todos
              </button>
              <button
                type="button"
                onClick={handleDeselectAllFiltered}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[11px] font-bold transition-all shrink-0 cursor-pointer"
              >
                Limpar
              </button>
            </div>

            {/* Properties Selector Checklist */}
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 border border-slate-200/80 rounded-xl bg-white p-2">
              {filteredProperties.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 text-center">Nenhum imóvel encontrado.</p>
              ) : (
                filteredProperties.map((p) => {
                  const isChecked = selectedPropertyIds.has(p.id);
                  const belongsToOtherCondo = p.condominium && p.condominium.trim() && p.condominium.trim().toLowerCase() !== (condo?.name || '').trim().toLowerCase();

                  return (
                    <label
                      key={p.id}
                      onClick={() => toggleProperty(p.id)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isChecked 
                          ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950 font-bold' 
                          : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center transition-colors border ${
                          isChecked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </div>
                        <div>
                          <span className="font-extrabold text-slate-900">{p.propertyCode}</span>
                          <span className="text-slate-500 font-normal ml-2">({p.ownerName})</span>
                        </div>
                      </div>

                      {belongsToOtherCondo && !isChecked && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-semibold">
                          {p.condominium}
                        </span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1.5">
              <FileText size={14} className="text-indigo-600" /> Observações
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Chave de acesso na portaria, dia da reunião de condomínio..."
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm hover:shadow-indigo-200 disabled:opacity-50 cursor-pointer"
            >
              <Save size={16} />
              <span>{loading ? 'Salvando...' : 'Salvar Condomínio'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
