/**
 * GERENCIADOR PRO — ESPELHO DE LEADS NO GOOGLE SHEETS
 * Versão: 2026-08-23.3
 *
 * O D1/Cloudflare Worker é a fonte primária.
 * Este Apps Script funciona apenas como espelho.
 * Antes de escrever, valida o payload contra o lead canônico no D1
 * por meio do endpoint /api/mirror/authorize.
 */

const CONFIG = Object.freeze({
  VERSION: "2026-08-23.3",
  SERVICE_NAME: "Gerenciador PRO Sheets Mirror",
  SPREADSHEET_NAME: "GERENCIADOR PRO — LEADS OFICIAL",
  CADASTROS_SHEET: "Cadastros",
  RESUMO_SHEET: "Resumo",
  PROPERTY_KEY: "GP_LEADS_SPREADSHEET_ID_20260802_V6",
  MIRROR_AUTH_URL: "https://gerenciador-pro-v2.animaisfofinhos1983.workers.dev/api/mirror/authorize",
  LOCK_TIMEOUT_MS: 30000,
  AUTH_TIMEOUT_MS: 10000,
  MAX_TEXT_LENGTH: 5000
});

const HEADERS = Object.freeze([
  "ID",
  "Data/hora do servidor",
  "Tipo de interesse",
  "Nome",
  "WhatsApp",
  "E-mail",
  "País",
  "Cidade/estado",
  "Contato preferido",
  "Experiência no trading",
  "Principal objetivo",
  "Canal de divulgação",
  "Tamanho do público",
  "Link do canal",
  "Experiência como afiliado",
  "Observação",
  "Consentimento",
  "Origem",
  "UTM source",
  "UTM medium",
  "UTM campaign",
  "URL da página",
  "Data/hora do navegador",
  "Navegador",
  "Status comercial"
]);

/**
 * Execute somente se precisar reconstruir ou conferir a estrutura.
 * Reutiliza a planilha oficial existente.
 */
function INSTALAR_SISTEMA() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    const spreadsheet = getOrCreateSpreadsheet_();
    const cadastros = ensureCadastrosSheet_(spreadsheet, true);

    ensureResumoSheet_(spreadsheet, true);
    ensureEditTrigger_(spreadsheet);
    runSelfTest_(spreadsheet, cadastros);
    updateResumo_(spreadsheet);

    const result = {
      ok: true,
      service: CONFIG.SERVICE_NAME,
      version: CONFIG.VERSION,
      installed: true,
      selfTest: true,
      timestamp: new Date().toISOString()
    };

    console.log(JSON.stringify(result));
    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Diagnóstico público mínimo.
 * Não expõe ID, URL, nome da planilha nem contagem de cadastros.
 */
function doGet(e) {
  return jsonOutput_({
    ok: true,
    service: CONFIG.SERVICE_NAME,
    version: CONFIG.VERSION,
    status: "ready",
    timestamp: new Date().toISOString()
  });
}

/**
 * Recebe somente espelhamentos previamente confirmados pelo Worker/D1.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  let payload = {};
  let submissionId = "";

  try {
    payload = getPayload_(e);
    submissionId = cleanText_(payload.submission_id);

    // Segurança vem antes do ScriptLock para uma chamada inválida não ocupar
    // o lock de gravação da planilha.
    authorizeMirrorPayload_(payload);

    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    validatePayload_(payload);

    const spreadsheet = getOfficialSpreadsheet_();
    const sheet = ensureCadastrosSheet_(spreadsheet, false);
    ensureResumoSheet_(spreadsheet, false);

    // Idempotência primária pelo submission_id canônico do D1.
    const existingSubmission = findSubmissionId_(sheet, submissionId);
    if (existingSubmission) {
      updateResumo_(spreadsheet);
      return jsonOutput_({
        ok: true,
        duplicate: true,
        submissionId: submissionId
      });
    }

    const normalizedEmail = normalizeEmail_(payload.email);
    const normalizedPhone = normalizePhone_(payload.whatsapp);

    // Compatibilidade com cadastros antigos que ainda não tinham idempotência
    // por submission_id.
    const duplicateContact = findDuplicateContact_(
      sheet,
      normalizedEmail,
      normalizedPhone,
      payload.tipo_interesse
    );

    if (duplicateContact) {
      updateResumo_(spreadsheet);
      return jsonOutput_({
        ok: true,
        duplicate: true,
        submissionId: submissionId
      });
    }

    const now = new Date();

    sheet.appendRow([
      submissionId,
      now,
      cleanText_(payload.tipo_interesse),
      cleanText_(payload.nome),
      cleanText_(payload.whatsapp),
      normalizedEmail,
      cleanText_(payload.pais),
      cleanText_(payload.cidade_estado),
      cleanText_(payload.contato_preferido),
      cleanText_(payload.experiencia_trading),
      cleanText_(payload.principal_objetivo),
      cleanText_(payload.canal_divulgacao),
      cleanText_(payload.tamanho_publico),
      cleanText_(payload.link_canal),
      cleanText_(payload.experiencia_afiliado),
      cleanText_(payload.observacao),
      cleanText_(payload.consentimento),
      cleanText_(payload.origem),
      cleanText_(payload.utm_source),
      cleanText_(payload.utm_medium),
      cleanText_(payload.utm_campaign),
      cleanText_(payload.pagina_url),
      cleanText_(payload.enviado_em_local),
      cleanText_(payload.user_agent),
      "Novo"
    ]);

    SpreadsheetApp.flush();

    const savedRow = sheet.getLastRow();
    const savedId = sheet.getRange(savedRow, 1).getDisplayValue();

    if (savedId !== submissionId) {
      throw new Error("A planilha não confirmou o ID da linha gravada.");
    }

    updateResumo_(spreadsheet);
    SpreadsheetApp.flush();

    return jsonOutput_({
      ok: true,
      duplicate: false,
      submissionId: submissionId,
      confirmedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);

    return jsonOutput_({
      ok: false,
      submissionId: submissionId,
      error: publicErrorMessage_(error)
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Confirma no Worker que TODOS os campos que o Apps Script pretende gravar
 * correspondem ao lead canônico já existente no D1.
 *
 * Uma chamada direta ao Apps Script sem lead válido no D1, com ID inventado
 * ou com qualquer campo adulterado é recusada antes da planilha.
 */
function authorizeMirrorPayload_(payload) {
  const submissionId = cleanText_(payload.submission_id);
  const mirrorAuthToken = plainText_(payload._mirror_auth_token, 128);
  if (!submissionId || !/^[a-f0-9]{64}$/.test(mirrorAuthToken)) {
    throw new Error("MIRROR_UNAUTHORIZED");
  }

  const authPayload = buildAuthorizationPayload_(payload);
  let response;

  try {
    response = UrlFetchApp.fetch(CONFIG.MIRROR_AUTH_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(authPayload),
      muteHttpExceptions: true,
      followRedirects: false
    });
  } catch (error) {
    console.error("mirror_auth_unavailable", getErrorMessage_(error));
    throw new Error("MIRROR_AUTH_UNAVAILABLE");
  }

  const status = response.getResponseCode();
  let result = null;

  try {
    result = JSON.parse(response.getContentText() || "{}");
  } catch (error) {
    result = null;
  }

  if (status !== 200 || !result || result.ok !== true) {
    if (status >= 500) {
      throw new Error("MIRROR_AUTH_UNAVAILABLE");
    }
    throw new Error("MIRROR_UNAUTHORIZED");
  }
}

function buildAuthorizationPayload_(payload) {
  return {
    _mirror_auth_token: plainText_(payload._mirror_auth_token, 128),
    submission_id: plainText_(payload.submission_id, 120),
    tipo_interesse: plainText_(payload.tipo_interesse, 20),
    nome: plainText_(payload.nome, 160),
    whatsapp: plainText_(payload.whatsapp, 80),
    email: plainText_(payload.email, 320),
    pais: plainText_(payload.pais, 120),
    cidade_estado: plainText_(payload.cidade_estado, 500),
    contato_preferido: plainText_(payload.contato_preferido, 500),
    experiencia_trading: plainText_(payload.experiencia_trading, 500),
    principal_objetivo: plainText_(payload.principal_objetivo, 1000),
    canal_divulgacao: plainText_(payload.canal_divulgacao, 180),
    tamanho_publico: plainText_(payload.tamanho_publico, 500),
    link_canal: plainText_(payload.link_canal, 1000),
    experiencia_afiliado: plainText_(payload.experiencia_afiliado, 1000),
    observacao: plainText_(payload.observacao, 5000),
    consentimento: plainText_(payload.consentimento, 20),
    origem: plainText_(payload.origem, 500),
    utm_source: plainText_(payload.utm_source, 500),
    utm_medium: plainText_(payload.utm_medium, 500),
    utm_campaign: plainText_(payload.utm_campaign, 500),
    pagina_url: plainText_(payload.pagina_url, 2000),
    enviado_em_local: plainText_(payload.enviado_em_local, 100),
    user_agent: plainText_(payload.user_agent, 1000)
  };
}

/**
 * Atualiza o painel quando o interesse ou status é editado.
 */
function ATUALIZAR_PAINEL_AO_EDITAR(e) {
  try {
    if (e && e.range) {
      const sheet = e.range.getSheet();
      const column = e.range.getColumn();

      if (sheet.getName() !== CONFIG.CADASTROS_SHEET) return;
      if (e.range.getRow() === 1) return;
      if (column !== 3 && column !== 25) return;
    }

    const spreadsheet = e && e.source ? e.source : getOfficialSpreadsheet_();
    updateResumo_(spreadsheet);
  } catch (error) {
    console.error(error);
  }
}

/**
 * Em operação normal a planilha oficial NUNCA é recriada silenciosamente.
 */
function getOfficialSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(CONFIG.PROPERTY_KEY);

  if (!savedId) {
    throw new Error("OFFICIAL_SPREADSHEET_NOT_CONFIGURED");
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(savedId);
    configureSpreadsheet_(spreadsheet);
    return spreadsheet;
  } catch (error) {
    console.error("official_spreadsheet_unavailable", getErrorMessage_(error));
    throw new Error("OFFICIAL_SPREADSHEET_UNAVAILABLE");
  }
}

/**
 * Só INSTALAR_SISTEMA pode criar uma planilha se ainda não houver ID salvo.
 */
function getOrCreateSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(CONFIG.PROPERTY_KEY);

  if (savedId) return getOfficialSpreadsheet_();

  const spreadsheet = SpreadsheetApp.create(
    CONFIG.SPREADSHEET_NAME,
    1000,
    HEADERS.length
  );

  properties.setProperty(CONFIG.PROPERTY_KEY, spreadsheet.getId());

  configureSpreadsheet_(spreadsheet);
  ensureCadastrosSheet_(spreadsheet, true);
  ensureResumoSheet_(spreadsheet, true);

  return spreadsheet;
}

function configureSpreadsheet_(spreadsheet) {
  try {
    spreadsheet.setSpreadsheetLocale("pt_BR");
    spreadsheet.setSpreadsheetTimeZone("America/Sao_Paulo");
  } catch (error) {
    console.warn(getErrorMessage_(error));
  }
}

function ensureCadastrosSheet_(spreadsheet, fullSetup) {
  let sheet = spreadsheet.getSheetByName(CONFIG.CADASTROS_SHEET);

  if (!sheet) {
    const sheets = spreadsheet.getSheets();
    const firstSheet = sheets[0];
    const firstCell = firstSheet.getRange(1, 1).getDisplayValue().trim();

    const canRenameFirstSheet =
      sheets.length === 1 &&
      firstSheet.getLastRow() <= 1 &&
      firstCell === "";

    if (canRenameFirstSheet) {
      firstSheet.setName(CONFIG.CADASTROS_SHEET);
      sheet = firstSheet;
    } else {
      sheet = spreadsheet.insertSheet(CONFIG.CADASTROS_SHEET);
    }

    fullSetup = true;
  }

  const missingColumns = HEADERS.length - sheet.getMaxColumns();
  if (missingColumns > 0) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), missingColumns);
    fullSetup = true;
  }

  const currentHeaders = sheet
    .getRange(1, 1, 1, HEADERS.length)
    .getDisplayValues()[0];

  const headersAreCorrect = HEADERS.every(function(header, index) {
    return currentHeaders[index] === header;
  });

  if (!headersAreCorrect) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([Array.from(HEADERS)]);
    fullSetup = true;
  }

  if (fullSetup) formatCadastrosSheet_(sheet);
  return sheet;
}

function formatCadastrosSheet_(sheet) {
  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setValues([Array.from(HEADERS)])
    .setBackground("#ff7a1a")
    .setFontColor("#111111")
    .setFontWeight("bold")
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 44);
  sheet.getRange("B:B").setNumberFormat("dd/mm/yyyy hh:mm:ss");

  const statusRule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(
      [
        "Novo",
        "Contatado",
        "Qualificado",
        "Aguardando lançamento",
        "Convertido",
        "Sem interesse"
      ],
      true
    )
    .setAllowInvalid(false)
    .build();

  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 25, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);
  }

  if (!sheet.getFilter()) {
    sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  }

  const widths = [
    230, 170, 155, 200, 170,
    220, 130, 180, 160, 190,
    210, 190, 160, 230, 190,
    240, 130, 150, 140, 140,
    160, 270, 200, 280, 180
  ];

  widths.forEach(function(width, index) {
    sheet.setColumnWidth(index + 1, width);
  });
}

function ensureResumoSheet_(spreadsheet, fullSetup) {
  let summary = spreadsheet.getSheetByName(CONFIG.RESUMO_SHEET);

  if (!summary) {
    summary = spreadsheet.insertSheet(CONFIG.RESUMO_SHEET);
    fullSetup = true;
  }

  if (fullSetup) formatResumoSheet_(summary);
  return summary;
}

function formatResumoSheet_(summary) {
  try {
    summary.getRange("A1:B1").breakApart();
  } catch (error) {
    console.warn(getErrorMessage_(error));
  }

  summary.getRange("A1:B8").clearContent();
  summary.getRange("A1").setValue("PAINEL — GERENCIADOR PRO");

  summary.getRange("A2:B8").setValues([
    ["Indicador", "Quantidade"],
    ["Total de interessados", 0],
    ["Interessados em comprar", 0],
    ["Interessados em revender", 0],
    ["Novos contatos", 0],
    ["Contatos qualificados", 0],
    ["Convertidos", 0]
  ]);

  summary.getRange("A1:B1").merge();

  summary
    .getRange("A1:B1")
    .setBackground("#111827")
    .setFontColor("#ff7a1a")
    .setFontWeight("bold")
    .setFontSize(15)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle");

  summary
    .getRange("A2:B2")
    .setBackground("#ff7a1a")
    .setFontColor("#111111")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  summary.getRange("A3:B8").setBorder(true, true, true, true, true, true);

  summary
    .getRange("B3:B8")
    .setFontWeight("bold")
    .setFontSize(14)
    .setHorizontalAlignment("center")
    .setNumberFormat("0");

  summary.setColumnWidth(1, 280);
  summary.setColumnWidth(2, 140);
  summary.setRowHeight(1, 48);
  summary.setFrozenRows(2);
}

function updateResumo_(spreadsheet) {
  const cadastros = ensureCadastrosSheet_(spreadsheet, false);
  const summary = ensureResumoSheet_(spreadsheet, false);
  const lastRow = cadastros.getLastRow();

  let total = 0;
  let buyers = 0;
  let resellers = 0;
  let newContacts = 0;
  let qualified = 0;
  let converted = 0;

  if (lastRow >= 2) {
    const values = cadastros
      .getRange(2, 1, lastRow - 1, HEADERS.length)
      .getDisplayValues();

    values.forEach(function(row) {
      const id = String(row[0] || "").trim();
      if (!id) return;

      total += 1;

      const interest = String(row[2] || "").trim().toLowerCase();
      const status = String(row[24] || "").trim().toLowerCase();

      if (interest === "comprar") buyers += 1;
      if (interest === "revender") resellers += 1;
      if (status === "novo") newContacts += 1;
      if (status === "qualificado") qualified += 1;
      if (status === "convertido") converted += 1;
    });
  }

  summary.getRange("B3:B8").setValues([
    [total],
    [buyers],
    [resellers],
    [newContacts],
    [qualified],
    [converted]
  ]);

  SpreadsheetApp.flush();
}

function ensureEditTrigger_(spreadsheet) {
  const triggers = ScriptApp.getProjectTriggers();

  const alreadyExists = triggers.some(function(trigger) {
    try {
      return (
        trigger.getHandlerFunction() === "ATUALIZAR_PAINEL_AO_EDITAR" &&
        trigger.getTriggerSourceId() === spreadsheet.getId()
      );
    } catch (error) {
      return false;
    }
  });

  if (!alreadyExists) {
    ScriptApp
      .newTrigger("ATUALIZAR_PAINEL_AO_EDITAR")
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();
  }
}

function runSelfTest_(spreadsheet, sheet) {
  const testId = "AUTOTESTE-" + Utilities.getUuid();
  const now = new Date();

  sheet.appendRow([
    testId,
    now,
    "comprar",
    "AUTOTESTE TEMPORÁRIO",
    "5500000000000",
    "autoteste-" + Date.now() + "@gerenciadorpro.local",
    "Brasil",
    "Teste automático",
    "WhatsApp",
    "Teste automático",
    "Validar gravação",
    "",
    "",
    "",
    "",
    "Esta linha será apagada automaticamente.",
    "sim",
    "autoteste",
    "",
    "",
    "",
    "Apps Script",
    now.toISOString(),
    "Google Apps Script",
    "Novo"
  ]);

  SpreadsheetApp.flush();

  const row = sheet.getLastRow();
  const writtenId = sheet.getRange(row, 1).getDisplayValue();

  if (writtenId !== testId) {
    throw new Error("O autoteste não conseguiu confirmar a gravação.");
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
}

function getPayload_(e) {
  if (e && e.parameter && Object.keys(e.parameter).length > 0) {
    return e.parameter;
  }

  const rawBody =
    e && e.postData && typeof e.postData.contents === "string"
      ? e.postData.contents.trim()
      : "";

  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    throw new Error("INVALID_PAYLOAD");
  }
}

function validatePayload_(payload) {
  const requiredFields = [
    "submission_id",
    "tipo_interesse",
    "nome",
    "whatsapp",
    "email",
    "pais",
    "consentimento"
  ];

  requiredFields.forEach(function(field) {
    if (!String(payload[field] || "").trim()) {
      throw new Error("INVALID_PAYLOAD");
    }
  });

  const email = normalizeEmail_(payload.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("INVALID_PAYLOAD");
  }

  const phone = normalizePhone_(payload.whatsapp);
  if (phone.length < 10) throw new Error("INVALID_PAYLOAD");

  const interest = String(payload.tipo_interesse || "").trim().toLowerCase();
  if (interest !== "comprar" && interest !== "revender") {
    throw new Error("INVALID_PAYLOAD");
  }

  if (interest === "revender" && !String(payload.canal_divulgacao || "").trim()) {
    throw new Error("INVALID_PAYLOAD");
  }
}

function findSubmissionId_(sheet, submissionId) {
  if (!submissionId || sheet.getLastRow() < 2) return false;

  const finder = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();

  return Boolean(finder);
}

function findDuplicateContact_(sheet, email, phone, interest) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const values = sheet.getRange(2, 3, lastRow - 1, 4).getDisplayValues();
  const normalizedInterest = String(interest || "").trim().toLowerCase();

  return values.some(function(row) {
    const rowInterest = String(row[0] || "").trim().toLowerCase();
    const rowPhone = normalizePhone_(row[2]);
    const rowEmail = normalizeEmail_(row[3]);

    return (
      rowInterest === normalizedInterest &&
      (rowEmail === email || rowPhone === phone)
    );
  });
}

function cleanText_(value) {
  let text = plainText_(value, CONFIG.MAX_TEXT_LENGTH);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function plainText_(value, maxLength) {
  let text = String(value || "").trim();
  const limit = Math.max(1, Number(maxLength || CONFIG.MAX_TEXT_LENGTH));
  if (text.length > limit) text = text.slice(0, limit);
  return text;
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
}

function publicErrorMessage_(error) {
  const code = getErrorMessage_(error);
  if (code === "MIRROR_AUTH_UNAVAILABLE") return "mirror_unavailable";
  if (code === "OFFICIAL_SPREADSHEET_UNAVAILABLE") return "mirror_unavailable";
  if (code === "OFFICIAL_SPREADSHEET_NOT_CONFIGURED") return "mirror_unavailable";
  if (code === "MIRROR_UNAUTHORIZED") return "mirror_unauthorized";
  return "mirror_rejected";
}

function getErrorMessage_(error) {
  if (error && error.message) return String(error.message);
  return String(error || "Erro desconhecido.");
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
