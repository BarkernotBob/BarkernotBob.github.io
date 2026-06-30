/**
 * Trashback 2025 — backend for the web app.
 *
 * Turns your Google Sheet into the "database" for the Trashback web app.
 *   - GET  : returns every game from the "Data Entry" tab (requires the
 *            passcode, so the whole web app is behind one password).
 *   - POST : adds a new game to "Data Entry" (also requires the passcode).
 *
 * The data never leaves your Google Drive. You own it.
 *
 * Layout of the "Data Entry" tab (each game is TWO rows — Open then Wall):
 *   A,B = the opposing pair (auto-filled for reports)
 *   C   = date
 *   D   = side (Open / Wall)
 *   E,F = the two players on that side
 *   G   = that side's score
 * The rows below the last game are pre-built blank slots (the Side label and
 * the A formula are already there); a new game fills the next blank slot.
 *
 * SETUP / RE-DEPLOY: see ../SETUP.md. After ANY edit here you must publish a
 * new version: Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy.
 * The web app URL stays the same.
 */

// ────────────────────────────────────────────────────────────────────────
// CONFIG
// ────────────────────────────────────────────────────────────────────────
var CONFIG = {
  // The long ID in the middle of the sheet's URL.
  SHEET_ID: '1jpKix662nMj59Xh7v7-j-goMNs3frUIBqALQzg1i6d4',

  // The tab that holds the games.
  SHEET_NAME: 'Data Entry',

  // The single passcode that protects the whole web app (viewing AND adding).
  PASSCODE: 'nflife',
};

// Column numbers (1-based) in the Data Entry tab.
var COL = { ENEMY1: 1, ENEMY2: 2, DATE: 3, SIDE: 4, P1: 5, P2: 6, SCORE: 7 };
var FIRST_DATA_ROW = 7; // header is on row 6
// ────────────────────────────────────────────────────────────────────────


/** Returns every game (requires the passcode). */
function doGet(e) {
  try {
    if (!authed_(e && e.parameter && e.parameter.pass)) {
      return json_({ ok: false, error: 'auth' });
    }
    return json_({ ok: true, games: readGames_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** Adds one new game (requires the passcode). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e2) { return json_({ ok: false, error: 'busy' }); }
  try {
    var body = JSON.parse(e.postData.contents);
    if (!authed_(body.passcode)) return json_({ ok: false, error: 'bad_passcode' });

    var open = normArr_(body.openTeam);
    var wall = normArr_(body.wallTeam);
    var os = Number(body.openScore);
    var ws = Number(body.wallScore);
    if (open.length !== 2 || wall.length !== 2) return json_({ ok: false, error: 'missing_team' });
    if (isNaN(os) || isNaN(ws)) return json_({ ok: false, error: 'bad_score' });

    writeGame_(open, os, wall, ws);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function authed_(pass) { return String(pass || '') === String(CONFIG.PASSCODE); }

function sheet_() {
  var s = SpreadsheetApp.openById(CONFIG.SHEET_ID).getSheetByName(CONFIG.SHEET_NAME);
  if (!s) throw new Error('Tab "' + CONFIG.SHEET_NAME + '" not found');
  return s;
}

/**
 * Reads the Data Entry tab and pairs Open/Wall rows into games.
 * Returns compact arrays to keep the payload small:
 *   [dateStr, openP1, openP2, openScore, wallP1, wallP2, wallScore]
 */
function readGames_() {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return [];

  // Only pull columns C..G (date, side, p1, p2, score) — much faster than the
  // whole 40-column sheet.
  var vals = sheet.getRange(FIRST_DATA_ROW, COL.DATE, last - FIRST_DATA_ROW + 1, 5).getValues();
  // index: 0=date, 1=side, 2=p1, 3=p2, 4=score

  var tz = Session.getScriptTimeZone();
  var games = [];
  var pend = null; // a pending "Open" side waiting for its "Wall" partner

  for (var i = 0; i < vals.length; i++) {
    var side = String(vals[i][1] || '').trim();
    var p1 = String(vals[i][2] || '').trim();
    var p2 = String(vals[i][3] || '').trim();
    if ((side !== 'Open' && side !== 'Wall') || !p1 || !p2) continue;

    var rec = { date: vals[i][0], p1: p1, p2: p2, score: toNum_(vals[i][4]), side: side };
    if (side === 'Open') {
      pend = rec;
    } else if (pend) { // Wall row closes the current game
      games.push([
        dateStr_(pend.date || rec.date, tz),
        pend.p1, pend.p2, pend.score,
        rec.p1, rec.p2, rec.score,
      ]);
      pend = null;
    }
  }
  return games;
}

/** Fills the next blank Open/Wall slot (or appends two rows if none are free). */
function writeGame_(open, os, wall, ws) {
  var sheet = sheet_();
  var last = sheet.getLastRow();
  var slot = -1;
  var appended = false;

  if (last >= FIRST_DATA_ROW) {
    // Scan D,E,F for the first "Open" row with an empty player cell whose next
    // row is a "Wall" row, also empty — i.e. the next unused game slot.
    var n = last - FIRST_DATA_ROW + 1;
    var grid = sheet.getRange(FIRST_DATA_ROW, COL.SIDE, n, 3).getValues(); // D,E,F
    for (var i = 0; i < grid.length - 1; i++) {
      var sideA = String(grid[i][0] || '').trim(), eA = String(grid[i][1] || '').trim();
      var sideB = String(grid[i + 1][0] || '').trim(), eB = String(grid[i + 1][1] || '').trim();
      if (sideA === 'Open' && !eA && sideB === 'Wall' && !eB) { slot = FIRST_DATA_ROW + i; break; }
    }
  }

  if (slot < 0) { // no free slot — append a fresh pair
    slot = Math.max(sheet.getLastRow() + 1, FIRST_DATA_ROW);
    sheet.getRange(slot, COL.SIDE).setValue('Open');
    sheet.getRange(slot + 1, COL.SIDE).setValue('Wall');
    appended = true;
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0); // date-only — strip the time so sheet stores no timestamp
  // Open row
  sheet.getRange(slot, COL.DATE).setValue(today).setNumberFormat('M/d/yyyy');
  sheet.getRange(slot, COL.P1, 1, 2).setValues([[open[0], open[1]]]);
  sheet.getRange(slot, COL.SCORE).setValue(os);
  sheet.getRange(slot, COL.ENEMY2).setValue(wall[1]); // B = opponent's 2nd player
  // Wall row
  sheet.getRange(slot + 1, COL.DATE).setValue(today).setNumberFormat('M/d/yyyy');
  sheet.getRange(slot + 1, COL.P1, 1, 2).setValues([[wall[0], wall[1]]]);
  sheet.getRange(slot + 1, COL.SCORE).setValue(ws);
  sheet.getRange(slot + 1, COL.ENEMY2).setValue(open[1]);

  // Column A is normally a formula (=E of the partner row). Pre-built slots
  // already have it; appended rows don't, so set it literally there.
  if (appended) {
    sheet.getRange(slot, COL.ENEMY1).setValue(wall[0]);
    sheet.getRange(slot + 1, COL.ENEMY1).setValue(open[0]);
  }
}

function normArr_(t) {
  if (Array.isArray(t)) {
    return t.map(function (x) { return String(x).trim(); }).filter(function (x) { return x.length > 0; });
  }
  return String(t || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
}

function toNum_(v) { var n = Number(v); return isNaN(n) ? null : n; }

function dateStr_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'M/d/yyyy');
  return String(v || '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
