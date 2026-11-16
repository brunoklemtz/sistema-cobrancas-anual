# Rotina do painel do balcão

A lista sai da **base central** (arquivo local + Supabase). Fontes de abastecimento no PC:

1. **Data de entrada** (e-mail Reserva Nova, planilha ou API) — define Hoje/Amanhã  
2. **Dashboard Artax** — Hospedados / Chegada / Saída (confirma e corrige UH)  
3. **Planilha** — inventário 1x/dia  
4. **API Artax** — 1x/dia, só preenche buraco (com cooldown 6h se 401/429)

O painel **não depende** da API Artax para existir. Check-in manual na Artax **não** é a porta de entrada do balcão.

## Links

- **Equipe (fixo, Vercel):** `https://site-klemtz.vercel.app/balcao/<token>/`  
  Também em `dados/url-fixo.txt` depois do seed/sync.  
  Secret: `BALCAO_PUBLIC_TOKEN` na Vercel (mesmo valor de `dados/token.txt`).
- **Contingência local / túnel:** `https://….trycloudflare.com/t/<token>/` via `publicar.ps1`  
  Só quem tem o link entra. Sem o token, 401. Não publique em grupo aberto.

O PC precisa estar ligado para abastecer (Chrome logado na Artax). A tela na Vercel abre mesmo se o túnel cair.

## Publicar / deploy

```powershell
# 1) Schema + seed da base atual no Supabase
node .\painel-balcao\seed-nuvem.mjs

# 2) Agenda do PC (planilha 07h, dash 08–20h, emails 15min 08–23h, API 21:30)
powershell -ExecutionPolicy Bypass -File ".\painel-balcao\agendar.ps1"
  # Agenda aponta para C:\dev\balcao\*.cmd (atalho sem espaço no path)

# 3) Túnel antigo (opcional, contingência)
powershell -ExecutionPolicy Bypass -File ".\painel-balcao\publicar.ps1"
```

No site (`C:\dev\site`): deploy na Vercel com `BALCAO_PUBLIC_TOKEN` = conteúdo de `painel-balcao/dados/token.txt`.

## Agenda automática

- **07:00** — planilha Artax (inventário)  
- **08:00–20:00** — dashboard Artax a cada **15 min** (Chrome balcão porta **9223**, área 2)  
  - Atualiza `balcao_base` e espelha as linhas em `temporada_reservas` (painel Temporada)  
  - Em seguida: `forcar-telefones-artax.mjs` grava na Artax (formulário web) os telefones com `payload.artax_tel=pendente` — **sem API**  
- **A cada 30 min** — `checar-saude.mjs` (Chrome 9223, dashboard com menos de 45 min, tarefa dash = 0); falha → `dados/saude.json` + aviso no balcão + **WhatsApp** (chip 4455 → `BALCAO_AVISO_TEL`), anti-spam 60 min  
- **A cada 1 min** — `ouvir-comandos.mjs` (fila na nuvem: `dash` / `saude` / `forcar_tel` / `status`)  
- **08:00–23:00** — e-mails Reserva Nova, a cada **15 min**  
  - Reserva nova: grava na base + dispara **boas-vindas** (hóspede) e **aviso à equipe** via site (`/api/balcao/.../reserva-nova`)  
- **21:30** — API Artax (**conservadora**: só buraco; cooldown 6h se 401/429)  
- Chrome do scrape: só `chrome-balcao.cmd` (9223). Não usa o Chrome do dia a dia.  
- Botão **Atualizar** no painel Temporada / balcão na Vercel — só recarrega a lista (não dispara Chrome)

## Avisos WhatsApp + correção pelo celular

Falha real do balcão (Chrome 9223 fora, dashboard velho, tarefa dash com erro, scrape com 0 linhas) manda WhatsApp para o Bruno pelo chip **4455**.  
Configure na Vercel: `BALCAO_AVISO_TEL` = seu celular (não o número do chip — a UAZAPI bloqueia envio “para si”).

**Hospedados vazio não é falha.** A aba Artax só enche após check-in; a base local/nuvem manda. Lista vazia não zera a base nem gera aviso.

### Corrigir pelo telefone

1. **WhatsApp (rotina fixa)** — do número em `BALCAO_AVISO_TEL`, mande para o 4455:
   - `corrige balcao` → enfileira **dash**
   - `corrige balcao dash` / `corrige balcao saude`
   - Resposta: “Ok, pedi ao PC…”. O PC precisa estar ligado (tarefa `Painel balcao comandos 1min`).
2. **Cursor no celular** — peça “roda o dash do balcão” / “corrige saúde”. O agente na sessão do PC executa os mesmos scripts (`atualizar.mjs --dashboard`, `checar-saude.mjs`). Use quando o chat do Cursor estiver aberto; a fila WhatsApp cobre quando não estiver.

Webhook dedicado (UAZAPI 4455): `POST /api/balcao/wa?token=<BALCAO_PUBLIC_TOKEN>`.  
Também aceita no webhook geral se a mensagem vier do celular autorizado.

### Limites (PC obrigatório)

| Camada | Onde |
|---|---|
| Lista / matriz | Nuvem (Vercel + `balcao_base`) |
| Aviso de falha | WhatsApp via site |
| Rodar dash / saúde / forçar tel | **PC** (Chrome 9223 + Artax logado) |
| Scrape sem PC | Não (fase 2 / VPS — fora desta rotina) |

Se o PC estiver desligado, o aviso chega no celular, mas o comando fica `pendente` até o worker voltar.

## Uso no balcão

- Visualização: só **Matriz**  
- Abas: Ontem | Hoje | Amanhã | Saídas  
- Apto em texto; **Marcar entrada** consolida a localização  
- Depois de **Entrou**, mudança de UH no dashboard não move o hóspede  
- Apto vago: **Incluir** / **Tirar** só na base (manual)  
- Selo **Entrada** = data da reserva, não o clique de check-in na Artax  
- Selo **Sem tel** = sem WhatsApp ainda; **WA falhou** = número inválido / fora do WhatsApp  

## Telefone automático (só 3 fontes)

O número do hóspede entra **somente** por:

1. **E-mail Reserva Nova** — telefone no cabeçalho do e-mail  
2. **Planilha Artax** — colunas telefone / celular / whatsapp (07h)  
3. **API Artax** — `guest_phone` / `holder_guest.phones` (21:30 e webhook/GET no site)

Sem Chrome Airbnb e sem ficha Artax para **achar** telefone. Dashboard não traz número.

Quando a reserva nasce sem telefone: aviso à equipe/gestor (`⚠️ Sem telefone …`), status `pendente_telefone` / selo **Sem tel**.  
O retry de BV no site sincroniza balcão → temporada e dispara quando uma das 3 fontes preencher o buraco.

Manual: colar no campo Telefone do balcão / Temporada e **Enviar** (marca `artax_tel=pendente`; o job do PC grava Celular na Artax via formulário web).  
Não usar os 4 dígitos do “código da porta” como telefone.
