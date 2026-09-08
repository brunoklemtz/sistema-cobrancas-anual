import { Property } from '../types';

type PropertyRef = Pick<Property, 'id' | 'propertyCode' | 'status'>;

export type PropertyAvailabilityResult =
  | { ok: true }
  | { ok: false; message: string };

export function normalizePropertyCode(code: string): string {
  return (code || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findPropertyByCode(
  properties: PropertyRef[],
  code: string,
  excludeId?: string
): PropertyRef | undefined {
  const normalized = normalizePropertyCode(code);
  if (!normalized) return undefined;

  return properties.find((p) => {
    if (excludeId && p.id === excludeId) return false;
    return normalizePropertyCode(p.propertyCode) === normalized;
  });
}

export function assertPropertyAvailableForContract(args: {
  properties: PropertyRef[];
  propertyCode: string;
  currentId?: string;
  intendedStatus: 'active' | 'inactive';
}): PropertyAvailabilityResult {
  const displayCode = (args.propertyCode || '').trim().replace(/\s+/g, ' ');
  const normalized = normalizePropertyCode(args.propertyCode);
  if (!normalized) {
    return { ok: false, message: 'Informe a identificação do imóvel.' };
  }

  const others = args.properties.filter((p) => {
    if (args.currentId && p.id === args.currentId) return false;
    return normalizePropertyCode(p.propertyCode) === normalized;
  });

  if (!args.currentId && others.length > 0) {
    const occupied = others.find((p) => p.status === 'active');
    if (occupied) {
      return {
        ok: false,
        message: `Já existe cadastro do imóvel ${displayCode} com contrato ativo. Encerre o contrato atual ou use Novo Contrato no imóvel inativo.`,
      };
    }
    return {
      ok: false,
      message: `Já existe cadastro do imóvel ${displayCode}. Reabra o imóvel existente e use Novo Contrato.`,
    };
  }

  if (args.intendedStatus === 'active') {
    const occupied = others.find((p) => p.status === 'active');
    if (occupied) {
      return {
        ok: false,
        message: `O imóvel ${displayCode} já possui contrato ativo. Encerre o contrato atual antes de ativar outro.`,
      };
    }
  }

  return { ok: true };
}
