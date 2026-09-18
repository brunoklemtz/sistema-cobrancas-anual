# Varredura Origem WhatsApp

Extensão Chrome para classificar a origem de leads no WhatsApp Web, focada em estatísticas de:

- Meta / Instagram / Facebook;
- Status;
- Marketplace;
- Site;
- origem desconhecida.

A extensão é somente leitura: não gera rascunhos, não envia mensagens e não toca na caixa de mensagem do WhatsApp.

## Instalar

```powershell
cd "C:\Users\klemt\Projects\REMIX SISTEMA ANUAL CARLOS\extension"
npm install
npm test
npm run build
```

Depois:

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `extension`.
5. Abra `https://web.whatsapp.com/` logado.

## Como Usar

1. Importe `fila-marketing.json`.
2. Escolha o lote de DMs por rodada.
3. Rode **Fazer smoke test**.
4. Se estiver ok, clique em **Iniciar varredura**.
5. Exporte `origem-whatsapp.json` ou `origem-whatsapp.csv`.
6. No projeto do site, aplique o resultado com o script de marketing correspondente.

## Segurança

- Não envia mensagens.
- Não usa OpenAI.
- Não acessa Airbnb/Booking.
- Não clica em enviar.
- Não preenche rascunho.
- Rola a conversa apenas para identificar contexto de origem.

## Validação

```powershell
npm test
npm run build
```
