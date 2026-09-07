export function cleanPhoneNumber(raw: string): string {
  let clean = (raw || '').replace(/\D/g, '');
  if (clean.length === 10 || clean.length === 11) {
    clean = `55${clean}`;
  }
  return clean;
}

export function normalizeBaseUrl(url?: string): string {
  let base = (url || 'https://api.uazapi.com').trim();
  if (base.endsWith('/')) {
    base = base.slice(0, -1);
  }
  return base;
}

export async function handleUazapiSend(body: any) {
  const { url, instanceName, token, number, text, simulate, simulateResult } = body || {};

  if (!number || !text) {
    return { status: 400, json: { error: 'Número e mensagem de texto são obrigatórios.' } };
  }

  if (simulate) {
    console.log(`[SIMULATION] Sending message to ${number}: ${String(text).substring(0, 60)}...`);
    if (simulateResult === 'falhou') {
      return {
        status: 500,
        json: {
          success: false,
          error: 'Simulação de falha de envio na UAZAPI',
          status: 'falhou',
        },
      };
    }
    return {
      status: 200,
      json: {
        success: true,
        status: simulateResult || 'enviada',
        messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  if (!token) {
    return { status: 400, json: { error: 'Token da instância UAZAPI não configurado.' } };
  }

  const cleanPhone = cleanPhoneNumber(number);
  const baseUrl = normalizeBaseUrl(url);

  const candidateEndpoints = [
    `${baseUrl}/send/text`,
    `${baseUrl}/message/sendText`,
    `${baseUrl}/message/sendText/${encodeURIComponent(instanceName || '')}`,
    `${baseUrl}/message/text`,
    `${baseUrl}/api/send-message`,
    `${baseUrl}/sendText`,
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    token: token,
    apikey: token,
    'Client-Token': token,
    Authorization: `Bearer ${token}`,
  };

  if (instanceName) {
    headers['instance'] = instanceName;
  }

  const bodyPayloads = [
    { number: cleanPhone, text },
    { number: cleanPhone, body: text, message: text },
    { number: cleanPhone, message: text },
    { phone: cleanPhone, message: text },
    { to: cleanPhone, message: text },
  ];

  let lastError: any = null;
  let responseData: any = null;
  let success = false;

  for (const endpoint of candidateEndpoints) {
    for (const payload of bodyPayloads) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          responseData = await resp.json().catch(() => ({ status: 'enviada' }));
          success = true;
          break;
        } else {
          const errText = await resp.text().catch(() => '');
          lastError = `HTTP ${resp.status}: ${errText}`;
        }
      } catch (e: any) {
        lastError = e.message || 'Erro de conexão';
      }
    }
    if (success) break;
  }

  if (success) {
    const messageId =
      responseData?.key?.id ||
      responseData?.id ||
      responseData?.messageId ||
      `uaz_${Date.now()}`;
    return {
      status: 200,
      json: {
        success: true,
        status: 'enviada',
        messageId,
        data: responseData,
      },
    };
  }

  return {
    status: 502,
    json: {
      success: false,
      error: `Falha ao enviar via UAZAPI: ${lastError || 'Servidor indisponível'}`,
      status: 'falhou',
    },
  };
}

export async function handleUazapiStatus(body: any) {
  const { url, instanceName, token, simulate } = body || {};

  if (simulate) {
    return {
      status: 200,
      json: {
        success: true,
        status: 'connected',
        details: { instance: instanceName || 'simulated_instance', state: 'open' },
      },
    };
  }

  if (!token) {
    return {
      status: 200,
      json: { success: false, status: 'disconnected', error: 'Token não configurado' },
    };
  }

  const baseUrl = normalizeBaseUrl(url);
  const endpoints = [
    `${baseUrl}/instance/status`,
    `${baseUrl}/instance/connectionState`,
    `${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName || '')}`,
    `${baseUrl}/instance/info`,
    `${baseUrl}/status`,
    `${baseUrl}/info`,
  ];

  const headers: Record<string, string> = {
    token,
    apikey: token,
    'Client-Token': token,
    Authorization: `Bearer ${token}`,
  };

  let connected = false;
  let details: any = null;

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, { method: 'GET', headers });
      if (resp.ok) {
        details = await resp.json().catch(() => ({}));
        const state = (
          details?.instance?.state ||
          details?.state ||
          details?.status ||
          ''
        ).toLowerCase();
        if (state === 'open' || state === 'connected' || state === 'ready' || resp.status === 200) {
          connected = true;
          break;
        }
      }
    } catch {
      // continue
    }
  }

  return {
    status: 200,
    json: {
      success: true,
      status: connected ? 'connected' : 'disconnected',
      details,
    },
  };
}

export async function handleContingencyAlert(body: any) {
  const { contingencyInstance, adminPhones, alertMessage, reason } = body || {};

  if (!adminPhones || !Array.isArray(adminPhones) || adminPhones.length === 0) {
    return { status: 400, json: { error: 'Nenhum número de administrador fornecido.' } };
  }

  const results = [];
  const token = contingencyInstance?.token;
  const baseUrl = normalizeBaseUrl(contingencyInstance?.url);

  for (const phone of adminPhones) {
    if (!phone) continue;
    const cleanPhone = cleanPhoneNumber(phone);
    const textPayload = `🚨 [ALERTA DE CONTINGÊNCIA IMOBILIÁRIO]\n\n${alertMessage}\n\nMotivo: ${reason || 'Falha na Instância Principal'}\nHorário: ${new Date().toLocaleString('pt-BR')}`;

    if (!token) {
      console.log(`[CONTINGENCY ALERT SIMULATION] To: ${cleanPhone} | ${textPayload}`);
      results.push({ phone: cleanPhone, status: 'simulated_sent' });
      continue;
    }

    try {
      const resp = await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token,
          apikey: token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ number: cleanPhone, text: textPayload }),
      });

      results.push({
        phone: cleanPhone,
        status: resp.ok ? 'sent' : 'failed',
        statusCode: resp.status,
      });
    } catch (e: any) {
      results.push({
        phone: cleanPhone,
        status: 'failed',
        error: e.message,
      });
    }
  }

  return { status: 200, json: { success: true, results } };
}
