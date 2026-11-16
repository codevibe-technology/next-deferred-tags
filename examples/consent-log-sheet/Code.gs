/**
 * Consent log in a Google Sheet, for next-deferred-tags `sheetsConsentLog`.
 *
 * Setup (5 minutes):
 * 1. Create a Google Sheet. Extensions > Apps Script. Replace the code with this file.
 * 2. Project Settings > Script properties > Add: SECRET = a long random string.
 * 3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *    Copy the /exec URL.
 * 4. In your Next.js app (server only):
 *      CONSENT_SHEET_URL=<the /exec URL>
 *      CONSENT_SHEET_SECRET=<the same SECRET>
 *
 * "Anyone" can reach the URL, but every request must carry the SECRET, so only your
 * server can add or read rows. Rows are only ever appended, never changed.
 */

var SHEET_NAME = 'Consent log';
var HEADERS = ['Received at', 'Chosen at', 'Visitor id', 'Version', 'Analytics', 'Marketing', 'Action', 'Page'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorised_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('SECRET');
  return !!expected && secret === expected;
}

/** Add one consent choice. Body: { secret, record }. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!authorised_(body.secret)) return json_({ ok: false, error: 'unauthorised' });
    var r = body.record || {};
    if (typeof r.id !== 'string' || typeof r.analytics !== 'boolean' || typeof r.marketing !== 'boolean') {
      return json_({ ok: false, error: 'bad record' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      // Leading apostrophe keeps ids and pages as plain text (no formulas, no number formats).
      sheet_().appendRow([r.receivedAt, r.chosenAt, "'" + r.id, "'" + r.version, r.analytics, r.marketing, r.action, r.page ? "'" + r.page : '']);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Every choice of one visitor: ?secret=...&visitor=<id>. */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!authorised_(p.secret)) return json_({ ok: false, error: 'unauthorised' });
  if (!p.visitor) return json_({ ok: false, error: 'visitor missing' });
  var values = sheet_().getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var v = values[i];
    if (String(v[2]) !== p.visitor) continue;
    rows.push({
      receivedAt: new Date(v[0]).toISOString(),
      chosenAt: new Date(v[1]).toISOString(),
      visitorId: String(v[2]),
      version: String(v[3]),
      analytics: v[4] === true,
      marketing: v[5] === true,
      action: String(v[6]),
      page: v[7] ? String(v[7]) : undefined,
    });
  }
  rows.sort(function (a, b) { return a.chosenAt < b.chosenAt ? -1 : 1; });
  return json_({ ok: true, rows: rows });
}
