/**
 * Café popup order sink.
 *
 * Setup:
 *   1. Open the Google Sheet that should receive orders.
 *   2. Extensions > Apps Script, paste this file in.
 *   3. Deploy > New deployment > Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Copy the /exec URL into SHEET_ENDPOINT in index.html and board.html.
 *
 * Re-deploy (Manage deployments > edit > new version) after any edit here,
 * otherwise the /exec URL keeps serving the old code.
 *
 * Everything is POSTed as text/plain so the browser treats it as a "simple"
 * request and skips the CORS preflight, which Apps Script cannot answer.
 * The action field picks the handler:
 *
 *   {}                                                  -> append an order
 *   { action: 'board' }                                 -> list every order
 *   { action: 'updateStatus', row, drinkStatus }        -> move a ticket
 */

var SHEET_NAME = 'Café Orders';
var HEADERS = [
  'Timestamp',
  'First name',
  'Last name',
  'Company',
  'Email',
  'Drink',
  'Drink Status',
  'Email Status'
];

// Drink Status moves in progress -> ready -> picked up.
var DRINK_IN_PROGRESS = 'in progress';
var DRINK_READY = 'ready';
var DRINK_PICKED_UP = 'picked up';
var DRINK_STATUSES = [DRINK_IN_PROGRESS, DRINK_READY, DRINK_PICKED_UP];

// Email Status is owned by the email agent: pending -> sent / failed.
var DEFAULT_EMAIL_STATUS = 'pending';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    switch (data.action) {
      case 'board':
        return json_({ result: 'success', orders: getBoardOrders_() });
      case 'updateStatus':
        return json_(updateDrinkStatus_(data));
      default:
        return json_(appendOrder_(data));
    }
  } catch (err) {
    return json_({ result: 'error', message: String(err) });
  }
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === 'board') {
    return json_({ result: 'success', orders: getBoardOrders_() });
  }

  return json_({ result: 'ok', message: 'Café orders endpoint is live.' });
}

function appendOrder_(data) {
  var sheet = getSheet_();

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.firstName || '',
    data.lastName || '',
    data.company || '',
    data.email || '',
    data.drink || '',
    data.drinkStatus || DRINK_IN_PROGRESS,
    data.emailStatus || DEFAULT_EMAIL_STATUS
  ]);

  return { result: 'success', row: sheet.getLastRow() };
}

function updateDrinkStatus_(data) {
  var status = String(data.drinkStatus || '').toLowerCase();

  if (DRINK_STATUSES.indexOf(status) === -1) {
    return { result: 'error', message: 'Unknown drink status: ' + data.drinkStatus };
  }

  var sheet = getSheet_();
  var row = resolveRow_(sheet, data);

  if (!row) {
    return { result: 'error', message: 'Could not find that order.' };
  }

  var idx = indexMap_(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  sheet.getRange(row, idx.drinkStatus + 1).setValue(status);

  return { result: 'success', row: row, drinkStatus: status };
}

/**
 * Rows are only ever appended, so the row number is a stable handle. The
 * timestamp is still verified when the caller sends one, so a manually
 * deleted row can never cause a write to land on somebody else's order.
 */
function resolveRow_(sheet, data) {
  var values = sheet.getDataRange().getValues();
  var idx = indexMap_(values[0]);
  var row = Number(data.row);
  var stamp = data.timestamp ? String(data.timestamp) : '';

  if (row >= 2 && row <= values.length) {
    if (!stamp || asText_(values[row - 1][idx.timestamp]) === stamp) return row;
  }

  if (!stamp) return 0;

  for (var i = 1; i < values.length; i++) {
    if (asText_(values[i][idx.timestamp]) === stamp) return i + 1;
  }

  return 0;
}

function getBoardOrders_() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();

  if (values.length < 2) return [];

  var idx = indexMap_(values[0]);
  var orders = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (!row[idx.timestamp] && !row[idx.firstName] && !row[idx.drink]) continue;

    orders.push({
      row: i + 1,
      timestamp: asText_(row[idx.timestamp]),
      firstName: row[idx.firstName] || '',
      lastName: row[idx.lastName] || '',
      company: row[idx.company] || '',
      email: row[idx.email] || '',
      drink: row[idx.drink] || '',
      drinkStatus: String(row[idx.drinkStatus] || DRINK_IN_PROGRESS).toLowerCase(),
      emailStatus: String(row[idx.emailStatus] || DEFAULT_EMAIL_STATUS).toLowerCase()
    });
  }

  return orders;
}

/** Sheets may hand back a Date for the timestamp cell; normalise to ISO text. */
function asText_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}

function indexMap_(headers) {
  function col(name, fallback) {
    var i = headers.indexOf(name);
    return i === -1 ? fallback : i;
  }

  return {
    timestamp: col('Timestamp', 0),
    firstName: col('First name', 1),
    lastName: col('Last name', 2),
    company: col('Company', 3),
    email: col('Email', 4),
    drink: col('Drink', 5),
    drinkStatus: col('Drink Status', 6),
    emailStatus: col('Email Status', 7)
  };
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }

  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
  var existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Sheets that predate the Email column would otherwise have drink/status
  // cells slide under the new header when HEADERS is rewritten in place.
  if (existing.indexOf('Email') === -1) {
    var emailAt = HEADERS.indexOf('Email');
    if (emailAt !== -1) {
      sheet.insertColumnBefore(emailAt + 1);
      lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
      existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    }
  }

  var changed = false;

  for (var i = 0; i < HEADERS.length; i++) {
    if (existing[i] !== HEADERS[i]) {
      sheet.getRange(1, i + 1).setValue(HEADERS[i]);
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
