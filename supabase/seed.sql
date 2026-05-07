-- FCRB Eventos - minimal seed data for deploy testing.

with gestor as (
  insert into public.users (name, email, role, department)
  values (
    'Ana Silva',
    'ana.silva@fcrb.gov.br',
    'gestor_eventos',
    'Setor de Eventos'
  )
  on conflict (email) do update
    set
      name = excluded.name,
      role = excluded.role,
      department = excluded.department,
      updated_at = now()
  returning id
),
evento as (
  insert into public.events (
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
    status
  )
  select
    'Congresso Internacional de Literatura de Cordel',
    'Seminário',
    '2026-05-15',
    '09:00',
    '20:00',
    'Auditório, Pátio Externo',
    'hibrido',
    'Centro de Pesquisa',
    gestor.id,
    'A FCRB promove congresso sobre Literatura de Cordel, patrimônio imaterial do Brasil, debatendo transformações, novos públicos e origens do gênero.',
    'Evento institucional dedicado à Literatura de Cordel, reunindo pesquisadores, convidados externos e equipe de produção para debates, registros e ações de divulgação.',
    'Pesquisadores, estudantes, convidados externos e comunidade FCRB',
    'em_planejamento'
  from gestor
  where not exists (
    select 1
    from public.events
    where official_name = 'Congresso Internacional de Literatura de Cordel'
  )
  returning id
),
evento_ref as (
  select id
  from evento
  union all
  select id
  from public.events
  where official_name = 'Congresso Internacional de Literatura de Cordel'
  limit 1
),
gestor_ref as (
  select id
  from gestor
  union all
  select id
  from public.users
  where email = 'ana.silva@fcrb.gov.br'
  limit 1
)
insert into public.communication_requests (
  event_id,
  status,
  collection_owner_id,
  communication_owner_id,
  inputs_due_date,
  publication_due_date,
  completion_percent,
  title,
  short_description,
  full_description,
  piece_type,
  objective,
  audience,
  registration_link,
  streaming_link,
  channels,
  notes
)
select
  evento_ref.id,
  'aguardando_informacoes',
  gestor_ref.id,
  gestor_ref.id,
  '2026-05-08',
  '2026-05-12',
  65,
  'Congresso Internacional de Literatura de Cordel',
  'Encontro sobre Literatura de Cordel, patrimônio imaterial do Brasil, seus públicos e transformações contemporâneas.',
  'A FCRB promove congresso sobre Literatura de Cordel, patrimônio imaterial do Brasil, debatendo transformações, novos públicos e origens do gênero, com participação de pesquisadores e convidados externos.',
  'Post, card institucional e chamada para site',
  'Divulgação institucional do evento',
  'Público interessado, pesquisadores e comunidade FCRB',
  'A definir',
  'A definir',
  'Site institucional, Instagram, Newsletter, YouTube, Mailing',
  'Seed inicial para testar a aba Comunicação no deploy.'
from evento_ref, gestor_ref
on conflict (event_id) do update
  set
    status = excluded.status,
    collection_owner_id = excluded.collection_owner_id,
    communication_owner_id = excluded.communication_owner_id,
    inputs_due_date = excluded.inputs_due_date,
    publication_due_date = excluded.publication_due_date,
    completion_percent = excluded.completion_percent,
    title = excluded.title,
    short_description = excluded.short_description,
    full_description = excluded.full_description,
    piece_type = excluded.piece_type,
    objective = excluded.objective,
    audience = excluded.audience,
    registration_link = excluded.registration_link,
    streaming_link = excluded.streaming_link,
    channels = excluded.channels,
    notes = excluded.notes,
    updated_at = now();

with evento_ref as (
  select id
  from public.events
  where official_name = 'Congresso Internacional de Literatura de Cordel'
  limit 1
),
gestor_ref as (
  select id
  from public.users
  where email = 'ana.silva@fcrb.gov.br'
  limit 1
)
insert into public.checklist_items (
  event_id,
  title,
  area,
  status,
  owner_user_id,
  due_date,
  notes
)
select
  evento_ref.id,
  item.title,
  item.area,
  item.status,
  gestor_ref.id,
  item.due_date,
  item.notes
from evento_ref, gestor_ref,
(
  values
    (
      'Solicitar fotos e mini bios dos convidados',
      'Comunicação',
      'pendente',
      '2026-05-06'::date,
      'Informações necessárias para peças de divulgação.'
    ),
    (
      'Confirmar estrutura do auditório',
      'Infraestrutura',
      'em_andamento',
      '2026-05-10'::date,
      'Validar som, projeção e disposição da mesa.'
    ),
    (
      'Gerar ofício-convite institucional',
      'Documentos',
      'pendente',
      '2026-05-08'::date,
      'Minuta pode ser criada pela aba Documentos e Minutas.'
    )
) as item(title, area, status, due_date, notes)
where not exists (
  select 1
  from public.checklist_items ci
  where ci.event_id = evento_ref.id
    and ci.title = item.title
);

insert into public.document_templates (
  name,
  category,
  document_type,
  description,
  body_template,
  is_active
)
select
  model.name,
  model.category,
  model.document_type,
  model.description,
  model.body_template,
  true
from (
  values
    (
      'Ofício-convite',
      'Convites',
      'Ofício',
      'Modelo institucional para convidar palestrantes, autoridades ou representantes de instituições.',
      'Ofício nº [Número]/[Ano]/FCRB\n\nÀ/ao [Destinatário],\n\nA Fundação Casa de Rui Barbosa convida V.Sa. para participar do evento [Nome do evento], a realizar-se em [Data], no local [Local].\n\nAtenciosamente,\n[Assinatura]'
    ),
    (
      'Solicitação de parceria',
      'Parcerias',
      'Solicitação',
      'Modelo para registrar pedido de apoio, cooperação ou parceria institucional.',
      'Prezados(as),\n\nA Fundação Casa de Rui Barbosa apresenta solicitação de parceria para o evento [Nome do evento], com objetivo de [Objetivo].\n\nDetalhes da proposta:\n[Descrição]\n\nAtenciosamente,\n[Assinatura]'
    ),
    (
      'Mensagem para foto e mini bio',
      'Comunicação',
      'Mensagem',
      'Texto base para solicitar foto, mini bio e dados de contato de convidado.',
      'Olá, [Nome]. Tudo bem?\n\nPara a divulgação do evento [Nome do evento], pedimos o envio de uma foto em boa resolução e uma mini bio curta, com até 300 caracteres.\n\nObrigada(o),\nEquipe FCRB'
    ),
    (
      'Relatório pós-evento',
      'Encerramento e memória',
      'Relatório',
      'Modelo para consolidar informações finais, público, registros e aprendizados do evento.',
      'Relatório pós-evento\n\nEvento: [Nome do evento]\nData: [Data]\nLocal: [Local]\n\nResumo:\n[Resumo]\n\nResultados:\n[Resultados]\n\nPendências e memória institucional:\n[Observações]'
    )
) as model(name, category, document_type, description, body_template)
where not exists (
  select 1
  from public.document_templates dt
  where dt.name = model.name
);
