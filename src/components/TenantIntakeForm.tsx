import React, { useEffect, useState } from 'react';
import { AdditionalOccupant } from '../types';
import { Plus, Trash2, Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react';

/** Formulário público em link fixo: /ficha */
export default function TenantIntakeForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [tenantName, setTenantName] = useState('');
  const [tenantCpf, setTenantCpf] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [occupantCount, setOccupantCount] = useState(1);
  const [additional, setAdditional] = useState<AdditionalOccupant[]>([]);
  const [truthCheck, setTruthCheck] = useState(false);
  const [documentFileData, setDocumentFileData] = useState('');
  const [documentFileType, setDocumentFileType] = useState('image/jpeg');
  const [documentFileName, setDocumentFileName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch('/api/contract-intake')
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const extra = Math.max(0, occupantCount - 1);
    setAdditional((prev) => {
      const next = [...prev];
      while (next.length < extra) next.push({ name: '', cpf: '', phone: '' });
      return next.slice(0, extra);
    });
  }, [occupantCount]);

  const onFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setError('Arquivo muito grande (máx. 8 MB).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDocumentFileData(String(reader.result || ''));
      setDocumentFileType(file.type || 'image/jpeg');
      setDocumentFileName(file.name || 'documento-titular.jpg');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/contract-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantName,
          tenantCpf,
          tenantPhone,
          tenantEmail,
          tenantAddress,
          additionalOccupants: additional,
          truthCheck,
          documentFileData,
          documentFileType,
          documentFileName: documentFileName || 'documento-titular.jpg',
          notes,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao enviar');
      setOk(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <p className="text-sm font-semibold text-slate-600">Carregando formulário…</p>
      </div>
    );
  }

  if (ok) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 max-w-md w-full text-center">
          <CheckCircle className="mx-auto text-emerald-500 mb-2" size={36} />
          <h1 className="text-lg font-black text-slate-900">Ficha enviada</h1>
          <p className="text-sm text-slate-600 mt-2">
            Recebemos seus dados e a foto do documento. O locador fará o vínculo com o imóvel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-slate-100 py-8 px-4">
      <form
        onSubmit={submit}
        className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden"
      >
        <div className="bg-amber-400 px-5 py-4">
          <div className="flex items-center gap-2 text-amber-950">
            <FileText size={18} />
            <h1 className="font-black text-base">Ficha do locatário</h1>
          </div>
          <p className="text-xs font-semibold text-amber-900/80 mt-1">
            Preencha seus dados. O imóvel será vinculado pelo locador.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Nome completo *</label>
            <input
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">CPF *</label>
              <input
                required
                value={tenantCpf}
                onChange={(e) => setTenantCpf(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp *</label>
              <input
                required
                value={tenantPhone}
                onChange={(e) => setTenantPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">E-mail</label>
            <input
              type="email"
              value={tenantEmail}
              onChange={(e) => setTenantEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Endereço / domicílio *</label>
            <input
              required
              value={tenantAddress}
              onChange={(e) => setTenantAddress(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantas pessoas vão morar? (incluindo você) *
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={occupantCount}
              onChange={(e) => setOccupantCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-28 px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          {additional.map((occ, idx) => (
            <div key={idx} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-slate-700">Ocupante {idx + 2}</p>
                <button
                  type="button"
                  onClick={() => setOccupantCount((c) => Math.max(1, c - 1))}
                  className="text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <input
                required
                placeholder="Nome completo *"
                value={occ.name}
                onChange={(e) => {
                  const next = [...additional];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setAdditional(next);
                }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="CPF *"
                  value={occ.cpf}
                  onChange={(e) => {
                    const next = [...additional];
                    next[idx] = { ...next[idx], cpf: e.target.value };
                    setAdditional(next);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                />
                <input
                  required
                  placeholder="Telefone *"
                  value={occ.phone}
                  onChange={(e) => {
                    const next = [...additional];
                    next[idx] = { ...next[idx], phone: e.target.value };
                    setAdditional(next);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                />
              </div>
            </div>
          ))}

          {occupantCount < 10 && (
            <button
              type="button"
              onClick={() => setOccupantCount((c) => c + 1)}
              className="flex items-center gap-1 text-xs font-bold text-amber-800"
            >
              <Plus size={14} /> Adicionar ocupante
            </button>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Foto do documento do titular * (RG/CNH/passaporte)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-amber-300 rounded-xl p-4 cursor-pointer hover:bg-amber-50">
              <Upload size={20} className="text-amber-700" />
              <span className="text-xs font-semibold text-slate-600">
                {documentFileName || 'Toque para enviar imagem ou PDF'}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
              placeholder="Opcional"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={truthCheck}
              onChange={(e) => setTruthCheck(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              Declaro, sob as penas do art. 299 do Código Penal, que as informações são verdadeiras e
              que o imóvel será usado como residência.
            </span>
          </label>

          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-sm disabled:opacity-60"
          >
            {saving ? 'Enviando…' : 'Enviar ficha'}
          </button>
        </div>
      </form>
    </div>
  );
}
