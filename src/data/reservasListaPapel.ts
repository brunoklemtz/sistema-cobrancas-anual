import {
  Reservation,
  nightsBetween,
} from '../utils/reservations';

/**
 * Lista lida da folha impressa (foto de 12/11/2026).
 * Marca-texto amarelo = contato direto. As demais linhas ficam como outra origem,
 * com telefone quando a folha trazia o número.
 * Datas no formato da folha (dd/mm/aaaa).
 */
type LinhaFolha = {
  guestName: string;
  checkIn: string;
  checkOut: string;
  channel: 'direto' | 'outra';
  phone?: string;
  propertyHint?: string;
  amount?: number;
  notes?: string;
  seq?: number;
};

function iso(br: string): string {
  const [day, month, year] = br.split('/');
  return `${year}-${month}-${day}`;
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const seen = new Set<string>();

function reserva(linha: LinhaFolha): Reservation {
  const checkIn = iso(linha.checkIn);
  const checkOut = iso(linha.checkOut);
  const sourceKey = `folha-${slug(linha.guestName)}-${checkIn}${linha.seq ? `-${linha.seq}` : ''}`;
  if (seen.has(sourceKey)) {
    throw new Error(`Reserva repetida na folha: ${sourceKey}`);
  }
  seen.add(sourceKey);
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) {
    throw new Error(`Período inválido para ${linha.guestName}: ${linha.checkIn} a ${linha.checkOut}`);
  }
  return {
    id: sourceKey,
    sourceKey,
    guestName: linha.guestName,
    checkIn,
    checkOut,
    channel: linha.channel,
    status: 'confirmada',
    phone: linha.phone,
    propertyHint: linha.propertyHint,
    amount: linha.amount,
    notes: linha.notes,
  };
}

export const RESERVAS_FOLHA: Reservation[] = [
  reserva({ guestName: 'Alysson SS', checkIn: '13/11/2026', checkOut: '15/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Cristiano Ferreira Da Silva', checkIn: '13/11/2026', checkOut: '16/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Maria Alice Oliveira', checkIn: '13/11/2026', checkOut: '16/11/2026', channel: 'outra', propertyHint: 'Apto 202' }),
  reserva({ guestName: 'Marcio Da Oxford', checkIn: '14/11/2026', checkOut: '14/12/2026', channel: 'outra' }),
  reserva({ guestName: 'Tillero Martinez Xioraly', checkIn: '14/11/2026', checkOut: '15/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Daiane Borba', checkIn: '14/11/2026', checkOut: '16/11/2026', channel: 'outra', propertyHint: 'Ch 25' }),
  reserva({ guestName: 'Aldair Marim', checkIn: '14/11/2026', checkOut: '15/11/2026', channel: 'direto' }),
  reserva({ guestName: 'Katia Milena Paulina Lougon', checkIn: '17/11/2026', checkOut: '19/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Samara', checkIn: '19/11/2026', checkOut: '22/11/2026', channel: 'outra', phone: '5548996788425' }),
  reserva({ guestName: 'André Marciano Schilling', checkIn: '19/11/2026', checkOut: '22/11/2026', channel: 'direto' }),
  reserva({ guestName: 'Gisele Aparecida Macari Canceller', checkIn: '20/11/2026', checkOut: '21/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Gabriel Medeiros', checkIn: '20/11/2026', checkOut: '22/11/2026', channel: 'outra', phone: '554198900072' }),
  reserva({ guestName: 'Julia Costa Werhli', checkIn: '23/11/2026', checkOut: '24/11/2026', channel: 'outra' }),
  reserva({ guestName: 'Rafael Matheus Pires Magalhães', checkIn: '26/11/2026', checkOut: '30/11/2026', channel: 'direto' }),
  reserva({ guestName: 'Elizeu De Oliveira Vargas Junior', checkIn: '02/12/2026', checkOut: '04/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Nilson Nascimento', checkIn: '06/12/2026', checkOut: '07/12/2026', channel: 'outra' }),
  reserva({
    guestName: 'Daniel Soares De Andrade',
    checkIn: '11/12/2026',
    checkOut: '20/12/2026',
    channel: 'direto',
    notes: 'Pagar tudo na chegada',
  }),
  reserva({ guestName: 'Paulo Severo', checkIn: '11/12/2026', checkOut: '13/12/2026', channel: 'outra' }),
  reserva({ guestName: 'Estéfani Nayara', checkIn: '11/12/2026', checkOut: '13/12/2026', channel: 'outra' }),
  reserva({ guestName: 'Jéssica Taina Da Rosa', checkIn: '11/12/2026', checkOut: '13/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Temitope Motunrayo Chidi Amadi', checkIn: '13/12/2026', checkOut: '19/12/2026', channel: 'outra' }),
  reserva({ guestName: 'Alceni Matias Cirilo', checkIn: '13/12/2026', checkOut: '20/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Elisangela Aranas Dos Santos Camargo', checkIn: '19/12/2026', checkOut: '24/12/2026', channel: 'direto' }),
  reserva({
    guestName: 'Juliana Santos Da Silva',
    checkIn: '21/12/2026',
    checkOut: '26/12/2026',
    channel: 'outra',
    notes: 'A folha traz esta reserva duas vezes, nas mesmas datas.',
  }),
  reserva({
    guestName: 'Juliana Santos Da Silva',
    checkIn: '21/12/2026',
    checkOut: '26/12/2026',
    channel: 'outra',
    seq: 2,
    notes: 'Segunda linha igual na folha. Apague se for a mesma reserva.',
  }),
  reserva({ guestName: 'Irajá Ferreira', checkIn: '23/12/2026', checkOut: '27/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Maykon Barbosa Cantieri', checkIn: '23/12/2026', checkOut: '31/12/2026', channel: 'direto', phone: '556792950553' }),
  reserva({
    guestName: 'Isabel Gadonski',
    checkIn: '24/12/2026',
    checkOut: '27/12/2026',
    channel: 'outra',
    notes: 'Anotação manuscrita na folha: IMPUM',
  }),
  reserva({ guestName: 'William Wasen', checkIn: '25/12/2026', checkOut: '26/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Gustavo Sousa', checkIn: '26/12/2026', checkOut: '29/12/2026', channel: 'direto', phone: '5511984970689' }),
  reserva({ guestName: 'Karen Almeida Silverio', checkIn: '26/12/2026', checkOut: '30/12/2026', channel: 'direto' }),
  reserva({ guestName: 'Gabriel Schuler Schuler', checkIn: '26/12/2026', checkOut: '31/12/2026', channel: 'direto' }),
  reserva({
    guestName: 'Michelli Katiana Martinez Carrera',
    checkIn: '27/12/2026',
    checkOut: '03/01/2027',
    channel: 'direto',
    phone: '595993252729',
    amount: 4000,
    notes: 'Total R$ 4.000,00 na folha. A linha de baixo repetia o nome com o telefone 595 993 252729.',
  }),
  reserva({ guestName: 'Freire Mônica Alejandra', checkIn: '29/12/2026', checkOut: '05/01/2027', channel: 'outra' }),
  reserva({
    guestName: 'Diogo Leonardo Graczcki',
    checkIn: '30/12/2026',
    checkOut: '04/01/2027',
    channel: 'outra',
    phone: '554999913967',
    notes: 'E-mail na folha ilegível (termina em gmail.com).',
  }),
  reserva({ guestName: 'Daiane Janaine Vilarino Da Silva Rodrigues', checkIn: '30/12/2026', checkOut: '03/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Igor Haigert Sudati De', checkIn: '30/12/2026', checkOut: '03/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Vinicius', checkIn: '30/12/2026', checkOut: '03/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Roberta Gorski', checkIn: '30/12/2026', checkOut: '03/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Fernando Crispim', checkIn: '30/12/2026', checkOut: '04/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Gabriel Medeiros', checkIn: '30/12/2026', checkOut: '04/01/2027', channel: 'outra', phone: '554198900072' }),
  reserva({ guestName: 'Ana Carla Negrini', checkIn: '30/12/2026', checkOut: '04/01/2027', channel: 'direto', phone: '554991890587' }),
  reserva({ guestName: 'Gabryel Henrique Da Silva', checkIn: '31/12/2026', checkOut: '05/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Emerson Luiz Braga', checkIn: '01/01/2027', checkOut: '05/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Jean Ricardo Mattana', checkIn: '02/01/2027', checkOut: '07/01/2027', channel: 'outra', phone: '555491818245' }),
  reserva({ guestName: 'Carla Renata Dos Santos', checkIn: '04/01/2027', checkOut: '06/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Evandro Grilo', checkIn: '04/01/2027', checkOut: '08/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Jhonatan Batista', checkIn: '05/01/2027', checkOut: '08/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Ariane Queila Macena', checkIn: '05/01/2027', checkOut: '08/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Lia Balbina Ortiz', checkIn: '05/01/2027', checkOut: '15/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Roque Luis Carrera Barrios', checkIn: '17/01/2027', checkOut: '24/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Rumilda Carrera', checkIn: '17/01/2027', checkOut: '31/01/2027', channel: 'direto' }),
  reserva({ guestName: 'Suelen Paiva', checkIn: '17/01/2027', checkOut: '23/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Cezar Baltazar Correia', checkIn: '21/01/2027', checkOut: '24/01/2027', channel: 'direto', phone: '554991337133' }),
  reserva({
    guestName: 'Terezinha Bezerra Leite Nantes',
    checkIn: '22/01/2027',
    checkOut: '29/01/2027',
    channel: 'direto',
    phone: '556791341983',
    amount: 1900,
    notes: 'Anotação "Fechos 1900" lida como valor fechado de R$ 1.900,00.',
  }),
  reserva({ guestName: 'Bruno Adriano Da Silva Machado', checkIn: '23/01/2027', checkOut: '31/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Jean Carlos De Souza Santos', checkIn: '25/01/2027', checkOut: '28/01/2027', channel: 'outra' }),
  reserva({ guestName: 'Potiassu José Kleber Da Silva', checkIn: '28/01/2027', checkOut: '01/02/2027', channel: 'direto' }),
  reserva({ guestName: 'Tatiani Bonoto Medeiros', checkIn: '30/01/2027', checkOut: '02/02/2027', channel: 'direto' }),
  reserva({ guestName: 'Ana Paula Da Silveira', checkIn: '12/02/2027', checkOut: '16/02/2027', channel: 'direto' }),
  reserva({ guestName: 'Rodrigo Lopes', checkIn: '16/02/2027', checkOut: '23/02/2027', channel: 'direto' }),
];
