PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (
    role IN (
      'administrador',
      'gestor_institucional',
      'gestor_evento',
      'equipe_operacional',
      'comunicacao',
      'somente_leitura'
    )
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  official_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  location TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('presencial', 'online', 'hibrido')),
  responsible_area TEXT NOT NULL,
  lead_user_id INTEGER NOT NULL REFERENCES users(id),
  short_description TEXT NOT NULL,
  full_description TEXT,
  target_audience TEXT,
  accessibility_needs TEXT,
  estimated_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (estimated_budget_cents >= 0),
  status TEXT NOT NULL DEFAULT 'em_planejamento' CHECK (
    status IN (
      'em_planejamento',
      'aguardando_documentos',
      'em_contratacao',
      'em_divulgacao',
      'confirmado',
      'em_execucao',
      'encerrado',
      'com_pendencias'
    )
  ),
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_team_members (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  responsibility TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  area TEXT,
  category TEXT NOT NULL CHECK (category IN ('operacional', 'documental', 'comunicacao', 'fechamento')),
  status TEXT NOT NULL DEFAULT 'nao_iniciado' CHECK (
    status IN ('nao_iniciado', 'em_andamento', 'pendente', 'concluido', 'atrasado')
  ),
  owner_user_id INTEGER REFERENCES users(id),
  due_date TEXT,
  completed_at TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  due_date TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (
    status IN ('nao_iniciada', 'em_andamento', 'pendente', 'concluida', 'atrasada')
  ),
  internal_comments TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS guests (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  affiliation TEXT,
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  mini_bio TEXT,
  participation_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (participation_confirmed IN (0, 1)),
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communication_requests (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  official_title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  full_description TEXT,
  guest_names TEXT,
  required_credits TEXT,
  registration_link TEXT,
  streaming_link TEXT,
  accessibility_info TEXT,
  channels TEXT,
  status TEXT NOT NULL DEFAULT 'nao_solicitado' CHECK (
    status IN (
      'nao_solicitado',
      'aguardando_informacoes',
      'em_producao',
      'em_revisao',
      'aprovado',
      'publicado'
    )
  ),
  communication_owner_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (
    service_type IN (
      'alimentacao',
      'audiovisual',
      'transmissao',
      'fotografia',
      'design',
      'impressao',
      'transporte',
      'hospedagem',
      'acessibilidade',
      'limpeza',
      'seguranca',
      'montagem',
      'equipamento_tecnico',
      'apoio_producao'
    )
  ),
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'cotacao_necessaria' CHECK (
    status IN (
      'cotacao_necessaria',
      'cotacao_solicitada',
      'proposta_recebida',
      'em_analise',
      'aprovado_internamente',
      'contratado',
      'servico_realizado',
      'pendente',
      'cancelado'
    )
  ),
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  template_type TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_template_usage (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES document_templates(id),
  used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_by_user_id INTEGER REFERENCES users(id),
  PRIMARY KEY (event_id, template_id)
);

CREATE TABLE IF NOT EXISTS document_ai_drafts (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL,
  prompt_context TEXT NOT NULL,
  generated_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS event_documents (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  category TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('registro_vazio', 'upload', 'link', 'modelo', 'ia')),
  status TEXT NOT NULL CHECK (
    status IN (
      'aguardando_criacao',
      'em_elaboracao',
      'minuta_gerada',
      'em_revisao',
      'aguardando_aprovacao',
      'aprovado',
      'enviado',
      'arquivado'
    )
  ),
  owner_user_id INTEGER REFERENCES users(id),
  responsible_area TEXT,
  due_date TEXT,
  access_level TEXT NOT NULL CHECK (access_level IN ('publico', 'interno', 'restrito', 'sensivel')),
  version TEXT NOT NULL DEFAULT 'v1',
  file_label TEXT,
  file_url TEXT,
  notes TEXT,
  source_draft_id INTEGER REFERENCES document_ai_drafts(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_responsible_area ON events(responsible_area);
CREATE INDEX IF NOT EXISTS idx_tasks_event_status_due ON tasks(event_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_checklist_event_status ON checklist_items(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_documents_event_status ON event_documents(event_id, status);
CREATE INDEX IF NOT EXISTS idx_guests_event ON guests(event_id);
CREATE INDEX IF NOT EXISTS idx_vendors_event_status ON vendors(event_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_created ON audit_log(event_id, created_at);
