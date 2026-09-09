-- Tabela para fichas recebidas pelo link fixo /ficha
-- Mesmo padrão das outras tabelas do Remix (id + doc jsonb)

create table if not exists public.contract_intakes (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Ajuste de RLS conforme sua política (service role na API costuma contornar).
alter table public.contract_intakes enable row level security;

create policy "service or authenticated read contract_intakes"
  on public.contract_intakes for select
  to authenticated
  using (true);

create policy "service insert contract_intakes"
  on public.contract_intakes for insert
  to anon, authenticated
  with check (true);
