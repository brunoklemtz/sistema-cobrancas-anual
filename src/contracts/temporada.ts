/**
 * Contrato padrão de locação por temporada — 30, 60 ou 90 dias.
 * Ficha (dados) no topo + condições gerais + regimento anexo.
 */

export type LeaseDurationDays = 30 | 60 | 90;

export const LEASE_DURATION_OPTIONS: LeaseDurationDays[] = [30, 60, 90];

export const DEFAULT_LANDLORD = {
  name: 'Bruno Conrado Klemtz',
  cpf: '035.447.569-00',
  address: 'Rua 306C, nº 30, bairro Meia Praia, Itapema/SC',
  paymentAddress: 'Rua 244, nº 14, Meia Praia, Itapema/SC – CEP 88220-000',
  boletoCreditorPerson: 'Bruno Conrado Klemtz, CPF 035.447.569-00',
  boletoCreditorCompany: 'Bruno Conrado Klemtz LTDA, CNPJ 46.730.090/0001-77',
  forum: 'Comarca de Itapema – SC',
} as const;

export const DEFAULT_SEASON_FEES = {
  adminFee: 500,
  cleaningFee: 100,
  electricityKwhRate: 0.88,
  waterBaseFee: 56,
  waterBaseM3: 5,
  maxOccupants: 1,
  excessOccupantDailyFine: 50,
  fleaDedetizationFee: 350,
  diligenceFee: 100,
  holdoverMultiplier: 2,
  conductFineAlugueis: 2,
} as const;

/** Ocupante adicional (além do titular). */
export interface AdditionalOccupant {
  name: string;
  cpf: string;
  phone: string;
}

export interface SeasonContractInput {
  propertyCode: string;
  condominium?: string;
  propertyAddress: string;
  tenantName: string;
  tenantCpf: string;
  tenantEmail?: string;
  tenantPhone: string;
  tenantAddress?: string;
  additionalOccupants?: AdditionalOccupant[];
  rentAmount: number;
  leaseStartDate: string | Date;
  leaseDurationDays: LeaseDurationDays;
  maxOccupants?: number;
  adminFee?: number;
  cleaningFee?: number;
  initialWaterReading?: number | null;
  initialElectricityReading?: number | null;
  cityOfSignature?: string;
  landlord?: Partial<typeof DEFAULT_LANDLORD>;
  fees?: Partial<typeof DEFAULT_SEASON_FEES>;
  /** Se true, envolve valores da ficha com 【 】 no texto plano. */
  highlightPlain?: boolean;
}

export interface SeasonContractFilled {
  meta: {
    leaseDurationDays: LeaseDurationDays;
    leaseStartDate: string;
    leaseEndDate: string;
    rentAmountFormatted: string;
    adminFeeFormatted: string;
    cleaningFeeFormatted: string;
    holdoverAmountFormatted: string;
  };
  /** Texto plano (Autentique / clipboard), com 【dados】 se highlightPlain. */
  text: string;
  /** HTML para preview com <mark class="contract-hl"> nos dados. */
  htmlPreview: string;
}

function parseStartDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const d = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (isNaN(d.getTime())) throw new Error('Data de início inválida');
  return d;
}

/** Término: início + N dias − 1 (último dia inclusivo). */
export function calcLeaseEndDate(start: string | Date, days: LeaseDurationDays): Date {
  const d = parseStartDate(start);
  const end = new Date(d);
  end.setDate(end.getDate() + days - 1);
  return end;
}

export function formatDateBr(value: string | Date): string {
  const d = parseStartDate(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatMoneyBr(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Destaca dado editável no texto plano e no HTML. */
function hl(raw: string, plain: boolean): { plain: string; html: string } {
  const safe = String(raw ?? '');
  return {
    plain: plain ? `【${safe}】` : safe,
    html: `<mark class="contract-hl">${escapeHtml(safe)}</mark>`,
  };
}

function durationLabel(days: LeaseDurationDays): string {
  if (days === 30) return '30 (trinta) dias';
  if (days === 60) return '60 (sessenta) dias';
  return '90 (noventa) dias';
}

function buildParcelLines(days: LeaseDurationDays): string {
  const lines = ['• 1ª — no ato da assinatura ou no início do contrato'];
  if (days >= 60) lines.push('• 2ª — 30 dias após o início');
  if (days >= 90) lines.push('• 3ª — 60 dias após o início');
  return lines.join('\n');
}

export const SEASON_REGIMENTO_INTERNO = `ANEXO — REGIMENTO INTERNO

ARTIGO 1º: O presente regimento interno tem como objetivo regulamentar as normas em benefício de todos os condôminos e inquilinos, devendo ser rigorosamente observado por todos os moradores e por qualquer pessoa que utilize o edifício ou por ele transite. Os condôminos, ou responsáveis pelas suas unidades autônomas, ficam obrigados a dar conhecimento dos termos deste regimento aos seus familiares, LOCATÁRIOs, empregados e visitantes. O condomínio reger-se-á, para todos os efeitos, pela convenção, por este regimento e pela legislação pertinente.

ARTIGO 2º — Direitos dos Condôminos:
a) Formular queixas, reclamações e pedidos de esclarecimento, por escrito, ao Síndico ou ao Conselho Consultivo, sobre assuntos relativos ao edifício, sempre que houver motivo justificável.
b) Possuir chave da porta de acesso ao prédio e dos portões das garagens, bem como a chave ou controle remoto necessários.

ARTIGO 3º — Deveres dos Condôminos e LOCATÁRIOs:
Utilizar as partes comuns somente para os fins a que se destinam; conservar as partes comuns e colaborar com o síndico; não obstruir passagens, vias de acesso, corredores ou escadas, nem utilizar patins, patinetes, skates, velocípedes ou bolas nas áreas comuns; obedecer à Lei do Silêncio (23:00 às 08:00); usar aparelhos sonoros sem perturbar o sossego em qualquer horário; manter em boas condições dispositivos de gás e água na unidade; deixar livres entradas, passagens, escadas e corredores; acondicionar o lixo em sacos plásticos nas lixeiras; providenciar conserto de peças do condomínio danificadas por si ou visitantes; incluir este Regimento nos contratos; registrar sugestões/denúncias ao síndico ou no livro de ocorrências; limpar pés e materiais de praia antes do hall; manter a porta do hall fechada; animais de pequeno porte na unidade e, nas áreas comuns, no colo ou sem risco aos demais — proibido soltá-los nas áreas comuns para necessidades ou passeios.

ARTIGO 4º — Proibições:
Tocar instrumentos ou promover festas que perturbem o sossego; usar a unidade para clubes de jogos/dança, fins políticos, religiosos, médicos, comerciais ou pessoas de maus costumes; estender/secar roupas em janelas ou externos (varal sem ultrapassar o peitoril); lançar lixo sem acondicionar ou jogar objetos pelas janelas; manter oficina ou instalações perigosas/ruidosas; guardar móveis em área comum sem autorização do síndico; fumar nas áreas comuns; portar ou usar entorpecentes em qualquer local do condomínio.

ARTIGO 5º — Penalidades:
Multa de R$ 200,00 por infração, dobrando-se a cada reincidência do mesmo tipo, sem prejuízo da responsabilidade civil ou criminal. A entrega deste Regimento representa advertência, notificação e intimação de ciência do teor. Cabe recurso à Assembleia Geral, com comprovação do pagamento da multa. O Síndico aplica as penalidades, podendo consultar o Conselho Consultivo. Valores das multas destinam-se ao fundo de reserva. Danos materiais: pagamento do prejuízo apurado; recusa sujeita à cobrança judicial. Multas não pagas podem ser cobradas judicialmente. Condômino ou possuidor que reiteradamente descumprir deveres poderá, por deliberação de três quartos dos demais, ser compelido a multa de até o quíntuplo da contribuição condominial, além de perdas e danos.`;

/**
 * Gera o contrato padrão preenchido (ficha + condições + regimento).
 */
export function buildSeasonContract(input: SeasonContractInput): SeasonContractFilled {
  const landlord = { ...DEFAULT_LANDLORD, ...input.landlord };
  const fees = { ...DEFAULT_SEASON_FEES, ...input.fees };
  const days = input.leaseDurationDays;
  const start = parseStartDate(input.leaseStartDate);
  const end = calcLeaseEndDate(start, days);
  const startBr = formatDateBr(start);
  const endBr = formatDateBr(end);
  const rentFmt = formatMoneyBr(input.rentAmount);
  const adminFee = input.adminFee ?? fees.adminFee;
  const cleaningFee = input.cleaningFee ?? fees.cleaningFee;
  const maxOcc = input.maxOccupants ?? fees.maxOccupants;
  const city = input.cityOfSignature || 'Itapema - SC';
  const holdoverAmt = formatMoneyBr(input.rentAmount * fees.holdoverMultiplier);
  const useHl = input.highlightPlain !== false;

  const waterInit =
    input.initialWaterReading != null && input.initialWaterReading !== undefined
      ? String(input.initialWaterReading)
      : 'a registrar na vistoria / WhatsApp';
  const elecInit =
    input.initialElectricityReading != null && input.initialElectricityReading !== undefined
      ? String(input.initialElectricityReading)
      : 'a registrar na vistoria / WhatsApp';

  const h = (v: string) => hl(v, useHl);
  const code = h(input.propertyCode);
  const condo = h(input.condominium || '—');
  const propAddr = h(input.propertyAddress);
  const tName = h(input.tenantName);
  const tCpf = h(input.tenantCpf);
  const tPhone = h(input.tenantPhone);
  const tEmail = h(input.tenantEmail || '—');
  const tAddr = h(input.tenantAddress || '—');
  const startH = h(startBr);
  const endH = h(endBr);
  const daysH = h(String(days));
  const rentH = h(rentFmt);
  const adminH = h(formatMoneyBr(adminFee));
  const cleanH = h(formatMoneyBr(cleaningFee));
  const maxOccH = h(String(maxOcc));
  const waterH = h(waterInit);
  const elecH = h(elecInit);
  const kwhH = h(formatMoneyBr(fees.electricityKwhRate));
  const waterFeeH = h(formatMoneyBr(fees.waterBaseFee));
  const holdoverH = h(holdoverAmt);
  const fineDayH = h(formatMoneyBr(fees.excessOccupantDailyFine));
  const landlordName = h(landlord.name);
  const landlordCpf = h(landlord.cpf);
  const landlordAddr = h(landlord.address);
  const payAddr = h(landlord.paymentAddress);
  const forumH = h(landlord.forum);
  const cityH = h(city);
  const dateSignH = h(startBr);
  const durLabel = durationLabel(days);
  const parcels = buildParcelLines(days);

  const extras = input.additionalOccupants?.filter((o) => o.name?.trim()) || [];
  const extrasPlain =
    extras.length === 0
      ? 'Nenhum (somente o titular), salvo anuência posterior do LOCADOR'
      : extras
          .map((o, i) => {
            const n = h(o.name.trim());
            const c = h(o.cpf.trim() || '—');
            const p = h(o.phone.trim() || '—');
            return `${i + 1}. ${n.plain} — CPF ${c.plain} — Tel. ${p.plain}`;
          })
          .join('\n');
  const extrasHtml =
    extras.length === 0
      ? 'Nenhum (somente o titular), salvo anuência posterior do LOCADOR'
      : extras
          .map((o, i) => {
            const n = h(o.name.trim());
            const c = h(o.cpf.trim() || '—');
            const p = h(o.phone.trim() || '—');
            return `${i + 1}. ${n.html} — CPF ${c.html} — Tel. ${p.html}`;
          })
          .join('<br/>');

  const titleDays = days;

  const bodyPlain = `CONTRATO DE LOCAÇÃO RESIDENCIAL POR TEMPORADA
PRAZO DETERMINADO — ${titleDays} DIAS

==============================
FICHA DO CONTRATO (DADOS)
==============================

1. LOCADOR
Nome: ${landlordName.plain}
CPF: ${landlordCpf.plain}
Endereço: ${landlordAddr.plain}

2. LOCATÁRIO (TITULAR)
Nome: ${tName.plain}
CPF: ${tCpf.plain}
Telefone/WhatsApp: ${tPhone.plain}
E-mail: ${tEmail.plain}
Endereço: ${tAddr.plain}

2.1. DEMAIS OCUPANTES (quem vai morar)
${extrasPlain}

3. IMÓVEL
Código: ${code.plain}
Identificação: ${condo.plain}
Endereço: ${propAddr.plain}

4. PRAZO (TEMPORADA — ${daysH.plain} DIAS)
Início: ${startH.plain}
Término: ${endH.plain}
Prazo: ${durLabel} — sem prorrogação automática

5. VALORES E OCUPAÇÃO
Aluguel: ${rentH.plain} por período de 30 (trinta) dias (pagamento antecipado)
Parcelas:
${parcels}
Taxa administrativa: ${adminH.plain} — cobrada na entrada / ato da assinatura
Devolução da taxa administrativa: restituída na saída, descontados água, energia elétrica, limpeza de saída (padrão ${cleanH.plain}, salvo outro valor informado) e demais despesas/débitos; cumprido o contrato em dia e sem débitos, devolve-se o saldo
Ocupantes máximos (residentes): ${maxOccH.plain} pessoa(s)
Visitas: qualquer visitante somente com anuência prévia do LOCADOR via WhatsApp
Sem anuência: multa ${fineDayH.plain} por dia, por pessoa + possível rescisão
Drogas / brigas / ameaças: multa de ${fees.conductFineAlugueis} (dois) aluguéis + desocupação imediata
Permanência após o término (mesmo com pagamento/antecipado): não autorizada — cobrança de ${fees.holdoverMultiplier} (duas) vezes o aluguel (${holdoverH.plain} por período de 30 dias, ou equivalente diário), além da Cláusula 9ª

6. ENCARGOS / MEDIÇÕES
Água inicial: ${waterH.plain}
Energia inicial: ${elecH.plain}
kWh (leitura interna): ${kwhH.plain} (sujeito a reajuste da concessionária)
Água: ${waterFeeH.plain} até ${fees.waterBaseM3} m³ (excedentes conforme tabela; esgoto conforme fornecedora)
Gás: diferença de peso do botijão entre entrada e saída
Áreas comuns/lixeiras: sem cobrança de serviço pelo LOCADOR; responsabilidade conforme Cláusula 6ª-A

7. PAGAMENTO
Local: ${payAddr.plain}
Meios: PIX, transferência, depósito, boleto ou outro indicado por escrito com 05 dias de antecedência
Boletos durante a locação: ${landlord.boletoCreditorPerson} ou ${landlord.boletoCreditorCompany}
Valores devidos após a saída (consumos, danos, saldo negativo da taxa administrativa e demais débitos): boleto em nome de ${landlord.boletoCreditorPerson} e/ou ${landlord.boletoCreditorCompany}, passível de protesto em caso de inadimplemento, independentemente de o credor ser pessoa física ou jurídica

8. ASSINATURA
Local: ${cityH.plain}
Data: ${dateSignH.plain}
Foro: ${forumH.plain}

O LOCATÁRIO declara, sob as penas do art. 299 do Código Penal, que o objeto deste instrumento é residência e que as informações da ficha são verdadeiras.

==============================
CONDIÇÕES GERAIS (PADRÃO)
==============================

Cláusula 1ª – Do Objeto
Objeto: locação do imóvel indicado na ficha, por temporada de ${durLabel}, nos termos da Lei nº 8.245/1991.

Cláusula 2ª – Do Prazo
Prazo fixo conforme a ficha, independentemente de notificação.
Encerrado o prazo, o LOCATÁRIO deverá desocupar o imóvel e entregar as chaves ao LOCADOR.
Não há prorrogação automática. Continuação somente mediante novo contrato escrito.
A eventual tolerância do LOCADOR após o término não implica novação, renovação ou prorrogação.

Cláusula 3ª – Do Valor e Pagamento
O valor, as parcelas e a taxa administrativa constam na ficha. O pagamento do aluguel é antecipado (art. 48 da Lei nº 8.245/91).
Caso o crédito antecipado se esgote ou haja débito pendente sem acordo escrito, o contrato poderá ser considerado rescindido, observado o prazo máximo de ${durLabel} e o limite legal de 90 (noventa) dias para temporada.

Cláusula 4ª – Local e Meio de Pagamento
Conforme a ficha. Alteração de meio de pagamento somente por indicação escrita do LOCADOR com antecedência mínima de 05 (cinco) dias corridos do vencimento.
Os valores devidos após a desocupação poderão ser cobrados por boleto em nome do CPF e/ou do CNPJ indicados na ficha, passível de protesto, sem prejuízo das demais medidas legais.

Cláusula 5ª – Da Ocupação e Visitas
A ocupação residente fica limitada ao número e às pessoas indicadas na ficha.
Qualquer visitante somente com anuência prévia do LOCADOR via WhatsApp.
Sem anuência: multa da ficha por dia, por pessoa, sem prejuízo da desocupação e da rescisão.
É vedada sublocação, cessão ou empréstimo a terceiros sem autorização escrita do LOCADOR (art. 14 da Lei nº 8.245/91).

Cláusula 6ª – Encargos, Consumos e Taxa Administrativa
Além do aluguel, cobram-se gás, água e energia elétrica conforme a ficha.
O imóvel é entregue limpo. A limpeza de saída poderá ser descontada da taxa administrativa no valor padrão da ficha (salvo outro valor informado).
A taxa administrativa da ficha é cobrada na entrada e restituída na saída, deduzidos água, energia, limpeza de saída e demais despesas/débitos. Cumprido o contrato em dia e quitados os encargos, o saldo é restituído ao LOCATÁRIO. Eventual saldo negativo poderá ser cobrado na forma da Cláusula 4ª.
Leituras e critérios de cobrança conforme a ficha. Leitura poderá ser feita até 7 dias antes do vencimento mensal.

Cláusula 6ª-A – Áreas Comuns e Lixeiras
A limpeza das áreas comuns e lixeiras não é cobrada pelo LOCADOR como serviço. O LOCATÁRIO e visitantes devem manter limpo o que utilizarem e acondicionar o lixo corretamente.
Durante a vigência deste contrato, sujeira, areia, água de praia, lixo ou objetos deixados no hall, corredores, garagem, acessos e lixeiras, relacionados ao uso da unidade ou de seus visitantes, são de responsabilidade do LOCATÁRIO, podendo o custo de higienização/remoção ser descontado da taxa administrativa ou cobrado por boleto, sem prejuízo das multas do Regimento Interno.
Exceção restrita: o LOCATÁRIO só se exime se, de imediato ao constatar o fato, comunicar o LOCADOR via WhatsApp com foto ou vídeo (data/hora) identificando o terceiro/unidade responsável, e essa comunicação for acatada pelo LOCADOR. A mera alegação de que “foi o vizinho”, sem esse registro tempestivo, não afasta a responsabilidade.

Cláusula 7ª – Estado do Imóvel e Uso
O estado do imóvel e inventário constarão em laudo/vistoria (fotos ou vídeo), parte integrante deste contrato.
O LOCATÁRIO terá 48 (quarenta e oito) horas após o recebimento das chaves para contestar a vistoria por escrito, preferencialmente com fotos. Sem manifestação, presume-se aceita.
É vedada a instalação de ponto fixo de internet/rede, furação ou qualquer infraestrutura no imóvel, bem como obras, benfeitorias ou alterações, sem autorização escrita do LOCADOR. É permitido o uso de chip e/ou roteador portátil sem alteração estrutural.
Havendo piscina (privativa ou coletiva), seu uso não está incluído nesta locação, salvo autorização expressa.

Cláusula 8ª – Saída Antecipada e Valores Pagos
Em desocupação antecipada por iniciativa do LOCATÁRIO, não haverá devolução dos valores já pagos nem crédito por dias não utilizados, sem prejuízo dos consumos até a entrega das chaves e da apuração da taxa administrativa.
A devolução do imóvel exige entrega pessoal das chaves e comunicação prévia ao LOCADOR (WhatsApp ou meio indicado).

Cláusula 9ª – Permanência Após o Término
Permanência após a data de término da ficha sem novo contrato escrito ou autorização expressa do LOCADOR, por força ou iniciativa do LOCATÁRIO, configura ocupação indevida, ainda que haja pagamento, crédito antecipado, depósito, PIX, boleto ou qualquer outro meio de quitação. O pagamento, mesmo antecipado, não prorroga, renova nem legitima a permanência.
Nessa hipótese, o LOCATÁRIO fica sujeito à cobrança de ${fees.holdoverMultiplier} (duas) vezes o valor do aluguel indicado na ficha, por período de 30 (trinta) dias ou equivalente diário, sem prejuízo de despejo/reintegração de posse, perdas e danos e demais vias cíveis.
O LOCATÁRIO fica ciente de que a permanência indevida, conforme as circunstâncias e se presentes os requisitos legais do caso concreto, poderá também configurar ilícito penal, sem prejuízo das medidas cíveis acima.
Bagagens e objetos devem ser retirados até a desocupação. Itens deixados poderão ser guardados por até 15 (quinze) dias após comunicação; depois, poderão ser considerados abandonados, respondendo o LOCATÁRIO por custos de remoção/armazenamento/descarte.

Cláusula 10ª – Obrigações e Conduta
Zelar pela limpeza, conservação e ordem; pagar consumos nas datas pactuadas; restituir o imóvel nas condições da vistoria inicial.
Danos: ressarcimento por bem equivalente (fungível) ou indenização (infungível). Danos que impeçam nova locação: diárias do período de restabelecimento.
Pulgas: taxa de dedetização de ${formatMoneyBr(fees.fleaDedetizationFee)} + diárias até liberação.
Abandono de animais: comunicação às autoridades e multa de 01 (um) aluguel mensal. Animais de pequeno porte, quando admitidos, observam o Regimento Interno.
É terminantemente proibido o uso, guarda, cultivo, comércio ou facilitação de entorpecentes no imóvel ou áreas comuns; bem como brigas, agressões, ameaças, gritaria excessiva ou conduta que perturbe a ordem ou a segurança. A infração sujeita o LOCATÁRIO a multa de ${fees.conductFineAlugueis} (dois) aluguéis vigentes, desocupação imediata, indenização por perdas e danos e cobrança dos débitos na forma deste contrato, sem prejuízo do Regimento Interno e das vias legais. O LOCATÁRIO responde solidariamente pelos atos de seus visitantes.
Proibido uso comercial, jogos de azar e som excessivo — multa de 01 (um) aluguel e possível desocupação imediata.
O LOCATÁRIO declara ciência do Regimento Interno do condomínio, anexo após as assinaturas deste instrumento, e que o recebeu, leu e se obriga a cumpri-lo.

Cláusula 11ª – Inadimplemento
Atraso no pagamento acarreta:
• multa moratória de 10% sobre o débito;
• juros de 1% ao mês, pro rata die;
• correção pelo IGP-M ou índice substituto;
• honorários de 10% (extrajudicial) ou 20% (judicial);
• custas, se houver.
Inadimplemento ou descumprimento contratual/regimento, após eventual tolerância, pode gerar multa de 01 (um) aluguel vigente, sem prejuízo das demais medidas.
Débito em aberto há mais de 15 (quinze) dias após boleto/vencimento poderá ser inscrito em SPC/Serasa e/ou protestado, nos termos da legislação e da ficha.

Cláusula 12ª – Comunicações
Comunicações e mora por WhatsApp e/ou e-mail nos contatos da ficha têm validade entre as partes.

Cláusula 13ª – LGPD
As partes consentem no tratamento dos dados pessoais necessários à execução deste contrato (Lei nº 13.709/2018).

Cláusula 14ª – Assinatura
Válido se assinado física ou eletronicamente (Lei nº 13.874/19, Lei nº 12.682/12, MP nº 2.200-2/01 e legislação aplicável), independentemente de rubrica em cada página.
Anexo obrigatório: foto do documento de identidade do LOCATÁRIO titular.

Cláusula 15ª – Foro
Fica eleito o foro indicado na ficha para dirimir questões oriundas deste contrato.

${city}, ${startBr}

_________________________________
${landlord.name}
LOCADOR

_________________________________
${input.tenantName}
LOCATÁRIO

Testemunhas (opcional):
1. _______________________________ CPF: _______________
2. _______________________________ CPF: _______________

DECLARAÇÃO DE RECEBIMENTO E LEITURA DO REGIMENTO INTERNO

Declaro que recebi, li e compreendi o REGIMENTO INTERNO anexo a este contrato, que dele tenho ciência integral e que me obrigo a cumpri-lo, bem como a dar conhecimento aos meus familiares, visitantes e demais ocupantes sob minha responsabilidade.
A entrega desta cópia representa advertência, notificação e intimação de conhecimento do teor do Regimento, para fins das penalidades nele previstas.

Data: ____/____/________

_________________________________
${input.tenantName}
LOCATÁRIO — ciência e recebimento

${SEASON_REGIMENTO_INTERNO}
`;

  const htmlPreview = buildHtmlPreview({
    titleDays,
    landlordName: landlordName.html,
    landlordCpf: landlordCpf.html,
    landlordAddr: landlordAddr.html,
    tName: tName.html,
    tCpf: tCpf.html,
    tPhone: tPhone.html,
    tEmail: tEmail.html,
    tAddr: tAddr.html,
    extrasHtml,
    code: code.html,
    condo: condo.html,
    propAddr: propAddr.html,
    daysH: daysH.html,
    startH: startH.html,
    endH: endH.html,
    durLabel: escapeHtml(durLabel),
    rentH: rentH.html,
    parcels: escapeHtml(parcels).replace(/\n/g, '<br/>'),
    adminH: adminH.html,
    cleanH: cleanH.html,
    maxOccH: maxOccH.html,
    fineDayH: fineDayH.html,
    holdoverH: holdoverH.html,
    holdoverMult: fees.holdoverMultiplier,
    conductFine: fees.conductFineAlugueis,
    waterH: waterH.html,
    elecH: elecH.html,
    kwhH: kwhH.html,
    waterFeeH: waterFeeH.html,
    waterBaseM3: fees.waterBaseM3,
    payAddr: payAddr.html,
    boletoPerson: escapeHtml(landlord.boletoCreditorPerson),
    boletoCompany: escapeHtml(landlord.boletoCreditorCompany),
    cityH: cityH.html,
    dateSignH: dateSignH.html,
    forumH: forumH.html,
    city,
    startBr,
    landlordNamePlain: escapeHtml(landlord.name),
    tenantNamePlain: escapeHtml(input.tenantName),
    fleaFee: escapeHtml(formatMoneyBr(fees.fleaDedetizationFee)),
    generalPlainHtml: escapeHtml(
      bodyPlain.slice(bodyPlain.indexOf('CONDIÇÕES GERAIS'))
    ).replace(/\n/g, '<br/>'),
  });

  return {
    meta: {
      leaseDurationDays: days,
      leaseStartDate: startBr,
      leaseEndDate: endBr,
      rentAmountFormatted: rentFmt,
      adminFeeFormatted: formatMoneyBr(adminFee),
      cleaningFeeFormatted: formatMoneyBr(cleaningFee),
      holdoverAmountFormatted: holdoverAmt,
    },
    text: bodyPlain,
    htmlPreview,
  };
}

function buildHtmlPreview(p: Record<string, string | number>): string {
  return `<div class="contract-preview">
<style>
.contract-preview { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 12px; line-height: 1.45; color: #1e293b; }
.contract-preview mark.contract-hl, .contract-hl {
  background: #fef08a; color: #713f12; font-weight: 800; padding: 0 3px; border-radius: 3px;
  border-bottom: 2px solid #eab308; box-decoration-break: clone;
}
.contract-preview h1 { font-size: 14px; font-weight: 900; margin: 0 0 4px; }
.contract-preview h2 { font-size: 12px; font-weight: 800; margin: 14px 0 6px; letter-spacing: 0.02em; }
.contract-preview .ficha { background: #fffbeb; border: 2px solid #f59e0b; border-radius: 12px; padding: 12px; margin: 8px 0 16px; }
.contract-preview .sec { margin-bottom: 10px; }
.contract-preview .label { font-weight: 700; color: #92400e; font-size: 11px; text-transform: uppercase; }
</style>
<h1>CONTRATO DE LOCAÇÃO RESIDENCIAL POR TEMPORADA</h1>
<p><strong>PRAZO DETERMINADO — ${p.titleDays} DIAS</strong></p>
<div class="ficha">
<h2>FICHA DO CONTRATO (DADOS EM DESTAQUE)</h2>
<div class="sec"><div class="label">1. Locador</div>
Nome: ${p.landlordName}<br/>CPF: ${p.landlordCpf}<br/>Endereço: ${p.landlordAddr}</div>
<div class="sec"><div class="label">2. Locatário (titular)</div>
Nome: ${p.tName}<br/>CPF: ${p.tCpf}<br/>Tel.: ${p.tPhone}<br/>E-mail: ${p.tEmail}<br/>Endereço: ${p.tAddr}</div>
<div class="sec"><div class="label">2.1 Demais ocupantes</div>${p.extrasHtml}</div>
<div class="sec"><div class="label">3. Imóvel</div>
Código: ${p.code} · ${p.condo}<br/>${p.propAddr}</div>
<div class="sec"><div class="label">4. Prazo</div>
${p.daysH} dias · Início ${p.startH} · Término ${p.endH}</div>
<div class="sec"><div class="label">5. Valores</div>
Aluguel: ${p.rentH} / 30 dias<br/>Taxa adm.: ${p.adminH} (reembolsável)<br/>Limpeza saída (padrão): ${p.cleanH}<br/>Ocupantes máx.: ${p.maxOccH}<br/>Permanência indevida: ${p.holdoverMult}× = ${p.holdoverH}<br/>Visitas sem anuência: ${p.fineDayH}/dia/pessoa · Drogas/brigas: ${p.conductFine} aluguéis</div>
<div class="sec"><div class="label">6. Medições</div>
Água: ${p.waterH} · Energia: ${p.elecH} · kWh: ${p.kwhH} · Água base: ${p.waterFeeH}/${p.waterBaseM3} m³</div>
<div class="sec"><div class="label">7–8. Pagamento / Assinatura</div>
${p.payAddr}<br/>Foro: ${p.forumH} · ${p.cityH}, ${p.dateSignH}</div>
</div>
<div class="geral">${p.generalPlainHtml}</div>
</div>`;
}

export interface SeasonContractPropertyFields {
  contractType: 'temporada';
  leaseDurationDays: LeaseDurationDays;
  leaseEndDate: string;
  adminFee?: number;
  cleaningFee?: number;
  maxOccupants?: number;
  propertyAddress?: string;
}

export function toPropertySeasonFields(
  input: Pick<
    SeasonContractInput,
    'leaseStartDate' | 'leaseDurationDays' | 'adminFee' | 'cleaningFee' | 'maxOccupants' | 'propertyAddress'
  >
): SeasonContractPropertyFields {
  const end = calcLeaseEndDate(input.leaseStartDate, input.leaseDurationDays);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, '0');
  const dd = String(end.getDate()).padStart(2, '0');
  return {
    contractType: 'temporada',
    leaseDurationDays: input.leaseDurationDays,
    leaseEndDate: `${yyyy}-${mm}-${dd}`,
    adminFee: input.adminFee,
    cleaningFee: input.cleaningFee,
    maxOccupants: input.maxOccupants,
    propertyAddress: input.propertyAddress,
  };
}

/** Verifica se há documento de identidade do titular (imagem/PDF). */
export function hasTenantIdDocument(
  documents?: { name?: string; fileType?: string; fileData?: string }[] | null
): boolean {
  if (!documents?.length) return false;
  return documents.some((d) => {
    if (!d.fileData) return false;
    const t = (d.fileType || '').toLowerCase();
    const n = (d.name || '').toLowerCase();
    return (
      t.startsWith('image/') ||
      t === 'application/pdf' ||
      /\.(jpe?g|png|webp|gif|pdf)$/i.test(n) ||
      d.fileData.startsWith('data:image/') ||
      d.fileData.startsWith('data:application/pdf')
    );
  });
}

export function createIntakeToken(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
