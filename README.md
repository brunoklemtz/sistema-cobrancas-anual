# Sistema de Cobranças Mensal e Anual

App React + Vite + **Supabase (Postgres)** + APIs WhatsApp (UAZAPI), pronto para **Vercel** + **GitHub**.

## Pré-requisitos

- Node.js 20+
- Projeto Supabase com o schema em [`supabase/schema.sql`](supabase/schema.sql)
- Chaves `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

## Setup local

1. Copie o env:
   ```bash
   copy .env.example .env.local
   ```
2. Cole URL e anon key do Supabase em `.env.local`
3. No Supabase SQL Editor, rode `supabase/schema.sql`
4. Ative **Authentication → Providers → Google** (redirect: `http://localhost:3000` e o domínio Vercel)
5. Instale e rode:
   ```bash
   npm install
   npm run dev
   ```
6. Abra http://localhost:3000

## Deploy Vercel

1. Crie um **repo GitHub novo** (não use `brunoklemtz/site`)
2. Na Vercel: **Add New Project** → importe o repo
3. Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Build: `npm run build:web` / Output: `dist` (já em `vercel.json`)

## Contas já mapeadas

| Serviço | Conta / recurso |
|---------|-----------------|
| GitHub | `brunoklemtz` (criar repo novo para cobranças) |
| Vercel | `klemtz` (criar projeto novo, não `site`) |
| Supabase | `pnjxjemarmsxpltzoqwf` |

## Estrutura

- `src/` — frontend React
- `src/lib/db.ts` — acesso ao Postgres via Supabase
- `api/` — serverless functions Vercel (UAZAPI)
- `shared/uazapi.ts` — lógica compartilhada local/Vercel
- `supabase/schema.sql` — tabelas + RLS
