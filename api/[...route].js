const { supabaseRequest, selectRows, insertRows } = require("../lib/supabase");

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function normalizeEnum(value, fallback) {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

async function readJson(request) {
  if (request.body && typeof request.body === "object") return request.body;

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

function splitIds(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))];
}

function buildLeadUserEmail(name) {
  const slug = normalizeEnum(name, "responsavel").replace(/[^a-z0-9_]/g, "");
  return `${slug || "responsavel"}@teste.local`;
}

async function getUsersByIds(ids = []) {
  if (!ids.length) return new Map();
  const users = await selectRows("users", {
    select: "id,name",
    id: `in.(${ids.join(",")})`
  });
  return new Map(users.map((user) => [user.id, user]));
}

async function getOrCreateLeadUser(name) {
  const leadName = String(name || "Responsavel nao informado").trim();
  const email = buildLeadUserEmail(leadName);
  const existing = await selectRows("users", {
    select: "id,name",
    email: `eq.${email}`,
    limit: "1"
  });

  if (existing[0]) return existing[0];

  const inserted = await insertRows("users", [{
    name: leadName,
    email,
    role: "gestor_evento"
  }]);

  return inserted[0];
}

function eventToClient(row, helpers = {}) {
  const locations = row.location ? row.location.split(",").map((item) => item.trim()).filter(Boolean) : [];
  const leadUser = helpers.usersById?.get(row.lead_user_id);
  const communication = helpers.communicationByEventId?.get(row.id);
  const pendingCount = helpers.pendingCountByEventId?.get(row.id) || 0;
  const critical = helpers.criticalByEventId?.get(row.id);

  return {
    id: `EV-${String(row.id).padStart(4, "0")}`,
    dbId: row.id,
    eventName: row.official_name,
    eventType: row.event_type,
    format: row.format === "hibrido" ? "Híbrido" : String(row.format || "").charAt(0).toUpperCase() + String(row.format || "").slice(1),
    responsibleArea: row.responsible_area,
    mainResponsible: leadUser?.name || "Responsável não informado",
    startDate: row.event_date,
    endDate: null,
    startTime: row.start_time,
    endTime: row.end_time,
    eventDescription: row.short_description,
    locations,
    status: row.status === "encerrado" ? "Encerrado" : "Em planejamento",
    pendingCount: `${pendingCount} pendências`,
    criticalArea: critical?.area || critical?.category || "A definir",
    criticalDeadline: critical?.due_date ? `${critical.due_date} - ${critical.title}` : "A definir",
    communicationStatus: communication?.status || "Não solicitado"
  };
}

function checklistItemToClient(row, usersById = new Map()) {
  const owner = usersById.get(row.owner_user_id);

  return {
    id: row.id,
    eventDbId: row.event_id,
    title: row.title,
    area: row.area,
    category: row.area,
    status: row.status,
    ownerName: owner?.name || "Sem responsável",
    dueDate: row.due_date,
    completedAt: row.completed_at,
    notes: row.notes
  };
}

function communicationToClient(row) {
  return {
    eventDbId: row.event_id,
    officialTitle: row.official_title || row.title,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    registrationLink: row.registration_link,
    streamingLink: row.streaming_link,
    channels: row.channels ? row.channels.split(",").map((item) => item.trim()).filter(Boolean) : [],
    status: row.status || "nao_solicitado",
    updatedAt: row.updated_at
  };
}

function documentTemplateToClient(row, usageByTemplateId = new Map()) {
  const usage = usageByTemplateId.get(row.id);

  return {
    id: row.id,
    name: row.name,
    templateType: row.template_type || row.document_type || row.category,
    body: row.body || row.body_template || "",
    used: Boolean(usage),
    usedAt: usage?.used_at || null
  };
}

function eventDocumentToClient(row, usersById = new Map()) {
  const owner = usersById.get(row.owner_user_id);

  return {
    id: row.id,
    eventDbId: row.event_id,
    title: row.title,
    documentType: row.document_type,
    category: row.category,
    origin: row.origin,
    status: row.status,
    ownerName: owner?.name || "Sem responsável",
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

function aiDraftToClient(row) {
  return {
    id: row.id,
    draftType: row.draft_type,
    generatedText: row.generated_text,
    provider: row.provider || "local",
    model: row.model,
    createdAt: row.created_at
  };
}

async function listEvents() {
  const events = await selectRows("events", {
    select: "id,official_name,event_type,event_date,start_time,end_time,location,format,responsible_area,lead_user_id,short_description,status",
    order: "event_date.asc,start_time.asc"
  });
  const eventIds = events.map((event) => event.id);
  const usersById = await getUsersByIds(splitIds(events, "lead_user_id"));
  const communicationRows = eventIds.length
    ? await selectRows("communication_requests", {
      select: "event_id,status",
      event_id: `in.(${eventIds.join(",")})`
    })
    : [];
  const checklistRows = eventIds.length
    ? await selectRows("checklist_items", {
      select: "id,event_id,title,area,status,due_date",
      event_id: `in.(${eventIds.join(",")})`,
      status: "in.(nao_iniciado,em_andamento,pendente,atrasado)",
      order: "due_date.asc,id.asc"
    })
    : [];

  const communicationByEventId = new Map(communicationRows.map((row) => [row.event_id, row]));
  const pendingCountByEventId = new Map();
  const criticalByEventId = new Map();

  checklistRows.forEach((item) => {
    pendingCountByEventId.set(item.event_id, (pendingCountByEventId.get(item.event_id) || 0) + 1);
    if (!criticalByEventId.has(item.event_id)) criticalByEventId.set(item.event_id, item);
  });

  return events.map((event) => eventToClient(event, {
    usersById,
    communicationByEventId,
    pendingCountByEventId,
    criticalByEventId
  }));
}

async function createEvent(payload) {
  const requiredFields = ["eventName", "eventType", "startDate", "format", "responsibleArea", "mainResponsible"];
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());

  if (missing.length) {
    const error = new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const leadUser = await getOrCreateLeadUser(payload.mainResponsible);
  const format = normalizeEnum(payload.format, "presencial");
  const locations = Array.isArray(payload.locations) && payload.locations.length
    ? payload.locations.join(", ")
    : "Local a definir";
  const shortDescription = String(payload.eventDescription || "Sem descricao curta.").trim();

  const inserted = await insertRows("events", [{
    official_name: String(payload.eventName).trim(),
    event_type: String(payload.eventType).trim(),
    event_date: payload.startDate,
    start_time: payload.startTime || "00:00",
    end_time: payload.endTime || null,
    location: locations,
    format,
    responsible_area: String(payload.responsibleArea).trim(),
    lead_user_id: leadUser.id,
    short_description: shortDescription,
    full_description: shortDescription,
    accessibility_needs: payload.triggers?.requiresAccessibility ? "Acessibilidade solicitada." : null,
    status: "em_planejamento",
    internal_notes: payload.team ? `Equipe informada: ${payload.team}` : null
  }]);

  const event = inserted[0];
  return eventToClient(event, {
    usersById: new Map([[leadUser.id, leadUser]])
  });
}

async function updateEvent(eventId, payload) {
  const requiredFields = ["eventName", "eventType", "startDate", "format", "responsibleArea", "mainResponsible"];
  const missing = requiredFields.filter((field) => !String(payload[field] || "").trim());

  if (missing.length) {
    const error = new Error(`Campos obrigatorios ausentes: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const existing = await selectRows("events", {
    select: "id",
    id: `eq.${eventId}`,
    limit: "1"
  });

  if (!existing[0]) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const leadUser = await getOrCreateLeadUser(payload.mainResponsible);
  const format = normalizeEnum(payload.format, "presencial");
  const locations = Array.isArray(payload.locations) && payload.locations.length
    ? payload.locations.join(", ")
    : "Local a definir";
  const shortDescription = String(payload.eventDescription || "Sem descricao curta.").trim();

  const updated = await supabaseRequest("events", {
    method: "PATCH",
    search: {
      id: `eq.${eventId}`
    },
    body: {
      official_name: String(payload.eventName).trim(),
      event_type: String(payload.eventType).trim(),
      event_date: payload.startDate,
      start_time: payload.startTime || "00:00",
      end_time: payload.endTime || null,
      location: locations,
      format,
      responsible_area: String(payload.responsibleArea).trim(),
      lead_user_id: leadUser.id,
      short_description: shortDescription,
      full_description: shortDescription,
      accessibility_needs: payload.triggers?.requiresAccessibility ? "Acessibilidade solicitada." : null,
      internal_notes: payload.team ? `Equipe informada: ${payload.team}` : null,
      updated_at: new Date().toISOString()
    },
    prefer: "return=representation"
  });

  const event = updated[0];
  return eventToClient(event, {
    usersById: new Map([[leadUser.id, leadUser]])
  });
}

async function getChecklistItems(eventId) {
  const items = await selectRows("checklist_items", {
    select: "id,event_id,title,area,status,due_date,completed_at,notes,owner_user_id",
    event_id: `eq.${eventId}`,
    order: "due_date.asc,id.asc"
  });
  const usersById = await getUsersByIds(splitIds(items, "owner_user_id"));
  return items.map((item) => checklistItemToClient(item, usersById));
}

async function createChecklistItem(eventId, payload) {
  const title = String(payload.title || "").trim();
  if (!title) {
    const error = new Error("Nome do item obrigatorio.");
    error.statusCode = 400;
    throw error;
  }

  const events = await selectRows("events", {
    select: "id,lead_user_id",
    id: `eq.${eventId}`,
    limit: "1"
  });
  const event = events[0];
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const ownerName = String(payload.ownerName || "").trim();
  const owner = ownerName && ownerName !== "A confirmar"
    ? await getOrCreateLeadUser(ownerName)
    : null;

  const inserted = await insertRows("checklist_items", [{
    event_id: eventId,
    title,
    area: String(payload.area || "Produção").trim(),
    status: String(payload.status || "pendente"),
    owner_user_id: owner?.id || event.lead_user_id || null,
    due_date: payload.dueDate || null,
    notes: payload.notes || null
  }]);

  const usersById = await getUsersByIds(splitIds(inserted, "owner_user_id"));
  return checklistItemToClient(inserted[0], usersById);
}

async function updateChecklistItem(itemId, payload) {
  const status = payload.done ? "concluido" : "pendente";
  const completedAt = payload.done ? new Date().toISOString() : null;
  const updated = await supabaseRequest("checklist_items", {
    method: "PATCH",
    search: {
      id: `eq.${itemId}`
    },
    body: {
      status,
      completed_at: completedAt
    },
    prefer: "return=representation"
  });

  if (!updated[0]) {
    const error = new Error("Item de checklist nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const usersById = await getUsersByIds(splitIds(updated, "owner_user_id"));
  return checklistItemToClient(updated[0], usersById);
}

async function getCommunicationRequest(eventId) {
  const events = await selectRows("events", {
    select: "id,official_name,short_description,full_description,created_at",
    id: `eq.${eventId}`,
    limit: "1"
  });
  const event = events[0];
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const rows = await selectRows("communication_requests", {
    select: "event_id,official_title,short_description,full_description,registration_link,streaming_link,channels,status,updated_at",
    event_id: `eq.${eventId}`,
    limit: "1"
  });
  const row = rows[0] || {
    event_id: event.id,
    official_title: event.official_name,
    short_description: event.short_description,
    full_description: event.full_description,
    registration_link: null,
    streaming_link: "",
    channels: "Site institucional, Instagram, Newsletter",
    status: "nao_solicitado",
    updated_at: event.created_at
  };

  return communicationToClient(row);
}

async function saveCommunicationRequest(eventId, payload) {
  const officialTitle = String(payload.officialTitle || "").trim();
  const shortDescription = String(payload.shortDescription || "").trim();
  if (!officialTitle || !shortDescription) {
    const error = new Error("Titulo e descricao curta sao obrigatorios.");
    error.statusCode = 400;
    throw error;
  }

  const events = await selectRows("events", {
    select: "id",
    id: `eq.${eventId}`,
    limit: "1"
  });
  if (!events[0]) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const body = {
    official_title: officialTitle,
    short_description: shortDescription,
    full_description: payload.fullDescription || null,
    registration_link: payload.registrationLink || null,
    streaming_link: payload.streamingLink || null,
    channels: Array.isArray(payload.channels) ? payload.channels.join(", ") : String(payload.channels || ""),
    status: "aguardando_informacoes",
    updated_at: new Date().toISOString()
  };
  const existingRows = await selectRows("communication_requests", {
    select: "id",
    event_id: `eq.${eventId}`,
    limit: "1"
  });
  const rows = existingRows[0]
    ? await supabaseRequest("communication_requests", {
      method: "PATCH",
      search: {
        id: `eq.${existingRows[0].id}`
      },
      body,
      prefer: "return=representation"
    })
    : await insertRows("communication_requests", [{
      event_id: eventId,
      ...body
    }]);

  return communicationToClient(rows[0]);
}

async function getDocumentAiHistory(eventId) {
  const rows = await selectRows("document_ai_drafts", {
    select: "id,draft_type,generated_text,provider,model,created_at",
    event_id: `eq.${eventId}`,
    order: "created_at.desc,id.desc",
    limit: "5"
  });

  return rows.map(aiDraftToClient);
}

async function getEventDocuments(eventId) {
  const events = await selectRows("events", {
    select: "id",
    id: `eq.${eventId}`,
    limit: "1"
  });
  if (!events[0]) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const items = await selectRows("event_documents", {
    select: "id,event_id,title,document_type,category,origin,status,owner_user_id,responsible_area,due_date,access_level,version,file_label,file_url,notes,source_draft_id,created_at,updated_at",
    event_id: `eq.${eventId}`,
    order: "due_date.asc,id.asc"
  });
  const usersById = await getUsersByIds(splitIds(items, "owner_user_id"));
  const templates = await selectRows("document_templates", {
    select: "id,name,template_type,body",
    order: "name.asc"
  });
  const usageRows = await selectRows("event_template_usage", {
    select: "template_id,used_at",
    event_id: `eq.${eventId}`
  });
  const usageByTemplateId = new Map(usageRows.map((row) => [row.template_id, row]));

  return {
    items: items.map((item) => eventDocumentToClient(item, usersById)),
    templates: templates.map((template) => documentTemplateToClient(template, usageByTemplateId)),
    aiDrafts: await getDocumentAiHistory(eventId)
  };
}

async function createEventDocument(eventId, payload) {
  const title = String(payload.title || "").trim();
  if (!title) {
    const error = new Error("Nome do documento obrigatorio.");
    error.statusCode = 400;
    throw error;
  }

  const events = await selectRows("events", {
    select: "id,lead_user_id",
    id: `eq.${eventId}`,
    limit: "1"
  });
  const event = events[0];
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const ownerName = String(payload.ownerName || "").trim();
  const owner = ownerName && ownerName !== "A confirmar"
    ? await getOrCreateLeadUser(ownerName)
    : null;
  const origin = String(payload.origin || "registro_vazio");

  const inserted = await insertRows("event_documents", [{
    event_id: eventId,
    title,
    document_type: String(payload.documentType || "Outro"),
    category: String(payload.category || "Produção"),
    origin,
    status: String(payload.status || "aguardando_criacao"),
    owner_user_id: owner?.id || event.lead_user_id || null,
    responsible_area: payload.responsibleArea || null,
    due_date: payload.dueDate || null,
    access_level: payload.accessLevel || "interno",
    version: "v1",
    file_label: origin === "upload" ? "Arquivo a anexar" : null,
    file_url: origin === "link" ? payload.fileUrl || null : payload.fileUrl || null,
    notes: payload.notes || null,
    source_draft_id: payload.sourceDraftId || null
  }]);

  const usersById = await getUsersByIds(splitIds(inserted, "owner_user_id"));
  const document = eventDocumentToClient(inserted[0], usersById);
  let checklistItem = null;

  if (payload.createChecklistItem) {
    checklistItem = await createChecklistItem(eventId, {
      title: `Acompanhar documento: ${title}`,
      area: "Documentos",
      status: "pendente",
      ownerName: ownerName || "A confirmar",
      dueDate: payload.dueDate || null,
      notes: payload.notes || "Pendencia criada a partir de documento."
    });
  }

  return { document, checklistItem };
}

async function getEventContextForAi(eventId) {
  const events = await selectRows("events", {
    select: "id,official_name,event_type,event_date,start_time,end_time,location,format,responsible_area,lead_user_id,short_description,full_description",
    id: `eq.${eventId}`,
    limit: "1"
  });
  const event = events[0];
  if (!event) {
    const error = new Error("Evento nao encontrado.");
    error.statusCode = 404;
    throw error;
  }

  const usersById = await getUsersByIds([event.lead_user_id]);
  const communicationRows = await selectRows("communication_requests", {
    select: "official_title,short_description,full_description,registration_link,streaming_link,channels",
    event_id: `eq.${eventId}`,
    limit: "1"
  });
  const communication = communicationRows[0] || {};

  return {
    ...event,
    responsavel: usersById.get(event.lead_user_id)?.name || "Responsável não informado",
    communication_title: communication.official_title,
    communication_short_description: communication.short_description,
    communication_full_description: communication.full_description,
    registration_link: communication.registration_link,
    streaming_link: communication.streaming_link,
    channels: communication.channels
  };
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

A Fundação Casa de Rui Barbosa informa a realização do evento "${eventContext.official_name}", previsto para ${eventContext.event_date}, no horário ${time}, em ${eventContext.location}, no formato ${eventContext.format}.

O evento tem como objetivo ${goal}. A atividade integra a programação institucional da FCRB e será acompanhada pela área ${eventContext.responsible_area}, sob responsabilidade de ${eventContext.responsavel}.

Solicitamos, por gentileza, a colaboração necessária para viabilizar os encaminhamentos relacionados a esta ação institucional. O canal previsto de envio é ${deliveryChannel}. ${notes ? `Observação da equipe: ${notes}` : ""}

Atenciosamente,

${eventContext.responsavel || "[Nome/Cargo do Assinante]"}
Fundação Casa de Rui Barbosa

Minuta gerada automaticamente para revisão humana. Revise nomes, cargos, prazos, dados legais e tom institucional antes do envio.`;
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
    const error = new Error(payload.error?.message || "Falha ao chamar o Gemini.");
    error.statusCode = 502;
    throw error;
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("\n")
    .trim();

  if (!text || text.length < 250) {
    const error = new Error("Gemini retornou uma minuta incompleta.");
    error.statusCode = 502;
    throw error;
  }

  return { text, model };
}

async function generateDocumentAiDraft(eventId, payload) {
  const eventContext = await getEventContextForAi(eventId);
  const prompt = buildDocumentAiPrompt(eventContext, payload);
  let provider = "local";
  let model = "template-institucional-local";
  let generatedText = buildLocalInstitutionalDraft(eventContext, payload);
  let warning = process.env.GEMINI_API_KEY ? null : "Nenhuma chave Gemini configurada. Foi gerada uma minuta local editavel.";

  try {
    const aiResult = await callGeminiForDocumentDraft(prompt);
    if (aiResult?.text) {
      provider = "gemini";
      model = aiResult.model;
      generatedText = aiResult.text;
      warning = null;
    }
  } catch (error) {
    warning = `${error.message} Foi usada a geracao local como fallback.`;
  }

  const inserted = await insertRows("document_ai_drafts", [{
    event_id: eventId,
    draft_type: String(payload.draftType || "oficio_convite"),
    prompt_context: prompt,
    generated_text: generatedText,
    provider,
    model
  }]);
  const draft = inserted[0];

  await insertRows("audit_log", [{
    event_id: eventId,
    actor_user_id: eventContext.lead_user_id,
    action: "gerou_minuta_ia_documentos",
    entity_type: "document_ai_draft",
    entity_id: draft.id,
    details: JSON.stringify({
      draft_type: String(payload.draftType || "oficio_convite"),
      provider,
      model
    })
  }], { prefer: "return=minimal" });

  return {
    id: draft.id,
    draftType: draft.draft_type,
    generatedText: draft.generated_text,
    provider,
    model: draft.model,
    warning
  };
}

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
    const pathname = url.pathname;

    if (request.method === "GET" && pathname === "/api/events") {
      sendJson(response, 200, { events: await listEvents() });
      return;
    }

    if (request.method === "POST" && pathname === "/api/events") {
      const payload = await readJson(request);
      const event = await createEvent(payload);
      sendJson(response, 201, { event });
      return;
    }

    const eventMatch = pathname.match(/^\/api\/events\/(\d+)$/);
    if (request.method === "PATCH" && eventMatch) {
      const payload = await readJson(request);
      const event = await updateEvent(Number(eventMatch[1]), payload);
      sendJson(response, 200, { event });
      return;
    }

    const checklistMatch = pathname.match(/^\/api\/events\/(\d+)\/checklist$/);
    if (request.method === "GET" && checklistMatch) {
      sendJson(response, 200, { items: await getChecklistItems(Number(checklistMatch[1])) });
      return;
    }

    if (request.method === "POST" && checklistMatch) {
      const payload = await readJson(request);
      const item = await createChecklistItem(Number(checklistMatch[1]), payload);
      sendJson(response, 201, { item });
      return;
    }

    const checklistItemMatch = pathname.match(/^\/api\/checklist-items\/(\d+)$/);
    if (request.method === "PATCH" && checklistItemMatch) {
      const payload = await readJson(request);
      const item = await updateChecklistItem(Number(checklistItemMatch[1]), payload);
      sendJson(response, 200, { item });
      return;
    }

    const communicationMatch = pathname.match(/^\/api\/events\/(\d+)\/communication$/);
    if (request.method === "GET" && communicationMatch) {
      sendJson(response, 200, { communication: await getCommunicationRequest(Number(communicationMatch[1])) });
      return;
    }

    if (request.method === "PATCH" && communicationMatch) {
      const payload = await readJson(request);
      const communication = await saveCommunicationRequest(Number(communicationMatch[1]), payload);
      sendJson(response, 200, { communication });
      return;
    }

    const documentsMatch = pathname.match(/^\/api\/events\/(\d+)\/documents$/);
    if (request.method === "GET" && documentsMatch) {
      sendJson(response, 200, await getEventDocuments(Number(documentsMatch[1])));
      return;
    }

    if (request.method === "POST" && documentsMatch) {
      const payload = await readJson(request);
      const result = await createEventDocument(Number(documentsMatch[1]), payload);
      sendJson(response, 201, result);
      return;
    }

    const documentAiMatch = pathname.match(/^\/api\/events\/(\d+)\/documents\/ai-draft$/);
    if (request.method === "POST" && documentAiMatch) {
      const payload = await readJson(request);
      const draft = await generateDocumentAiDraft(Number(documentAiMatch[1]), payload);
      sendJson(response, 201, { draft });
      return;
    }

    sendJson(response, 404, { error: "Rota nao implementada nesta rodada do deploy." });
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.message || "Erro interno."
    });
  }
};
