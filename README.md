# שאלוני לקוח — Client Onboarding Questionnaires

Two Hebrew RTL questionnaires, served as static HTML from GitHub Pages, submitting
to a Google Apps Script backend that writes to a Sheet, saves uploads to Drive, and
emails a summary to meir@ai-lab.co.il.

No framework, no build step. Edit the files, push, and GitHub Pages serves them.

## Files

| file | what it is |
| --- | --- |
| `index.html` | landing page with a link to each questionnaire |
| `app-spec.html` | questionnaire 1 — collection app characterization. Page shell only; the questions live in `app-spec.form.js` |
| `app-spec.form.js` | the 9 chapters / 97 questions of questionnaire 1, routed by the respondent's role (see below) |
| `videos.html` | questionnaire 2 — training videos, one submission per department |
| `shared.css` | the whole design system |
| `shared.js` | form engine: rendering, autosave, validation, files, submit, wizard mode, "לא יודע/ת", no-server fallback. **CONFIG lives at the top.** |
| `apps-script/Code.gs` | the backend — pasted into script.google.com, not deployed from here |
| `tools/check-form.mjs` | `node tools/check-form.mjs` — validates the schema (duplicate keys, broken conditions) and prints each role's path |

## The two values that must be filled in

Both live at the top of `shared.js`:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "PASTE_APPS_SCRIPT_URL_HERE",   // the /exec URL
  DRIVE_UPLOAD_LINK: "DRIVE_UPLOAD_LINK",          // shared folder for large files
};
```

Until `APPS_SCRIPT_URL` is set, submitting opens a **fallback screen** with the full
answers as text and three buttons — download a `.txt`, open a `mailto:` to
`CONFIG.FALLBACK_EMAIL`, copy. The questionnaire is therefore usable from day one;
the backend only adds the Sheet row, the Drive upload and the automatic email. Leaving `DRIVE_UPLOAD_LINK` untouched hides the "upload it directly" link
and shows an email fallback instead — so nothing looks broken either way.

`DRIVE_UPLOAD_LINK` points at a **dedicated "העלאות גדולות" folder**, shared as
"anyone with the link can edit". It is deliberately NOT one of the three answer
folders: anyone holding that link can see and delete everything in the folder it
opens, and the answer folders hold other clients' material.

And in `apps-script/Code.gs`: the three folder IDs and the Sheet ID.

## Questionnaire 1: chapters by role, one chapter per screen

The respondents are not technical, and no single person at the client knows the
whole process. So the first step asks who is filling the form (`roles`, multi),
and each chapter declares `showIf: forRoles(...)`:

| role | chapters | questions |
| --- | --- | --- |
| הנהלה | התמונה הגדולה · מה האפליקציה צריכה להציג · לסיום | 20 |
| כספים וגבייה | תנאי האשראי · כללי הצ׳קים · במשרד · לסיום | 34 (+7 conditional) |
| מכירות וניהול סוכנים | התמונה הגדולה · הביקור · הסוכנים והטלפונים · לסיום | 36 |
| סוכן/ת שטח | הביקור · הסוכנים והטלפונים · לסיום | 27 |
| מחשוב / ספק התוכנה | מערכות ומחשוב · לסיום | 12 |

`wizard: true` renders one chapter per screen; the sticky button reads «לפרק הבא»
until the last chapter, then «שליחת השאלון». Required questions are validated per
step. The step is saved with the draft, so a closed tab reopens where it left off.

`allowUnknown: true` adds a «לא יודע/ת · מישהו אחר יענה» toggle under every
non-file question. It stores the literal string `לא יודע/ת`, counts as answered,
and reaches the Sheet verbatim — which is the point: it tells Meir exactly which
questions still need a different person.

Questions are phrased about *what happens* (who approves, what the office types,
whether there is reception in the stores), never about software. The technical
decisions (login method, offline, ERP integration path, OCR fields, retention) are
inferred from those answers; the mapping lives in Meir's internal notes, outside
this repo.

### Meeting mode — `app-spec.html?mode=meeting`

Meir fills the same questionnaire live over Zoom, typing while the client's
people talk. `applyMeetingMode(FORM)` (bottom of `app-spec.form.js`) reshapes the
schema before `buildForm`: chapters follow `MEETING_AGENDA` (agent first, finance,
management last) with `who` / `minutes` hints in each chapter head, no role step,
`skipRequired`, a `notes_<id>` long question appended to every chapter, a jump
`<select>` between chapters, and a "save a copy so far" link under the button.
The draft is stored under its own key (`app_spec_meeting`), so a client's draft
on the same device is never touched.

## How a question is defined

Questions are data, not markup. Each page declares a schema and `buildForm()`
renders it, which is why both forms behave identically.

```js
{ key: "unique_key",           // also the localStorage key — never reuse
  type: "short" | "long" | "single" | "multi" | "yesno" | "file" | "date",
  label: "the question, in Hebrew",
  help: "optional clarifying line",
  required: true,
  options: ["א", "ב"],          // single / multi
  cols2: true,                  // lay options out in two columns on wide screens
  accept: "image/*,.pdf",       // file
  driveNote: true,              // show the >20MB fallback note
  example: "שוטף+30, שוטף+60",   // rendered as "לדוגמה: …" under the help line
  allowUnknown: false,          // per-question override of FORM.allowUnknown
  fileLabel: "צילום מסך",       // file: the button text
  showIf: (s) => s.other === "כן" }   // conditional
```

A section may also carry `showIf(state)` (chapter-level condition) and `intro`
(a highlighted paragraph above its first question).

The payload's `answers[]` carry `section` (the chapter title) and `meta.role`
(role title + chosen role categories); `Code.gs` prints chapter headings in the
email and writes the role into its own column (`FIXED_HEADERS`).

## Limits, and why

- 20MB per file and 3 files per question — from the spec.
- **25MB total per submission** — added, and load-bearing. Apps Script caps a POST
  at ~50MB and base64 inflates by ~33%, so three 20MB files would encode to ~80MB
  and fail *after* a long upload on a phone. The cap fails fast with a Hebrew
  message pointing at the Drive folder.

## CORS

The front end posts with **no custom headers**, so the request stays a "simple
request" and the browser skips the preflight that Apps Script cannot answer. The
body is therefore `text/plain` and `doPost` parses `e.postData.contents` by hand.
Do not add a `Content-Type: application/json` header — it will break submission
from GitHub Pages.

## Drafts

Every change is written to `localStorage` (key `cq_draft_<form>`), restored on load
with a Hebrew toast, and cleared only on a successful submit. A failed submit keeps
the draft on purpose.

**Files are not part of the draft** — `File` objects cannot be serialised. A restored
draft shows a second toast saying attachments must be re-picked.

## Deploying

GitHub Pages, `main` branch, `/` root. GitHub Pages on a free account only serves
**public** repositories.

### Custom domain (not set up)

To serve this from a subdomain later: add a `CNAME` file at the repo root containing
the hostname (e.g. `forms.ai-lab.co.il`), add a CNAME DNS record pointing that host
at `mlb-code.github.io`, then set the domain under Settings → Pages.

## After editing Code.gs

Apps Script keeps serving the deployed version, not the saved one. Deploy → Manage
deployments → pencil → Version: **New version** → Deploy. Editing and saving alone
changes nothing on the live URL.
