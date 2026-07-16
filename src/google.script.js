/* global SpreadsheetApp, ContentService, LockService, Session, Utilities, MailApp */

// Copy this entire file into the Google Apps Script project bound to the Sheet.

const SHEET_NAME = 'data';
const SETTINGS_SHEET_NAME = 'settings';
const REPORT_RECIPIENT = 'tehuanmelo@gmail.com';
const FORM_URL = 'https://example.com';

const MATERIAL_HEADERS = [
  'pistola',
  'faca',
  'rifle',
  'bastao',
  'capacete',
  'aparador-soco',
  'aparador-chute',
  'luva',
  'protetor-canela',
  'protetor-bucal',
  'coquilha',
  'saco-pancada',
  'dummy',
];

const HEADERS = [
  'timestamp',
  'professor',
  'base',
  'data',
  ...MATERIAL_HEADERS,
  'observacoes',
];

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'inventario-de-materiais',
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Corpo da requisicao ausente.');
    }

    const data = JSON.parse(e.postData.contents);
    const timestamp = parseTimestamp_(data.submittedAt);
    const professor = getProfessor_(data.coach);
    const base = requiredText_(data.base, 'Base');
    const materials = data.materials || {};
    const notes = safeText_(data.notes || '');

    lock.waitLock(10000);

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new Error(
        'Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.',
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
      'yyyy-MM-dd',
    );

    const materialValues = MATERIAL_HEADERS.map((materialId) =>
      quantity_(materials[materialId]),
    );

    if (materialValues.every((quantity) => quantity === 0) && !notes) {
      throw new Error(
        'Informe pelo menos um material ou preencha as observacoes.',
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

    return jsonResponse_({
      ok: true,
      row: sheet.getLastRow(),
      submittedAt: timestamp.toISOString(),
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
      'Nenhuma planilha ativa. Vincule o Apps Script a uma planilha do Google Sheets.',
    );
  }

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
    String(header || '').trim().toLowerCase(),
  );
  const dateColumnIndex = headers.indexOf('data');
  const baseColumnIndex = headers.indexOf('base');

  if (dateColumnIndex === -1 || baseColumnIndex === -1) {
    throw new Error('As colunas "data" e "base" sao obrigatorias na aba "data".');
  }

  const timeZone =
    spreadsheet.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  const submissions = dataValues.slice(1).map((row) => ({
    base: String(row[baseColumnIndex] || '').trim(),
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
    .map((row) => String(row[0] || '').trim())
    .filter(Boolean);
  const uniqueBases = new Map();

  settingsBases.forEach((base) => {
    const key = normalizeBase_(base);
    if (key && !uniqueBases.has(key)) uniqueBases.set(key, base);
  });

  const missingBases = Array.from(uniqueBases.entries())
    .filter(([key]) => !submittedBaseKeys.has(key))
    .map(([, base]) => base);
  const monthLabel = formatMonthLabel_(latestMonth);
  const subject = `Bases pendentes - ${monthLabel}`;
  const body = missingBases.length
    ? [
        'Bom dia, pessoal',
        '',
        'As bases abaixo ainda nao enviaram a lista do material disponivel para treino.',
        '',
        missingBases.join('\n'),
        '',
        'link para envio:',
        FORM_URL,
      ].join('\n')
    : [
        'Bom dia, pessoal',
        '',
        `Todas as bases enviaram a lista do material disponivel para treino em ${monthLabel}.`,
        '',
        'link para envio:',
        FORM_URL,
      ].join('\n');

  MailApp.sendEmail(REPORT_RECIPIENT, subject, body);

  return {
    latestMonth,
    missingBases,
    emailSentTo: REPORT_RECIPIENT,
  };
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
      .setFontWeight('bold')
      .setBackground('#22201f')
      .setFontColor('#ffffff');

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
  if (!coach || typeof coach !== 'object') {
    throw new Error('Professor ausente.');
  }

  const ps = requiredText_(coach.ps, 'Numero PS');
  const name = requiredText_(coach.name, 'Nome do professor');
  return safeText_(`${ps} ${name}`.trim().toUpperCase());
}

function parseTimestamp_(value) {
  const timestamp = value ? new Date(value) : new Date();

  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('Timestamp invalido.');
  }

  return timestamp;
}

function quantity_(value) {
  const quantity = Number(value || 0);

  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
    throw new Error('Quantidade de material invalida.');
  }

  return quantity;
}

function monthKey_(value, timeZone) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM');
  }

  const text = String(value || '').trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

  const brazilianMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilianMatch) return `${brazilianMatch[3]}-${brazilianMatch[2]}`;

  return '';
}

function formatMonthLabel_(monthKey) {
  const parts = monthKey.split('-');
  return `${parts[1]}/${parts[0]}`;
}

function normalizeBase_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function requiredText_(value, fieldName) {
  const text = String(value || '').trim();
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
