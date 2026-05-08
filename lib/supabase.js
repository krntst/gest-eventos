function cleanEnvValue(value, variableName) {
  let rawValue = String(value || "").trim();
  const assignmentPrefix = `${variableName}=`;
  const exportPrefix = `export ${variableName}=`;

  if (rawValue.startsWith(exportPrefix)) {
    rawValue = rawValue.slice(exportPrefix.length).trim();
  } else if (rawValue.startsWith(assignmentPrefix)) {
    rawValue = rawValue.slice(assignmentPrefix.length).trim();
  }

  return rawValue
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .trim();
}

function cleanSupabaseUrl(value) {
  const rawUrl = cleanEnvValue(value, "SUPABASE_URL")
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");

  if (!rawUrl) return "";

  try {
    return new URL(rawUrl).origin;
  } catch {
    return rawUrl;
  }
}

const SUPABASE_URL = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");

function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const error = new Error("Supabase nao configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
    error.statusCode = 500;
    throw error;
  }
}

function buildSearchParams(search = {}) {
  const params = new URLSearchParams();

  Object.entries(search).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  return params;
}

async function supabaseRequest(path, options = {}) {
  assertSupabaseConfig();

  const {
    method = "GET",
    search,
    body,
    prefer
  } = options;

  const params = buildSearchParams(search);
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}${params.size ? `?${params}` : ""}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json"
  };

  if (prefer) headers.prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.hint || payload?.details || "Falha ao acessar Supabase.";
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function selectRows(table, search = {}) {
  return supabaseRequest(table, { search });
}

async function insertRows(table, rows, options = {}) {
  return supabaseRequest(table, {
    method: "POST",
    body: rows,
    prefer: options.prefer || "return=representation"
  });
}

module.exports = {
  supabaseRequest,
  selectRows,
  insertRows
};
