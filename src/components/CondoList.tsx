import React, { useState, useMemo } from 'react';
import { Condominium, Property, BillingRecord, OperationType } from '../types';
import { deleteDoc } from '../lib/db';
import { handleFirestoreError } from '../utils/firestore';
import { 
  Building2, Plus, Edit2, Trash2, MapPin, User, Phone, FileText, 
  Home, Search, AlertCircle, CheckCircle, ChevronRight, Percent
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CondoFormModal from './CondoFormModal';
import CondoRentReportModal from './CondoRentReportModal';

interface CondoListProps {
  condominiums: Condominium[];
  properties: Property[];
  billings: BillingRecord[];
  isAdmin: boolean;
}

export default function CondoList({ condominiums, properties, billings, isAdmin }: CondoListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCondo, setSelectedCondo] = useState<Condominium | null>(null);
  const [condoToDelete, setCondoToDelete] = useState<Condominium | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Report Modal States
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportInitialCondo, setReportInitialCondo] = useState<string>('all');
  const [reportInitialTab, setReportInitialTab] = useState<'general' | 'commission'>('general');

  // Map condominium name to linked properties
  const condoPropertiesMap = useMemo(() => {
    const map = new Map<string, Property[]>();
    properties.forEach(p => {
      const name = p.condominium?.trim().toLowerCase();
      if (name) {
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(p);
      }
    });
    return map;
  }, [properties]);

  const filteredCondominiums = useMemo(() => {
    return condominiums.filter(c => {
      const matchName = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchAddress = (c.address || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchSyndic = (c.syndicName || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchName || matchAddress || matchSyndic;
    });
  }, [condominiums, searchTerm]);

  const handleDelete = async () => {
    if (!condoToDelete) return;
    try {
      await deleteDoc('condominiums', condoToDelete.id);
      setCondoToDelete(null);
      setDeleteError(null);
    } catch (err: any) {
      console.error(err);
      setDeleteError('Erro ao excluir condomínio: ' + err.message);
      handleFirestoreError(err, OperationType.DELETE, 'condominiums');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="bg-white p-5 rounded-[28px] border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-600">
            <Building2 size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
              Condomínios Cadastrados
              <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-xs font-bold rounded-full">
                {condominiums.length}
              </span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Gerencie condomínios e vincule seus imóveis para relatórios e cobranças
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
          <div className="relative w-full md:w-56">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Buscar por nome, síndico..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => {
              setReportInitialCondo('all');
              setReportInitialTab('general');
              setIsReportModalOpen(true);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
            title="Gerar relatórios de pagamento e comissões do condomínio"
          >
            <FileText size={16} />
            <span>Relatório por Condomínio</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setSelectedCondo(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs transition-all flex items-center gap-2 shadow-sm hover:shadow-indigo-200 shrink-0 cursor-pointer"
            >
              <Plus size={16} />
              <span>Novo Condomínio</span>
            </button>
          )}
        </div>
      </div>

      {/* Condos Grid */}
      {filteredCondominiums.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-[28px] border border-dashed border-slate-300 space-y-3">
          <Building2 className="mx-auto text-slate-300" size={48} />
          <h3 className="text-base font-bold text-slate-700">
            {searchTerm ? 'Nenhum condomínio encontrado para sua busca.' : 'Nenhum condomínio cadastrado ainda.'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Cadastre os condomínios onde ficam seus imóveis para organizá-los e gerar relatórios financeiros consolidados.
          </p>
          {isAdmin && !searchTerm && (
            <button
              onClick={() => {
                setSelectedCondo(null);
                setIsModalOpen(true);
              }}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-xs transition-all shadow-sm cursor-pointer"
            >
              <Plus size={16} /> Cadastrar Primeiro Condomínio
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCondominiums.map((condo) => {
            const linkedProps = condoPropertiesMap.get(condo.name.trim().toLowerCase()) || [];

            return (
              <motion.div
                key={condo.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Condo Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <Building2 size={22} />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-base leading-snug tracking-tight">
                          {condo.name}
                        </h3>
                        {condo.address && (
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                            <MapPin size={12} className="shrink-0 text-slate-400" />
                            <span className="truncate max-w-[200px]">{condo.address}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setSelectedCondo(condo);
                            setIsModalOpen(true);
                          }}
                          title="Editar Condomínio"
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            setCondoToDelete(condo);
                            setDeleteError(null);
                          }}
                          title="Excluir Condomínio"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Syndic & Contact Info */}
                  {(condo.syndicName || condo.syndicPhone) && (
                    <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 mb-3 text-xs space-y-1">
                      {condo.syndicName && (
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <span>Síndico: <strong className="text-slate-900">{condo.syndicName}</strong></span>
                        </div>
                      )}
                      {condo.syndicPhone && (
                        <div className="flex items-center gap-1.5 font-medium text-slate-600">
                          <Phone size={13} className="text-slate-400 shrink-0" />
                          <span>{condo.syndicPhone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {condo.notes && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3 italic px-1">
                      "{condo.notes}"
                    </p>
                  )}
                </div>

                {/* Linked Properties Section */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
                    <Home size={14} className="text-indigo-600" />
                    <span>{linkedProps.length} {linkedProps.length === 1 ? 'Imóvel' : 'Imóveis'}</span>
                  </div>

                  {linkedProps.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-w-[180px] justify-end">
                      {linkedProps.slice(0, 3).map((p) => (
                        <span 
                          key={p.id}
                          className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md font-extrabold text-[10px] border border-slate-200"
                        >
                          {p.propertyCode}
                        </span>
                      ))}
                      {linkedProps.length > 3 && (
                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md font-bold text-[10px]">
                          +{linkedProps.length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">Nenhum imóvel vinculado</span>
                  )}
                </div>

                {/* Report Action Button */}
                <button
                  onClick={() => {
                    setReportInitialCondo(condo.name);
                    setReportInitialTab('commission');
                    setIsReportModalOpen(true);
                  }}
                  className="mt-3 w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-emerald-200/60"
                  title={`Gerar comissão do síndico (${condo.syndicName || 'Ana'}) para ${condo.name}`}
                >
                  <FileText size={14} className="text-emerald-600" />
                  <span>Relatório & Comissão ({condo.syndicName || 'Síndico'})</span>
                </button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Condo Rent & Commission Report Modal */}
      {isReportModalOpen && (
        <CondoRentReportModal
          billings={billings}
          properties={properties}
          initialCondoName={reportInitialCondo}
          initialTab={reportInitialTab}
          onClose={() => setIsReportModalOpen(false)}
        />
      )}

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <CondoFormModal
            condo={selectedCondo}
            allProperties={properties}
            onClose={() => {
              setIsModalOpen(false);
              setSelectedCondo(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Modal Confirmation Delete */}
      <AnimatePresence>
        {condoToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600">
                <div className="p-3 bg-rose-50 rounded-2xl border border-rose-100">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Excluir Condomínio?</h3>
                  <p className="text-xs text-slate-500">Esta ação não pode ser desfeita.</p>
                </div>
              </div>

              {deleteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  {deleteError}
                </div>
              )}

              <p className="text-xs font-semibold text-slate-600 leading-relaxed">
                Você tem certeza que deseja excluir o condomínio <strong className="text-slate-900">{condoToDelete.name}</strong>?
                {(condoPropertiesMap.get(condoToDelete.name.trim().toLowerCase()) || []).length > 0 && (
                  <span className="block mt-2 text-rose-600 font-bold bg-rose-50 p-2.5 rounded-xl border border-rose-100">
                    Atenção: Existem {(condoPropertiesMap.get(condoToDelete.name.trim().toLowerCase()) || []).length} imóveis vinculados a este condomínio. A exclusão do condomínio não apagará os imóveis.
                  </span>
                )}
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setCondoToDelete(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-sm cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
