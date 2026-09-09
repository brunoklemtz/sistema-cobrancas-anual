import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase não configurado (URL/KEY).');
  }
  return createClient(url, key);
}

/** Link fixo — apenas metadados do formulário. */
export async function handleIntakeGet(_token?: string) {
  return {
    status: 200,
    json: {
      mode: 'fixed',
      title: 'Ficha do locatário',
      message: 'Preencha seus dados. O locador vinculará o imóvel depois.',
    },
  };
}

/** Recebe ficha no link fixo e grava em contract_intakes. */
export async function handleIntakePost(_token: string | undefined, body: any) {
  const name = String(body?.tenantName || '').trim();
  const cpf = String(body?.tenantCpf || '').trim();
  const phone = String(body?.tenantPhone || '').trim();
  const email = String(body?.tenantEmail || '').trim();
  const address = String(body?.tenantAddress || '').trim();
  const truthCheck = Boolean(body?.truthCheck);
  const docFileData = String(body?.documentFileData || '');
  const docFileType = String(body?.documentFileType || 'image/jpeg');
  const docFileName = String(body?.documentFileName || 'documento-titular.jpg');
  const notes = String(body?.notes || '').trim();

  if (!name || !cpf || !phone || !address) {
    return { status: 400, json: { error: 'Preencha nome, CPF, telefone e endereço.' } };
  }
  if (!truthCheck) {
    return { status: 400, json: { error: 'Confirme a declaração de veracidade.' } };
  }
  if (!docFileData || docFileData.length < 100) {
    return { status: 400, json: { error: 'Envie a foto do documento do titular.' } };
  }

  const additionalOccupants = Array.isArray(body?.additionalOccupants)
    ? body.additionalOccupants
        .map((o: any) => ({
          id: o.id || `occ_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: String(o.name || '').trim(),
          cpf: String(o.cpf || '').trim(),
          phone: String(o.phone || '').trim(),
        }))
        .filter((o: any) => o.name && o.cpf && o.phone)
    : [];

  const idDoc = {
    id: `doc_id_${Date.now()}`,
    name: docFileName,
    fileData: docFileData,
    fileType: docFileType,
    uploadedAt: new Date().toISOString(),
    size: Math.round((docFileData.length * 3) / 4),
  };

  const now = new Date().toISOString();
  const doc = {
    status: 'pending',
    tenantName: name,
    tenantCpf: cpf,
    tenantEmail: email,
    tenantPhone: phone,
    tenantAddress: address,
    additionalOccupants,
    documents: [idDoc],
    notes,
    createdAt: now,
    updatedAt: now,
  };

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('contract_intakes')
    .insert({ doc })
    .select('id')
    .single();

  if (error) {
    return {
      status: 500,
      json: {
        error:
          error.message ||
          'Falha ao salvar. Confira se a tabela contract_intakes existe no Supabase.',
      },
    };
  }

  return {
    status: 200,
    json: {
      ok: true,
      id: (data as any)?.id,
      message: 'Ficha recebida. O locador fará o vínculo com o imóvel.',
    },
  };
}
