import { writeFileSync } from 'fs';
import { jsPDF } from 'jspdf';
import { buildSeasonContract } from '../src/contracts/temporada.ts';

const filled = buildSeasonContract({
  propertyCode: '301',
  condominium: 'CASA OLINDA',
  propertyAddress: 'Rua Olinda Peixoto, n° 431, APTO 301, Perequê, Porto Belo/SC',
  tenantName: 'Boris Fernando Titus Staciuk',
  tenantCpf: '130.113.681-63',
  tenantEmail: 'astaciuk@yahoo.com.ar',
  tenantPhone: '+54 9 3754 41-7912',
  tenantAddress: 'Rua Olinda Peixoto, n° 430, 301, Perequê, Porto Belo/SC',
  rentAmount: 1600,
  leaseStartDate: '2026-08-28',
  leaseDurationDays: 90,
  maxOccupants: 1,
  adminFee: 500,
  cleaningFee: 100,
  highlightPlain: false,
});

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const marginX = 14;
const marginTop = 12;
const marginBottom = 14;
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const maxW = pageW - marginX * 2;
let y = marginTop;

doc.setTextColor(20, 20, 20);

for (const raw of filled.text.split('\n')) {
  const line = raw.replace(/\t/g, '  ');
  const isTitle = line.startsWith('CONTRATO DE') || line.startsWith('PRAZO DETERMINADO');
  const isClause = /^Cláusula /.test(line) || line.startsWith('ARTIGO ') || line.startsWith('ANEXO');
  const isFicha = line.includes('FICHA DO CONTRATO') || line.startsWith('=======');
  const isBlank = line.trim() === '';

  if (isTitle || isFicha) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
  } else if (isClause) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
  }

  const wrapped = isBlank ? [''] : doc.splitTextToSize(line || ' ', maxW);
  for (const w of wrapped) {
    if (y > pageH - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
    doc.text(w, marginX, y);
    y += isTitle ? 5 : 4.2;
  }
  if (isTitle) y += 1;
  if (isClause) y += 0.6;
}

const outPdf = 'contratos/CONTRATO_301_BORIS_90_DIAS.pdf';
writeFileSync(outPdf, Buffer.from(doc.output('arraybuffer')));
writeFileSync('contratos/EXEMPLO_301_BORIS_90_DIAS.txt', filled.text);
console.log(outPdf);
console.log(JSON.stringify(filled.meta));
