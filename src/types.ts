export interface Condominium {
  id: string;
  name: string;
  address?: string;
  syndicName?: string;
  syndicPhone?: string;
  notes?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TenantDocument {
  id: string;
  name: string;
  fileData?: string;
  fileType?: string;
  uploadedAt?: string;
  size?: number;
}

/** Ocupante adicional além do titular do contrato. */
export interface AdditionalOccupant {
  id?: string;
  name: string;
  cpf: string;
  phone: string;
}

export interface AdditionalTenantInfo {
  id: string;
  label: string;
  value: string;
}

export interface TenantPhone {
  id: string;
  number: string;
  label?: string; // e.g. "Principal", "Cônjuge", "Comercial"
  isActiveForBilling: boolean;
  notes?: string;
}

export interface Property {
  id: string; // This is the document ID in Firestore, but also stored as a field for convenience
  propertyCode: string; // e.g., "Apt 101"
  condominium?: string; // e.g., "Residencial Flores", "Ed. Sol"
  ownerName: string; // Tenant Name for the property contract
  tenantCpf?: string;
  tenantEmail?: string;
  tenantAddress?: string;
  /** Demais pessoas que vão morar (nome, CPF, telefone). */
  additionalOccupants?: AdditionalOccupant[];
  referencePhone?: string;
  referenceAddress?: string;
  documents?: TenantDocument[];
  additionalInfo?: AdditionalTenantInfo[];
  /** Token do link público para o locatário preencher a ficha. */
  contractIntakeToken?: string;
  contractIntakeExpiresAt?: string;
  contractIntakeSubmittedAt?: string;
  phone?: string; // Legacy field retained for backwards compatibility
  phones?: TenantPhone[]; // Multiple phone numbers with active for billing flag
  rentAmount?: number;
  leaseStartDate?: any;
  /** Contrato temporada (Remix). Residencial 30 meses = modelo futuro. */
  contractType?: 'temporada' | 'residencial';
  /** Prazo da temporada em dias (30 | 60 | 90). */
  leaseDurationDays?: 30 | 60 | 90;
  /** Data de término calculada (yyyy-MM-dd ou Timestamp). */
  leaseEndDate?: any;
  /** Endereço completo do imóvel (objeto do contrato). */
  propertyAddress?: string;
  adminFee?: number;
  cleaningFee?: number;
  maxOccupants?: number;
  initialWaterReading?: number;
  initialElectricityReading?: number;
  securityDepositAmount?: number;
  securityDepositPaid?: boolean;
  isClean?: boolean;
  hasUtensils?: boolean;
  inspectionNotes?: string;
  status: 'active' | 'inactive';
  colorTag?: string;
  cadencePaused?: boolean; // Manual pause toggle for WhatsApp cadence
  cadencePausedAt?: any;
  cadencePausedBy?: string;
  createdAt: any;
  updatedAt: any;
}

export interface BillingItem {
  type: 'water' | 'electricity' | 'rent' | 'other';
  amount: number;
  previousReading?: number | null;
  currentReading?: number | null;
  notes?: string;
  isManuallyEdited?: boolean;
}

export interface PaymentEntry {
  id: string;
  amount: number;
  date: string; // yyyy-MM-dd
  notes?: string;
  registeredAt?: any;
}

export interface BillingRecord {
  id?: string;
  ids?: string[]; // For grouped records in UI
  groupKey?: string; // For grouping in UI
  propertyId: string;
  propertyCode?: string; // Denormalized for display even if property is deleted or not loaded
  tenantName: string; // Store tenant name at time of billing to preserve history
  tenantPhone?: string; // Store tenant phone at time of billing
  items: BillingItem[];
  totalAmount: number;
  paidAmount?: number;
  paymentHistory?: PaymentEntry[];
  readingDate?: any;
  dueDate: any;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  archived?: boolean;
  colorTag?: string; // Hex color or color name for row highlighting
  userRemovedBalanceItem?: boolean;
  lastVariableChargeEditedAt?: any; // For 15-minute debounce
  createdAt: any;
  updatedAt?: any;
  notes?: string;
}

export interface Tier {
  min: number;
  max: number | null; // null means "above"
  rate: number;
}

export interface Settings {
  waterBasePrice: number;
  waterBaseLimit: number;
  waterTiers: Tier[];
  electricityBasePrice: number;
  electricityBaseLimit: number;
  electricityTiers: Tier[];
}

export type WhatsAppMessageStatus = 
  | 'agendada' 
  | 'processando' 
  | 'enviada' 
  | 'entregue' 
  | 'lida' 
  | 'falhou' 
  | 'cancelada';

export type WhatsAppMessageType = 
  | 'due_reminder' 
  | 'overdue_cadence' 
  | 'variable_charges_updated' 
  | 'partial_payment_receipt' 
  | 'manual';

export interface WhatsAppQueueLogEntry {
  timestamp: string;
  status: WhatsAppMessageStatus;
  detail?: string;
  response?: any;
}

export interface WhatsAppQueueItem {
  id: string;
  propertyId: string;
  propertyCode: string;
  tenantName: string;
  recipientPhone: string;
  phoneLabel?: string;
  messageText: string;
  type: WhatsAppMessageType;
  billingIds: string[];
  competencies: string[]; // e.g. ["2026-08", "2026-07"]
  totalCalculated: number;
  principalAmount: number;
  fineAmount: number;
  interestAmount: number;
  paidAmount: number;
  remainingAmount: number;
  isTestMode: boolean;
  targetRealPhone: string;
  status: WhatsAppMessageStatus;
  scheduledFor: any; // Timestamp or ISO string
  attempts: number;
  maxAttempts: number;
  lastAttemptAt?: any;
  lastError?: string;
  uazapiMessageId?: string;
  logs?: WhatsAppQueueLogEntry[];
  createdAt: any;
  updatedAt: any;
}

export interface WhatsAppTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  content: string;
  body?: string;
  availableVariables: string[];
  updatedAt?: any;
}

export interface InstanceConfig {
  url: string; // e.g. https://api.uazapi.com or custom
  instanceName: string;
  token: string;
  status?: 'connected' | 'disconnected' | 'unknown' | 'testing';
  lastChecked?: string;
}

export interface WhatsAppSettings {
  primaryInstance: InstanceConfig; // For billing notifications & tenant chats
  contingencyInstance: InstanceConfig; // For contingency alerts only when primary disconnects
  adminAlertPhones: string[]; // 2 administrator phone numbers
  testAuthorizedPhones: string[]; // 2 test numbers for Test Mode
  isTestModeActive: boolean; // default true
  isWhatsAppActiveGlobal: boolean; // default false
  pilotContractIds: string[]; // 5 manually selected contracts
  pilotPropertyIds?: string[]; // alias
  pilotActive: boolean;
  sendTimeWindow: {
    startHour: number; // 8
    endHour: number; // 9
    timezone: string; // 'America/Sao_Paulo'
  };
  sendDays: number[]; // [1, 2, 3, 4, 5, 6] (1=Mon, 6=Sat)
  variableChargesDebounceMinutes: number; // 15
  finePercent: number; // 2
  monthlyInterestPercent: number; // 1
  updatedAt?: any;
}

export interface AuditLog {
  id?: string;
  userEmail: string;
  userName?: string;
  action: string;
  collection: string;
  entityId: string;
  previousData?: any;
  newData?: any;
  timestamp: any;
}

export interface ContingencyAlert {
  id?: string;
  trigger?: string;
  primaryInstanceName?: string;
  contingencyInstanceName?: string;
  type?: 'instance_disconnected' | 'send_critical_failure' | 'test_alert';
  message: string;
  details?: any;
  recipients?: string[];
  sentToPhones?: string[];
  status: 'sent' | 'failed';
  timestamp?: any;
  createdAt?: any;
}

export type WhatsAppAlert = ContingencyAlert;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

