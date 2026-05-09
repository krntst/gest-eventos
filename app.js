const initialEvents = [
  {
    id: "EV-2024-001",
    eventName: "Seminário Internacional de Preservação Digital",
    eventType: "Seminário",
    eventDescription: "Evento anual reunindo especialistas para discutir tecnologias e metodologias para preservação de acervos digitais.",
    startDate: "2024-08-15",
    endDate: "2024-08-17",
    startTime: "09:00",
    endTime: "18:00",
    format: "Híbrido",
    locations: ["Auditório"],
    responsibleArea: "Centro de Pesquisa",
    mainResponsible: "Ana Silva",
    status: "Em dia",
    pendingCount: "2 pendências",
    criticalArea: "Contratação",
    criticalDeadline: "24/05 - Contratação",
    communicationStatus: "Aprovada"
  },
  {
    id: "EV-2024-002",
    eventName: "Exposição: Modernismo em Papel",
    eventType: "Exposição",
    eventDescription: "Exibição de documentos raros e correspondências inéditas do acervo da fundação.",
    startDate: "2024-06-10",
    startTime: "18:30",
    format: "Presencial",
    locations: ["Hall"],
    responsibleArea: "Diretoria de Difusão Cultural",
    mainResponsible: "Carlos Mendes",
    status: "Atrasado",
    pendingCount: "3 em atraso",
    criticalArea: "Acervo",
    criticalDeadline: "15/05 - Seguro",
    communicationStatus: "Em produção"
  },
  {
    id: "EV-2024-003",
    eventName: "Lançamento: Coleção Memória",
    eventType: "Lançamento",
    eventDescription: "Evento virtual de lançamento da nova coleção de livros digitais da fundação.",
    startDate: "2024-09-22",
    startTime: "19:00",
    format: "Online",
    locations: [],
    responsibleArea: "Centro de Memória e Informação",
    mainResponsible: "João Rocha",
    status: "Atenção",
    pendingCount: "5 pendências",
    criticalArea: "Editorial",
    criticalDeadline: "30/05 - Convites",
    communicationStatus: "Aguardando briefing"
  }
];

let events = [];
let activeEvent = null;
let checklistItems = [];
let checklistLoadedEventId = null;
let checklistReturnTab = "checklist";
let communicationDetails = null;
let communicationLoadedEventId = null;
let documentDetails = null;
let documentLoadedEventId = null;
let currentDocumentAiDraft = null;
let currentDocumentAiMode = "preview";
let editingEvent = null;

const statusStyles = {
  "Em dia": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Atrasado": "bg-red-50 text-red-700 border-red-200",
  "Atenção": "bg-amber-50 text-amber-700 border-amber-200",
  "Em planejamento": "bg-blue-50 text-blue-700 border-blue-200",
  "Encerrado": "bg-emerald-50 text-emerald-700 border-emerald-200"
};

const modal = document.querySelector("#eventModal");
const form = document.querySelector("#newEventForm");
const checklistItemModal = document.querySelector("#checklistItemModal");
const checklistItemForm = document.querySelector("#checklistItemForm");
const communicationBriefingModal = document.querySelector("#communicationBriefingModal");
const communicationBriefingForm = document.querySelector("#communicationBriefingForm");
const eventDocumentModal = document.querySelector("#eventDocumentModal");
const eventDocumentForm = document.querySelector("#eventDocumentForm");
const documentAiModal = document.querySelector("#documentAiModal");
const documentAiForm = document.querySelector("#documentAiForm");
const documentAiResult = document.querySelector("#documentAiResult");
const dashboardStats = document.querySelector("#dashboardStats");
const eventsGrid = document.querySelector("#eventsGrid");
const localModeWarning = document.querySelector("#localModeWarning");
const pageTitle = document.querySelector("#pageTitle");
const filtersBar = document.querySelector("#filtersBar");
const dashboardView = document.querySelector("#dashboardView");
const eventDetailView = document.querySelector("#eventDetailView");
const sidebarToggle = document.querySelector("#sidebarToggle");
const dashboardSearchInput = filtersBar?.querySelector('input[type="text"], input[type="search"]');
const dashboardFilterSelects = filtersBar ? Array.from(filtersBar.querySelectorAll("select")) : [];

const dashboardFilters = {
  query: "",
  status: "",
  date: "",
  area: ""
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeForSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatDateRange(event) {
  const start = event.startDate ? new Date(`${event.startDate}T00:00:00`) : null;
  const end = event.endDate ? new Date(`${event.endDate}T00:00:00`) : null;

  if (!start) return "Data não definida";

  const formatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  if (end) return `${formatter.format(start)} a ${formatter.format(end)}`;
  return formatter.format(start);
}

function formatDateValue(value) {
  if (!value) return "A definir";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatStatusLabel(value) {
  const normalized = String(value || "")
    .replaceAll("_", " ")
    .trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "A definir";
}

function formatCommunicationStatus(value) {
  const labels = {
    nao_solicitado: "Não solicitado",
    aguardando_informacoes: "Aguardando informações",
    em_producao: "Em produção",
    em_revisao: "Em revisão",
    aprovado: "Aprovado",
    publicado: "Publicado"
  };
  return labels[value] || formatStatusLabel(value);
}

function formatCriticalArea(value) {
  const labels = {
    operacional: "Produção",
    documental: "Documentos",
    comunicacao: "Comunicação",
    fechamento: "Fechamento"
  };
  return labels[value] || value || "A definir";
}

function formatCriticalDeadline(value) {
  if (!value || value === "A definir") return "A definir";
  const [date, ...rest] = String(value).split(" - ");
  const dateValue = date ? new Date(`${date}T00:00:00`) : null;
  const formattedDate = dateValue && !Number.isNaN(dateValue.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(dateValue)
    : date;
  const title = rest.join(" - ");
  return title ? `${formattedDate} - ${title}` : formattedDate;
}

function getPendingNumber(event) {
  const match = String(event.pendingCount || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function getCommunicationTone(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "aprovado" || normalized === "publicado") return "success";
  if (normalized === "nao_solicitado" || normalized === "não_solicitado") return "neutral";
  return "warning";
}

function getEventStatusTone(event) {
  const status = normalizeForSearch(event.status);
  if (status.includes("atrasado")) return "danger";
  if (status.includes("atencao")) return "warning";
  if (status.includes("encerrado") || status.includes("concluido")) return "success";
  return "info";
}

function isEventActive(event) {
  const status = normalizeForSearch(event.status);
  return !status.includes("encerrado") && !status.includes("concluido") && !status.includes("cancelado") && !status.includes("arquivado");
}

function getCriticalDeadlineDate(event) {
  const value = String(event.criticalDeadline || "");
  const [date] = value.split(" - ");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinNextDays(date, days) {
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(today.getDate() + days);
  return date >= today && date <= limit;
}

function isSameMonth(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
}

function matchesDateFilter(event, filter) {
  if (!filter) return true;
  const startDate = event.startDate ? new Date(`${event.startDate}T00:00:00`) : null;
  if (!startDate || Number.isNaN(startDate.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekLimit = new Date(today);
  weekLimit.setDate(today.getDate() + 7);

  if (filter === "hoje") return startDate.getTime() === today.getTime();
  if (filter === "semana") return startDate >= today && startDate <= weekLimit;
  if (filter === "mes") return isSameMonth(event.startDate);
  return true;
}

function getFilteredEvents() {
  const query = normalizeForSearch(dashboardFilters.query);

  return events.filter((event) => {
    const haystack = normalizeForSearch([
      event.eventName,
      event.eventType,
      event.responsibleArea,
      event.mainResponsible,
      event.locations?.join(" "),
      event.eventDescription
    ].join(" "));
    const status = normalizeForSearch(event.status);
    const area = normalizeForSearch(event.responsibleArea);

    return (!query || haystack.includes(query))
      && (!dashboardFilters.status || status.includes(dashboardFilters.status))
      && (!dashboardFilters.area || area.includes(dashboardFilters.area))
      && matchesDateFilter(event, dashboardFilters.date);
  });
}

function getDashboardStats() {
  const activeEvents = events.filter(isEventActive).length;
  const criticalDeadlines = events.filter((event) => isWithinNextDays(getCriticalDeadlineDate(event), 7)).length;
  const noOwnerItems = events.reduce((total, event) => total + Number(event.noOwnerCount || 0), 0);
  const pendingBriefings = events.filter((event) => {
    const status = normalizeForSearch(event.communicationStatus);
    return status && !status.includes("nao_solicitado") && !status.includes("aprovado") && !status.includes("publicado");
  }).length;
  const documentsInReview = events.reduce((total, event) => total + Number(event.documentsReviewCount || 0), 0);

  return [
    ["Eventos ativos", activeEvents, "planejamento e execução", "text-primary"],
    ["Prazos críticos (7 dias)", criticalDeadlines, "ações com vencimento próximo", criticalDeadlines ? "text-status-warning" : "text-primary"],
    ["Pendências sem responsável", noOwnerItems, "itens que precisam de dono", noOwnerItems ? "text-status-danger" : "text-primary"],
    ["Briefings de comunicação", pendingBriefings, "aguardando informações", pendingBriefings ? "text-status-warning" : "text-primary"],
    ["Documentos em revisão", documentsInReview, "minutas e aprovações", documentsInReview ? "text-status-info" : "text-primary"]
  ];
}

function renderDashboardStats() {
  if (!dashboardStats) return;

  dashboardStats.innerHTML = getDashboardStats()
    .map(([label, value, detail, toneClass]) => `
      <div class="rounded-lg border border-outline-variant bg-white p-4 shadow-sm" aria-label="${escapeHtml(label)}: ${escapeHtml(value)}">
        <p class="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">${escapeHtml(label)}</p>
        <p class="mt-2 text-2xl font-bold ${toneClass}">${escapeHtml(value)}</p>
        <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(detail)}</p>
      </div>
    `)
    .join("");
}

function createEventCard(event) {
  const style = statusStyles[event.status] || statusStyles["Em planejamento"];
  const locationText = event.locations?.length ? event.locations.join(", ") : "Local a definir";
  const timeText = [event.startTime, event.endTime].filter(Boolean).join(" - ") || "Horário a definir";
  const criticalArea = formatCriticalArea(event.criticalArea);
  const criticalDeadline = formatCriticalDeadline(event.criticalDeadline);
  const communicationStatus = formatCommunicationStatus(event.communicationStatus);
  const communicationTone = getCommunicationTone(event.communicationStatus);
  const displayTitle = truncateText(event.eventName, 78);
  const displayDescription = truncateText(event.eventDescription || "Sem descrição curta.", 190);
  const displayLocation = truncateText(locationText, 74);
  const displayResponsible = truncateText(event.mainResponsible, 40);
  const displayDeadline = truncateText(criticalDeadline, 54);
  const displayCommunicationStatus = truncateText(communicationStatus, 40);
  const pendingTone = getPendingNumber(event) > 0 ? "text-status-warning" : "text-status-success";
  const deadlineTone = criticalDeadline === "A definir" ? "text-on-surface" : "text-status-danger";
  const communicationToneClass = {
    success: "text-status-success",
    warning: "text-status-warning",
    neutral: "text-on-surface-variant"
  }[communicationTone] || "text-on-surface";

  return `
    <article class="flex min-h-[560px] flex-col overflow-hidden rounded-lg border border-outline-variant bg-white shadow-sm">
      <div class="border-b border-outline-variant bg-surface-container-low px-4 py-3">
        <span class="inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}">
          ${escapeHtml(event.status)}
        </span>
      </div>
      <div class="flex flex-1 flex-col p-4">
        <h3 class="mb-2 min-h-[56px] text-xl font-bold leading-tight" title="${escapeHtml(event.eventName)}">${escapeHtml(displayTitle)}</h3>
        <div class="mb-3 flex flex-wrap gap-1.5">
          <span class="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-800">${escapeHtml(truncateText(event.eventType, 18))}</span>
          <span class="rounded bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant">${escapeHtml(truncateText(event.format, 18))}</span>
          <span class="rounded bg-surface-container px-2 py-0.5 text-[11px] font-medium text-on-surface-variant" title="${escapeHtml(event.responsibleArea)}">${escapeHtml(truncateText(event.responsibleArea, 34))}</span>
        </div>
        <div class="mb-3 space-y-1.5 text-xs text-on-surface-variant">
          <p class="flex items-center gap-2"><span class="material-symbols-outlined text-base">calendar_today</span>${formatDateRange(event)}</p>
          <p class="flex items-center gap-2"><span class="material-symbols-outlined text-base">schedule</span>${escapeHtml(timeText)}</p>
          <p class="flex items-center gap-2" title="${escapeHtml(locationText)}"><span class="material-symbols-outlined text-base">location_on</span>${escapeHtml(displayLocation)}</p>
          <p class="flex items-center gap-2" title="${escapeHtml(event.mainResponsible)}"><span class="material-symbols-outlined text-base">person</span>Resp: ${escapeHtml(displayResponsible)}</p>
        </div>
        <p class="mb-4 min-h-[64px] text-xs leading-5 text-on-surface-variant" title="${escapeHtml(event.eventDescription || "Sem descrição curta.")}">${escapeHtml(displayDescription)}</p>
        <div class="mt-auto space-y-1.5 border-t border-outline-variant pt-3 text-xs">
          <p class="grid grid-cols-[minmax(0,1fr)_minmax(120px,auto)] gap-4"><span class="text-on-surface-variant">Total de pendências</span><span class="text-right font-medium ${pendingTone}">${escapeHtml(event.pendingCount)}</span></p>
          <p class="grid grid-cols-[minmax(0,1fr)_minmax(120px,auto)] gap-4"><span class="text-on-surface-variant">Área mais crítica</span><span class="text-right font-medium">${escapeHtml(truncateText(criticalArea, 28))}</span></p>
          <p class="grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] gap-4"><span class="text-on-surface-variant">Próximo prazo crítico</span><span class="text-right font-medium ${deadlineTone}" title="${escapeHtml(criticalDeadline)}">${escapeHtml(displayDeadline)}</span></p>
          <p class="grid grid-cols-[minmax(0,1fr)_minmax(140px,auto)] gap-4"><span class="text-on-surface-variant">Status da comunicação</span><span class="text-right font-medium ${communicationToneClass}" title="${escapeHtml(communicationStatus)}">${escapeHtml(displayCommunicationStatus)}</span></p>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-outline-variant bg-surface-container-low p-3">
        <button class="js-edit-event px-2 py-1 text-xs font-medium text-on-surface-variant hover:bg-surface-container" data-event-id="${escapeHtml(event.id)}">Editar</button>
        <button class="js-open-pendencias px-2 py-1 text-xs font-medium text-primary hover:bg-white" data-event-id="${escapeHtml(event.id)}">Pendências</button>
        <button class="js-open-ficha border border-outline-variant bg-white px-2 py-1 text-xs font-medium hover:bg-surface-container-low" data-event-id="${escapeHtml(event.id)}">Ficha</button>
      </div>
    </article>
  `;
}

function renderEvents() {
  renderDashboardStats();
  const filteredEvents = getFilteredEvents();
  const hasActiveFilter = dashboardFilters.query || dashboardFilters.status || dashboardFilters.date || dashboardFilters.area;

  eventsGrid.innerHTML = filteredEvents.length
    ? filteredEvents.map(createEventCard).join("")
    : `<p class="col-span-full border border-outline-variant bg-white p-6 text-sm text-on-surface-variant">
        ${hasActiveFilter ? "Nenhum evento encontrado com os filtros atuais." : "Nenhum evento cadastrado."}
      </p>`;
}

function showDashboard() {
  pageTitle.textContent = "Painel de Eventos";
  filtersBar.classList.remove("hidden");
  dashboardView.classList.remove("hidden");
  eventDetailView.classList.add("hidden");
  eventDetailView.innerHTML = "";
}

function renderOperationalTabs(activeTab = "overview") {
  const tabs = [
    ["overview", "Visão geral"],
    ["checklist", "Checklist"],
    ["tasks", "Tarefas"],
    ["communication", "Comunicação"],
    ["guests", "Convidados"],
    ["vendors", "Fornecedores"],
    ["documents", "Documentos"],
    ["history", "Histórico"]
  ];

  return tabs
    .map(([key, label]) => `
      <button data-tab="${key}" class="js-detail-tab whitespace-nowrap border-b-2 pb-3 text-sm font-medium ${key === activeTab ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-primary"}">
        ${label}
      </button>
    `)
    .join("");
}

function getChecklistStats(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekLimit = new Date(today);
  weekLimit.setDate(today.getDate() + 7);

  return {
    total: items.length,
    open: items.filter((item) => item.status !== "concluido").length,
    done: items.filter((item) => item.status === "concluido").length,
    late: items.filter((item) => item.status === "atrasado").length,
    noOwner: items.filter((item) => item.ownerName === "Sem responsável").length,
    thisWeek: items.filter((item) => {
      if (!item.dueDate || item.status === "concluido") return false;
      const due = new Date(`${item.dueDate}T00:00:00`);
      return due >= today && due <= weekLimit;
    }).length
  };
}

function renderStatCard(label, value, detail = "", tone = "neutral") {
  const toneClasses = {
    neutral: "border-outline-variant bg-white text-on-surface",
    danger: "border-red-200 bg-red-50 text-red-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900"
  };

  return `
    <div class="rounded-lg border p-4 ${toneClasses[tone] || toneClasses.neutral}">
      <p class="text-xs font-medium uppercase tracking-wide text-on-surface-variant">${label}</p>
      <p class="mt-2 text-2xl font-bold">${value}</p>
      ${detail ? `<p class="mt-1 text-xs">${detail}</p>` : ""}
    </div>
  `;
}

function renderStatusBadge(status) {
  const labels = {
    nao_iniciado: "Não iniciado",
    em_andamento: "Em andamento",
    pendente: "Pendente",
    concluido: "Concluído",
    atrasado: "Atrasado"
  };
  const classes = {
    nao_iniciado: "bg-slate-50 text-slate-700 border-slate-200",
    em_andamento: "bg-blue-50 text-blue-700 border-blue-200",
    pendente: "bg-amber-50 text-amber-700 border-amber-200",
    concluido: "bg-emerald-50 text-emerald-700 border-emerald-200",
    atrasado: "bg-red-50 text-red-700 border-red-200"
  };

  return `<span class="inline-flex rounded border px-2 py-1 text-xs font-medium ${classes[status] || classes.pendente}">${labels[status] || status}</span>`;
}

function formatChecklistArea(item) {
  const value = item.area || item.category || "";
  const labels = {
    operacional: "Produção",
    documental: "Documentos",
    comunicacao: "Comunicação",
    fechamento: "Fechamento"
  };

  return labels[value] || value;
}

function renderChecklistRows(items) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="6" class="px-4 py-8 text-center text-sm text-on-surface-variant">
          Nenhum item de checklist cadastrado para este evento.
        </td>
      </tr>
    `;
  }

  return items
    .map((item) => `
      <tr class="border-t border-outline-variant bg-white">
        <td class="w-12 px-4 py-4 align-top">
          <input class="js-checklist-toggle rounded border-outline-variant text-primary" data-item-id="${item.id}" type="checkbox" ${item.status === "concluido" ? "checked" : ""} />
        </td>
        <td class="px-4 py-4 align-top">
          <p class="font-medium ${item.status === "concluido" ? "text-on-surface-variant line-through" : "text-on-surface"}">${escapeHtml(item.title)}</p>
          <p class="mt-1 text-xs text-on-surface-variant">ID: CHECK-${String(item.id).padStart(3, "0")}</p>
        </td>
        <td class="px-4 py-4 align-top text-sm text-on-surface-variant">${escapeHtml(formatChecklistArea(item))}</td>
        <td class="px-4 py-4 align-top text-sm">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container text-xs font-bold">${escapeHtml(item.ownerName).slice(0, 2).toUpperCase()}</span>
            <span>${escapeHtml(item.ownerName)}</span>
          </div>
        </td>
        <td class="px-4 py-4 align-top text-sm">${escapeHtml(item.dueDate || "Sem prazo")}</td>
        <td class="px-4 py-4 align-top">${renderStatusBadge(item.status)}</td>
      </tr>
    `)
    .join("");
}

function renderChecklistContent(event) {
  const stats = getChecklistStats(checklistItems);

  return `
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
      <div class="space-y-6">
        <section class="grid grid-cols-2 gap-3 md:grid-cols-5">
          ${renderStatCard("Pendências", stats.open, "Abertas")}
          ${renderStatCard("Atrasadas", stats.late, stats.late ? "Crítico" : "Sem atraso", stats.late ? "danger" : "neutral")}
          ${renderStatCard("Esta semana", stats.thisWeek, "Vencem em até 7 dias", "warning")}
          ${renderStatCard("Concluídas", stats.done, `${stats.total} itens no total`, "success")}
          ${renderStatCard("Sem responsável", stats.noOwner, "Atribuir responsável")}
        </section>

        <section class="rounded-lg border border-outline-variant bg-white">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant p-4">
            <div>
              <h3 class="text-lg font-semibold text-primary">Checklist do evento</h3>
              <p class="text-sm text-on-surface-variant">Itens operacionais e documentais vinculados à ficha.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <input class="rounded-md border-outline-variant text-sm" placeholder="Buscar item..." type="search" disabled />
              <button class="rounded-md border border-outline-variant bg-white px-3 py-2 text-sm text-on-surface-variant" disabled>Área</button>
              <button class="rounded-md border border-outline-variant bg-white px-3 py-2 text-sm text-on-surface-variant" disabled>Status</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[840px] text-left">
              <thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th class="w-12 px-4 py-3"></th>
                  <th class="px-4 py-3">Item</th>
                  <th class="px-4 py-3">Área</th>
                  <th class="px-4 py-3">Responsável</th>
                  <th class="px-4 py-3">Prazo</th>
                  <th class="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>${renderChecklistRows(checklistItems)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="space-y-6">
        <section class="rounded-lg border border-outline-variant bg-white p-4">
          <h3 class="mb-4 text-lg font-semibold text-primary">Ações rápidas</h3>
          <button id="openChecklistItemModal" class="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-container">
            <span class="material-symbols-outlined text-base">add</span>
            Adicionar item
          </button>
          <button class="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-3 text-sm font-medium" disabled>
            <span class="material-symbols-outlined text-base">playlist_add_check</span>
            Gerar checklist padrão
          </button>
          <button class="flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-3 text-sm font-medium" disabled>
            <span class="material-symbols-outlined text-base">person_add</span>
            Vincular responsável
          </button>
        </section>

        <section class="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 class="mb-4 text-xs font-bold uppercase tracking-wide text-red-800">Alertas críticos</h3>
          <div class="space-y-3 text-sm">
            ${stats.noOwner ? `<p class="rounded bg-white p-3 text-red-900">${stats.noOwner} item sem responsável definido.</p>` : ""}
            ${stats.late ? `<p class="rounded bg-white p-3 text-red-900">${stats.late} item atrasado precisa de revisão.</p>` : ""}
            ${!stats.noOwner && !stats.late ? `<p class="rounded bg-white p-3 text-on-surface-variant">Nenhum alerta crítico no checklist.</p>` : ""}
          </div>
        </section>
      </aside>
    </div>
  `;
}

function getDocumentItems() {
  return documentDetails?.items || [];
}

function getDocumentStats(items, templates = []) {
  const finalStatuses = new Set(["aprovado", "enviado", "arquivado"]);
  const open = items.filter((item) => !finalStatuses.has(item.status)).length;
  const done = items.filter((item) => finalStatuses.has(item.status)).length;
  const noOwner = items.filter((item) => item.ownerName === "Sem responsável").length;
  const next = items
    .filter((item) => !finalStatuses.has(item.status) && item.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  return {
    total: items.length,
    open,
    done,
    noOwner,
    next,
    templates: templates.length,
    usedTemplates: templates.filter((template) => template.used).length
  };
}

function renderDocumentRows(items) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="6" class="px-4 py-8 text-center text-sm text-on-surface-variant">
          Nenhum documento mapeado para este evento.
        </td>
      </tr>
    `;
  }

  return items
    .map((item) => `
      <tr class="border-t border-outline-variant bg-white">
        <td class="px-4 py-4 align-top">
          <p class="font-medium">${escapeHtml(item.title)}</p>
          <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(item.documentType || "Documento")} · ${escapeHtml(item.category || "Sem categoria")} · ${escapeHtml(formatDocumentOrigin(item.origin))}</p>
        </td>
        <td class="px-4 py-4 align-top text-sm">
          <div class="flex items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container text-xs font-bold">${escapeHtml(item.ownerName).slice(0, 2).toUpperCase()}</span>
            <span>${escapeHtml(item.ownerName)}</span>
          </div>
        </td>
        <td class="px-4 py-4 align-top text-sm">${escapeHtml(formatDateValue(item.dueDate) || "Sem prazo")}</td>
        <td class="px-4 py-4 align-top">${renderDocumentStatusBadge(item.status)}</td>
        <td class="px-4 py-4 align-top text-sm">
          <div class="space-y-1">
            <p class="text-on-surface-variant">${escapeHtml(formatAccessLevel(item.accessLevel))} · ${escapeHtml(item.version || "v1")}</p>
            ${item.fileUrl ? `<a class="font-medium text-primary hover:underline" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noreferrer">Abrir link</a>` : `<p class="text-on-surface-variant">${escapeHtml(item.fileLabel || "Sem arquivo/link")}</p>`}
          </div>
        </td>
        <td class="px-4 py-4 align-top text-sm text-on-surface-variant">${escapeHtml(item.notes || "Sem observação")}</td>
      </tr>
    `)
    .join("");
}

function formatDocumentOrigin(value) {
  const map = {
    registro_vazio: "Registro vazio",
    upload: "Arquivo",
    link: "Link",
    modelo: "Modelo",
    ia: "Minuta IA"
  };
  return map[value] || "Registro";
}

function formatAccessLevel(value) {
  const map = {
    publico: "Público",
    interno: "Interno",
    restrito: "Restrito",
    sensivel: "Sensível"
  };
  return map[value] || "Interno";
}

function renderDocumentStatusBadge(status) {
  const labels = {
    aguardando_criacao: "Aguardando criação",
    em_elaboracao: "Em elaboração",
    minuta_gerada: "Minuta gerada",
    em_revisao: "Em revisão",
    aguardando_aprovacao: "Aguardando aprovação",
    aprovado: "Aprovado",
    enviado: "Enviado",
    arquivado: "Arquivado"
  };
  const tones = {
    aguardando_criacao: "border-outline-variant bg-surface-container text-on-surface-variant",
    em_elaboracao: "border-blue-200 bg-blue-50 text-blue-700",
    minuta_gerada: "border-purple-200 bg-purple-50 text-purple-700",
    em_revisao: "border-amber-200 bg-amber-50 text-amber-700",
    aguardando_aprovacao: "border-orange-200 bg-orange-50 text-orange-700",
    aprovado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    enviado: "border-emerald-200 bg-emerald-50 text-emerald-700",
    arquivado: "border-outline-variant bg-surface-container text-on-surface-variant"
  };

  return `<span class="inline-flex rounded border px-2 py-1 text-xs font-medium ${tones[status] || tones.aguardando_criacao}">${labels[status] || status}</span>`;
}

function renderTemplateCards(templates = []) {
  if (!templates.length) {
    return `<p class="rounded border border-outline-variant bg-white p-3 text-sm text-on-surface-variant">Nenhum modelo cadastrado.</p>`;
  }

  return templates
    .map((template) => `
      <div class="rounded border border-outline-variant bg-white p-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium">${escapeHtml(template.name)}</p>
            <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(template.body)}</p>
          </div>
          <span class="rounded px-2 py-1 text-[11px] font-medium ${template.used ? "bg-emerald-50 text-emerald-700" : "bg-surface-container text-on-surface-variant"}">
            ${template.used ? "Usado" : "Disponível"}
          </span>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="flex-1 rounded border border-outline-variant px-2 py-1.5 text-xs font-medium hover:bg-surface-container" type="button" disabled>Usar modelo</button>
          <button class="js-open-ai-draft flex-1 rounded border border-outline-variant px-2 py-1.5 text-xs font-medium hover:bg-surface-container" data-draft-type="${escapeHtml(template.templateType || "oficio_convite")}" type="button">Gerar com IA</button>
        </div>
      </div>
    `)
    .join("");
}

function renderAiDraftHistory(aiDrafts = []) {
  if (!aiDrafts.length) {
    return `
      <div class="rounded border border-outline-variant bg-surface-container-lowest p-3 text-sm text-on-surface-variant">
        Nenhuma minuta gerada ainda. Use o assistente para criar a primeira versão.
      </div>
    `;
  }

  return aiDrafts
    .map((draft) => `
      <div class="rounded border border-outline-variant bg-white p-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-medium">${escapeHtml(formatDraftType(draft.draftType))}</p>
            <p class="mt-1 text-xs text-on-surface-variant">${escapeHtml(draft.createdAt || "Agora")} · ${escapeHtml(draft.provider || "local")}</p>
          </div>
          <span class="rounded bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant">${escapeHtml(draft.model || "modelo local")}</span>
        </div>
        <p class="mt-2 line-clamp-3 text-xs leading-5 text-on-surface-variant">${escapeHtml(draft.generatedText || "")}</p>
      </div>
    `)
    .join("");
}

function formatDraftType(value) {
  const map = {
    oficio_convite: "Ofício-convite",
    solicitacao_parceria: "Solicitação de parceria",
    mensagem_convidado: "Mensagem para convidado",
    relatorio_pos_evento: "Relatório pós-evento",
    briefing_evento: "Briefing do evento"
  };
  return map[value] || "Minuta institucional";
}

function formatDraftModelBase(value) {
  const map = {
    padrao_fcrb_oficio: "Padrão FCRB - Ofício externo",
    convite_institucional: "Convite institucional",
    mensagem_operacional: "Mensagem operacional",
    relatorio_memoria: "Relatório de memória",
    sem_modelo: "Sem modelo específico"
  };
  return map[value] || "Modelo institucional";
}

function formatDeliveryChannel(value) {
  const map = {
    sei: "SEI",
    email: "E-mail",
    whatsapp: "WhatsApp",
    impresso: "Impresso",
    a_definir: "A definir"
  };
  return map[value] || "A definir";
}

function formatTone(value) {
  const map = {
    formal: "Formal",
    muito_formal: "Muito formal",
    conciso: "Conciso"
  };
  return map[value] || "Formal";
}

function normalizeDraftText(text = "") {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDraftSubject(text = "", fallback = "Minuta institucional") {
  const normalized = normalizeDraftText(text);
  const subjectLine = normalized.split("\n").find((line) => /^assunto\s*:/i.test(line.trim()));
  if (subjectLine) return subjectLine.replace(/^assunto\s*:\s*/i, "").trim();

  const firstUsefulLine = normalized
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("---") && line.length < 140);

  return firstUsefulLine || fallback;
}

function extractPendingFields(text = "") {
  const fields = [...String(text).matchAll(/\[[^\]]+\]/g)].map((match) => match[0]);
  return [...new Set(fields)].slice(0, 8);
}

function getDraftRecommendations(context = {}, pendingFields = []) {
  const recommendations = [];
  if (pendingFields.length) recommendations.push("Complete os campos pendentes antes de encaminhar para revisão.");
  if (context.deliveryChannel === "sei") recommendations.push("Confira numeração, assinante e classificação antes de cadastrar no SEI.");
  if (context.recipientName || context.recipientRole) recommendations.push("Valide tratamento, cargo e instituição do destinatário.");
  if (context.tone === "conciso") recommendations.push("Revise se a versão concisa preserva as informações obrigatórias.");
  if (!recommendations.length) recommendations.push("Revise nomes, datas, prazos e dados institucionais antes do envio.");
  return recommendations.slice(0, 4);
}

function renderInstitutionalDocumentPreview(text = "") {
  const normalized = normalizeDraftText(text);
  if (!normalized) {
    return '<p class="text-sm text-on-surface-variant">A minuta aparecerá aqui após a geração.</p>';
  }

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => {
      const clean = paragraph.trim();
      if (!clean) return "";
      if (/^assunto\s*:/i.test(clean)) {
        return `<p class="font-semibold text-primary">${escapeHtml(clean)}</p>`;
      }
      if (clean.startsWith("• ")) {
        const items = clean
          .split("\n")
          .map((item) => item.replace(/^•\s*/, "").trim())
          .filter(Boolean)
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("");
        return `<ul class="list-disc space-y-1 pl-5">${items}</ul>`;
      }
      return `<p>${escapeHtml(clean).replaceAll("\n", "<br />")}</p>`;
    })
    .join("");
}

function renderDocumentAiEmptyState() {
  currentDocumentAiDraft = null;
  currentDocumentAiMode = "preview";
  return `
    <div class="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-dashed border-outline-variant bg-white p-6 text-center">
      <div class="max-w-sm">
        <span class="material-symbols-outlined text-4xl text-on-surface-variant">description</span>
        <p class="mt-3 text-sm font-medium text-primary">Nenhuma minuta gerada ainda</p>
        <p class="mt-1 text-sm text-on-surface-variant">Preencha o contexto à esquerda e clique em “Gerar minuta”.</p>
      </div>
    </div>
  `;
}

function renderDocumentAiLoading() {
  return `
    <div class="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-outline-variant bg-white p-6 text-center">
      <div>
        <span class="material-symbols-outlined animate-pulse text-4xl text-primary">auto_awesome</span>
        <p class="mt-3 text-sm font-medium text-primary">Gerando minuta institucional...</p>
        <p class="mt-1 text-sm text-on-surface-variant">A IA está usando os dados do evento e o contexto informado.</p>
      </div>
    </div>
  `;
}

function renderDocumentAiResult(draft, options = {}) {
  currentDocumentAiDraft = draft;
  currentDocumentAiMode = options.mode || currentDocumentAiMode || "preview";

  const generatedText = draft?.generatedText || "";
  const subject = extractDraftSubject(generatedText, `${formatDraftType(draft?.draftType)} - ${activeEvent?.eventName || "Evento"}`);
  const pendingFields = extractPendingFields(generatedText);
  const recommendations = getDraftRecommendations(draft?.context || {}, pendingFields);
  const statusLabel = currentDocumentAiMode === "review"
    ? "Revisão preparada"
    : currentDocumentAiMode === "saved"
      ? "Minuta salva"
      : "Minuta gerada";
  const statusClass = currentDocumentAiMode === "review"
    ? "bg-amber-50 text-amber-800 border-amber-200"
    : currentDocumentAiMode === "saved"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-blue-50 text-blue-800 border-blue-200";
  const providerLabel = `${draft?.provider || "local"} · ${draft?.model || "modelo local"}`;

  return `
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-outline-variant bg-white">
      <div class="border-b border-outline-variant bg-surface-container-lowest p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium ${statusClass}">
            <span class="material-symbols-outlined text-sm">${currentDocumentAiMode === "review" ? "send" : currentDocumentAiMode === "saved" ? "save" : "check_circle"}</span>
            ${statusLabel}
          </span>
          <span class="rounded bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant">${escapeHtml(providerLabel)}</span>
        </div>
        ${draft?.warning ? `<p class="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">${escapeHtml(draft.warning)}</p>` : ""}
        <h3 class="mt-4 text-xl font-semibold text-primary">Assunto: ${escapeHtml(subject)}</h3>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto bg-surface-container-low p-5">
        <article class="mx-auto min-h-[420px] max-w-3xl border border-outline-variant bg-white px-10 py-8 text-sm leading-7 text-on-surface">
          ${currentDocumentAiMode === "edit" ? `
            <label class="block">
              <span class="mb-2 block text-sm font-medium text-primary">Editor simples da minuta</span>
              <textarea id="documentAiGeneratedText" class="min-h-[420px] w-full resize-y rounded border-outline-variant p-4 text-sm leading-7 focus:ring-primary">${escapeHtml(generatedText)}</textarea>
            </label>
          ` : `
            <div class="space-y-5">
              ${renderInstitutionalDocumentPreview(generatedText)}
            </div>
          `}
        </article>

        <div class="mx-auto mt-4 grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
          <div class="rounded border border-red-100 bg-red-50 p-4">
            <h4 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-red-800">
              <span class="material-symbols-outlined text-base">warning</span>
              Campos pendentes
            </h4>
            ${pendingFields.length ? `
              <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-red-900">
                ${pendingFields.map((field) => `<li>${escapeHtml(field)}</li>`).join("")}
              </ul>
            ` : '<p class="mt-3 text-sm text-red-900">Nenhum campo pendente identificado automaticamente.</p>'}
          </div>
          <div class="rounded border border-blue-100 bg-blue-50 p-4">
            <h4 class="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-900">
              <span class="material-symbols-outlined text-base">tips_and_updates</span>
              Recomendações da IA
            </h4>
            <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-blue-950">
              ${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant bg-surface-container-lowest p-4">
        <button class="js-copy-document-ai-draft inline-flex items-center gap-2 rounded border border-outline-variant bg-white px-3 py-2 text-sm font-medium hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined text-base">content_copy</span>
          Copiar texto
        </button>
        <button class="js-edit-document-ai-draft inline-flex items-center gap-2 rounded border border-outline-variant bg-white px-3 py-2 text-sm font-medium hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined text-base">edit</span>
          Editar no editor
        </button>
        <button class="js-regenerate-document-ai-draft inline-flex items-center gap-2 rounded border border-outline-variant bg-white px-3 py-2 text-sm font-medium hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined text-base">refresh</span>
          Gerar novamente
        </button>
        <button class="js-save-document-ai-draft inline-flex items-center gap-2 rounded border border-outline-variant bg-white px-3 py-2 text-sm font-medium hover:bg-surface-container" type="button">
          <span class="material-symbols-outlined text-base">save</span>
          Salvar como minuta
        </button>
        <button class="js-review-document-ai-draft inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-container" type="button">
          <span class="material-symbols-outlined text-base">send</span>
          Enviar para revisão
        </button>
      </div>
    </div>
  `;
}

function renderDocumentsContent(event) {
  const items = getDocumentItems();
  const templates = documentDetails?.templates || [];
  const aiDrafts = documentDetails?.aiDrafts || [];
  const stats = getDocumentStats(items, templates);

  return `
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
      <div class="space-y-6">
        <section class="flex flex-col justify-between gap-4 rounded-lg border border-outline-variant bg-white p-5 lg:flex-row lg:items-start">
          <div>
            <h3 class="text-2xl font-semibold text-primary">Documentos e Minutas</h3>
            <p class="mt-1 max-w-2xl text-sm text-on-surface-variant">Centralize documentos, modelos institucionais, minutas e aprovações do evento. Esta aba já usa os dados reais do evento e pode gerar minutas com IA para revisão da equipe.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="js-open-ai-draft inline-flex items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-2 text-sm font-medium hover:bg-surface-container" type="button">
              <span class="material-symbols-outlined text-base text-purple-600">auto_awesome</span>
              Gerar minuta com IA
            </button>
            <button class="js-open-document-item inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-container" type="button">
              <span class="material-symbols-outlined text-base">add</span>
              Novo documento
            </button>
          </div>
        </section>

        <section class="grid grid-cols-2 gap-3 md:grid-cols-5">
          ${renderStatCard("Documentos do evento", stats.total, `${stats.open} pendentes`)}
          ${renderStatCard("Concluídos", stats.done, "Etapas finalizadas", "success")}
          ${renderStatCard("Em revisão", Math.max(stats.open - 1, 0), "A validar pela equipe", "warning")}
          ${renderStatCard("Minutas IA", aiDrafts.length, aiDrafts.length ? "Histórico recente" : "Nenhuma gerada")}
          ${renderStatCard("Modelos disponíveis", stats.templates, `${stats.usedTemplates} usado(s)`)}
        </section>

        <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div class="rounded-lg border border-outline-variant bg-white p-5">
            <div class="mb-4 flex items-center gap-3">
              <span class="material-symbols-outlined rounded bg-purple-50 p-2 text-purple-700">auto_awesome</span>
              <div>
                <h3 class="text-xl font-semibold text-primary">Assistente de Minutas</h3>
                <p class="text-sm text-on-surface-variant">Gere uma primeira versão institucional a partir dos dados do evento.</p>
              </div>
            </div>
            <div class="space-y-3">
              <button class="js-open-ai-draft flex w-full items-center justify-between rounded border border-outline-variant bg-white p-3 text-left text-sm font-medium hover:bg-purple-50" data-draft-type="oficio_convite" type="button">
                <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-base">edit_document</span>Gerar ofício-convite</span>
                <span class="material-symbols-outlined text-base">arrow_forward</span>
              </button>
              <button class="js-open-ai-draft flex w-full items-center justify-between rounded border border-outline-variant bg-white p-3 text-left text-sm font-medium hover:bg-purple-50" data-draft-type="solicitacao_parceria" type="button">
                <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-base">handshake</span>Gerar solicitação de parceria</span>
                <span class="material-symbols-outlined text-base">arrow_forward</span>
              </button>
              <button class="js-open-ai-draft flex w-full items-center justify-between rounded border border-outline-variant bg-white p-3 text-left text-sm font-medium hover:bg-purple-50" data-draft-type="mensagem_convidado" type="button">
                <span class="inline-flex items-center gap-2"><span class="material-symbols-outlined text-base">mail</span>Gerar mensagem para convidado</span>
                <span class="material-symbols-outlined text-base">arrow_forward</span>
              </button>
            </div>
            <p class="mt-4 rounded border-l-2 border-outline bg-surface-container-low p-3 text-xs leading-5 text-on-surface-variant">A IA sugere e organiza. A revisão, aprovação e envio permanecem sob responsabilidade da equipe.</p>
          </div>

          <div class="rounded-lg border border-outline-variant bg-white">
            <div class="flex items-center justify-between border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Minutas geradas</h3>
              <span class="text-xs text-on-surface-variant">últimas 5</span>
            </div>
            <div class="space-y-3 p-4">
              ${renderAiDraftHistory(aiDrafts)}
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-lg border border-outline-variant bg-white">
          <div class="border-b border-outline-variant bg-surface-container-low p-4">
            <h3 class="text-lg font-semibold text-primary">Documentos do evento</h3>
            <p class="text-sm text-on-surface-variant">Registros documentais próprios, com status, acesso, responsável e histórico do evento.</p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[920px] text-left text-sm">
              <thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th class="px-4 py-3">Documento</th>
                  <th class="px-4 py-3">Responsável</th>
                  <th class="px-4 py-3">Prazo</th>
                  <th class="px-4 py-3">Status</th>
                  <th class="px-4 py-3">Arquivo/link</th>
                  <th class="px-4 py-3">Observação</th>
                </tr>
              </thead>
              <tbody>${renderDocumentRows(items)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="space-y-6">
        <section class="rounded-lg border border-outline-variant bg-white p-4">
          <h3 class="mb-4 text-lg font-semibold text-primary">Ações rápidas</h3>
          <button class="js-open-ai-draft mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-white hover:bg-primary-container" type="button">
            <span class="material-symbols-outlined text-base">auto_awesome</span>
            Gerar minuta com IA
          </button>
          <button class="js-open-document-item mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-3 text-sm font-medium hover:bg-surface-container" type="button">
            <span class="material-symbols-outlined text-base">add</span>
            Novo documento
          </button>
          <button class="mb-3 flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-3 text-sm font-medium" disabled>
            <span class="material-symbols-outlined text-base">description</span>
            Usar modelo
          </button>
          <button class="flex w-full items-center justify-center gap-2 rounded-md border border-outline-variant bg-white px-4 py-3 text-sm font-medium" disabled>
            <span class="material-symbols-outlined text-base">upload_file</span>
            Anexar arquivo
          </button>
        </section>

        <section class="rounded-lg border border-outline-variant bg-white">
          <div class="border-b border-outline-variant bg-surface-container-low p-4">
            <h3 class="text-lg font-semibold text-primary">Modelos institucionais</h3>
          </div>
          <div class="space-y-3 p-4">
            ${renderTemplateCards(templates)}
          </div>
        </section>

        <section class="rounded-lg border border-outline-variant bg-white p-4">
          <h3 class="mb-3 text-lg font-semibold text-primary">Alertas documentais</h3>
          <div class="space-y-3 text-sm">
            ${stats.next ? `<p class="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">Próximo prazo: ${escapeHtml(stats.next.title)} em ${escapeHtml(formatDateValue(stats.next.dueDate))}.</p>` : `<p class="rounded border border-outline-variant bg-surface-container-lowest p-3 text-on-surface-variant">Nenhum prazo documental crítico.</p>`}
            <p class="rounded border border-outline-variant bg-surface-container-lowest p-3 text-on-surface-variant">Upload real fica para o próximo ciclo; por enquanto registramos arquivo, link ou origem da minuta.</p>
          </div>
        </section>
      </aside>
    </div>
  `;
}

function renderOverviewContent(event) {
  return `
    <section class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div class="rounded-lg border border-outline-variant bg-white p-6">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-xl font-semibold text-primary">Progresso geral</h3>
          <span class="text-sm text-on-surface-variant">Primeira versão</span>
        </div>
        <div class="mb-5 h-2 overflow-hidden rounded-full bg-surface-container">
          <div class="h-full w-1/3 rounded-full bg-primary-container"></div>
        </div>
        <div class="space-y-3 text-sm">
          <p class="flex items-center gap-3"><span class="material-symbols-outlined text-emerald-600">check_circle</span> Evento cadastrado</p>
          <p class="flex items-center gap-3"><span class="material-symbols-outlined text-amber-500">radio_button_unchecked</span> Checklist inicial gerado</p>
          <p class="flex items-center gap-3"><span class="material-symbols-outlined text-outline-variant">radio_button_unchecked</span> Pendências detalhadas a revisar</p>
        </div>
      </div>

      <div class="rounded-lg border border-outline-variant bg-white p-6">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-xl font-semibold text-primary">Tarefas críticas</h3>
          <button class="text-sm font-medium text-primary hover:underline">Ver todas</button>
        </div>
        <div class="divide-y divide-outline-variant text-sm">
          <div class="py-3">
            <p class="font-medium">Revisar checklist inicial</p>
            <p class="mt-1 text-xs text-amber-600">Próxima ação recomendada</p>
          </div>
          <div class="py-3">
            <p class="font-medium">Confirmar responsáveis por módulos ativados</p>
            <p class="mt-1 text-xs text-on-surface-variant">Responsável: ${escapeHtml(event.mainResponsible)}</p>
          </div>
          <div class="py-3">
            <p class="font-medium">Completar documentos e comunicação</p>
            <p class="mt-1 text-xs text-on-surface-variant">Conforme gatilhos do cadastro</p>
          </div>
        </div>
      </div>
    </section>
  `;
}

function getCommunicationState(event) {
  const normalized = String(event.communicationStatus || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const requiresCommunication = normalized && normalized !== "nao_solicitado" && normalized !== "não_solicitado";
  const pending = getPendingNumber(event);
  const completion = requiresCommunication ? (pending > 0 ? 65 : 90) : 20;
  const statusLabel = requiresCommunication ? formatCommunicationStatus(normalized) : "Não solicitado";

  return {
    normalized,
    requiresCommunication,
    statusLabel,
    completion,
    pendingInputs: requiresCommunication ? 3 : 0,
    canSend: normalized === "pronto_para_comunicacao" || normalized === "aprovado" || normalized === "publicado",
    helperText: requiresCommunication
      ? "Disponível quando briefing e informações estiverem completas."
      : "Ative comunicação no cadastro ou edite o briefing para iniciar este fluxo."
  };
}

function getDefaultCommunication(event) {
  return {
    officialTitle: event.eventName,
    shortDescription: event.eventDescription || "Sem descrição curta.",
    fullDescription: event.eventDescription || "",
    registrationLink: "",
    streamingLink: event.streamLink || "",
    channels: ["Site institucional", "Instagram", "Newsletter"],
    status: event.communicationStatus || "nao_solicitado"
  };
}

function renderReadOnlyField(label, value, extraClass = "") {
  return `
    <div class="${extraClass}">
      <p class="mb-1 text-xs font-medium text-on-surface-variant">${label}</p>
      <div class="min-h-10 rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm leading-5">
        ${escapeHtml(value || "A definir")}
      </div>
    </div>
  `;
}

function renderChannelPill(label) {
  return `<span class="rounded-full border border-outline-variant bg-surface-container px-3 py-1 text-xs font-medium text-on-surface-variant">${label}</span>`;
}

function renderMessageTemplate(title) {
  return `
    <div class="border border-outline-variant bg-white p-3">
      <p class="mb-2 text-sm font-medium">${title}</p>
      <div class="flex flex-wrap gap-2">
        <button class="inline-flex items-center gap-1 rounded bg-surface-container px-2 py-1 text-xs text-on-surface-variant" type="button" disabled>
          <span class="material-symbols-outlined text-sm">chat</span>
          WhatsApp
        </button>
        <button class="inline-flex items-center gap-1 rounded bg-surface-container px-2 py-1 text-xs text-on-surface-variant" type="button" disabled>
          <span class="material-symbols-outlined text-sm">mail</span>
          E-mail
        </button>
      </div>
    </div>
  `;
}

function renderCommunicationContent(event) {
  const state = getCommunicationState(event);
  const briefing = communicationDetails || getDefaultCommunication(event);
  const locationText = event.locations?.length ? event.locations.join(", ") : "Local a definir";
  const timeText = [event.startTime, event.endTime].filter(Boolean).join(" - ") || "Horário a definir";
  const eventWhenWhere = `${formatDateRange(event)}, ${timeText} - ${locationText}`;
  const channels = briefing.channels?.length ? briefing.channels : ["Site institucional", "Instagram", "Newsletter"];

  return `
    <div class="space-y-6">
      <section class="flex flex-col justify-between gap-4 rounded-lg border border-outline-variant bg-white p-5 lg:flex-row lg:items-start">
        <div>
          <h3 class="text-2xl font-semibold text-primary">Comunicação</h3>
          <p class="mt-1 text-sm text-on-surface-variant">Solicitação de divulgação e informações de comunicação.</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
            <span class="inline-flex items-center gap-1">
              <span class="material-symbols-outlined text-base">pending</span>
              ${escapeHtml(state.statusLabel)}
            </span>
            <span class="rounded-full bg-secondary-container px-2 py-0.5 text-xs font-medium text-primary">${state.completion}% completo</span>
          </div>
        </div>
        <div class="flex flex-col items-start gap-1 lg:items-end">
          <div class="flex gap-2">
            <button id="openCommunicationBriefingModal" class="rounded border border-outline-variant bg-white px-4 py-2 text-sm font-medium hover:bg-surface-container" type="button">
              ${communicationDetails ? "Editar briefing" : "+ Adicionar briefing"}
            </button>
            <button class="rounded bg-primary px-4 py-2 text-sm font-medium text-white ${state.canSend ? "hover:bg-primary-container" : "cursor-not-allowed opacity-50"}" type="button" ${state.canSend ? "" : "disabled"}>
              Enviar para comunicação
            </button>
          </div>
          <p class="text-xs italic text-on-surface-variant">${escapeHtml(state.helperText)}</p>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        ${renderStatCard("Status da comunicação", state.statusLabel, `${state.completion}% completo`)}
        ${renderStatCard("Informações pendentes", state.pendingInputs, state.pendingInputs ? "1 foto, 2 mini bios" : "Nada pendente", state.pendingInputs ? "danger" : "success")}
        ${renderStatCard("Prazo para envio", formatDateValue(event.startDate), "Ajustar depois no briefing")}
        ${renderStatCard("Última atualização", "Hoje, 09:41", "Por equipe de produção")}
      </section>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div class="space-y-6">
          <section class="rounded-lg border border-outline-variant bg-white">
            <div class="border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Briefing de divulgação</h3>
            </div>
            <div class="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              ${renderReadOnlyField("Título de divulgação", briefing.officialTitle, "md:col-span-2")}
              ${renderReadOnlyField("Descrição curta", briefing.shortDescription || "Sem descrição curta.", "md:col-span-2")}
              ${renderReadOnlyField("Objetivo", "Divulgação institucional do evento")}
              ${renderReadOnlyField("Público-alvo", "Público interessado, pesquisadores e comunidade FCRB")}
              ${renderReadOnlyField("Tipo de peça necessária", "Post, card institucional e chamada para site")}
              ${renderReadOnlyField("Data, horário e local", eventWhenWhere)}
              ${renderReadOnlyField("Link de inscrição", briefing.registrationLink || "A definir")}
              ${renderReadOnlyField("Link de transmissão", briefing.streamingLink || (event.format === "Online" || event.format === "Híbrido" ? "A definir" : "Não se aplica"))}
              <div class="md:col-span-2">
                <p class="mb-2 text-xs font-medium text-on-surface-variant">Canais solicitados</p>
                <div class="flex flex-wrap gap-2">
                  ${channels.map(renderChannelPill).join("")}
                </div>
              </div>
            </div>
          </section>

          <section class="overflow-hidden rounded-lg border border-outline-variant bg-white">
            <div class="flex items-center justify-between border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Informações dos convidados</h3>
              <span class="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">${state.pendingInputs} pendências</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[920px] text-left text-sm">
                <thead class="bg-surface-container text-xs uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th class="px-4 py-3">Nome</th>
                    <th class="px-4 py-3">Instituição</th>
                    <th class="px-4 py-3">E-mail</th>
                    <th class="px-4 py-3">Telefone</th>
                    <th class="px-4 py-3">Canal pref.</th>
                    <th class="px-4 py-3">Status foto</th>
                    <th class="px-4 py-3">Status bio</th>
                    <th class="px-4 py-3">Últ. atualização</th>
                    <th class="px-4 py-3">Histórico</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-outline-variant">
                  <tr>
                    <td class="px-4 py-4 font-medium">Dr. João Almeida</td>
                    <td class="px-4 py-4 text-on-surface-variant">UFRJ</td>
                    <td class="px-4 py-4 text-on-surface-variant">joao@ufrj.br</td>
                    <td class="px-4 py-4 text-on-surface-variant">(21) 9999-9999</td>
                    <td class="px-4 py-4 text-on-surface-variant">WhatsApp</td>
                    <td class="px-4 py-4"><span class="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Recebida</span></td>
                    <td class="px-4 py-4"><span class="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">Pendente</span></td>
                    <td class="px-4 py-4 text-on-surface-variant">Ontem, 14:00</td>
                    <td class="px-4 py-4"><span class="material-symbols-outlined text-base text-on-surface-variant">history</span></td>
                  </tr>
                  <tr>
                    <td class="px-4 py-4 font-medium">Dra. Luiza Castro</td>
                    <td class="px-4 py-4 text-on-surface-variant">FCRB</td>
                    <td class="px-4 py-4 text-on-surface-variant">luiza@fcrb.gov.br</td>
                    <td class="px-4 py-4 text-on-surface-variant">(21) 8888-8888</td>
                    <td class="px-4 py-4 text-on-surface-variant">E-mail</td>
                    <td class="px-4 py-4"><span class="rounded bg-red-50 px-2 py-1 text-xs text-red-700">Crítico</span></td>
                    <td class="px-4 py-4"><span class="rounded bg-red-50 px-2 py-1 text-xs text-red-700">Crítico</span></td>
                    <td class="px-4 py-4 text-on-surface-variant">Há 3 dias</td>
                    <td class="px-4 py-4"><span class="material-symbols-outlined text-base text-on-surface-variant">history</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="border-t border-outline-variant bg-surface-container-low px-4 py-3 text-xs text-on-surface-variant">
              Dados demonstrativos nesta fase. No próximo ciclo, esta tabela será vinculada ao módulo de Convidados.
            </p>
          </section>

          <section class="rounded-lg border border-outline-variant bg-white">
            <div class="border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Peças prontas</h3>
            </div>
            <div class="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
              <div class="rounded border border-dashed border-outline-variant bg-surface-container-lowest p-4">
                <p class="text-sm font-medium">Card Instagram</p>
                <p class="mt-1 text-xs text-on-surface-variant">Aguardando criação</p>
              </div>
              <div class="rounded border border-dashed border-outline-variant bg-surface-container-lowest p-4">
                <p class="text-sm font-medium">Banner interno</p>
                <p class="mt-1 text-xs text-on-surface-variant">Aguardando criação</p>
              </div>
              <div class="rounded border border-dashed border-outline-variant bg-surface-container-lowest p-4">
                <p class="text-sm font-medium">Peça para site</p>
                <p class="mt-1 text-xs text-on-surface-variant">Aguardando criação</p>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-6">
          <section class="rounded-lg border border-outline-variant bg-white">
            <div class="border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Padrões e mensagens</h3>
            </div>
            <div class="space-y-4 p-4">
              <div class="border border-outline-variant bg-surface-container-lowest p-3">
                <h4 class="mb-1 text-sm font-semibold text-primary">Regras para foto</h4>
                <p class="text-sm leading-5 text-on-surface-variant">JPG/PNG, boa resolução, rosto visível e fundo neutro ou institucional. Evitar prints, baixa qualidade e cortes inadequados.</p>
              </div>
              <div class="border border-outline-variant bg-surface-container-lowest p-3">
                <h4 class="mb-1 text-sm font-semibold text-primary">Regras para mini bio</h4>
                <p class="text-sm leading-5 text-on-surface-variant">Curta: até 300 caracteres. Completa: até 800 caracteres. Foco em atuação profissional recente e titulação máxima.</p>
                <div class="mt-3 flex justify-between text-xs text-on-surface-variant">
                  <span>Caracteres (exemplo curta)</span>
                  <span>180 / 300</span>
                </div>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-outline-variant">
                  <div class="h-full w-3/5 bg-primary"></div>
                </div>
              </div>
              <div>
                <h4 class="mb-2 text-sm font-medium text-on-surface-variant">Mensagens rápidas</h4>
                <div class="space-y-2">
                  ${renderMessageTemplate("Solicitar foto e mini bio")}
                  ${renderMessageTemplate("Lembrete de pendência")}
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-outline-variant bg-white">
            <div class="border-b border-outline-variant bg-surface-container-low p-4">
              <h3 class="text-xl font-semibold text-primary">Histórico de aprovação</h3>
            </div>
            <div class="space-y-4 p-4 text-sm">
              <div class="flex gap-3 border-b border-outline-variant pb-4">
                <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"></span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium">Briefing iniciado</p>
                  <div class="mt-1 flex justify-between gap-4 text-xs text-on-surface-variant">
                    <span>08/05/2026 - 14:30</span>
                    <span>Equipe de produção</span>
                  </div>
                  <p class="mt-1 text-xs text-on-surface-variant">Status: em elaboração. Informações solicitadas.</p>
                </div>
              </div>
              <div class="flex gap-3 opacity-60">
                <span class="mt-1 h-2 w-2 shrink-0 rounded-full bg-outline"></span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium">Aprovação Ascom</p>
                  <div class="mt-1 flex justify-between gap-4 text-xs text-on-surface-variant">
                    <span>Pendente</span>
                    <span>-</span>
                  </div>
                  <p class="mt-1 text-xs text-on-surface-variant">Status: aguardando envio.</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;
}

async function loadChecklistItems(event) {
  if (!event?.dbId || !isServerMode()) {
    checklistItems = [];
    renderEventDetail(event, "checklist");
    return;
  }

  const target = document.querySelector("#detailTabContent");
  if (target) {
    target.innerHTML = '<p class="rounded-lg border border-outline-variant bg-white p-6 text-sm text-on-surface-variant">Carregando checklist...</p>';
  }

  try {
    const response = await fetch(`/api/events/${event.dbId}/checklist`);
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o checklist.");
    checklistItems = payload.items || [];
    checklistLoadedEventId = event.id;
    renderEventDetail(event, "checklist");
  } catch (error) {
    if (target) {
      target.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">${escapeHtml(error.message)}</p>`;
    }
  }
}

async function loadCommunicationDetails(event) {
  if (!event?.dbId || !isServerMode()) {
    communicationDetails = getDefaultCommunication(event);
    renderEventDetail(event, "communication");
    return;
  }

  const target = document.querySelector("#detailTabContent");
  if (target) {
    target.innerHTML = '<p class="rounded-lg border border-outline-variant bg-white p-6 text-sm text-on-surface-variant">Carregando comunicação...</p>';
  }

  try {
    const response = await fetch(`/api/events/${event.dbId}/communication`);
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Não foi possível carregar comunicação.");
    communicationDetails = payload.communication || getDefaultCommunication(event);
    communicationLoadedEventId = event.id;
    renderEventDetail(event, "communication");
  } catch (error) {
    if (target) {
      target.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">${escapeHtml(error.message)}</p>`;
    }
  }
}

async function loadDocumentDetails(event) {
  if (!event?.dbId || !isServerMode()) {
    documentDetails = { items: getDocumentItems(), templates: [] };
    renderEventDetail(event, "documents");
    return;
  }

  const target = document.querySelector("#detailTabContent");
  if (target) {
    target.innerHTML = '<p class="rounded-lg border border-outline-variant bg-white p-6 text-sm text-on-surface-variant">Carregando documentos...</p>';
  }

  try {
    const response = await fetch(`/api/events/${event.dbId}/documents`);
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Não foi possível carregar documentos.");
    documentDetails = {
      items: payload.items || [],
      templates: payload.templates || [],
      aiDrafts: payload.aiDrafts || []
    };
    documentLoadedEventId = event.id;
    renderEventDetail(event, "documents");
  } catch (error) {
    if (target) {
      target.innerHTML = `<p class="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">${escapeHtml(error.message)}</p>`;
    }
  }
}

async function updateChecklistItem(itemId, done) {
  const response = await fetch(`/api/checklist-items/${itemId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ done })
  });
  const payload = await readJsonResponse(response);
  if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o checklist.");
  return payload.item;
}

async function createChecklistItem(payload) {
  if (!activeEvent?.dbId) throw new Error("Evento ativo não encontrado.");

  const response = await fetch(`/api/events/${activeEvent.dbId}/checklist`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result.error || "Não foi possível adicionar o item.");
  return result.item;
}

async function saveCommunicationBriefing(payload) {
  if (!activeEvent?.dbId) throw new Error("Evento ativo não encontrado.");

  const response = await fetch(`/api/events/${activeEvent.dbId}/communication`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result.error || "Não foi possível salvar o briefing.");
  return result.communication;
}

async function generateDocumentAiDraft(payload) {
  if (!activeEvent?.dbId) throw new Error("Evento ativo não encontrado.");

  const response = await fetch(`/api/events/${activeEvent.dbId}/documents/ai-draft`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result.error || "Não foi possível gerar a minuta.");
  return result.draft;
}

async function createEventDocument(payload) {
  if (!activeEvent?.dbId) throw new Error("Evento ativo não encontrado.");

  const response = await fetch(`/api/events/${activeEvent.dbId}/documents`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const result = await readJsonResponse(response);
  if (!response.ok) throw new Error(result.error || "Não foi possível salvar o documento.");
  return result;
}

function renderEventDetail(event, activeTab = "overview") {
  activeEvent = event;
  const pending = getPendingNumber(event);
  const atrasadas = event.status === "Atrasado" ? pending : 0;
  const locationText = event.locations?.length ? event.locations.join(", ") : "Local a definir";
  const timeText = [event.startTime, event.endTime].filter(Boolean).join(" - ") || "Horário a definir";
  const communication = formatCommunicationStatus(event.communicationStatus);
  const communicationTone = getCommunicationTone(event.communicationStatus);
  const activeContent = activeTab === "checklist"
    ? renderChecklistContent(event)
    : activeTab === "communication"
      ? renderCommunicationContent(event)
      : activeTab === "documents"
        ? renderDocumentsContent(event)
        : renderOverviewContent(event);

  pageTitle.textContent = "Ficha do Evento";
  filtersBar.classList.add("hidden");
  dashboardView.classList.add("hidden");
  eventDetailView.classList.remove("hidden");

  eventDetailView.innerHTML = `
    <button id="backToDashboard" class="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
      <span class="material-symbols-outlined text-base">arrow_back</span>
      Voltar ao painel
    </button>

    <div class="mb-6 overflow-hidden rounded-lg border border-outline-variant bg-primary-container">
      <div class="flex min-h-28 items-end justify-between gap-4 bg-primary-container px-6 py-5 text-white">
        <div>
          <div class="mb-2 flex flex-wrap gap-2">
            <span class="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">${escapeHtml(event.eventType)}</span>
            <span class="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-800">${escapeHtml(event.status)}</span>
          </div>
          <h2 class="text-3xl font-bold leading-tight">${escapeHtml(event.eventName)}</h2>
        </div>
      </div>
    </div>

    <div class="space-y-6">
      <section class="rounded-lg border border-outline-variant bg-white p-6">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div><p class="text-xs font-medium text-on-surface-variant">Data</p><p class="mt-1 font-medium">${formatDateRange(event)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Horário</p><p class="mt-1 font-medium">${escapeHtml(timeText)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Local</p><p class="mt-1 font-medium">${escapeHtml(locationText)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Formato</p><p class="mt-1 font-medium">${escapeHtml(event.format)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Área responsável</p><p class="mt-1 font-medium">${escapeHtml(event.responsibleArea)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Responsável principal</p><p class="mt-1 font-medium">${escapeHtml(event.mainResponsible)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">Comunicação</p><p class="mt-1 font-medium">${escapeHtml(communication)}</p></div>
          <div><p class="text-xs font-medium text-on-surface-variant">ID</p><p class="mt-1 font-medium">${escapeHtml(event.id)}</p></div>
        </div>
        <div class="mt-6 border-t border-outline-variant pt-5">
          <p class="text-xs font-medium text-on-surface-variant">Descrição breve</p>
          <p class="mt-2 max-w-4xl leading-6">${escapeHtml(event.eventDescription || "Sem descrição curta.")}</p>
        </div>
      </section>

      <div class="flex gap-6 overflow-x-auto border-b border-outline-variant">
        ${renderOperationalTabs(activeTab)}
      </div>

      <div id="detailTabContent">
        ${activeContent}
      </div>
    </div>
  `;

  if (activeTab === "checklist" && checklistLoadedEventId !== event.id) {
    loadChecklistItems(event);
  }

  if (activeTab === "documents" && documentLoadedEventId !== event.id) {
    loadDocumentDetails(event);
  }

  if (activeTab === "communication" && communicationLoadedEventId !== event.id) {
    loadCommunicationDetails(event);
  }
}

function isServerMode() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function configureRuntimeMode() {
  if (isServerMode()) return;

  localModeWarning?.classList.remove("hidden");
  document.querySelector("#openEventModal").disabled = true;
  document.querySelector("#openEventModal").classList.add("cursor-not-allowed", "opacity-60");
}

function openModal() {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function setLocationCheckboxes(locations = []) {
  form.querySelectorAll('input[name="locations"]').forEach((input) => {
    input.checked = locations.includes(input.value);
  });
}

function openCreateEventModal() {
  editingEvent = null;
  form.reset();
  document.querySelector("#eventModalTitle").textContent = "Novo evento";
  document.querySelector("#eventModalDescription").textContent = "Preencha os dados básicos para registrar um novo evento na FCRB.";
  document.querySelector("#submitEventText").textContent = "Criar evento";
  openModal();
}

function openEditEventModal(event) {
  editingEvent = event;
  form.reset();
  document.querySelector("#eventModalTitle").textContent = "Editar evento";
  document.querySelector("#eventModalDescription").textContent = "Atualize os dados básicos deste evento.";
  document.querySelector("#submitEventText").textContent = "Salvar alterações";

  form.elements.eventName.value = event.eventName || "";
  form.elements.eventType.value = event.eventType || "";
  form.elements.eventDescription.value = event.eventDescription || "";
  form.elements.startDate.value = event.startDate || "";
  form.elements.endDate.value = event.endDate || "";
  form.elements.startTime.value = event.startTime || "";
  form.elements.endTime.value = event.endTime || "";
  form.elements.format.value = event.format || "";
  form.elements.streamLink.value = event.streamLink || "";
  form.elements.responsibleArea.value = event.responsibleArea || "";
  form.elements.mainResponsible.value = event.mainResponsible || "";
  form.elements.team.value = event.team || "";
  setLocationCheckboxes(event.locations);

  openModal();
}

function closeModal() {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  editingEvent = null;
  document.querySelector("#eventModalTitle").textContent = "Novo evento";
  document.querySelector("#eventModalDescription").textContent = "Preencha os dados básicos para registrar um novo evento na FCRB.";
  document.querySelector("#submitEventText").textContent = "Criar evento";
  form.reset();
}

function openChecklistItemModal(defaultArea = "") {
  if (!activeEvent) return;
  checklistReturnTab = defaultArea === "Documentos" ? "documents" : "checklist";
  checklistItemForm.reset();
  if (defaultArea) checklistItemForm.elements.area.value = defaultArea;
  checklistItemModal.classList.remove("hidden");
  checklistItemModal.classList.add("flex");
}

function closeChecklistItemModal() {
  checklistItemModal.classList.add("hidden");
  checklistItemModal.classList.remove("flex");
  checklistItemForm.reset();
  checklistReturnTab = "checklist";
}

function setBriefingChannels(channels = []) {
  communicationBriefingForm.querySelectorAll('input[name="channels"]').forEach((input) => {
    input.checked = channels.includes(input.value);
  });
}

function getBriefingChannels() {
  return Array.from(communicationBriefingForm.querySelectorAll('input[name="channels"]:checked')).map((input) => input.value);
}

function openCommunicationBriefingModal() {
  if (!activeEvent) return;
  const briefing = communicationDetails || getDefaultCommunication(activeEvent);

  communicationBriefingForm.reset();
  communicationBriefingForm.elements.officialTitle.value = briefing.officialTitle || activeEvent.eventName || "";
  communicationBriefingForm.elements.shortDescription.value = briefing.shortDescription || activeEvent.eventDescription || "";
  communicationBriefingForm.elements.fullDescription.value = briefing.fullDescription || "";
  communicationBriefingForm.elements.registrationLink.value = briefing.registrationLink || "";
  communicationBriefingForm.elements.streamingLink.value = briefing.streamingLink || activeEvent.streamLink || "";
  setBriefingChannels(briefing.channels || []);

  communicationBriefingModal.classList.remove("hidden");
  communicationBriefingModal.classList.add("flex");
}

function closeCommunicationBriefingModal() {
  communicationBriefingModal.classList.add("hidden");
  communicationBriefingModal.classList.remove("flex");
  communicationBriefingForm.reset();
}

function openEventDocumentModal() {
  if (!activeEvent || !eventDocumentModal || !eventDocumentForm) return;
  eventDocumentForm.reset();
  eventDocumentForm.elements.responsibleArea.value = activeEvent.responsibleArea || "Centro de Pesquisa";
  eventDocumentModal.classList.remove("hidden");
  eventDocumentModal.classList.add("flex");
}

function closeEventDocumentModal() {
  if (!eventDocumentModal || !eventDocumentForm) return;
  eventDocumentModal.classList.add("hidden");
  eventDocumentModal.classList.remove("flex");
  eventDocumentForm.reset();
}

function openDocumentAiModal(draftType = "oficio_convite") {
  if (!activeEvent || !documentAiModal || !documentAiForm) return;
  documentAiForm.reset();
  documentAiForm.elements.draftType.value = draftType || "oficio_convite";
  documentAiForm.elements.goal.value = `Convidar ou formalizar participação relacionada ao evento ${activeEvent.eventName}.`;
  documentAiForm.elements.modelBase.value = draftType === "mensagem_convidado" ? "mensagem_operacional" : "padrao_fcrb_oficio";
  documentAiForm.elements.recipientName.value = activeEvent.responsibleArea || "";
  documentAiForm.elements.recipientInstitution.value = "";
  documentAiForm.elements.recipientRole.value = "";
  documentAiForm.elements.deliveryChannel.value = draftType === "mensagem_convidado" ? "email" : "sei";
  documentAiForm.elements.sourceText.value = activeEvent.eventDescription || "";
  documentAiForm.elements.useEventData.checked = true;
  documentAiForm.querySelector('input[name="tone"][value="formal"]').checked = true;
  documentAiResult.innerHTML = renderDocumentAiEmptyState();
  documentAiModal.classList.remove("hidden");
  documentAiModal.classList.add("flex");
}

function closeDocumentAiModal() {
  if (!documentAiModal || !documentAiForm) return;
  documentAiModal.classList.add("hidden");
  documentAiModal.classList.remove("flex");
  documentAiForm.reset();
  currentDocumentAiDraft = null;
  currentDocumentAiMode = "preview";
  documentAiResult.innerHTML = "";
}

function getCheckedValues(formData, name) {
  return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function loadSavedEvents() {
  try {
    const savedEvents = localStorage.getItem("fcrb-events");
    return savedEvents ? JSON.parse(savedEvents) : initialEvents;
  } catch (error) {
    return initialEvents;
  }
}

function saveEvents() {
  localStorage.setItem("fcrb-events", JSON.stringify(events));
}

function applySidebarState(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarToggle?.setAttribute("aria-label", collapsed ? "Expandir menu lateral" : "Recolher menu lateral");
  localStorage.setItem("fcrb-sidebar-collapsed", collapsed ? "1" : "0");
}

function initSidebar() {
  const collapsed = localStorage.getItem("fcrb-sidebar-collapsed") === "1";
  applySidebarState(collapsed);

  sidebarToggle?.addEventListener("click", () => {
    applySidebarState(!document.body.classList.contains("sidebar-collapsed"));
  });
}

function initDashboardFilters() {
  dashboardSearchInput?.addEventListener("input", (event) => {
    dashboardFilters.query = event.target.value;
    renderEvents();
  });

  dashboardFilterSelects.forEach((select, index) => {
    select.addEventListener("change", (event) => {
      if (index === 0) dashboardFilters.status = event.target.value;
      if (index === 1) dashboardFilters.date = event.target.value;
      if (index === 2) dashboardFilters.area = event.target.value;
      renderEvents();
    });
  });
}

async function loadEvents() {
  if (!isServerMode()) {
    events = [];
    renderEvents();
    eventsGrid.innerHTML = `
      <p class="col-span-full border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Abra o app em <strong>http://127.0.0.1:4173/</strong> para carregar e salvar eventos no banco SQLite.
      </p>
    `;
    return;
  }

  if (dashboardStats) {
    dashboardStats.innerHTML = Array.from({ length: 5 }).map(() => `
      <div class="rounded-lg border border-outline-variant bg-white p-4 shadow-sm">
        <p class="h-3 w-32 rounded bg-surface-container"></p>
        <p class="mt-3 h-7 w-10 rounded bg-surface-container"></p>
        <p class="mt-2 h-3 w-40 rounded bg-surface-container"></p>
      </div>
    `).join("");
  }
  eventsGrid.innerHTML = '<p class="col-span-full border border-outline-variant bg-white p-6 text-sm text-on-surface-variant">Carregando eventos...</p>';

  try {
    const response = await fetch("/api/events");
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os eventos.");
    events = payload.events || [];
    renderEvents();
  } catch (error) {
    events = loadSavedEvents();
    renderEvents();
    eventsGrid.insertAdjacentHTML("afterbegin", `
      <p class="col-span-full border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        Não foi possível carregar os eventos da API. Exibindo dados locais de apoio.
      </p>
    `);
    console.warn("Usando dados locais porque a API não respondeu.", error);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const fallbackMessage = response.ok
      ? "A API retornou uma resposta invalida."
      : `A API retornou uma resposta invalida (${response.status}). Verifique se a rota existe no deploy atual.`;
    throw new Error(fallbackMessage);
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  const formData = new FormData(form);
  const newEvent = {
    id: `EV-2026-${String(events.length + 1).padStart(3, "0")}`,
    eventName: formData.get("eventName"),
    eventType: formData.get("eventType"),
    eventDescription: formData.get("eventDescription"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    format: formData.get("format"),
    locations: getCheckedValues(formData, "locations"),
    streamLink: formData.get("streamLink"),
    responsibleArea: formData.get("responsibleArea"),
    mainResponsible: formData.get("mainResponsible"),
    team: formData.get("team"),
    triggers: {
      hasExternalGuests: formData.has("hasExternalGuests"),
      hasSuppliers: formData.has("hasSuppliers"),
      requiresAccessibility: formData.has("requiresAccessibility"),
      hasRegistration: formData.has("hasRegistration"),
      requiresCommunication: formData.has("requiresCommunication")
    },
    status: "Em planejamento",
    pendingCount: "Checklist inicial",
    criticalArea: "A definir",
    criticalDeadline: "A definir",
    communicationStatus: formData.has("requiresCommunication") ? "Briefing pendente" : "Não solicitado"
  };

  if (isServerMode()) {
    try {
      const url = editingEvent ? `/api/events/${editingEvent.dbId}` : "/api/events";
      const response = await fetch(url, {
        method: editingEvent ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(newEvent)
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o evento.");

      if (editingEvent) {
        events = events.map((event) => event.id === editingEvent.id ? payload.event : event);
      } else {
        events.unshift(payload.event);
      }
      renderEvents();
      closeModal();
      return;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  events.unshift(newEvent);
  saveEvents();
  renderEvents();
  closeModal();
}

document.querySelector("#openEventModal").addEventListener("click", openCreateEventModal);
document.querySelector("#closeEventModal").addEventListener("click", closeModal);
document.querySelector("#cancelEvent").addEventListener("click", closeModal);
form.addEventListener("submit", handleSubmit);
document.querySelector("#closeChecklistItemModal").addEventListener("click", closeChecklistItemModal);
document.querySelector("#cancelChecklistItem").addEventListener("click", closeChecklistItemModal);
document.querySelector("#closeCommunicationBriefingModal").addEventListener("click", closeCommunicationBriefingModal);
document.querySelector("#cancelCommunicationBriefing").addEventListener("click", closeCommunicationBriefingModal);
document.querySelector("#closeEventDocumentModal")?.addEventListener("click", closeEventDocumentModal);
document.querySelector("#cancelEventDocument")?.addEventListener("click", closeEventDocumentModal);
document.querySelector("#closeDocumentAiModal")?.addEventListener("click", closeDocumentAiModal);
document.querySelector("#cancelDocumentAi")?.addEventListener("click", closeDocumentAiModal);

checklistItemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(checklistItemForm);
  const submitButton = document.querySelector('button[form="checklistItemForm"]');
  submitButton.disabled = true;
  submitButton.classList.add("opacity-60");

  try {
    const item = await createChecklistItem({
      title: formData.get("title"),
      area: formData.get("area"),
      ownerName: formData.get("ownerName"),
      dueDate: formData.get("dueDate"),
      status: formData.get("status"),
      notes: formData.get("notes")
    });

    checklistItems.unshift(item);
    checklistLoadedEventId = activeEvent.id;
    documentLoadedEventId = null;
    const returnTab = checklistReturnTab;
    closeChecklistItemModal();
    renderEventDetail(activeEvent, returnTab);
    await loadEvents();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-60");
  }
});

communicationBriefingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(communicationBriefingForm);
  const submitButton = document.querySelector('button[form="communicationBriefingForm"]');
  submitButton.disabled = true;
  submitButton.classList.add("opacity-60");

  try {
    communicationDetails = await saveCommunicationBriefing({
      officialTitle: formData.get("officialTitle"),
      shortDescription: formData.get("shortDescription"),
      fullDescription: formData.get("fullDescription"),
      registrationLink: formData.get("registrationLink"),
      streamingLink: formData.get("streamingLink"),
      channels: getBriefingChannels()
    });
    communicationLoadedEventId = activeEvent.id;
    closeCommunicationBriefingModal();
    renderEventDetail(activeEvent, "communication");
    await loadEvents();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-60");
  }
});

eventDocumentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(eventDocumentForm);
  const submitButton = document.querySelector('button[form="eventDocumentForm"]');
  submitButton.disabled = true;
  submitButton.classList.add("opacity-60");

  try {
    const result = await createEventDocument({
      origin: formData.get("origin"),
      title: formData.get("title"),
      documentType: formData.get("documentType"),
      category: formData.get("category"),
      notes: formData.get("notes"),
      status: formData.get("status"),
      dueDate: formData.get("dueDate"),
      ownerName: formData.get("ownerName"),
      responsibleArea: formData.get("responsibleArea"),
      accessLevel: formData.get("accessLevel"),
      fileUrl: formData.get("fileUrl"),
      createChecklistItem: Boolean(formData.get("createChecklistItem"))
    });

    documentDetails = {
      ...(documentDetails || {}),
      items: [result.document, ...(documentDetails?.items || [])],
      templates: documentDetails?.templates || [],
      aiDrafts: documentDetails?.aiDrafts || []
    };
    documentLoadedEventId = activeEvent.id;
    if (result.checklistItem) {
      checklistItems = [result.checklistItem, ...checklistItems];
      checklistLoadedEventId = null;
    }
    closeEventDocumentModal();
    renderEventDetail(activeEvent, "documents");
    await loadEvents();
  } catch (error) {
    alert(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-60");
  }
});

documentAiForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(documentAiForm);
  const submitButton = document.querySelector('button[form="documentAiForm"]');
  submitButton.disabled = true;
  submitButton.classList.add("opacity-60");
  documentAiResult.innerHTML = renderDocumentAiLoading();

  try {
    const draftContext = {
      draftType: formData.get("draftType"),
      goal: formData.get("goal"),
      modelBase: formData.get("modelBase"),
      recipientName: formData.get("recipientName"),
      recipientInstitution: formData.get("recipientInstitution"),
      recipientRole: formData.get("recipientRole"),
      deliveryChannel: formData.get("deliveryChannel"),
      sourceText: formData.get("sourceText"),
      tone: formData.get("tone"),
      useEventData: Boolean(formData.get("useEventData")),
      notes: formData.get("notes")
    };
    const draft = await generateDocumentAiDraft({
      ...draftContext,
      audience: [
        formData.get("recipientName"),
        formData.get("recipientRole"),
        formData.get("recipientInstitution")
      ].filter(Boolean).join(" - ")
    });

    draft.context = draftContext;
    documentAiResult.innerHTML = renderDocumentAiResult(draft, { mode: "preview" });

    documentDetails = {
      ...(documentDetails || {}),
      aiDrafts: [
        {
          id: draft.id,
          draftType: draft.draftType,
          generatedText: draft.generatedText,
          provider: draft.provider,
          model: draft.model,
          createdAt: "Agora"
        },
        ...(documentDetails?.aiDrafts || [])
      ].slice(0, 5)
    };
    documentLoadedEventId = activeEvent.id;
    renderEventDetail(activeEvent, "documents");
  } catch (error) {
    documentAiResult.innerHTML = `<p class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">${escapeHtml(error.message)}</p>`;
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-60");
  }
});

documentAiResult?.addEventListener("click", async (event) => {
  const copyButton = event.target.closest(".js-copy-document-ai-draft");
  const editButton = event.target.closest(".js-edit-document-ai-draft");
  const regenerateButton = event.target.closest(".js-regenerate-document-ai-draft");
  const saveButton = event.target.closest(".js-save-document-ai-draft");
  const reviewButton = event.target.closest(".js-review-document-ai-draft");

  if (copyButton) {
    const textArea = document.querySelector("#documentAiGeneratedText");
    const text = textArea?.value || currentDocumentAiDraft?.generatedText || "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      if (textArea) {
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.setSelectionRange(0, 0);
      }
    }

    const original = copyButton.innerHTML;
    copyButton.innerHTML = '<span class="material-symbols-outlined text-base">check</span>Copiado';
    setTimeout(() => {
      copyButton.innerHTML = original;
    }, 1800);
    return;
  }

  if (editButton && currentDocumentAiDraft) {
    const textArea = document.querySelector("#documentAiGeneratedText");
    if (textArea) {
      currentDocumentAiDraft.generatedText = textArea.value;
    }
    documentAiResult.innerHTML = renderDocumentAiResult(currentDocumentAiDraft, { mode: "edit" });
    document.querySelector("#documentAiGeneratedText")?.focus();
    return;
  }

  if (regenerateButton) {
    documentAiForm?.requestSubmit();
    return;
  }

  if (saveButton && currentDocumentAiDraft) {
    const textArea = document.querySelector("#documentAiGeneratedText");
    if (textArea) currentDocumentAiDraft.generatedText = textArea.value;
    documentAiResult.innerHTML = renderDocumentAiResult(currentDocumentAiDraft, { mode: "saved" });
    return;
  }

  if (reviewButton && currentDocumentAiDraft) {
    const textArea = document.querySelector("#documentAiGeneratedText");
    if (textArea) currentDocumentAiDraft.generatedText = textArea.value;
    documentAiResult.innerHTML = renderDocumentAiResult(currentDocumentAiDraft, { mode: "review" });
  }
});

eventsGrid.addEventListener("click", (event) => {
  const editButton = event.target.closest(".js-edit-event");
  if (editButton) {
    const selectedEvent = events.find((item) => item.id === editButton.dataset.eventId);
    if (selectedEvent) openEditEventModal(selectedEvent);
    return;
  }

  const detailButton = event.target.closest(".js-open-ficha, .js-open-pendencias");
  if (!detailButton) return;

  const selectedEvent = events.find((item) => item.id === detailButton.dataset.eventId);
  if (selectedEvent) {
    checklistItems = [];
    checklistLoadedEventId = null;
    communicationDetails = null;
    communicationLoadedEventId = null;
    documentDetails = null;
    documentLoadedEventId = null;
    renderEventDetail(selectedEvent, detailButton.classList.contains("js-open-pendencias") ? "checklist" : "overview");
  }
});

eventDetailView.addEventListener("click", async (event) => {
  if (event.target.closest("#backToDashboard")) showDashboard();

  const tab = event.target.closest(".js-detail-tab");
  if (tab && activeEvent) {
    renderEventDetail(activeEvent, tab.dataset.tab);
  }

  if (event.target.closest("#openChecklistItemModal")) {
    openChecklistItemModal();
  }

  if (event.target.closest(".js-open-document-item")) {
    openEventDocumentModal();
  }

  const aiButton = event.target.closest(".js-open-ai-draft");
  if (aiButton) {
    openDocumentAiModal(aiButton.dataset.draftType || "oficio_convite");
  }

  if (event.target.closest("#openCommunicationBriefingModal")) {
    openCommunicationBriefingModal();
  }

  const checklistToggle = event.target.closest(".js-checklist-toggle");
  if (checklistToggle && activeEvent) {
    const itemId = Number(checklistToggle.dataset.itemId);
    const done = checklistToggle.checked;
    checklistToggle.disabled = true;

    try {
      const updatedItem = await updateChecklistItem(itemId, done);
      checklistItems = checklistItems.map((item) => item.id === itemId ? updatedItem : item);
      renderEventDetail(activeEvent, "checklist");
    } catch (error) {
      alert(error.message);
      checklistToggle.checked = !done;
      checklistToggle.disabled = false;
    }
  }
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

checklistItemModal.addEventListener("click", (event) => {
  if (event.target === checklistItemModal) closeChecklistItemModal();
});

communicationBriefingModal.addEventListener("click", (event) => {
  if (event.target === communicationBriefingModal) closeCommunicationBriefingModal();
});

eventDocumentModal?.addEventListener("click", (event) => {
  if (event.target === eventDocumentModal) closeEventDocumentModal();
});

documentAiModal?.addEventListener("click", (event) => {
  if (event.target === documentAiModal) closeDocumentAiModal();
});

initSidebar();
initDashboardFilters();
configureRuntimeMode();
loadEvents();
