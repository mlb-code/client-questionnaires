# שאלוני לקוח — Client Onboarding Questionnaires

Two Hebrew RTL questionnaires, served as static HTML from GitHub Pages, submitting
to a Google Apps Script backend that writes to a Sheet, saves uploads to Drive, and
emails a summary to meir@ai-lab.co.il.

No framework, no build step. Edit the files, push, and GitHub Pages serves them.

## Files

| file | what it is |
| --- | --- |
| `index.html` | landing page with a link to each questionnaire |
| `app-spec.html` | questionnaire 1 — collection app characterization (7 sections) |
| `videos.html` | questionnaire 2 — training videos, one submission per department |
| `shared.css` | the whole design system |
| `shared.js` | form engine: rendering, autosave, validation, files, submit. **CONFIG lives at the top.** |
| `apps-script/Code.gs` | the backend — pasted into script.google.com, not deployed from here |

## The two values that must be filled in

Both live at the top of `shared.js`:

```js
const CONFIG = {
  APPS_SCRIPT_URL: "PASTE_APPS_SCRIPT_URL_HERE",   // the /exec URL
  DRIVE_UPLOAD_LINK: "DRIVE_UPLOAD_LINK",          // shared folder for large files
};
```

Until `APPS_SCRIPT_URL` is set, submitting shows a Hebrew notice instead of failing
silently. Leaving `DRIVE_UPLOAD_LINK` untouched hides the "upload it directly" link
and shows an email fallback instead — so nothing looks broken either way.

`DRIVE_UPLOAD_LINK` points at a **dedicated "העלאות גדולות" folder**, shared as
"anyone with the link can edit". It is deliberately NOT one of the three answer
folders: anyone holding that link can see and delete everything in the folder it
opens, and the answer folders hold other clients' material.

And in `apps-script/Code.gs`: the three folder IDs and the Sheet ID.

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
  showIf: (s) => s.other === "כן" }   // conditional
```

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
