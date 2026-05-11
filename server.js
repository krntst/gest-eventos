const { createReadStream, existsSync, readFileSync } = require("node:fs");
const { extname, join, resolve } = require("node:path");
const http = require("node:http");
const { DatabaseSync } = require("node:sqlite");

function loadLocalEnv() {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv();

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = resolve(process.env.DB_PATH || "data/fluxodc.sqlite");
const ROOT = __dirname;

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");

function ensureSchemaMigrations() {
  const checklistColumns = db.prepare("PRAGMA table_info(checklist_items)").all();
  const hasAreaColumn = checklistColumns.some((column) => column.name === "area");

  if (checklistColumns.length && !hasAreaColumn) {
    db.exec("ALTER TABLE checklist_items ADD COLUMN area TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS document_ai_drafts (
      id INTEGER PRIMARY KEY,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      draft_type TEXT NOT NULL,
      prompt_context TEXT NOT NULL,
      generated_text TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
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
    )
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_event_documents_event_status ON event_documents(event_id, status)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      actor_user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_log_event_created ON audit_log(event_id, created_at DESC)");
}

ensureSchemaMigrations();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolveRequest, rejectRequest) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        rejectRequest(new Error("Payload muito grande."));
      }
    });

    request.on("end", () => {
      try {
        resolveRequest(body ? JSON.parse(body) : {});
      } catch {
        rejectRequest(new Error("JSON invalido."));
      }
    });
  });
}

function normalizeEnum(value, fallback) {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getOrCreateLeadUser(name) {
  const leadName = String(name || "Responsavel nao informado").trim();
  const slug = normalizeEnum(leadName, "responsavel").replace(/[^a-z0-9_]/g, "");
  const email = `${slug || "responsavel"}@teste.local`;
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

  if (existing) return existing.id;

  const result = db
    .prepare("INSERT INTO users (name, email, role) VALUES (?, ?, 'gestor_evento')")
    .run(leadName, email);
  return Number(result.lastInsertRowid);
}

function eventToClient(row) {
  const locations = row.location ? row.location.split(",").map((item) => item.trim()).filter(Boolean) : [];

  return {
    id: `EV-${String(row.id).padStart(4, "0")}`,
    dbId: row.id,
    eventName: row.official_name,
    eventType: row.event_type,
    format: row.format === "hibrido" ? "Híbrido" : row.format.charAt(0).toUpperCase() + row.format.slice(1),
    responsibleArea: row.responsible_area,
    mainResponsible: row.responsavel,
    startDate: row.event_date,
    endDate: null,
    startTime: row.start_time,
    endTime: row.end_time,
    eventDescription: row.short_description,
    locations,
    status: row.status === "encerrado" ? "Encerrado" : "Em planejamento",
    pendingCount: `${row.pending_count || 0} pendências`,
    criticalArea: row.critical_area || "A definir",
    criticalDeadline: row.critical_deadline || "A definir",
    communicationStatus: row.communication_status || "Não solicitado",
    noOwnerCount: Number(row.no_owner_count || 0),
    documentsReviewCount: Number(row.documents_review_count || 0)
  };
}

function checklistItemToClient(row) {
  return {
    id: row.id,
    eventDbId: row.event_id,
    title: row.title,
    area: row.area || row.category,
    category: row.category,
    status: row.status,
    ownerName: row.owner_name || "Sem responsável",
    dueDate: row.due_date,
    completedAt: row.completed_at,
    notes: row.notes
  };
}

function documentTemplateToClient(row) {
  return {
    id: row.id,
    name: row.name,
    templateType: row.template_type,
    body: row.body,
    used: Boolean(row.used_at),
    usedAt: row.used_at || null
  };
}

function eventDocumentToClient(row) {
  return {
    id: row.id,
    eventDbId: row.event_id,
    title: row.title,
    documentType: row.document_type,
    category: row.category,
    origin: row.origin,
    status: row.status,
    ownerName: row.owner_name || "Sem responsável",
    responsibleArea: row.responsible_area || "A definir",
    dueDate: row.due_date,
    accessLevel: row.access_level,
    version: row.version || "v1",
    fileLabel: row.file_label,
    fileUrl: row.file_url,
    notes: row.notes,
    sourceDraftId: row.source_draft_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseAuditDetails(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return String(value);
  }
}

function auditLogToClient(row) {
  return {
    id: row.id,
    eventDbId: row.event_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name || "Sistema",
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: parseAuditDetails(row.details),
    createdAt: row.created_at
  };
}

function checklistAreaToCategory(area) {
  const normalized = normalizeEnum(area, "operacional");
  const map = {
    producao: "operacional",
    comunicacao: "comunicacao",
    convidados: "operacional",
    fornecedores: "operacional",
    documentos: "documental",
    infraestrutura: "operacional",
    acessibilidade: "operacional"
  };

  return map[normalized] || "operacional";
}

function normalizeDocumentOrigin(origin) {
  const normalized = normalizeEnum(origin, "registro_vazio");
  const allowed = new Set(["registro_vazio", "upload", "link", "modelo", "ia"]);
  return allowed.has(normalized) ? normalized : "registro_vazio";
}

function normalizeDocumentStatus(status) {
  const normalized = normalizeEnum(status, "aguardando_criacao");
  const allowed = new Set([
    "aguardando_criacao",
    "em_elaboracao",
    "minuta_gerada",
    "em_revisao",
    "aguardando_aprovacao",
    "aprovado",
    "enviado",
    "arquivado"
  ]);
  return allowed.has(normalized) ? normalized : "aguardando_criacao";
}

function normalizeAccessLevel(accessLevel) {
  const normalized = normalizeEnum(accessLevel, "interno");
  const allowed = new Set(["publico", "interno", "restrito", "sensivel"]);
  return allowed.has(normalized) ? normalized : "interno";
}

function normalizeChecklistStatus(status) {
  const normalized = normalizeEnum(status, "pendente");
  const allowed = new Set(["nao_iniciado", "pendente", "em_andamento"]);
  return allowed.has(normalized) ? normalized : "pendente";
}

function listEvents() {
  return db
    .prepare(`
      SELECT
        e.id,
        e.official_name,
        e.event_type,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        e.format,
        e.responsible_area,
        e.short_description,
        e.status,
        u.name AS responsavel,
        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.event_id = e.id
            AND t.status IN ('nao_iniciada', 'em_andamento', 'pendente', 'atrasada')
        ) + (
          SELECT COUNT(*)
          FROM checklist_items ci
          WHERE ci.event_id = e.id
            AND ci.status IN ('nao_iniciado', 'em_andamento', 'pendente', 'atrasado')
        ) AS pending_count,
        (
          SELECT COALESCE(ci.area, ci.category)
          FROM checklist_items ci
          WHERE ci.event_id = e.id
            AND ci.status IN ('nao_iniciado', 'em_andamento', 'pendente', 'atrasado')
          ORDER BY
            CASE ci.status
              WHEN 'atrasado' THEN 1
              WHEN 'pendente' THEN 2
              WHEN 'em_andamento' THEN 3
              WHEN 'nao_iniciado' THEN 4
              ELSE 5
            END,
            ci.due_date IS NULL,
            ci.due_date,
            ci.id
          LIMIT 1
        ) AS critical_area,
        (
          SELECT ci.due_date || ' - ' || ci.title
          FROM checklist_items ci
          WHERE ci.event_id = e.id
            AND ci.status IN ('nao_iniciado', 'em_andamento', 'pendente', 'atrasado')
            AND ci.due_date IS NOT NULL
          ORDER BY
            CASE ci.status
              WHEN 'atrasado' THEN 1
              WHEN 'pendente' THEN 2
              WHEN 'em_andamento' THEN 3
              WHEN 'nao_iniciado' THEN 4
              ELSE 5
            END,
            ci.due_date,
            ci.id
          LIMIT 1
        ) AS critical_deadline,
        (
          SELECT COUNT(*)
          FROM checklist_items ci
          WHERE ci.event_id = e.id
            AND ci.status IN ('nao_iniciado', 'em_andamento', 'pendente', 'atrasado')
            AND ci.owner_user_id IS NULL
        ) AS no_owner_count,
        (
          SELECT COUNT(*)
          FROM event_documents ed
          WHERE ed.event_id = e.id
            AND ed.status IN ('em_revisao', 'aguardando_aprovacao', 'minuta_gerada')
        ) AS documents_review_count,
        cr.status AS communication_status
      FROM events e
      JOIN users u ON u.id = e.lead_user_id
      LEFT JOIN communication_requests cr ON cr.event_id = e.id
      GROUP BY e.id, cr.status
      ORDER BY e.event_date, e.start_time
    `)
    .all()
    .map(eventToClient);
}

function updateEvent(eventId, payload) {
  const existing = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);

  if (!existing) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const requiredFields = ["eventName", "eventType", "startDate", "format", "responsibleArea", "mainResponsible"];
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());

  if (missing.length) {
    const error = new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const leadUserId = getOrCreateLeadUser(payload.mainResponsible);
  const format = normalizeEnum(payload.format, "presencial");
  const locations = Array.isArray(payload.locations) && payload.locations.length
    ? payload.locations.join(", ")
    : "Local a definir";
  const shortDescription = payload.eventDescription || "Sem descricao curta.";

  db.exec("BEGIN");
  try {
    db
      .prepare(`
        UPDATE events
        SET
          official_name = ?,
          event_type = ?,
          event_date = ?,
          start_time = ?,
          end_time = ?,
          location = ?,
          format = ?,
          responsible_area = ?,
          lead_user_id = ?,
          short_description = ?,
          full_description = ?,
          internal_notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(
        payload.eventName,
        payload.eventType,
        payload.startDate,
        payload.startTime || "00:00",
        payload.endTime || null,
        locations,
        format,
        payload.responsibleArea,
        leadUserId,
        shortDescription,
        shortDescription,
        payload.team ? `Equipe informada: ${payload.team}` : null,
        eventId
      );

    db
      .prepare(`
        INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'editou_evento', 'event', ?, ?)
      `)
      .run(eventId, leadUserId, eventId, payload.eventName);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return listEvents().find((event) => event.dbId === eventId);
}

function getChecklistItems(eventId) {
  return db
    .prepare(`
      SELECT
        ci.id,
        ci.event_id,
        ci.title,
        ci.area,
        ci.category,
        ci.status,
        ci.due_date,
        ci.completed_at,
        ci.notes,
        u.name AS owner_name
      FROM checklist_items ci
      LEFT JOIN users u ON u.id = ci.owner_user_id
      WHERE ci.event_id = ?
      ORDER BY
        CASE ci.status
          WHEN 'atrasado' THEN 1
          WHEN 'pendente' THEN 2
          WHEN 'em_andamento' THEN 3
          WHEN 'nao_iniciado' THEN 4
          WHEN 'concluido' THEN 5
          ELSE 6
        END,
        ci.due_date IS NULL,
        ci.due_date,
        ci.id
    `)
    .all(eventId)
    .map(checklistItemToClient);
}

function getEventHistory(eventId) {
  return db
    .prepare(`
      SELECT
        al.id,
        al.event_id,
        al.actor_user_id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.details,
        al.created_at,
        u.name AS actor_name
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.actor_user_id
      WHERE al.event_id = ?
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT 100
    `)
    .all(eventId)
    .map(auditLogToClient);
}

function getEventDocuments(eventId) {
  const event = db.prepare("SELECT id FROM events WHERE id = ?").get(eventId);

  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const items = db
    .prepare(`
      SELECT
        ed.id,
        ed.event_id,
        ed.title,
        ed.document_type,
        ed.category,
        ed.origin,
        ed.status,
        ed.responsible_area,
        ed.due_date,
        ed.access_level,
        ed.version,
        ed.file_label,
        ed.file_url,
        ed.notes,
        ed.source_draft_id,
        ed.created_at,
        ed.updated_at,
        u.name AS owner_name
      FROM event_documents ed
      LEFT JOIN users u ON u.id = ed.owner_user_id
      WHERE ed.event_id = ?
      ORDER BY
        CASE ed.status
          WHEN 'aguardando_criacao' THEN 1
          WHEN 'em_elaboracao' THEN 2
          WHEN 'minuta_gerada' THEN 3
          WHEN 'em_revisao' THEN 4
          WHEN 'aguardando_aprovacao' THEN 5
          WHEN 'aprovado' THEN 6
          WHEN 'enviado' THEN 7
          WHEN 'arquivado' THEN 8
          ELSE 6
        END,
        ed.due_date IS NULL,
        ed.due_date,
        ed.id
    `)
    .all(eventId)
    .map(eventDocumentToClient);

  const templates = db
    .prepare(`
      SELECT
        dt.id,
        dt.name,
        dt.template_type,
        dt.body,
        etu.used_at
      FROM document_templates dt
      LEFT JOIN event_template_usage etu
        ON etu.template_id = dt.id
       AND etu.event_id = ?
      ORDER BY dt.name
    `)
    .all(eventId)
    .map(documentTemplateToClient);

  return { items, templates, aiDrafts: getDocumentAiHistory(eventId) };
}

function createEventDocument(eventId, payload) {
  const event = db.prepare("SELECT id, lead_user_id, responsible_area FROM events WHERE id = ?").get(eventId);
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const title = String(payload.title || "").trim();
  if (!title) {
    const error = new Error("Nome do documento e obrigatorio.");
    error.statusCode = 400;
    throw error;
  }

  const origin = normalizeDocumentOrigin(payload.origin);
  const status = normalizeDocumentStatus(payload.status);
  const accessLevel = normalizeAccessLevel(payload.accessLevel);
  const ownerName = String(payload.ownerName || "").trim();
  const ownerUserId = ownerName && ownerName !== "A confirmar" ? getOrCreateLeadUser(ownerName) : null;
  const documentType = String(payload.documentType || "Documento institucional").trim();
  const category = String(payload.category || documentType).trim();
  const responsibleArea = String(payload.responsibleArea || event.responsible_area || "").trim() || null;
  const dueDate = payload.dueDate || null;
  const notes = payload.notes || null;
  const fileUrl = origin === "link" ? String(payload.fileUrl || "").trim() || null : null;
  const fileLabel = origin === "upload" ? "Arquivo a anexar" : (payload.fileLabel || null);
  const sourceDraftId = origin === "ia" && payload.sourceDraftId ? Number(payload.sourceDraftId) : null;

  db.exec("BEGIN");
  try {
    const result = db
      .prepare(`
        INSERT INTO event_documents (
          event_id,
          title,
          document_type,
          category,
          origin,
          status,
          owner_user_id,
          responsible_area,
          due_date,
          access_level,
          version,
          file_label,
          file_url,
          notes,
          source_draft_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v1', ?, ?, ?, ?)
      `)
      .run(
        eventId,
        title,
        documentType,
        category,
        origin,
        status,
        ownerUserId,
        responsibleArea,
        dueDate,
        accessLevel,
        fileLabel,
        fileUrl,
        notes,
        sourceDraftId
      );

    const documentId = Number(result.lastInsertRowid);
    let checklistItem = null;

    if (payload.createChecklistItem) {
      const checklistStatus = status === "aprovado" || status === "enviado" || status === "arquivado" ? "concluido" : "pendente";
      const checklistResult = db
        .prepare(`
          INSERT INTO checklist_items (event_id, title, area, category, status, owner_user_id, due_date, notes)
          VALUES (?, ?, 'Documentos', 'documental', ?, ?, ?, ?)
        `)
        .run(eventId, title, checklistStatus, ownerUserId, dueDate, notes);

      checklistItem = db
        .prepare(`
          SELECT
            ci.id,
            ci.event_id,
            ci.title,
            ci.area,
            ci.category,
            ci.status,
            ci.due_date,
            ci.completed_at,
            ci.notes,
            u.name AS owner_name
          FROM checklist_items ci
          LEFT JOIN users u ON u.id = ci.owner_user_id
          WHERE ci.id = ?
        `)
        .get(Number(checklistResult.lastInsertRowid));
    }

    db
      .prepare(`
        INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
        SELECT ?, lead_user_id, 'criou_documento_evento', 'event_document', ?, ?
        FROM events
        WHERE id = ?
      `)
      .run(eventId, documentId, title, eventId);

    db.exec("COMMIT");

    const row = db
      .prepare(`
        SELECT
          ed.id,
          ed.event_id,
          ed.title,
          ed.document_type,
          ed.category,
          ed.origin,
          ed.status,
          ed.responsible_area,
          ed.due_date,
          ed.access_level,
          ed.version,
          ed.file_label,
          ed.file_url,
          ed.notes,
          ed.source_draft_id,
          ed.created_at,
          ed.updated_at,
          u.name AS owner_name
        FROM event_documents ed
        LEFT JOIN users u ON u.id = ed.owner_user_id
        WHERE ed.id = ?
      `)
      .get(documentId);

    return {
      document: eventDocumentToClient(row),
      checklistItem: checklistItem ? checklistItemToClient(checklistItem) : null
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getDocumentAiHistory(eventId) {
  return db
    .prepare(`
      SELECT id, draft_type, generated_text, provider, model, created_at
      FROM document_ai_drafts
      WHERE event_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 5
    `)
    .all(eventId)
    .map((row) => ({
      id: row.id,
      draftType: row.draft_type,
      generatedText: row.generated_text,
      provider: row.provider,
      model: row.model,
      createdAt: row.created_at
    }));
}

function getEventContextForAi(eventId) {
  const row = db
    .prepare(`
      SELECT
        e.id,
        e.official_name,
        e.event_type,
        e.event_date,
        e.start_time,
        e.end_time,
        e.location,
        e.format,
        e.responsible_area,
        e.short_description,
        e.full_description,
        u.name AS responsavel,
        cr.official_title AS communication_title,
        cr.short_description AS communication_short_description,
        cr.full_description AS communication_full_description,
        cr.registration_link,
        cr.streaming_link,
        cr.channels
      FROM events e
      JOIN users u ON u.id = e.lead_user_id
      LEFT JOIN communication_requests cr ON cr.event_id = e.id
      WHERE e.id = ?
    `)
    .get(eventId);

  if (!row) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return row;
}

function buildDocumentAiPrompt(eventContext, payload) {
  const draftType = String(payload.draftType || "oficio_convite").trim();
  const goal = String(payload.goal || "Criar uma minuta institucional clara e objetiva.").trim();
  const audience = String(payload.audience || "Destinatario institucional").trim();
  const modelBase = String(payload.modelBase || "padrao_fcrb_oficio").trim();
  const recipientName = String(payload.recipientName || "").trim() || audience;
  const recipientInstitution = String(payload.recipientInstitution || "").trim() || "A definir";
  const recipientRole = String(payload.recipientRole || "").trim() || "A definir";
  const deliveryChannel = String(payload.deliveryChannel || "a_definir").trim();
  const tone = String(payload.tone || "formal").trim();
  const useEventData = payload.useEventData !== false;
  const notes = String(payload.notes || "Sem observacoes adicionais.").trim();
  const sourceText = String(payload.sourceText || "").trim();

  return `
Tipo de minuta: ${draftType}
Objetivo: ${goal}
Modelo base: ${modelBase}
Tom desejado: ${tone}
Canal de envio previsto: ${deliveryChannel}

Destinatario:
- Nome/publico: ${recipientName}
- Instituicao: ${recipientInstitution}
- Cargo/funcao: ${recipientRole}
Observacoes da equipe: ${notes}

Evento:
${useEventData ? `
- Nome: ${eventContext.official_name}
- Tipo: ${eventContext.event_type}
- Data: ${eventContext.event_date}
- Horario: ${eventContext.start_time}${eventContext.end_time ? ` - ${eventContext.end_time}` : ""}
- Local: ${eventContext.location}
- Formato: ${eventContext.format}
- Area responsavel: ${eventContext.responsible_area}
- Responsavel: ${eventContext.responsavel}
- Descricao: ${eventContext.communication_short_description || eventContext.short_description}
- Texto de apoio: ${eventContext.communication_full_description || eventContext.full_description || "Nao informado"}
- Link de inscricao: ${eventContext.registration_link || "A definir"}
- Link de transmissao: ${eventContext.streaming_link || "A definir"}
- Canais de comunicacao: ${eventContext.channels || "A definir"}
` : "- A equipe optou por nao usar os dados vinculados do evento."}

Texto base informado pela equipe:
${sourceText || "Nao informado"}

Instrucoes de saida:
- Escreva em portugues do Brasil, sem markdown e sem listas decorativas.
- Comece com uma linha "Assunto: ..." clara e reutilizavel.
- Renderize como documento institucional revisavel, com saudacao, desenvolvimento, encaminhamento e assinatura.
- Use marcadores entre colchetes para dados ausentes, por exemplo [Nome do Destinatario], [Numero do Oficio], [Data da Assinatura].
- Nao invente nomes, cargos, numeros de processo, autorizacoes, custos ou prazos nao informados.
`.trim();
}

function buildLocalInstitutionalDraft(eventContext, payload) {
  const draftType = String(payload.draftType || "oficio_convite").trim();
  const audience = String(payload.audience || "destinatário").trim();
  const recipientName = String(payload.recipientName || "").trim() || audience || "[Nome do Destinatario]";
  const recipientInstitution = String(payload.recipientInstitution || "").trim() || "[Instituicao do Destinatario]";
  const recipientRole = String(payload.recipientRole || "").trim() || "[Cargo/Funcao do Destinatario]";
  const deliveryChannel = String(payload.deliveryChannel || "a_definir").trim();
  const goal = String(payload.goal || "formalizar a solicitação").trim();
  const notes = String(payload.notes || "").trim();
  const date = eventContext.event_date;
  const time = eventContext.end_time ? `${eventContext.start_time} - ${eventContext.end_time}` : eventContext.start_time;

  const titles = {
    oficio_convite: "Minuta de Ofício-Convite",
    solicitacao_parceria: "Minuta de Solicitação de Parceria",
    mensagem_convidado: "Minuta de Mensagem para Convidado",
    relatorio_pos_evento: "Minuta de Relatório Pós-Evento",
    briefing_evento: "Minuta de Briefing do Evento"
  };

  return `Assunto: ${titles[draftType] || "Minuta Institucional"} - ${eventContext.official_name}

Rio de Janeiro, [Data da Assinatura]

Ofício nº [Número do Ofício]/[Ano]/FCRB

À/ao ${recipientName}
${recipientRole}
${recipientInstitution}

Senhor(a) ${recipientRole},

A Fundação Casa de Rui Barbosa informa a realização do evento "${eventContext.official_name}", previsto para ${date}, no horário ${time}, em ${eventContext.location}, no formato ${eventContext.format}.

O evento tem como objetivo ${goal}. A atividade integra a programação institucional da FCRB e será acompanhada pela área ${eventContext.responsible_area}, sob responsabilidade de ${eventContext.responsavel}.

Solicitamos, por gentileza, a colaboração necessária para viabilizar os encaminhamentos relacionados a esta ação institucional. O canal previsto de envio é ${deliveryChannel}. ${notes ? `Observação da equipe: ${notes}` : ""}

Atenciosamente,

${eventContext.responsavel || "[Nome/Cargo do Assinante]"}
Fundação Casa de Rui Barbosa

Minuta gerada automaticamente para revisão humana. Revise nomes, cargos, prazos, dados legais e tom institucional antes do envio.`;
}

async function callOpenAiForDocumentDraft(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "Voce e um assistente de redacao institucional da Fundacao Casa de Rui Barbosa. Gere minutas em portugues do Brasil, com linguagem formal, objetiva, clara e revisavel. Nao invente dados ausentes: marque como [preencher]. Nao use markdown; entregue texto limpo de documento institucional."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_output_tokens: 1200
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Falha ao chamar a IA.");
    error.statusCode = 502;
    throw error;
  }

  return {
    text: payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n").trim(),
    model
  };
}

async function callGeminiForDocumentDraft(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "Voce e um assistente de redacao institucional da Fundacao Casa de Rui Barbosa. Gere minutas em portugues do Brasil, com linguagem formal, objetiva, clara e revisavel. Nao invente dados ausentes: marque como [preencher]. Nao use markdown; entregue texto limpo de documento institucional."
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 4096
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload.error?.message || "Falha ao chamar o Gemini.";
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n")
    .trim();

  if (!text || text.length < 250) {
    const finishReason = payload.candidates?.[0]?.finishReason;
    const error = new Error(`Gemini retornou uma minuta incompleta${finishReason ? ` (${finishReason})` : ""}.`);
    error.statusCode = 502;
    throw error;
  }

  return { text, model };
}

function getAiProviderOrder() {
  const provider = String(process.env.AI_PROVIDER || "gemini").trim().toLowerCase();

  if (provider === "openai") return ["openai"];
  if (provider === "gemini") return ["gemini"];
  if (provider === "auto") return ["gemini", "openai"];

  return ["gemini", "openai"];
}

async function generateDocumentAiDraft(eventId, payload) {
  const eventContext = getEventContextForAi(eventId);
  const prompt = buildDocumentAiPrompt(eventContext, payload);
  let provider = "local";
  let model = "template-institucional-local";
  let generatedText = buildLocalInstitutionalDraft(eventContext, payload);
  let warning = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY
    ? null
    : "Nenhuma chave de IA configurada. Foi gerada uma minuta local editavel.";

  for (const preferredProvider of getAiProviderOrder()) {
    try {
      const aiResult = preferredProvider === "gemini"
        ? await callGeminiForDocumentDraft(prompt)
        : await callOpenAiForDocumentDraft(prompt);

      if (aiResult?.text) {
        provider = preferredProvider;
        model = aiResult.model;
        generatedText = aiResult.text;
        warning = null;
        break;
      }
    } catch (error) {
      warning = `${error.message} Foi usada a geracao local como fallback.`;
    }
  }

  const result = db
    .prepare(`
      INSERT INTO document_ai_drafts (event_id, draft_type, prompt_context, generated_text, provider, model)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(eventId, String(payload.draftType || "oficio_convite"), prompt, generatedText, provider, model);

  db
    .prepare(`
      INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
      SELECT ?, lead_user_id, 'gerou_minuta_ia_documentos', 'document_ai_draft', ?, ?
      FROM events
      WHERE id = ?
    `)
    .run(eventId, Number(result.lastInsertRowid), String(payload.draftType || "oficio_convite"), eventId);

  return {
    id: Number(result.lastInsertRowid),
    draftType: String(payload.draftType || "oficio_convite"),
    generatedText,
    provider,
    model,
    warning
  };
}

function createChecklistItem(eventId, payload) {
  const title = String(payload.title || "").trim();

  if (!title) {
    const error = new Error("Nome do item e obrigatorio.");
    error.statusCode = 400;
    throw error;
  }

  const event = db.prepare("SELECT id, lead_user_id FROM events WHERE id = ?").get(eventId);
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const area = String(payload.area || "Produção").trim();
  const category = checklistAreaToCategory(area);
  const status = normalizeChecklistStatus(payload.status);
  const dueDate = payload.dueDate || null;
  const notes = payload.notes || null;
  const ownerName = String(payload.ownerName || "").trim();
  const ownerUserId = ownerName && ownerName !== "A confirmar" ? getOrCreateLeadUser(ownerName) : null;

  const insert = db.prepare(`
    INSERT INTO checklist_items (event_id, title, area, category, status, owner_user_id, due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, 'criou_item_checklist', 'checklist_item', ?, ?)
  `);

  let itemId;
  db.exec("BEGIN");
  try {
    const result = insert.run(eventId, title, area, category, status, ownerUserId, dueDate, notes);
    itemId = Number(result.lastInsertRowid);
    insertAudit.run(eventId, event.lead_user_id, itemId, title);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const row = db
    .prepare(`
      SELECT
        ci.id,
        ci.event_id,
        ci.title,
        ci.area,
        ci.category,
        ci.status,
        ci.due_date,
        ci.completed_at,
        ci.notes,
        u.name AS owner_name
      FROM checklist_items ci
      LEFT JOIN users u ON u.id = ci.owner_user_id
      WHERE ci.id = ?
    `)
    .get(itemId);

  return checklistItemToClient(row);
}

function updateChecklistItem(itemId, payload) {
  const existing = db
    .prepare(`
      SELECT ci.*, e.lead_user_id
      FROM checklist_items ci
      JOIN events e ON e.id = ci.event_id
      WHERE ci.id = ?
    `)
    .get(itemId);

  if (!existing) {
    const error = new Error("Item de checklist nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const done = Boolean(payload.done);
  const nextStatus = done ? "concluido" : "pendente";
  const completedAt = done ? new Date().toISOString() : null;

  db.exec("BEGIN");
  try {
    db
      .prepare("UPDATE checklist_items SET status = ?, completed_at = ? WHERE id = ?")
      .run(nextStatus, completedAt, itemId);

    db
      .prepare(`
        INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, 'checklist_item', ?, ?)
      `)
      .run(
        existing.event_id,
        existing.lead_user_id,
        done ? "concluiu_item_checklist" : "reabriu_item_checklist",
        itemId,
        existing.title
      );

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const row = db
    .prepare(`
      SELECT
        ci.id,
        ci.event_id,
        ci.title,
        ci.area,
        ci.category,
        ci.status,
        ci.due_date,
        ci.completed_at,
        ci.notes,
        u.name AS owner_name
      FROM checklist_items ci
      LEFT JOIN users u ON u.id = ci.owner_user_id
      WHERE ci.id = ?
    `)
    .get(itemId);

  return checklistItemToClient(row);
}

function communicationToClient(row) {
  return {
    eventDbId: row.event_id,
    officialTitle: row.official_title,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    registrationLink: row.registration_link,
    streamingLink: row.streaming_link,
    channels: row.channels ? row.channels.split(",").map((item) => item.trim()).filter(Boolean) : [],
    status: row.status || "nao_solicitado",
    updatedAt: row.updated_at
  };
}

function getCommunicationRequest(eventId) {
  const row = db
    .prepare(`
      SELECT
        e.id AS event_id,
        COALESCE(cr.official_title, e.official_name) AS official_title,
        COALESCE(cr.short_description, e.short_description) AS short_description,
        COALESCE(cr.full_description, e.full_description) AS full_description,
        cr.registration_link,
        COALESCE(cr.streaming_link, '') AS streaming_link,
        COALESCE(cr.channels, 'Site institucional, Instagram, Newsletter') AS channels,
        COALESCE(cr.status, 'nao_solicitado') AS status,
        COALESCE(cr.updated_at, e.created_at) AS updated_at
      FROM events e
      LEFT JOIN communication_requests cr ON cr.event_id = e.id
      WHERE e.id = ?
    `)
    .get(eventId);

  if (!row) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return communicationToClient(row);
}

function upsertCommunicationRequest(eventId, payload) {
  const event = db.prepare("SELECT id, lead_user_id FROM events WHERE id = ?").get(eventId);

  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const officialTitle = String(payload.officialTitle || "").trim();
  const shortDescription = String(payload.shortDescription || "").trim();

  if (!officialTitle || !shortDescription) {
    const error = new Error("Titulo de divulgacao e descricao curta sao obrigatorios.");
    error.statusCode = 400;
    throw error;
  }

  const channels = Array.isArray(payload.channels)
    ? payload.channels.join(", ")
    : String(payload.channels || "Site institucional, Instagram, Newsletter");

  db.exec("BEGIN");
  try {
    db
      .prepare(`
        INSERT INTO communication_requests (
          event_id,
          official_title,
          short_description,
          full_description,
          registration_link,
          streaming_link,
          channels,
          status,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'aguardando_informacoes', CURRENT_TIMESTAMP)
        ON CONFLICT(event_id) DO UPDATE SET
          official_title = excluded.official_title,
          short_description = excluded.short_description,
          full_description = excluded.full_description,
          registration_link = excluded.registration_link,
          streaming_link = excluded.streaming_link,
          channels = excluded.channels,
          status = 'aguardando_informacoes',
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(
        eventId,
        officialTitle,
        shortDescription,
        payload.fullDescription || shortDescription,
        payload.registrationLink || null,
        payload.streamingLink || null,
        channels
      );

    db
      .prepare(`
        INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
        VALUES (?, ?, 'atualizou_briefing_comunicacao', 'communication_request', ?, ?)
      `)
      .run(eventId, event.lead_user_id, eventId, officialTitle);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getCommunicationRequest(eventId);
}

function createEvent(payload) {
  const requiredFields = ["eventName", "eventType", "startDate", "format", "responsibleArea", "mainResponsible"];
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());

  if (missing.length) {
    const error = new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const leadUserId = getOrCreateLeadUser(payload.mainResponsible);
  const format = normalizeEnum(payload.format, "presencial").replace("hibrido", "hibrido");
  const locations = Array.isArray(payload.locations) && payload.locations.length
    ? payload.locations.join(", ")
    : "Local a definir";
  const startTime = payload.startTime || "00:00";
  const shortDescription = payload.eventDescription || "Sem descricao curta.";
  const accessibilityNeeds = payload.triggers?.requiresAccessibility ? "Acessibilidade solicitada." : null;

  const insertEvent = db.prepare(`
    INSERT INTO events (
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
      accessibility_needs,
      status,
      internal_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'em_planejamento', ?)
  `);

  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO event_team_members (event_id, user_id, responsibility)
    VALUES (?, ?, ?)
  `);

  const insertChecklist = db.prepare(`
    INSERT INTO checklist_items (event_id, title, category, status, owner_user_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (event_id, title, owner_user_id, due_date, priority, status, internal_comments)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCommunication = db.prepare(`
    INSERT INTO communication_requests (
      event_id,
      official_title,
      short_description,
      full_description,
      streaming_link,
      accessibility_info,
      status,
      communication_owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, 'aguardando_informacoes', NULL)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_log (event_id, actor_user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let eventId;
  db.exec("BEGIN");

  try {
    const result = insertEvent.run(
      payload.eventName,
      payload.eventType,
      payload.startDate,
      startTime,
      payload.endTime || null,
      locations,
      format,
      payload.responsibleArea,
      leadUserId,
      shortDescription,
      shortDescription,
      accessibilityNeeds,
      payload.team ? `Equipe informada: ${payload.team}` : null
    );

    eventId = Number(result.lastInsertRowid);
    insertTeam.run(eventId, leadUserId, "Responsavel principal");

    insertChecklist.run(eventId, "Solicitacao interna criada", "documental", "pendente", leadUserId, payload.startDate);
    insertChecklist.run(eventId, "Checklist operacional inicial", "operacional", "nao_iniciado", leadUserId, payload.startDate);

    if (payload.triggers?.hasExternalGuests) {
      insertChecklist.run(eventId, "Convidados confirmados", "operacional", "pendente", leadUserId, payload.startDate);
      insertTask.run(eventId, "Cadastrar convidados externos", leadUserId, payload.startDate, "alta", "pendente", "Criado automaticamente pelo cadastro do evento.");
    }

    if (payload.triggers?.hasSuppliers) {
      insertChecklist.run(eventId, "Fornecedores mapeados", "operacional", "pendente", leadUserId, payload.startDate);
      insertTask.run(eventId, "Mapear fornecedores do evento", leadUserId, payload.startDate, "media", "pendente", "Criado automaticamente pelo cadastro do evento.");
    }

    if (payload.triggers?.requiresCommunication) {
      insertChecklist.run(eventId, "Briefing de comunicacao enviado", "comunicacao", "pendente", leadUserId, payload.startDate);
      insertTask.run(eventId, "Completar briefing de comunicacao", leadUserId, payload.startDate, "alta", "pendente", "Criado automaticamente pelo cadastro do evento.");
      insertCommunication.run(
        eventId,
        payload.eventName,
        shortDescription,
        shortDescription,
        payload.streamLink || null,
        accessibilityNeeds,
      );
    }

    insertAudit.run(eventId, leadUserId, "criou_evento", "event", eventId, "Evento criado pelo index.html local.");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const row = db
    .prepare(`
      SELECT e.*, u.name AS responsavel, 0 AS pending_count, NULL AS critical_area, NULL AS critical_deadline, NULL AS communication_status
      FROM events e
      JOIN users u ON u.id = e.lead_user_id
      WHERE e.id = ?
    `)
    .get(eventId);

  return eventToClient(row);
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = resolve(join(ROOT, pathname));

  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Arquivo nao encontrado.");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] || "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/events") {
      sendJson(response, 200, { events: listEvents() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/events") {
      const payload = await readJson(request);
      const event = createEvent(payload);
      sendJson(response, 201, { event });
      return;
    }

    const eventMatch = url.pathname.match(/^\/api\/events\/(\d+)$/);
    if (request.method === "PATCH" && eventMatch) {
      const payload = await readJson(request);
      const event = updateEvent(Number(eventMatch[1]), payload);
      sendJson(response, 200, { event });
      return;
    }

    const historyMatch = url.pathname.match(/^\/api\/events\/(\d+)\/history$/);
    if (request.method === "GET" && historyMatch) {
      sendJson(response, 200, { items: getEventHistory(Number(historyMatch[1])) });
      return;
    }

    const checklistMatch = url.pathname.match(/^\/api\/events\/(\d+)\/checklist$/);
    if (request.method === "GET" && checklistMatch) {
      sendJson(response, 200, { items: getChecklistItems(Number(checklistMatch[1])) });
      return;
    }

    if (request.method === "POST" && checklistMatch) {
      const payload = await readJson(request);
      const item = createChecklistItem(Number(checklistMatch[1]), payload);
      sendJson(response, 201, { item });
      return;
    }

    const communicationMatch = url.pathname.match(/^\/api\/events\/(\d+)\/communication$/);
    if (request.method === "GET" && communicationMatch) {
      sendJson(response, 200, { communication: getCommunicationRequest(Number(communicationMatch[1])) });
      return;
    }

    if (request.method === "PATCH" && communicationMatch) {
      const payload = await readJson(request);
      const communication = upsertCommunicationRequest(Number(communicationMatch[1]), payload);
      sendJson(response, 200, { communication });
      return;
    }

    const documentsMatch = url.pathname.match(/^\/api\/events\/(\d+)\/documents$/);
    if (request.method === "GET" && documentsMatch) {
      sendJson(response, 200, getEventDocuments(Number(documentsMatch[1])));
      return;
    }

    if (request.method === "POST" && documentsMatch) {
      const payload = await readJson(request);
      const result = createEventDocument(Number(documentsMatch[1]), payload);
      sendJson(response, 201, result);
      return;
    }

    const documentAiMatch = url.pathname.match(/^\/api\/events\/(\d+)\/documents\/ai-draft$/);
    if (request.method === "POST" && documentAiMatch) {
      const payload = await readJson(request);
      const draft = await generateDocumentAiDraft(Number(documentAiMatch[1]), payload);
      sendJson(response, 201, { draft });
      return;
    }

    const checklistItemMatch = url.pathname.match(/^\/api\/checklist-items\/(\d+)$/);
    if (request.method === "PATCH" && checklistItemMatch) {
      const payload = await readJson(request);
      const item = updateChecklistItem(Number(checklistItemMatch[1]), payload);
      sendJson(response, 200, { item });
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    sendJson(response, error.statusCode || 500, { error: error.message || "Erro inesperado." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FCRB Eventos em http://${HOST}:${PORT}`);
  console.log(`Banco SQLite: ${DB_PATH}`);
});
