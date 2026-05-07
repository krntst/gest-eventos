PRAGMA foreign_keys = ON;

INSERT INTO users (id, name, email, role) VALUES
  (1, 'Ana Gestora', 'ana.gestora@fcrb.gov.br', 'gestor_evento'),
  (2, 'Bruno Comunicacao', 'bruno.comunicacao@fcrb.gov.br', 'comunicacao'),
  (3, 'Carla Operacional', 'carla.operacional@fcrb.gov.br', 'equipe_operacional')
ON CONFLICT(email) DO NOTHING;

INSERT INTO events (
  id,
  official_name,
  event_type,
  event_date,
  start_time,
  end_time,
  location,
  format,
  responsible_area,
  lead_user_id,
  short_description,
  full_description,
  target_audience,
  accessibility_needs,
  estimated_budget_cents,
  status,
  internal_notes
) VALUES (
  1,
  'Seminario Memoria Institucional e Cultura Digital',
  'seminario',
  '2026-05-21',
  '14:00',
  '18:00',
  'Auditorio da Fundacao Casa de Rui Barbosa',
  'hibrido',
  'Centro de Memoria e Informacao',
  1,
  'Encontro para discutir preservacao digital e memoria institucional.',
  'Seminario com convidados externos, transmissao online e demanda de divulgacao institucional.',
  'Pesquisadores, servidores publicos e publico interessado em cultura digital.',
  'Interpretacao em Libras solicitada.',
  250000,
  'em_planejamento',
  'Evento piloto para validar o fluxo do MVP.'
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO event_team_members (event_id, user_id, responsibility) VALUES
  (1, 1, 'Responsavel principal'),
  (1, 2, 'Comunicacao e divulgacao'),
  (1, 3, 'Apoio operacional')
ON CONFLICT(event_id, user_id) DO NOTHING;

INSERT INTO checklist_items (id, event_id, title, category, status, owner_user_id, due_date) VALUES
  (1, 1, 'Solicitacao interna criada', 'documental', 'concluido', 1, '2026-05-05'),
  (2, 1, 'Convidados confirmados', 'operacional', 'em_andamento', 1, '2026-05-08'),
  (3, 1, 'Fotos recebidas', 'comunicacao', 'pendente', 2, '2026-05-10'),
  (4, 1, 'Mini bios recebidas', 'comunicacao', 'pendente', 2, '2026-05-10'),
  (5, 1, 'Infraestrutura confirmada', 'operacional', 'nao_iniciado', 3, '2026-05-15'),
  (6, 1, 'Relatorio pos-evento pendente', 'fechamento', 'nao_iniciado', 1, '2026-05-25')
ON CONFLICT(id) DO NOTHING;

INSERT INTO tasks (id, event_id, title, owner_user_id, due_date, priority, status, internal_comments) VALUES
  (1, 1, 'Confirmar participacao dos palestrantes', 1, '2026-05-08', 'alta', 'em_andamento', 'Prioridade para liberar comunicacao.'),
  (2, 1, 'Solicitar card de divulgacao', 2, '2026-05-11', 'media', 'pendente', 'Depende de fotos e mini bios.'),
  (3, 1, 'Confirmar transmissao online', 3, '2026-05-13', 'media', 'nao_iniciada', NULL)
ON CONFLICT(id) DO NOTHING;

INSERT INTO guests (
  id,
  event_id,
  full_name,
  affiliation,
  email,
  phone,
  photo_url,
  mini_bio,
  participation_confirmed,
  internal_notes
) VALUES (
  1,
  1,
  'Dra. Helena Duarte',
  'Universidade Federal do Rio de Janeiro',
  'helena.duarte@example.org',
  '+55 21 99999-0000',
  NULL,
  'Pesquisadora em memoria institucional e preservacao digital.',
  1,
  'Autorizacao de uso de imagem pendente.'
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO communication_requests (
  id,
  event_id,
  official_title,
  short_description,
  full_description,
  guest_names,
  required_credits,
  registration_link,
  streaming_link,
  accessibility_info,
  channels,
  status,
  communication_owner_id
) VALUES (
  1,
  1,
  'Seminario Memoria Institucional e Cultura Digital',
  'Encontro sobre preservacao digital e memoria institucional.',
  'Atividade hibrida com pesquisadores convidados e transmissao online.',
  'Dra. Helena Duarte',
  'Fundacao Casa de Rui Barbosa / Ministerio da Cultura',
  'https://inscricoes.example.org/memoria-digital',
  'https://video.example.org/fcrb',
  'Evento com previsao de interpretacao em Libras.',
  'site, redes sociais, mailing',
  'aguardando_informacoes',
  2
)
ON CONFLICT(id) DO NOTHING;

INSERT INTO vendors (id, event_id, name, service_type, contact_person, email, phone, status, internal_notes) VALUES
  (1, 1, 'Rio Streaming Servicos', 'transmissao', 'Marcos Lima', 'marcos@riostreaming.example', '+55 21 98888-0000', 'cotacao_solicitada', 'Aguardando proposta tecnica.')
ON CONFLICT(id) DO NOTHING;

INSERT INTO document_templates (id, name, template_type, body) VALUES
  (1, 'Solicitacao interna de evento', 'solicitacao', 'Modelo base para abertura e justificativa institucional do evento.'),
  (2, 'Briefing de comunicacao', 'comunicacao', 'Modelo com titulo, resumo, convidados, fotos, mini bios, links e canais.'),
  (3, 'Relatorio pos-evento', 'fechamento', 'Modelo para registrar resultados, pendencias finais e memoria do evento.')
ON CONFLICT(name) DO NOTHING;

INSERT INTO event_template_usage (event_id, template_id, used_by_user_id) VALUES
  (1, 1, 1)
ON CONFLICT(event_id, template_id) DO NOTHING;

INSERT INTO audit_log (id, event_id, actor_user_id, action, entity_type, entity_id, details) VALUES
  (1, 1, 1, 'criou_evento', 'event', 1, 'Evento piloto cadastrado no banco local.'),
  (2, 1, 2, 'abriu_demanda_comunicacao', 'communication_request', 1, 'Demanda criada aguardando fotos e mini bios.')
ON CONFLICT(id) DO NOTHING;
