/**
 * Client onboarding questionnaires — backend.
 *
 * Receives a questionnaire submission from the GitHub Pages front end, and:
 *   1. appends a row to the matching tab of the answers spreadsheet
 *   2. saves any uploaded files into the matching Drive folder
 *   3. emails a Hebrew summary to NOTIFY_EMAIL
 *
 * Deploy: Deploy > New deployment > Web app
 *         Execute as:      Me (meir@ai-lab.co.il)
 *         Who has access:  Anyone
 * Then copy the /exec URL into CONFIG.APPS_SCRIPT_URL in shared.js.
 *
 * IMPORTANT: after ANY edit here you must deploy a NEW VERSION, otherwise the
 * live URL keeps serving the old code. Deploy > Manage deployments > (pencil) >
 * Version: New version > Deploy.
 */

/* ============================  FILL THESE IN  ============================= */

const FOLDER_IDS = {
  app_spec: 'PASTE_APP_SPEC_FOLDER_ID',
  video_samsung: 'PASTE_SAMSUNG_FOLDER_ID',
  video_haier: 'PASTE_HAIER_FOLDER_ID',
};

const SHEET_ID = 'PASTE_SHEET_ID';

const NOTIFY_EMAIL = 'meir@ai-lab.co.il';

/* ============================  constants  ================================= */

const FORM_NAMES_HE = {
  app_spec: 'אפיון אפליקציית גבייה',
  video_samsung: 'סרטוני הדרכה — סמסונג',
  video_haier: 'סרטוני הדרכה — האייר',
};

/** Both video departments share one tab; the department is a column. */
const TAB_NAMES = {
  app_spec: 'אפיון אפליקציה',
  video_samsung: 'סרטוני הדרכה',
  video_haier: 'סרטוני הדרכה',
};

/**
 * Fixed columns, always first. Question columns are appended after these and
 * discovered as they appear, so adding a question to the form never breaks
 * rows that were written before it existed.
 */
const FIXED_HEADERS = [
  'חותמת זמן',
  'שאלון',
  'ממלא השאלון',
  'תפקיד',
  'ליצירת קשר',
  'קבצים שהועלו',
  'JSON מלא',
];

/* ============================  entry points  ============================== */

/** Lets Meir confirm the deployment is alive by opening the /exec URL. */
function doGet() {
  return json({
    ok: true,
    service: 'שאלוני לקוח — AI Lab',
    hint: 'השירות פעיל. שליחת שאלון מתבצעת ב-POST.',
  });
}

function doPost(e) {
  try {
    // The front end sends text/plain on purpose (no CORS preflight), so the
    // body arrives as a raw string and we parse it ourselves.
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'לא התקבל תוכן בבקשה' });
    }

    const payload = JSON.parse(e.postData.contents);
    const form = String(payload.form || '');

    if (!FOLDER_IDS[form]) {
      return json({ ok: false, error: 'סוג שאלון לא מזוהה: ' + form });
    }

    const meta = payload.meta || {};
    const answers = Array.isArray(payload.answers) ? payload.answers : [];
    const files = Array.isArray(payload.files) ? payload.files : [];

    const saved = saveFiles(form, files, meta);
    appendRow(form, answers, meta, saved, payload);
    sendEmail(form, answers, meta, saved);

    return json({ ok: true, files: saved.length });
  } catch (err) {
    // Always answer with JSON — the front end shows the message in Hebrew and
    // keeps the user's answers (they are autosaved) so nothing is lost.
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ============================  Drive  ===================================== */

/** Strips characters Drive dislikes, and keeps names a sane length. */
function safeName(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]/g, '-').slice(0, 120);
}

/**
 * Saves the files of one submission.
 *
 * Files go into a per-submission subfolder named "<date> — <contact>". A flat
 * folder becomes unusable after a handful of submissions, and grouping by
 * submission is what makes "which files came with which answers" answerable.
 */
function saveFiles(form, files, meta) {
  if (!files.length) return [];

  const parent = DriveApp.getFolderById(FOLDER_IDS[form]);
  const stamp = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm');
  const who = safeName(meta.clientContact || meta.filledBy || 'ללא שם');
  const folder = parent.createFolder(stamp + ' — ' + who);

  const saved = [];
  files.forEach(function (f, i) {
    try {
      const bytes = Utilities.base64Decode(f.data);
      const blob = Utilities.newBlob(bytes, f.mimeType || 'application/octet-stream', safeName(f.name));
      const file = folder.createFile(blob);
      saved.push({ name: file.getName(), url: file.getUrl(), q: f.q || '' });
    } catch (err) {
      // One bad file must not lose the whole submission — record it and move on.
      saved.push({ name: safeName(f.name), url: '', q: f.q || '', error: String(err) });
    }
  });

  return saved;
}

/* ============================  Sheet  ===================================== */

function getTab(form) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const name = TAB_NAMES[form];
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function appendRow(form, answers, meta, saved, payload) {
  const sheet = getTab(form);
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getLastRow() === 0
    ? []
    : sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);

  if (headers.length === 0) {
    headers = FIXED_HEADERS.slice();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  // Append any question column we have not seen before.
  const newColumns = [];
  answers.forEach(function (item) {
    if (headers.indexOf(item.q) === -1) newColumns.push(item.q);
  });
  if (newColumns.length) {
    sheet.getRange(1, headers.length + 1, 1, newColumns.length).setValues([newColumns]);
    sheet.getRange(1, headers.length + 1, 1, newColumns.length).setFontWeight('bold');
    headers = headers.concat(newColumns);
  }

  const fileSummary = saved
    .map(function (f) { return f.url ? f.name + ' — ' + f.url : f.name + ' (שמירה נכשלה)'; })
    .join('\n');

  const row = new Array(headers.length).fill('');
  row[0] = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm');
  row[1] = FORM_NAMES_HE[form] || form;
  row[2] = meta.filledBy || '';
  row[3] = meta.role || '';
  row[4] = meta.clientContact || '';
  row[5] = fileSummary;
  row[6] = JSON.stringify(payload.answers || []);

  answers.forEach(function (item) {
    const idx = headers.indexOf(item.q);
    if (idx > -1) row[idx] = item.a;
  });

  sheet.appendRow(row);
}

/* ============================  Email  ===================================== */

function escapeHtml(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sendEmail(form, answers, meta, saved) {
  const formName = FORM_NAMES_HE[form] || form;

  let lastSection = null;
  const rows = answers.map(function (item) {
    const answer = escapeHtml(item.a).replace(/\n/g, '<br>') || '<i style="color:#9aa3b8">לא נענה</i>';
    let heading = '';
    if (item.section && item.section !== lastSection) {
      lastSection = item.section;
      heading =
        '<tr><td colspan="2" style="padding:14px 14px 6px;background:#eef3fb;color:#14356e;font-weight:700;font-size:14px">' +
        escapeHtml(item.section) +
        '</td></tr>';
    }
    return (
      heading +
      '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e3e7ef;vertical-align:top;width:45%;color:#35405a;font-weight:600">' +
      escapeHtml(item.q) +
      '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e3e7ef;vertical-align:top;color:#10182a">' +
      answer +
      '</td></tr>'
    );
  }).join('');

  const fileList = saved.length
    ? '<ul style="margin:8px 0 0;padding-inline-start:20px">' +
      saved.map(function (f) {
        const label = escapeHtml(f.name) + (f.q ? ' <span style="color:#667089">— ' + escapeHtml(f.q) + '</span>' : '');
        return f.url
          ? '<li style="margin-bottom:6px"><a href="' + f.url + '">' + label + '</a></li>'
          : '<li style="margin-bottom:6px;color:#c0392f">' + label + ' (שמירה נכשלה)</li>';
      }).join('') +
      '</ul>'
    : '<p style="margin:8px 0 0;color:#667089">לא צורפו קבצים.</p>';

  const html =
    '<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;background:#f4f6fa;padding:24px">' +
    '<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e3e7ef">' +
    '<div style="background:#14356e;color:#fff;padding:20px 24px">' +
    '<h1 style="margin:0;font-size:19px">שאלון חדש התקבל</h1>' +
    '<p style="margin:4px 0 0;font-size:14px;opacity:.85">' + escapeHtml(formName) + '</p>' +
    '</div>' +
    '<div style="padding:18px 24px;background:#eef3fb;font-size:14px;color:#35405a">' +
    '<b>ממלא השאלון:</b> ' + escapeHtml(meta.filledBy || '—') + '<br>' +
    '<b>תפקיד:</b> ' + escapeHtml(meta.role || '—') + '<br>' +
    '<b>ליצירת קשר:</b> ' + escapeHtml(meta.clientContact || '—') + '<br>' +
    '<b>נשלח בתאריך:</b> ' + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd/MM/yyyy HH:mm') +
    '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px">' + rows + '</table>' +
    '<div style="padding:18px 24px;border-top:1px solid #e3e7ef">' +
    '<b style="font-size:14px;color:#35405a">קבצים שצורפו</b>' + fileList +
    '</div>' +
    '<div style="padding:14px 24px;background:#f4f6fa;color:#9aa3b8;font-size:12px">' +
    'נשלח אוטומטית ממערכת שאלוני הלקוח של AI Lab' +
    '</div></div></div>';

  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: 'שאלון חדש התקבל — ' + formName,
    htmlBody: html,
    name: 'שאלוני AI Lab',
  });
}

/* ============================  helpers  =================================== */

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

/* ============================  setup check  =============================== */

/**
 * Run this once from the editor (Run > testSetup) BEFORE deploying.
 * It verifies every ID and permission and prints exactly what is wrong,
 * instead of letting the first real submission fail silently.
 */
function testSetup() {
  const problems = [];

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    Logger.log('גיליון: ' + ss.getName());
  } catch (err) {
    problems.push('SHEET_ID שגוי או שאין הרשאה: ' + err);
  }

  Object.keys(FOLDER_IDS).forEach(function (key) {
    try {
      const folder = DriveApp.getFolderById(FOLDER_IDS[key]);
      Logger.log('תיקייה ' + key + ': ' + folder.getName());
    } catch (err) {
      problems.push('מזהה תיקייה שגוי עבור ' + key + ': ' + err);
    }
  });

  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: 'בדיקת חיבור — שאלוני AI Lab',
      htmlBody: '<div dir="rtl">אם קיבלת מייל זה, שליחת המיילים מהשאלונים עובדת.</div>',
    });
    Logger.log('מייל בדיקה נשלח אל ' + NOTIFY_EMAIL);
  } catch (err) {
    problems.push('שליחת מייל נכשלה: ' + err);
  }

  if (problems.length) {
    Logger.log('❌ נמצאו בעיות:\n' + problems.join('\n'));
  } else {
    Logger.log('✅ הכול תקין — אפשר לפרוס (Deploy).');
  }
  return problems;
}
