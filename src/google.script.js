/* global SpreadsheetApp, ContentService, LockService, Session, Utilities, MailApp, HtmlService */

// Copy this entire file into the Google Apps Script project bound to the Sheet.

const SHEET_NAME = "data";
const SETTINGS_SHEET_NAME = "settings";
const MISSING_BASES_SHEET_NAME = "missing-bases";
const REPORT_RECIPIENT = "tehuanmelo@gmail.com";
const FORM_URL = "https://example.com";

const MATERIAL_HEADERS = [
  "pistola",
  "faca",
  "rifle",
  "bastao",
  "capacete",
  "aparador-soco",
  "aparador-chute",
  "luva",
  "protetor-canela",
  "protetor-bucal",
  "coquilha",
  "saco-pancada",
  "dummy",
];

const MATERIAL_DETAILS = {
  pistola: { label: "Pistol", group: "Close Combat" },
  faca: { label: "Knife", group: "Close Combat" },
  rifle: { label: "Rifle", group: "Close Combat" },
  bastao: { label: "Baton", group: "Close Combat" },
  capacete: { label: "Helmet", group: "Strike" },
  "aparador-soco": { label: "Punch pad", group: "Strike" },
  "aparador-chute": { label: "Kick pad", group: "Strike" },
  luva: { label: "Gloves", group: "Strike" },
  "protetor-canela": { label: "Shin guards", group: "Strike" },
  "protetor-bucal": { label: "Mouth guards", group: "Strike" },
  coquilha: { label: "Groin guards", group: "Strike" },
  "saco-pancada": { label: "Punching bag", group: "Strike" },
  dummy: { label: "Dummy", group: "Jiu-jitsu" },
};

const HEADERS = [
  "timestamp",
  "professor",
  "base",
  "data",
  ...MATERIAL_HEADERS,
  "observacoes",
];

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "inventario-de-materiais",
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Corpo da requisicao ausente.");
    }

    const data = JSON.parse(e.postData.contents);
    const timestamp = parseTimestamp_(data.submittedAt);
    const professor = getProfessor_(data.coach);
    const base = requiredText_(data.base, "Base");
    const materials = data.materials || {};
    const notes = safeText_(data.notes || "");

    lock.waitLock(10000);

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error(
        "Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.",
      );
    }

    const sheet =
      spreadsheet.getSheetByName(SHEET_NAME) ||
      spreadsheet.insertSheet(SHEET_NAME);

    ensureHeaders_(sheet);

    const spreadsheetTimeZone =
      spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
    const submissionDate = Utilities.formatDate(
      timestamp,
      spreadsheetTimeZone,
      "yyyy-MM-dd",
    );

    const materialValues = MATERIAL_HEADERS.map((materialId) =>
      quantity_(materials[materialId]),
    );

    if (materialValues.every((quantity) => quantity === 0) && !notes) {
      throw new Error(
        "Informe pelo menos um material ou preencha as observacoes.",
      );
    }

    sheet.appendRow([
      timestamp,
      professor,
      base,
      submissionDate,
      ...materialValues,
      notes,
    ]);

    let missingBasesResult = null;
    let missingBasesWarning = "";

    try {
      missingBasesResult = updateMissingBasesSheet_(spreadsheet);
    } catch (updateError) {
      missingBasesWarning =
        updateError instanceof Error
          ? updateError.message
          : String(updateError);
      console.error(
        `Submission saved, but the missing-bases sheet could not be updated: ${missingBasesWarning}`,
      );
    }

    return jsonResponse_({
      ok: true,
      row: sheet.getLastRow(),
      submittedAt: timestamp.toISOString(),
      missingBasesUpdated: Boolean(missingBasesResult),
      missingBasesCount: missingBasesResult
        ? missingBasesResult.missingBases.length
        : null,
      warning: missingBasesWarning || undefined,
    });
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));

    return jsonResponse_({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/**
 * Emails a report containing every base that has not submitted in the latest
 * month found in the "data" column of the data sheet.
 *
 * Run this function manually or attach it to a time-driven Apps Script trigger.
 */
function sendMissingBasesEmail() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      "Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.",
    );
  }

  const result = getMissingBasesForLatestMonth_(spreadsheet);
  const latestMonth = result.latestMonth;
  const missingBases = result.missingBases;
  const monthLabel = formatMonthLabel_(latestMonth);
  const subject = `Bases pendentes - ${monthLabel}`;
  const body = missingBases.length
    ? [
        "Bom dia, pessoal",
        "",
        "As bases abaixo ainda nao enviaram a lista do material disponivel para treino.",
        "",
        missingBases.join("\n"),
        "",
        "link para envio:",
        FORM_URL,
      ].join("\n")
    : [
        "Bom dia, pessoal",
        "",
        `Todas as bases enviaram a lista do material disponivel para treino em ${monthLabel}.`,
        "",
        "link para envio:",
        FORM_URL,
      ].join("\n");

  MailApp.sendEmail(REPORT_RECIPIENT, subject, body);

  return {
    latestMonth,
    missingBases,
    emailSentTo: REPORT_RECIPIENT,
  };
}

/**
 * Rebuilds column A of the "missing-bases" sheet using the latest month found
 * in the data sheet. This can also be run manually to repair or refresh the
 * list at any time.
 */
function updateMissingBasesSheet() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error(
        "Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.",
      );
    }

    return updateMissingBasesSheet_(spreadsheet);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function updateMissingBasesSheet_(spreadsheet) {
  const result = getMissingBasesForLatestMonth_(spreadsheet);
  const missingSheet =
    spreadsheet.getSheetByName(MISSING_BASES_SHEET_NAME) ||
    spreadsheet.insertSheet(MISSING_BASES_SHEET_NAME);
  const requiredRows = result.missingBases.length + 1;

  if (missingSheet.getMaxRows() < requiredRows) {
    missingSheet.insertRowsAfter(
      missingSheet.getMaxRows(),
      requiredRows - missingSheet.getMaxRows(),
    );
  }

  const headerCell = missingSheet.getRange(1, 1);
  headerCell
    .setValue("base")
    .setNote(`Latest reporting month: ${result.latestMonth}`)
    .setFontWeight("bold")
    .setBackground("#22201f")
    .setFontColor("#ffffff");

  if (missingSheet.getMaxRows() > 1) {
    missingSheet
      .getRange(2, 1, missingSheet.getMaxRows() - 1, 1)
      .clearContent();
  }

  if (result.missingBases.length > 0) {
    missingSheet
      .getRange(2, 1, result.missingBases.length, 1)
      .setValues(result.missingBases.map((base) => [base]));
  }

  missingSheet.setFrozenRows(1);
  missingSheet.autoResizeColumn(1);

  return result;
}

function getMissingBasesForLatestMonth_(spreadsheet) {
  const dataSheet = spreadsheet.getSheetByName(SHEET_NAME);
  const settingsSheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);

  if (!dataSheet || dataSheet.getLastRow() < 2) {
    throw new Error('A aba "data" ainda nao possui submissoes.');
  }

  if (!settingsSheet || settingsSheet.getLastRow() < 2) {
    throw new Error('A aba "settings" nao possui bases a partir da celula A2.');
  }

  const dataValues = dataSheet.getDataRange().getValues();
  const headers = dataValues[0].map((header) =>
    String(header || "")
      .trim()
      .toLowerCase(),
  );
  const dateColumnIndex = headers.indexOf("data");
  const baseColumnIndex = headers.indexOf("base");

  if (dateColumnIndex === -1 || baseColumnIndex === -1) {
    throw new Error(
      'As colunas "data" e "base" sao obrigatorias na aba "data".',
    );
  }

  const timeZone =
    spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const submissions = dataValues.slice(1).map((row) => ({
    base: String(row[baseColumnIndex] || "").trim(),
    month: monthKey_(row[dateColumnIndex], timeZone),
  }));
  const validMonths = submissions
    .map((submission) => submission.month)
    .filter(Boolean)
    .sort();

  if (validMonths.length === 0) {
    throw new Error('Nenhuma data valida foi encontrada na coluna "data".');
  }

  const latestMonth = validMonths[validMonths.length - 1];
  const submittedBaseKeys = new Set(
    submissions
      .filter((submission) => submission.month === latestMonth)
      .map((submission) => normalizeBase_(submission.base))
      .filter(Boolean),
  );
  const settingsBases = settingsSheet
    .getRange(2, 1, settingsSheet.getLastRow() - 1, 1)
    .getDisplayValues()
    .map((row) => String(row[0] || "").trim())
    .filter(Boolean);
  const uniqueBases = new Map();

  settingsBases.forEach((base) => {
    const key = normalizeBase_(base);
    if (key && !uniqueBases.has(key)) uniqueBases.set(key, base);
  });

  return {
    latestMonth,
    missingBases: Array.from(uniqueBases.entries())
      .filter(([key]) => !submittedBaseKeys.has(key))
      .map(([, base]) => base),
  };
}

/**
 * Generates a branded PDF report for the latest month in the "data" column
 * and emails it to REPORT_RECIPIENT.
 *
 * If a base submitted more than once in the month, only its latest submission
 * is included so corrected inventory reports are not counted twice.
 */
function sendMaterialReportPdfEmail() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error(
      "Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.",
    );
  }

  const dataSheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!dataSheet || dataSheet.getLastRow() < 2) {
    throw new Error('A aba "data" ainda nao possui submissoes.');
  }

  const values = dataSheet.getDataRange().getValues();
  const headers = values[0].map((header) =>
    String(header || "")
      .trim()
      .toLowerCase(),
  );
  const requiredHeaders = ["timestamp", "professor", "base", "data"];
  requiredHeaders.forEach((header) => {
    if (headers.indexOf(header) === -1) {
      throw new Error(`A coluna "${header}" e obrigatoria na aba "data".`);
    }
  });

  const timestampColumn = headers.indexOf("timestamp");
  const professorColumn = headers.indexOf("professor");
  const baseColumn = headers.indexOf("base");
  const dateColumn = headers.indexOf("data");
  const timeZone =
    spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const monthKeys = values
    .slice(1)
    .map((row) => monthKey_(row[dateColumn], timeZone))
    .filter(Boolean)
    .sort();

  if (monthKeys.length === 0) {
    throw new Error('Nenhuma data valida foi encontrada na coluna "data".');
  }

  const latestMonth = monthKeys[monthKeys.length - 1];
  const latestSubmissionByBase = new Map();

  values.slice(1).forEach((row, rowIndex) => {
    if (monthKey_(row[dateColumn], timeZone) !== latestMonth) return;

    const base = String(row[baseColumn] || "").trim();
    const baseKey = normalizeBase_(base);
    if (!baseKey) return;

    const timestamp = dateValue_(row[timestampColumn]);
    const materialItems = MATERIAL_HEADERS.map((materialId) => {
      const columnIndex = headers.indexOf(materialId);
      const quantity = columnIndex === -1 ? 0 : Number(row[columnIndex] || 0);
      const details = MATERIAL_DETAILS[materialId];

      return {
        id: materialId,
        label: details.label,
        group: details.group,
        quantity: Number.isFinite(quantity) ? quantity : 0,
      };
    }).filter((material) => material.quantity > 0);
    const submission = {
      base,
      baseKey,
      professor: String(row[professorColumn] || "").trim(),
      timestamp,
      rowIndex,
      materials: materialItems,
      total: materialItems.reduce(
        (sum, material) => sum + material.quantity,
        0,
      ),
    };
    const current = latestSubmissionByBase.get(baseKey);

    if (
      !current ||
      timestamp.getTime() > current.timestamp.getTime() ||
      (timestamp.getTime() === current.timestamp.getTime() &&
        rowIndex > current.rowIndex)
    ) {
      latestSubmissionByBase.set(baseKey, submission);
    }
  });

  const submissions = Array.from(latestSubmissionByBase.values()).sort(
    (first, second) => first.base.localeCompare(second.base),
  );

  if (submissions.length === 0) {
    throw new Error(`Nenhuma submissao foi encontrada para ${latestMonth}.`);
  }

  const totalMaterials = submissions.reduce(
    (sum, submission) => sum + submission.total,
    0,
  );
  const basesWithMaterial = submissions.filter(
    (submission) => submission.total > 0,
  ).length;
  const basesWithoutMaterial = submissions.length - basesWithMaterial;
  const monthLabel = formatMonthLabel_(latestMonth);
  const generatedAt = Utilities.formatDate(
    new Date(),
    timeZone,
    "dd/MM/yyyy HH:mm",
  );
  const report = {
    latestMonth,
    monthLabel,
    generatedAt,
    timeZone,
    submissions,
    totalMaterials,
    basesWithMaterial,
    basesWithoutMaterial,
  };
  const html = buildMaterialReportHtml_(report);
  const pdf = HtmlService.createHtmlOutput(html)
    .getAs("application/pdf")
    .setName(`material-report-${latestMonth}.pdf`);
  const subject = `Material report by base - ${monthLabel}`;
  const plainBody = [
    "Good morning, everyone",
    "",
    `Please find attached the material report by base for ${monthLabel}.`,
    "",
    `Total bases: ${submissions.length}`,
    `Bases with material: ${basesWithMaterial}`,
    `Bases with no material: ${basesWithoutMaterial}`,
  ].join("\n");
  const emailHtml = [
    '<div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">',
    '<h2 style="margin:0 0 12px;color:#22201f">Material report by base</h2>',
    `<p>Please find attached the report for <strong>${escapeHtml_(monthLabel)}</strong>.</p>`,
    '<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:18px 0">',
    `<tr><td style="background:#f4f4f3">Total bases</td><td style="font-weight:bold">${submissions.length}</td></tr>`,
    `<tr><td style="background:#f4f4f3">Bases with material</td><td style="font-weight:bold">${basesWithMaterial}</td></tr>`,
    `<tr><td style="background:#f4f4f3">Bases with no material</td><td style="font-weight:bold">${basesWithoutMaterial}</td></tr>`,
    "</table>",
    '<p style="color:#6e7178;font-size:12px">National Guard - Available training material control</p>',
    "</div>",
  ].join("");

  MailApp.sendEmail(REPORT_RECIPIENT, subject, plainBody, {
    attachments: [pdf],
    htmlBody: emailHtml,
    name: "National Guard",
  });

  return {
    latestMonth,
    submittedBases: submissions.length,
    totalMaterials,
    basesWithMaterial,
    basesWithoutMaterial,
    pdfName: pdf.getName(),
    emailSentTo: REPORT_RECIPIENT,
  };
}

function buildMaterialReportHtml_(report) {
  const baseSections = report.submissions
    .map((submission, index) => {
      const materialRows = submission.materials.length
        ? submission.materials
            .map(
              (material) => `
                <tr>
                  <td><span class="group-tag">${escapeHtml_(material.group)}</span></td>
                  <td>${escapeHtml_(material.label)}</td>
                  <td class="quantity">${material.quantity}</td>
                </tr>`,
            )
            .join("")
        : '<tr><td colspan="3" class="empty">This base has no material.</td></tr>';
      const submittedAt = Utilities.formatDate(
        submission.timestamp,
        report.timeZone,
        "dd/MM/yyyy HH:mm",
      );

      return `
        <section class="base-card">
          <table class="base-header">
            <tr>
              <td class="base-number">${String(index + 1).padStart(2, "0")}</td>
              <td>
                <span class="label">Base</span>
                <h2>${escapeHtml_(submission.base)}</h2>
                <p>${escapeHtml_(submission.professor || "Coach not provided")}</p>
              </td>
              <td class="base-meta">
                <strong>${submission.total}</strong>
                <span>units</span>
                <small>${escapeHtml_(submittedAt)}</small>
              </td>
            </tr>
          </table>
          <table class="materials-table">
            <thead><tr><th>Group</th><th>Material</th><th class="quantity">Qty.</th></tr></thead>
            <tbody>${materialRows}</tbody>
          </table>
        </section>`;
    })
    .join("");
  return `<!doctype html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 13mm; }
        * { box-sizing: border-box; }
        body { margin: 0; color: #181a1f; background: #f4f4f3; font-family: Arial, sans-serif; font-size: 11px; line-height: 1.4; }
        .top-line { height: 5px; background: #22201f; }
        .report-header { padding: 22px 26px; background: #fff; border-bottom: 1px solid #d9dadd; }
        .report-header table { width: 100%; border-collapse: collapse; }
        .brand { vertical-align: middle; }
        .eyebrow, .label { display: block; color: #897313; font-size: 8px; font-weight: bold; letter-spacing: 1.4px; text-transform: uppercase; }
        .brand h1 { margin: 3px 0 2px; font-size: 23px; letter-spacing: -0.7px; }
        .brand p { margin: 0; color: #6e7178; }
        .period { width: 120px; text-align: right; vertical-align: middle; }
        .period strong { display: block; font-size: 18px; }
        .period span { color: #6e7178; font-size: 9px; text-transform: uppercase; }
        .content { padding: 22px 26px 30px; }
        .intro h2 { margin: 4px 0 5px; font-size: 19px; }
        .intro p { margin: 0; color: #6e7178; }
        .summary { width: 100%; margin: 18px 0 22px; border-collapse: separate; border-spacing: 8px 0; table-layout: fixed; }
        .summary td { padding: 13px 15px; background: #fff; border: 1px solid #dedfe2; border-radius: 7px; }
        .summary strong { display: block; font-size: 20px; }
        .summary span { color: #6e7178; font-size: 9px; text-transform: uppercase; }
        .base-card { margin: 0 0 14px; padding: 0; background: #fff; border: 1px solid #dedfe2; border-radius: 8px; page-break-inside: avoid; }
        .base-header { width: 100%; border-collapse: collapse; border-bottom: 1px solid #ebecef; }
        .base-header td { padding: 13px 15px; vertical-align: middle; }
        .base-number { width: 42px; color: #9b9da2; font-size: 10px; font-weight: bold; text-align: center; }
        .base-header h2 { margin: 2px 0; font-size: 14px; }
        .base-header p { margin: 0; color: #6e7178; font-size: 9px; }
        .base-meta { width: 105px; text-align: right; }
        .base-meta strong { display: block; font-size: 18px; }
        .base-meta span { display: block; color: #6e7178; font-size: 8px; text-transform: uppercase; }
        .base-meta small { display: block; margin-top: 4px; color: #8b8d92; font-size: 8px; }
        .materials-table { width: calc(100% - 30px); margin: 10px 15px 13px; border-collapse: collapse; }
        .materials-table th { padding: 6px 8px; color: #6e7178; background: #f8f8f7; border-bottom: 1px solid #dedfe2; font-size: 8px; letter-spacing: 0.6px; text-align: left; text-transform: uppercase; }
        .materials-table td { padding: 7px 8px; border-bottom: 1px solid #eeeeef; }
        .materials-table tr:last-child td { border-bottom: 0; }
        .materials-table .quantity { width: 55px; font-weight: bold; text-align: right; }
        .group-tag { display: inline-block; padding: 3px 6px; color: #66530c; background: #f5f0d8; border-radius: 10px; font-size: 7px; font-weight: bold; text-transform: uppercase; }
        .empty { color: #777; font-style: italic; text-align: center; }
        .report-footer { padding: 12px 26px; color: #7a7c81; background: #fff; border-top: 1px solid #dedfe2; font-size: 8px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="top-line"></div>
      <header class="report-header">
        <table><tr>
          <td class="brand">
            <span class="eyebrow">National Guard</span>
            <h1>Material inventory</h1>
            <p>Consolidated report of available training material by base</p>
          </td>
          <td class="period"><strong>${escapeHtml_(report.monthLabel)}</strong><span>Reporting month</span></td>
        </tr></table>
      </header>
      <main class="content">
        <section class="intro">
          <span class="eyebrow">Overview</span>
          <h2>Material reported by each base</h2>
        </section>
        <table class="summary"><tr>
          <td><strong>${report.submissions.length}</strong><span>Total bases</span></td>
          <td><strong>${report.basesWithMaterial}</strong><span>Bases with material</span></td>
          <td><strong>${report.basesWithoutMaterial}</strong><span>Bases with no material</span></td>
        </tr></table>
        ${baseSections}
      </main>
      <footer class="report-footer">Generated on ${escapeHtml_(report.generatedAt)} - National Guard</footer>
    </body>
  </html>`;
}

function ensureHeaders_(sheet) {
  const currentHeaders = sheet
    .getRange(1, 1, 1, HEADERS.length)
    .getDisplayValues()[0];
  const isEmpty = currentHeaders.every((header) => !header);

  if (isEmpty) {
    const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
    headerRange
      .setValues([HEADERS])
      .setFontWeight("bold")
      .setBackground("#22201f")
      .setFontColor("#ffffff");

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, HEADERS.length);
    return;
  }

  const headersMatch = HEADERS.every(
    (header, index) => currentHeaders[index] === header,
  );

  if (!headersMatch) {
    throw new Error(
      'O cabecalho da aba "data" nao corresponde ao formato esperado.',
    );
  }
}

function getProfessor_(coach) {
  if (!coach || typeof coach !== "object") {
    throw new Error("Professor ausente.");
  }

  const ps = requiredText_(coach.ps, "Numero PS");
  const name = requiredText_(coach.name, "Nome do professor");
  return safeText_(`${ps} ${name}`.trim().toUpperCase());
}

function parseTimestamp_(value) {
  const timestamp = value ? new Date(value) : new Date();

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error("Timestamp invalido.");
  }

  return timestamp;
}

function quantity_(value) {
  const quantity = Number(value || 0);

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
    throw new Error("Quantidade de material invalida.");
  }

  return quantity;
}

function monthKey_(value, timeZone) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone, "yyyy-MM");
  }

  const text = String(value || "").trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const brazilianMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilianMatch) return `${brazilianMatch[3]}-${brazilianMatch[2]}`;

  return "";
}

function dateValue_(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function formatMonthLabel_(monthKey) {
  const parts = monthKey.split("-");
  return `${parts[1]}/${parts[0]}`;
}

function normalizeBase_(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requiredText_(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${fieldName} ausente.`);
  return safeText_(text);
}

function safeText_(value) {
  const text = String(value).trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
