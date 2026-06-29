/**
 * Trashback 2025 — backend for the web app.
 *
 * This little script turns your Google Sheet into the "database" for the
 * Trashback web app. It does two things:
 *   - GET  : hands the web app every game in the FInput tab (so anyone with
 *            the link can VIEW the stats).
 *   - POST : adds a new game to the FInput tab, but ONLY if the person typed
 *            the correct group passcode (so randoms can't mess up your data).
 *
 * The data never leaves your Google Drive. You own it.
 *
 * SETUP: see ../SETUP.md for click-by-click instructions. The short version:
 *   1. Fill in CONFIG below (sheet ID + a passcode you choose).
 *   2. Deploy  ▸  New deployment  ▸  Web app
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   3. Copy the Web app URL it gives you and paste it into the web app
 *      (the APPS_SCRIPT_URL line near the top of Trashback.html).
 */

// ────────────────────────────────────────────────────────────────────────
// CONFIG — edit these three values.
// ────────────────────────────────────────────────────────────────────────
var CONFIG = {
  // The long ID in the middle of your sheet's URL:
  // https://docs.google.com/spreadsheets/d/THIS_PART/edit
  SHEET_ID: '1jpKix662nMj59Xh7v7-j-goMNs3frUIBqALQzg1i6d4',

  // The tab that holds the raw games. Leave as 'FInput' unless you renamed it.
  SHEET_NAME: 'FInput',

  // The group passcode everyone must type to ADD a game. Viewing never needs it.
  // CHANGE THIS to something only your group knows.
  PASSCODE: 'changeme',
};
// ────────────────────────────────────────────────────────────────────────


/** Returns every game as JSON so the web app can show the stats. */
function doGet(e) {
  try {
    var games = readGames_();
    return json_({ ok: true, games: games });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Adds one new game to the sheet, after checking the passcode. */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (String(body.passcode || '') !== String(CONFIG.PASSCODE)) {
      return json_({ ok: false, error: 'bad_passcode' });
    }

    var openTeam = normTeam_(body.openTeam);
    var wallTeam = normTeam_(body.wallTeam);
    var openScore = Number(body.openScore);
    var wallScore = Number(body.wallScore);

    if (!openTeam || !wallTeam) {
      return json_({ ok: false, error: 'missing_team' });
    }
    if (isNaN(openScore) || isNaN(wallScore)) {
      return json_({ ok: false, error: 'bad_score' });
    }

    var ts = body.timestamp ? String(body.timestamp) : formatNow_();

    var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
    sheet.appendRow([ts, openTeam, openScore, wallTeam, wallScore]);

    return json_({ ok: true, timestamp: ts });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

/** Reads the FInput tab and returns an array of game objects. */
function readGames_() {
  var sheet = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('Tab "' + CONFIG.SHEET_NAME + '" not found');

  var values = sheet.getDataRange().getValues();
  var games = [];
  for (var i = 1; i < values.length; i++) { // row 0 is the header
    var r = values[i];
    var openTeam = String(r[1] || '').trim();
    var wallTeam = String(r[3] || '').trim();
    if (!openTeam && !wallTeam) continue; // skip blank rows

    games.push({
      timestamp: stringifyCell_(r[0]),
      openTeam: splitTeam_(openTeam),
      openScore: toNum_(r[2]),
      wallTeam: splitTeam_(wallTeam),
      wallScore: toNum_(r[4]),
    });
  }
  return games;
}

/** "Ben, Daniel" -> ["Ben","Daniel"] */
function splitTeam_(s) {
  return String(s)
    .split(',')
    .map(function (x) { return x.trim(); })
    .filter(function (x) { return x.length > 0; });
}

/** ["Ben","Daniel"] (or "Ben, Daniel") -> "Ben, Daniel" */
function normTeam_(t) {
  if (Array.isArray(t)) {
    return t.map(function (x) { return String(x).trim(); })
            .filter(function (x) { return x.length > 0; })
            .join(', ');
  }
  return String(t || '').trim();
}

function toNum_(v) {
  var n = Number(v);
  return isNaN(n) ? null : n;
}

/** Dates come back as Date objects from Sheets; make them a stable string. */
function stringifyCell_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'M/d/yyyy H:mm:ss');
  }
  return String(v);
}

function formatNow_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy H:mm:ss');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
