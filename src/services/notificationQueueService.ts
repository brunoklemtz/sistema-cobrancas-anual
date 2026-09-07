import {
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
} from '../lib/db';
import { 
  Property, 
  BillingRecord, 
  WhatsAppQueueItem, 
  WhatsAppTemplate, 
  WhatsAppSettings, 
  WhatsAppMessageStatus,
  WhatsAppMessageType,
  TenantPhone
} from '../types';
import { UazapiService } from './uazapiService';
import { logAudit } from '../utils/auditLogger';
import { parseDate } from '../utils/firestore';
import { isBalanceItem, isDepositItem } from '../utils/billingUtils';
import { format, differenceInDays, startOfDay, addDays, isSunday, getHours, isBefore, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'due_reminder',
    key: 'due_reminder',
    name: 'Lembrete de Vencimento',
    description: 'Enviado no período pré-vencimento ou no dia do vencimento.',
    availableVariables: ['{nome}', '{contrato}', '{imovel}', '{competencia}', '{vencimento}', '{itens}', '{total}', '{saldo}'],
    content: `Olá, *{nome}*! Tudo bem?

Passando para lembrar sobre a cobrança do seu aluguel referente ao imóvel *{imovel}*.

📅 *Vencimento:* {vencimento}
📑 *Competência:* {competencia}

📋 *Detalhamento dos Itens:*
{itens}

💰 *Valor Total:* R$ {total}

Para efetuar o pagamento ou enviar o comprovante, responda a esta mensagem. Caso já tenha efetuado o pagamento, por favor desconsidere este lembrete.`
  },
  {
    id: 'overdue_cadence',
    key: 'overdue_cadence',
    name: 'Cobrança em Atraso (Régua)',
    description: 'Enviado periodicamente após o vencimento com multa de 2% e juros pro-rata de 1% a.m.',
    availableVariables: ['{nome}', '{contrato}', '{imovel}', '{competencia}', '{vencimento}', '{itens}', '{principal}', '{multa}', '{juros}', '{pagamentos}', '{saldo}', '{dias_atraso}'],
    content: `Olá, *{nome}*.

Constatamos que a cobrança do imóvel *{imovel}* com vencimento em *{vencimento}* encontra-se pendente ({dias_atraso} dia(s) de atraso).

📑 *Competências em Aberto:*
{competencia}

📋 *Detalhamento:*
{itens}

💵 *Valor Principal:* R$ {principal}
📊 *Multa (2%):* R$ {multa}
📈 *Juros de Mora (1% a.m. pro-rata):* R$ {juros}
{pagamentos}
💳 *Saldo Devedor Atualizado:* R$ {saldo}

Solicitamos a gentileza de regularizar a pendência ou nos enviar o comprovante de pagamento. Estamos à disposição para eventuais dúvidas.`
  },
  {
    id: 'variable_charges_updated',
    key: 'variable_charges_updated',
    name: 'Taxas Variáveis Atualizadas',
    description: 'Enviado após lançamento ou alteração de água/luz (após 15 minutos de carência).',
    availableVariables: ['{nome}', '{imovel}', '{competencia}', '{vencimento}', '{itens}', '{saldo}'],
    content: `Olá, *{nome}*!

Os valores de consumo de água/energia e taxas variáveis do imóvel *{imovel}* foram atualizados.

📑 *Competência:* {competencia}
📅 *Vencimento:* {vencimento}

📋 *Detalhamento Atualizado:*
{itens}

💰 *Saldo a Pagar:* R$ {saldo}

Ficamos à disposição para qualquer esclarecimento.`
  },
  {
    id: 'no_variable_charges_yet',
    key: 'no_variable_charges_yet',
    name: 'Aviso de Taxas Pendentes de Leitura',
    description: 'Enviado a 7 dias do vencimento quando medições de água/luz ainda não foram apuradas.',
    availableVariables: ['{nome}', '{imovel}', '{competencia}', '{vencimento}', '{itens}', '{saldo}'],
    content: `Olá, *{nome}*!

Segue a fatura de aluguel do imóvel *{imovel}* com vencimento em *{vencimento}*.

📑 *Competência:* {competencia}
📋 *Itens Lançados:*
{itens}

⚠️ *Aviso Importante:* As taxas variáveis de consumo (água e energia elétrica) deste mês ainda estão em apuração pela administração e serão lançadas oportunamente.

💰 *Valor Atual:* R$ {saldo}

Estamos à disposição.`
  },
  {
    id: 'partial_payment_receipt',
    key: 'partial_payment_receipt',
    name: 'Confirmação de Pagamento Parcial',
    description: 'Enviado automaticamente após registro de pagamento parcial no sistema.',
    availableVariables: ['{nome}', '{imovel}', '{competencia}', '{valor_pago}', '{saldo_anterior}', '{saldo_restante}', '{data_pagamento}'],
    content: `Olá, *{nome}*.

Confirmamos o recebimento do seu pagamento parcial referente ao imóvel *{imovel}*.

📅 *Data do Recebimento:* {data_pagamento}
💵 *Valor Recebido:* R$ {valor_pago}
📊 *Saldo Anterior:* R$ {saldo_anterior}
💳 *Saldo Restante Pendente:* R$ {saldo_restante}

ℹ️ *Importante:* Informamos que a cobrança permanece em aberto no sistema até a quitação integral do saldo restante.

Agradecemos e estamos à disposição.`
  }
];

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = {
  primaryInstance: {
    url: 'https://brunoklemtz.uazapi.com',
    instanceName: 'brunoklemtz',
    token: '96a31701-f2c4-41e7-b288-cbfcb9d48809',
    status: 'connected',
  },
  contingencyInstance: {
    url: 'https://brunoklemtz.uazapi.com',
    instanceName: 'contingencia_alertas',
    token: '96a31701-f2c4-41e7-b288-cbfcb9d48809',
    status: 'connected',
  },
  adminAlertPhones: ['5547992744455', '5547996527367', '5547988341417'],
  testAuthorizedPhones: ['5547992744455', '5547996527367', '5547988341417'],
  isTestModeActive: true, // Homologação ativada por padrão
  isWhatsAppActiveGlobal: false, // Produção desativada por padrão
  pilotContractIds: [],
  pilotActive: false,
  sendTimeWindow: {
    startHour: 8,
    endHour: 9,
    timezone: 'America/Sao_Paulo',
  },
  sendDays: [1, 2, 3, 4, 5, 6], // Segunda a Sábado
  variableChargesDebounceMinutes: 15,
  finePercent: 2,
  monthlyInterestPercent: 1,
};

export class NotificationQueueService {
  /**
   * Fetches settings from Firestore or returns defaults
   */
  static async getSettings(): Promise<WhatsAppSettings> {
    try {
      const snap = await getDoc('settings', 'whatsapp_config');
      if (snap) {
        const data = snap as Partial<WhatsAppSettings>;
        // If the primary instance has no token configured yet, merge with the current credentials
        const primary = {
          ...DEFAULT_WHATSAPP_SETTINGS.primaryInstance,
          ...(data.primaryInstance || {}),
        };
        if (!primary.token) {
          primary.url = DEFAULT_WHATSAPP_SETTINGS.primaryInstance.url;
          primary.token = DEFAULT_WHATSAPP_SETTINGS.primaryInstance.token;
          primary.status = 'connected';
        }
        return {
          ...DEFAULT_WHATSAPP_SETTINGS,
          ...data,
          primaryInstance: primary,
        } as WhatsAppSettings;
      }
      // Save default
      await setDoc('settings', 'whatsapp_config', DEFAULT_WHATSAPP_SETTINGS);
      return DEFAULT_WHATSAPP_SETTINGS;
    } catch (e) {
      console.warn('Erro ao carregar configurações do WhatsApp:', e);
      return DEFAULT_WHATSAPP_SETTINGS;
    }
  }

  /**
   * Fetches message templates
   */
  static async getTemplates(): Promise<WhatsAppTemplate[]> {
    try {
      const snap = await getDocs('whatsapp_templates');
      if (snap.length > 0) {
        const loaded = snap.map(d => d as WhatsAppTemplate);
        // Merge with defaults if any missing
        const map = new Map(loaded.map(t => [t.key, t]));
        return DEFAULT_TEMPLATES.map(dt => map.get(dt.key) || dt);
      }
      // Seed default templates
      for (const t of DEFAULT_TEMPLATES) {
        await setDoc('whatsapp_templates', t.key, t);
      }
      return DEFAULT_TEMPLATES;
    } catch (e) {
      console.warn('Erro ao carregar modelos do WhatsApp:', e);
      return DEFAULT_TEMPLATES;
    }
  }

  /**
   * Calculates overdue charges:
   * - 2% unique fine on remaining unpaid principal
   * - 1% per month pro-rata interest based on exact calendar days of delay
   * - Vencimento original is NEVER altered
   */
  static calculateOverdueCharges(params: {
    dueDate: Date;
    totalAmount: number;
    paidAmount: number;
    referenceDate?: Date;
    finePercent?: number;
    monthlyInterestPercent?: number;
  }) {
    const {
      dueDate,
      totalAmount,
      paidAmount,
      referenceDate = new Date(),
      finePercent = 2,
      monthlyInterestPercent = 1,
    } = params;

    const principal = Math.max(0, totalAmount - paidAmount);
    const startOfDue = startOfDay(dueDate);
    const startOfRef = startOfDay(referenceDate);

    const daysOfDelay = Math.max(0, differenceInDays(startOfRef, startOfDue));

    if (daysOfDelay <= 0 || principal <= 0) {
      return {
        isOverdue: false,
        daysOfDelay: 0,
        principalAmount: Math.round((principal + Number.EPSILON) * 100) / 100,
        fineAmount: 0,
        interestAmount: 0,
        totalWithCharges: Math.round((principal + Number.EPSILON) * 100) / 100,
      };
    }

    // Multa única de 2%
    const fineAmount = Math.round((principal * (finePercent / 100) + Number.EPSILON) * 100) / 100;

    // Juros de 1% ao mês proporcional aos dias de atraso (0.033333% ao dia)
    const dailyInterestRate = (monthlyInterestPercent / 100) / 30;
    const interestAmount = Math.round((principal * dailyInterestRate * daysOfDelay + Number.EPSILON) * 100) / 100;

    const totalWithCharges = Math.round((principal + fineAmount + interestAmount + Number.EPSILON) * 100) / 100;

    return {
      isOverdue: true,
      daysOfDelay,
      principalAmount: Math.round((principal + Number.EPSILON) * 100) / 100,
      fineAmount,
      interestAmount,
      totalWithCharges,
    };
  }

  /**
   * Checks if current time is within allowed send window:
   * Monday to Saturday, 08:00 - 09:00 (America/Sao_Paulo)
   */
  static isWithinSendWindow(date = new Date(), settings?: WhatsAppSettings): boolean {
    const s = settings || DEFAULT_WHATSAPP_SETTINGS;
    const day = date.getDay(); // 0 is Sunday
    if (day === 0) return false; // Never on Sundays

    const hour = date.getHours();
    return hour >= (s.sendTimeWindow.startHour ?? 8) && hour < (s.sendTimeWindow.endHour ?? 9);
  }

  /**
   * Calculates the next allowed send window
   */
  static getNextSendWindowDate(fromDate = new Date(), settings?: WhatsAppSettings): Date {
    const s = settings || DEFAULT_WHATSAPP_SETTINGS;
    let target = new Date(fromDate);
    const startH = s.sendTimeWindow.startHour ?? 8;

    // If today is Sunday or after 9:00 AM, move to next valid day at 8:15 AM
    if (isSunday(target) || getHours(target) >= (s.sendTimeWindow.endHour ?? 9)) {
      target = addDays(target, 1);
      while (isSunday(target)) {
        target = addDays(target, 1);
      }
    } else if (getHours(target) < startH) {
      // It is today before 8:00 AM
    }

    target.setHours(startH, 15, 0, 0);
    return target;
  }

  /**
   * Checks whether the overdue cadence dictates sending a message today:
   * - Days 1 to 10: every day
   * - Days 11 to 30: every 2 days
   * - After day 30: every 3 days
   */
  static shouldSendCadenceForDelay(daysOfDelay: number): boolean {
    if (daysOfDelay <= 0) return false;
    if (daysOfDelay <= 10) return true; // Daily
    if (daysOfDelay <= 30) {
      // Every 2 days (e.g. day 12, 14, 16...)
      return (daysOfDelay - 10) % 2 === 0;
    }
    // > 30 days: Every 3 days
    return (daysOfDelay - 30) % 3 === 0;
  }

  /**
   * Formats currency to Brazilian Real: R$ 1.250,00
   */
  static formatCurrency(val: number): string {
    return (val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Builds the formatted message body from template and data
   */
  static renderTemplate(
    templateContent: string,
    variables: Record<string, string | number>
  ): string {
    let result = templateContent;
    for (const [k, v] of Object.entries(variables)) {
      const valStr = typeof v === 'number' ? this.formatCurrency(v) : (v || '');
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(valStr));
    }
    return result;
  }

  /**
   * Consolidates pending billings of the same contract into one message
   */
  static compileConsolidatedMessage(params: {
    property: Property;
    billings: BillingRecord[];
    template: WhatsAppTemplate;
    settings: WhatsAppSettings;
    isTestMode: boolean;
    recipientPhone: string;
    phoneLabel?: string;
  }): {
    messageText: string;
    totalCalculated: number;
    principalAmount: number;
    fineAmount: number;
    interestAmount: number;
    paidAmount: number;
    remainingAmount: number;
    competencies: string[];
    billingIds: string[];
    maxDaysOfDelay: number;
  } {
    const { property, billings, template, settings, isTestMode, recipientPhone, phoneLabel } = params;

    // Filter to unpaid/pending billings
    const pendingBillings = billings
      .filter(b => b.status !== 'paid' && !b.archived)
      .sort((a, b) => {
        const da = parseDate(a.dueDate) || new Date(0);
        const db = parseDate(b.dueDate) || new Date(0);
        return da.getTime() - db.getTime();
      });

    let totalPrincipal = 0;
    let totalFine = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    let maxDaysOfDelay = 0;

    const itemsSummaryLines: string[] = [];
    const compList: string[] = [];
    const billingIds: string[] = [];
    let hasPendingVariableCharges = false;

    for (const b of pendingBillings) {
      if (b.id) billingIds.push(b.id);
      const dDate = parseDate(b.dueDate) || new Date();
      const compKey = format(dDate, 'MM/yyyy');
      if (!compList.includes(compKey)) compList.push(compKey);

      const bPaid = b.paidAmount || 0;
      totalPaid += bPaid;

      const charges = this.calculateOverdueCharges({
        dueDate: dDate,
        totalAmount: b.totalAmount,
        paidAmount: bPaid,
        finePercent: settings.finePercent,
        monthlyInterestPercent: settings.monthlyInterestPercent,
      });

      totalPrincipal += charges.principalAmount;
      totalFine += charges.fineAmount;
      totalInterest += charges.interestAmount;
      if (charges.daysOfDelay > maxDaysOfDelay) {
        maxDaysOfDelay = charges.daysOfDelay;
      }

      // Check if variable charges are missing/zero
      const waterItem = b.items?.find(i => i.type === 'water');
      const elecItem = b.items?.find(i => i.type === 'electricity');
      if ((!waterItem || waterItem.amount === 0) && (!elecItem || elecItem.amount === 0)) {
        hasPendingVariableCharges = true;
      }

      // Build breakdown of items
      itemsSummaryLines.push(`*Competência ${compKey} (Venc: ${format(dDate, 'dd/MM/yyyy')}):*`);
      (b.items || []).forEach(item => {
        let label = item.type === 'rent' ? 'Aluguel' : item.type === 'water' ? 'Água' : item.type === 'electricity' ? 'Energia' : (item.notes || 'Outros');
        if (item.previousReading !== undefined && item.currentReading !== undefined && item.previousReading !== null && item.currentReading !== null) {
          label += ` (Leituras: ${item.previousReading} ➔ ${item.currentReading})`;
        }
        itemsSummaryLines.push(`  • ${label}: R$ ${this.formatCurrency(item.amount)}`);
      });

      if (bPaid > 0) {
        itemsSummaryLines.push(`  ↳ _Valor já amortizado: R$ ${this.formatCurrency(bPaid)}_`);
      }
    }

    const totalCalculated = Math.round((totalPrincipal + totalFine + totalInterest + Number.EPSILON) * 100) / 100;
    const oldestBilling = pendingBillings[0];
    const oldestDueDate = oldestBilling?.dueDate?.toDate ? oldestBilling.dueDate.toDate() : (oldestBilling?.dueDate ? new Date(oldestBilling.dueDate) : new Date());

    let paymentsText = '';
    if (totalPaid > 0) {
      paymentsText = `💵 *Total Já Pago:* R$ ${this.formatCurrency(totalPaid)}\n`;
    }

    let itemsFormatted = itemsSummaryLines.join('\n');
    if (hasPendingVariableCharges && differenceInDays(oldestDueDate, new Date()) <= 7 && maxDaysOfDelay === 0) {
      itemsFormatted += '\n\n⚠️ _Aviso: Taxas variáveis (água/luz) deste mês ainda estão em apuração e serão lançadas oportunamente._';
    }

    const variables: Record<string, string | number> = {
      nome: property.ownerName || 'Inquilino',
      contrato: property.propertyCode || 'Contrato',
      imovel: `${property.propertyCode}${property.condominium ? ` (${property.condominium})` : ''}`,
      competencia: compList.join(', '),
      vencimento: format(oldestDueDate, 'dd/MM/yyyy'),
      itens: itemsFormatted,
      total: this.formatCurrency(totalCalculated),
      principal: this.formatCurrency(totalPrincipal),
      multa: this.formatCurrency(totalFine),
      juros: this.formatCurrency(totalInterest),
      pagamentos: paymentsText,
      saldo: this.formatCurrency(totalCalculated),
      dias_atraso: maxDaysOfDelay,
    };

    let rendered = this.renderTemplate(template.content, variables);

    // Apply Test Mode header if in test mode
    if (isTestMode) {
      const header = `🧪 *[MODO DE TESTE - HOMOLOGAÇÃO]*\n` +
        `👤 *Destinatário Real:* ${property.ownerName || 'Inquilino'}\n` +
        `📱 *Telefone Real:* ${UazapiService.formatPhoneDisplay(recipientPhone)}${phoneLabel ? ` (${phoneLabel})` : ''}\n` +
        `🏢 *Imóvel:* ${property.propertyCode}\n` +
        `----------------------------------------\n\n`;
      rendered = header + rendered;
    }

    return {
      messageText: rendered,
      totalCalculated,
      principalAmount: totalPrincipal,
      fineAmount: totalFine,
      interestAmount: totalInterest,
      paidAmount: totalPaid,
      remainingAmount: totalCalculated,
      competencies: compList,
      billingIds,
      maxDaysOfDelay,
    };
  }

  /**
   * Generates confirmation message for a partial payment
   */
  static compilePartialPaymentReceipt(params: {
    property: Property;
    billing: BillingRecord;
    amountPaid: number;
    previousBalance: number;
    remainingBalance: number;
    paymentDate: string;
    template: WhatsAppTemplate;
    isTestMode: boolean;
    recipientPhone: string;
    phoneLabel?: string;
  }): string {
    const {
      property,
      billing,
      amountPaid,
      previousBalance,
      remainingBalance,
      paymentDate,
      template,
      isTestMode,
      recipientPhone,
      phoneLabel,
    } = params;

    const bDueDate = parseDate(billing.dueDate) || new Date();
    const compKey = format(bDueDate, 'MM/yyyy');

    const variables: Record<string, string | number> = {
      nome: property.ownerName || 'Inquilino',
      imovel: `${property.propertyCode}${property.condominium ? ` (${property.condominium})` : ''}`,
      competencia: compKey,
      valor_pago: this.formatCurrency(amountPaid),
      saldo_anterior: this.formatCurrency(previousBalance),
      saldo_restante: this.formatCurrency(remainingBalance),
      data_pagamento: format(new Date(paymentDate + 'T12:00:00'), 'dd/MM/yyyy'),
    };

    let rendered = this.renderTemplate(template.content, variables);

    if (isTestMode) {
      const header = `🧪 *[MODO DE TESTE - CONFIRMAÇÃO DE PAGAMENTO]*\n` +
        `👤 *Destinatário Real:* ${property.ownerName || 'Inquilino'}\n` +
        `📱 *Telefone Real:* ${UazapiService.formatPhoneDisplay(recipientPhone)}${phoneLabel ? ` (${phoneLabel})` : ''}\n` +
        `🏢 *Imóvel:* ${property.propertyCode}\n` +
        `----------------------------------------\n\n`;
      rendered = header + rendered;
    }

    return rendered;
  }

  /**
   * Extracts active phones for a property
   */
  static getActiveBillingPhones(property: Property): TenantPhone[] {
    if (property.phones && property.phones.length > 0) {
      return property.phones.filter(p => p.isActiveForBilling && p.number && p.number.trim());
    }
    // Backwards compatibility with single phone field
    if (property.phone && property.phone.trim()) {
      return [{
        id: 'legacy_1',
        number: property.phone.trim(),
        label: 'Principal',
        isActiveForBilling: true,
      }];
    }
    return [];
  }

  /**
   * Checks if an automated message was already sent for this property today (Duplicate prevention)
   */
  static async hasSentAutomatedMessageToday(propertyId: string): Promise<boolean> {
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const snap = await getDocs('whatsapp_queue', {
        filters: [
          { field: 'propertyId', op: 'eq', value: propertyId },
          { field: 'status', op: 'in', value: ['enviada', 'entregue', 'lida', 'processando'] },
        ],
      });
      return snap.some(docSnap => {
        const item = docSnap as WhatsAppQueueItem;
        const cDate = parseDate(item.createdAt);
        const createdDate = cDate ? format(cDate, 'yyyy-MM-dd') : null;
        return createdDate === todayStr;
      });
    } catch (e) {
      console.warn('Erro ao verificar duplicidade de envio:', e);
      return false;
    }
  }

  /**
   * Generates overdue cadence notifications for all active properties with open debt
   */
  static async generateOverdueCadenceMessages(properties: Property[], billings: BillingRecord[]): Promise<number> {
    const settings = await this.getSettings();
    const templates = await this.getTemplates();
    const overdueTemplate = templates.find(t => t.key === 'overdue_cadence') || DEFAULT_TEMPLATES.find(t => t.key === 'overdue_cadence')!;

    let generatedCount = 0;

    // Filter properties if pilot is active
    let targetProperties = properties.filter(p => p.status === 'active' && !p.cadencePaused);
    if (settings.pilotActive) {
      const pilotIds = settings.pilotContractIds || settings.pilotPropertyIds || [];
      if (pilotIds.length > 0) {
        targetProperties = targetProperties.filter(p => pilotIds.includes(p.id || ''));
      }
    }

    for (const property of targetProperties) {
      if (!property.id) continue;

      // Check if already sent today
      const alreadySent = await this.hasSentAutomatedMessageToday(property.id);
      if (alreadySent) continue;

      // Find pending billings for this property
      const propBillings = billings.filter(b => b.propertyId === property.id && b.status !== 'paid' && !b.archived);
      if (propBillings.length === 0) continue;

      // Check overdue status
      const now = new Date();
      let maxDelay = 0;
      for (const b of propBillings) {
        const dDate = b.dueDate?.toDate ? b.dueDate.toDate() : new Date(b.dueDate);
        const delay = Math.max(0, differenceInDays(startOfDay(now), startOfDay(dDate)));
        if (delay > maxDelay) maxDelay = delay;
      }

      if (maxDelay <= 0) continue; // Not overdue yet

      // Check if today matches cadence pattern
      const isDueForCadence = this.shouldSendCadenceForDelay(maxDelay);
      if (!isDueForCadence) continue;

      const activePhones = this.getActiveBillingPhones(property);
      if (activePhones.length === 0) continue;

      for (let i = 0; i < activePhones.length; i++) {
        const phoneObj = activePhones[i];
        const isTest = settings.isTestModeActive;
        const testTarget = settings.testAuthorizedPhones[i % (settings.testAuthorizedPhones.length || 1)] || settings.testAuthorizedPhones[0] || '5547999999999';
        const actualRecipient = isTest ? testTarget : phoneObj.number;

        const compiled = this.compileConsolidatedMessage({
          property,
          billings: propBillings,
          template: overdueTemplate,
          settings,
          isTestMode: isTest,
          recipientPhone: phoneObj.number,
          phoneLabel: phoneObj.label,
        });

        const nextSendDate = this.getNextSendWindowDate(new Date(), settings);

        await addDoc('whatsapp_queue', {
          propertyId: property.id,
          propertyCode: property.propertyCode,
          tenantName: property.ownerName || 'Inquilino',
          recipientPhone: actualRecipient,
          phoneLabel: phoneObj.label || 'Principal',
          messageText: compiled.messageText,
          type: 'overdue_cadence' as WhatsAppMessageType,
          billingIds: compiled.billingIds,
          competencies: compiled.competencies,
          totalCalculated: compiled.totalCalculated,
          principalAmount: compiled.principalAmount,
          fineAmount: compiled.fineAmount,
          interestAmount: compiled.interestAmount,
          paidAmount: compiled.paidAmount,
          remainingAmount: compiled.remainingAmount,
          isTestMode: isTest,
          targetRealPhone: phoneObj.number,
          status: 'agendada' as WhatsAppMessageStatus,
          scheduledFor: nextSendDate.toISOString(),
          attempts: 0,
          maxAttempts: 3,
          logs: [
            {
              timestamp: new Date().toISOString(),
              status: 'agendada' as WhatsAppMessageStatus,
              detail: `Agendada pela régua de cobrança automática (${maxDelay} dias de atraso).`,
            }
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        generatedCount++;
      }
    }

    return generatedCount;
  }

  /**
   * Processes a batch of scheduled messages in the queue
   */
  static async processQueueBatch(batchSize = 15): Promise<{ sent: number; failed: number; pending: number }> {
    const settings = await this.getSettings();
    const snap = await getDocs('whatsapp_queue', {
      filters: [{ field: 'status', op: 'eq', value: 'agendada' }],
      limit: batchSize,
    });
    let sent = 0;
    let failed = 0;
    let pending = 0;

    for (const docSnap of snap) {
      const item = docSnap as WhatsAppQueueItem;
      if (!item.id) continue;

      // Update to processing
      await updateDoc('whatsapp_queue', item.id, {
        status: 'processando',
        lastAttemptAt: new Date().toISOString(),
        attempts: (item.attempts || 0) + 1,
        updatedAt: serverTimestamp(),
      });

      const simulateMode = settings.isTestModeActive && !settings.primaryInstance.token;

      const result = await UazapiService.sendTextMessage({
        instance: settings.primaryInstance,
        number: item.recipientPhone,
        text: item.messageText,
        simulate: simulateMode,
      });

      if (result.success) {
        sent++;
        await updateDoc('whatsapp_queue', item.id, {
          status: 'enviada',
          uazapiMessageId: result.messageId || 'sim_' + Date.now(),
          updatedAt: serverTimestamp(),
          logs: [
            ...(item.logs || []),
            {
              timestamp: new Date().toISOString(),
              status: 'enviada',
              detail: `Enviada com sucesso via UAZAPI. MessageID: ${result.messageId || 'simulado'}`,
            }
          ]
        });
      } else {
        const attempts = (item.attempts || 0) + 1;
        const maxAttempts = item.maxAttempts || 3;
        const willRetry = attempts < maxAttempts;

        if (willRetry) {
          pending++;
        } else {
          failed++;
        }

        await updateDoc('whatsapp_queue', item.id, {
          status: willRetry ? 'agendada' : 'falhou',
          lastError: result.error || 'Erro no envio',
          updatedAt: serverTimestamp(),
          logs: [
            ...(item.logs || []),
            {
              timestamp: new Date().toISOString(),
              status: willRetry ? 'agendada' : 'falhou',
              detail: `Tentativa ${attempts}/${maxAttempts} falhou: ${result.error || 'Falha de comunicação'}`,
            }
          ]
        });
      }
    }

    return { sent, failed, pending };
  }

  /**
   * Cancels remaining scheduled messages when a contract balance is zeroed
   */
  static async cancelPendingMessagesForProperty(propertyId: string, reason = 'Saldo zerado (quitação)'): Promise<void> {
    try {
      const snap = await getDocs('whatsapp_queue', {
        filters: [
          { field: 'propertyId', op: 'eq', value: propertyId },
          { field: 'status', op: 'eq', value: 'agendada' },
        ],
      });
      for (const d of snap) {
        await updateDoc('whatsapp_queue', d.id, {
          status: 'cancelada',
          lastError: reason,
          updatedAt: serverTimestamp(),
          logs: [
            ...(d.logs || []),
            {
              timestamp: new Date().toISOString(),
              status: 'cancelada',
              detail: reason,
            }
          ]
        });
      }
    } catch (e) {
      console.error('Erro ao cancelar mensagens pendentes da fila:', e);
    }
  }
}
