# Contrato padrão — Temporada 30 / 60 / 90 dias

Modelo único (ficha + condições gerais + regimento) para todos os contratos do Remix.

## Fluxo

1. Link **fixo** do formulário: `https://SEU-DOMINIO/ficha` (também `/formulario`).
2. Locatário preenche dados + ocupantes + foto do documento.
3. Ficha cai em `contract_intakes` (status pending).
4. Você preenche o imóvel no Remix, importa/anexa os dados e gera o contrato 30/60/90.

No PropertyForm: botão **Copiar link fixo da ficha (/ficha)**.


## Campos do link (locatário)

- Nome, CPF, WhatsApp, e-mail, endereço
- Quantidade de moradores + nome/CPF/telefone de cada adicional
- Foto do documento **só do titular** (obrigatória)
- Declaração de veracidade

## Admin (fora do link)

Código, condomínio, endereço do imóvel, aluguel, início, prazo, taxa adm., limpeza, leituras.

## Código

- Gerador: `src/contracts/temporada.ts`
- UI: `src/components/PropertyForm.tsx`
- Formulário público: `src/components/TenantIntakeForm.tsx` + `GET/POST /api/contract-intake`
- Exemplo PDF: `contratos/gerar-pdf-exemplo.ts`
