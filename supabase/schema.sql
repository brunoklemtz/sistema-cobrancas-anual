-- Sistema Cobranças — schema Supabase (Postgres)
-- Rode no SQL Editor: https://supabase.com/dashboard/project/pnjxjemarmsxpltzoqwf/sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabelas no estilo documento (JSONB) para espelhar o Firestore antigo
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS billings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS condominiums (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id TEXT PRIMARY KEY,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS whatsapp_alerts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para ordenação/filtros comuns
CREATE INDEX IF NOT EXISTS properties_code_idx ON properties ((doc->>'propertyCode'));
CREATE INDEX IF NOT EXISTS billings_property_idx ON billings ((doc->>'propertyId'));
CREATE INDEX IF NOT EXISTS billings_due_idx ON billings ((doc->>'dueDate'));
CREATE INDEX IF NOT EXISTS condominiums_name_idx ON condominiums ((doc->>'name'));
CREATE INDEX IF NOT EXISTS whatsapp_queue_status_idx ON whatsapp_queue ((doc->>'status'));
CREATE INDEX IF NOT EXISTS whatsapp_queue_created_idx ON whatsapp_queue ((doc->>'createdAt'));
CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs ((doc->>'timestamp'));
CREATE INDEX IF NOT EXISTS whatsapp_alerts_created_idx ON whatsapp_alerts ((doc->>'createdAt'));

-- RLS: apenas autenticados
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE condominiums ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'properties','billings','condominiums','settings',
    'whatsapp_queue','whatsapp_templates','whatsapp_alerts','audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_all_%s" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t, t
    );
  END LOOP;
END $$;

-- Realtime (opcional; ignore erro se já estiver na publication)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE properties;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE billings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE condominiums;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
