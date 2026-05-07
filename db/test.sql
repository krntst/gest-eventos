PRAGMA foreign_keys = ON;

.bail on

.read db/schema.sql
.read db/seed.sql

CREATE TEMP TABLE assertions (
  passed INTEGER NOT NULL CHECK (passed = 1),
  message TEXT NOT NULL
);

INSERT INTO assertions (passed, message)
SELECT COUNT(*) = 1, 'evento piloto cadastrado'
FROM events
WHERE official_name = 'Seminario Memoria Institucional e Cultura Digital';
SELECT 'ok: evento piloto cadastrado';

INSERT INTO assertions (passed, message)
SELECT COUNT(*) >= 6, 'checklist inicial criado'
FROM checklist_items
WHERE event_id = 1;
SELECT 'ok: checklist inicial criado';

INSERT INTO assertions (passed, message)
SELECT COUNT(*) >= 3, 'tarefas iniciais criadas'
FROM tasks
WHERE event_id = 1;
SELECT 'ok: tarefas iniciais criadas';

INSERT INTO assertions (passed, message)
SELECT COUNT(*) = 1, 'demanda de comunicacao vinculada'
FROM communication_requests
WHERE event_id = 1
  AND status = 'aguardando_informacoes';
SELECT 'ok: demanda de comunicacao vinculada';

INSERT INTO assertions (passed, message)
SELECT COUNT(*) = 1, 'convidado vinculado ao evento'
FROM guests
WHERE event_id = 1
  AND participation_confirmed = 1;
SELECT 'ok: convidado vinculado ao evento';

INSERT INTO assertions (passed, message)
SELECT COUNT(*) >= 2, 'historico minimo registrado'
FROM audit_log
WHERE event_id = 1;
SELECT 'ok: historico minimo registrado';

SELECT
  e.official_name AS evento,
  e.status,
  COUNT(DISTINCT t.id) AS tarefas,
  COUNT(DISTINCT ci.id) AS checklist,
  COUNT(DISTINCT g.id) AS convidados,
  cr.status AS comunicacao
FROM events e
LEFT JOIN tasks t ON t.event_id = e.id
LEFT JOIN checklist_items ci ON ci.event_id = e.id
LEFT JOIN guests g ON g.event_id = e.id
LEFT JOIN communication_requests cr ON cr.event_id = e.id
WHERE e.id = 1
GROUP BY e.id, cr.status;
