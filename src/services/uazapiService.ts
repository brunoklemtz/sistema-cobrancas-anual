import { InstanceConfig, WhatsAppMessageStatus } from '../types';

export interface SendMessageResult {
  success: boolean;
  status: WhatsAppMessageStatus;
  messageId?: string;
  error?: string;
  data?: any;
}

export class UazapiService {
  /**
   * Cleans phone number to digits only, ensuring country code 55 for Brazil if missing
   */
  static cleanPhone(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }
    return digits;
  }

  /**
   * Formats a phone string for user-friendly UI display: (XX) XXXXX-XXXX
   */
  static formatPhoneDisplay(raw: string): string {
    const digits = (raw || '').replace(/\D/g, '');
    if (!digits) return '';

    // Handle 55 prefix
    const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;

    if (local.length === 11) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
    if (local.length >= 8) {
      return `${local.slice(0, 5)}-${local.slice(5)}`;
    }
    return raw;
  }

  /**
   * Checks if an instance is connected
   */
  static async checkInstanceStatus(
    instance: InstanceConfig,
    simulate = false
  ): Promise<{ connected: boolean; status: 'connected' | 'disconnected' | 'unknown'; details?: any; error?: string }> {
    try {
      if (simulate) {
        return { connected: true, status: 'connected', details: { mode: 'simulated' } };
      }

      if (!instance.token) {
        return { connected: false, status: 'disconnected', error: 'Token não configurado' };
      }

      const response = await fetch('/api/uazapi/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: instance.url,
          instanceName: instance.instanceName,
          token: instance.token,
          simulate,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { connected: false, status: 'disconnected', error: `HTTP ${response.status}: ${errText}` };
      }

      const data = await response.json();
      return {
        connected: data.status === 'connected',
        status: data.status === 'connected' ? 'connected' : 'disconnected',
        details: data.details,
      };
    } catch (err: any) {
      return {
        connected: false,
        status: 'disconnected',
        error: err.message || 'Erro de conexão',
      };
    }
  }

  /**
   * Sends a text message through the backend proxy to protect tokens
   */
  static async sendTextMessage(params: {
    instance: InstanceConfig;
    number: string;
    text: string;
    simulate?: boolean;
    simulateResult?: WhatsAppMessageStatus;
  }): Promise<SendMessageResult> {
    const { instance, number, text, simulate = false, simulateResult } = params;

    const cleanNum = this.cleanPhone(number);
    if (!cleanNum) {
      return {
        success: false,
        status: 'falhou',
        error: 'Número de telefone inválido.',
      };
    }

    try {
      const response = await fetch('/api/uazapi/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: instance.url,
          instanceName: instance.instanceName,
          token: instance.token,
          number: cleanNum,
          text,
          simulate,
          simulateResult,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return {
          success: true,
          status: data.status || 'enviada',
          messageId: data.messageId,
          data: data.data,
        };
      } else {
        return {
          success: false,
          status: 'falhou',
          error: data.error || 'Erro ao enviar mensagem via UAZAPI',
        };
      }
    } catch (err: any) {
      return {
        success: false,
        status: 'falhou',
        error: err.message || 'Falha de rede ao conectar com a UAZAPI',
      };
    }
  }

  /**
   * Convenience alias for sending text message
   */
  static async sendMessage(
    instance: InstanceConfig,
    number: string,
    text: string,
    simulate = false
  ): Promise<SendMessageResult> {
    return this.sendTextMessage({
      instance,
      number,
      text,
      simulate,
    });
  }

  /**
   * Triggers contingency alert via the old / backup instance to the 2 admin numbers
   */
  static async sendContingencyAlert(params: {
    contingencyInstance: InstanceConfig;
    adminPhones: string[];
    alertMessage: string;
    reason: string;
  }): Promise<{ success: boolean; results: any[]; error?: string }> {
    try {
      const response = await fetch('/api/uazapi/contingency-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const data = await response.json();
      return {
        success: response.ok,
        results: data.results || [],
        error: data.error,
      };
    } catch (err: any) {
      return {
        success: false,
        results: [],
        error: err.message || 'Falha ao enviar alerta de contingência',
      };
    }
  }
}
