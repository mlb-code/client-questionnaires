/* ---------------------------------------------------------------------------
   Client onboarding questionnaires — shared engine.

   Each page declares a FORM schema and calls buildForm(FORM). Everything else
   (rendering, autosave, validation, file handling, submit) lives here so the
   questionnaires cannot drift apart in behaviour.

   Optional FORM flags (all default off, so older pages keep working):
     wizard: true        one chapter per screen, "הבא / הקודם" in the sticky bar
     allowUnknown: true  every non-file question gets a "לא יודע/ת" toggle
     sections[i].showIf  chapter-level condition (e.g. by the respondent's role)
   --------------------------------------------------------------------------- */

/* =====================  CONFIG — Meir edits these two  ===================== */

const CONFIG = {
  // Paste the Apps Script web app URL here (ends with /exec).
  APPS_SCRIPT_URL: "PASTE_APPS_SCRIPT_URL_HERE",

  // Shared Drive folder link for files too large to upload through the form.
  // Leave as-is to hide the "upload it directly" note entirely.
  DRIVE_UPLOAD_LINK: "DRIVE_UPLOAD_LINK",

  // Where the no-server fallback ("שליחה במייל") addresses the answers.
  FALLBACK_EMAIL: "meir@ai-lab.co.il",
};

/* ==========================  LIMITS  ====================================== */

const LIMITS = {
  MAX_FILE_BYTES: 20 * 1024 * 1024, // 20MB per file (spec)
  MAX_FILES_PER_QUESTION: 3, // (spec)
  // Beyond spec, and necessary: Apps Script caps a POST at ~50MB and base64
  // inflates by ~33%. Three 20MB files would be ~80MB encoded and the request
  // would fail *after* a long upload. Capping the raw total keeps the encoded
  // payload comfortably under the limit and fails fast, with a Hebrew message
  // pointing at the Drive folder instead.
  MAX_TOTAL_BYTES: 25 * 1024 * 1024,
};

/* The sentinel stored when a respondent marks a question "לא יודע/ת". It is a
   real answer (the question counts as done) and it reaches the Sheet verbatim,
   so Meir can see exactly which questions still need a different person. */
const UNKNOWN = "לא יודע/ת";

/* ==========================  small helpers  =============================== */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
};

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function toast(message, tone = "") {
  const t = el("div", { class: "toast " + tone }, message);
  document.body.append(t);
  setTimeout(() => t.remove(), 4200);
}

/* ==========================  form engine  ================================= */

function buildForm(FORM) {
  // Answers keyed by question key. Files live outside it — File objects cannot
  // be serialised into localStorage, so drafts restore text only (and we say so).
  const state = {};
  const files = {}; // key -> File[]
  let step = 0; // wizard only: 0 = the meta block, 1..n = visible chapters

  const formEl = $("#form");
  const progressFill = $("#progress");
  const submitBtn = $("#submitBtn");
  const prevBtn = $("#prevBtn");

  /* -----------------------------------------------------------  autosave  */

  const STORAGE_KEY = "cq_draft_" + FORM.storageKey;

  const saveDraft = debounce(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), state, step }),
      );
    } catch (_) {
      // Private mode or a full quota. The form still works; only the safety net is gone.
    }
  }, 250);

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.state !== "object") return false;
      Object.assign(state, parsed.state);
      if (Number.isInteger(parsed.step)) step = parsed.step;
      return Object.keys(parsed.state).length > 0;
    } catch (_) {
      return false;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ------------------------------------------------------------  visible  */

  const isSectionVisible = (s) => (typeof s.showIf === "function" ? !!s.showIf(state) : true);
  const visibleSections = () => FORM.sections.filter(isSectionVisible);
  const allQuestions = () => visibleSections().flatMap((s) => s.questions);
  const isVisible = (q) => (typeof q.showIf === "function" ? !!q.showIf(state) : true);
  const isUnknown = (q) => state[q.key] === UNKNOWN;

  function hasAnswer(q) {
    const v = state[q.key];
    if (q.type === "file") return (files[q.key] || []).length > 0;
    if (v === UNKNOWN) return true;
    if (q.type === "multi") return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  }

  /* Wizard steps: the meta block first, then every chapter the respondent's
     answers (usually their role) make visible. Recomputed on every render, so
     changing the role on step 0 reshapes the rest of the path. */
  function steps() {
    return [
      {
        meta: true,
        title: FORM.metaTitle || "פרטי מילוי",
        sub: FORM.metaSub || "מי יושב מול השאלון הזה",
        questions: FORM.metaQuestions,
      },
      ...visibleSections(),
    ];
  }

  /* -------------------------------------------------------------  render  */

  function render() {
    formEl.replaceChildren();

    if (FORM.wizard) {
      const list = steps();
      if (step > list.length - 1) step = list.length - 1;
      if (step < 0) step = 0;
      const current = list[step];

      formEl.append(renderStepHeader(list));
      formEl.append(renderSection(current, step === 0 ? null : step));
      if (step === 0 && typeof FORM.renderOverview === "function") {
        formEl.append(FORM.renderOverview(visibleSections(), state, el));
      }
      updateNav(list);
    } else {
      formEl.append(
        renderSection(
          {
            title: FORM.metaTitle || "פרטי מילוי",
            sub: FORM.metaSub || "מי יושב מול השאלון הזה",
            questions: FORM.metaQuestions,
          },
          null,
        ),
      );
      visibleSections().forEach((section, i) => {
        formEl.append(renderSection(section, i + 1));
      });
    }

    updateProgress();
  }

  function renderStepHeader(list) {
    const dots = el("div", { class: "step-dots", "aria-hidden": "true" });
    list.forEach((_, i) => {
      dots.append(el("span", { class: "dot" + (i === step ? " on" : i < step ? " done" : "") }));
    });
    const label =
      step === 0
        ? "התחלה"
        : `פרק ${step} מתוך ${list.length - 1}`;
    return el("div", { class: "step-head" }, el("span", { class: "step-label" }, label), dots);
  }

  function renderSection(section, index) {
    const visible = section.questions.filter(isVisible);
    if (visible.length === 0) return document.createDocumentFragment();

    const body = el("div", { class: "section-body" });
    if (section.intro) body.append(el("p", { class: "section-intro" }, section.intro));
    visible.forEach((q) => body.append(renderQuestion(q)));

    const badge =
      index === null
        ? el("div", {
            class: "section-num",
            html:
              '<svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">' +
              '<circle cx="10" cy="6.6" r="3.1" stroke="currentColor" stroke-width="1.7"/>' +
              '<path d="M4.2 16.2c.6-2.7 3-4.2 5.8-4.2s5.2 1.5 5.8 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
              "</svg>",
          })
        : el("div", { class: "section-num" }, String(index));

    return el(
      "section",
      { class: "section", id: "sec-" + (index === null ? "meta" : index) },
      el(
        "div",
        { class: "section-head" },
        badge,
        el(
          "div",
          {},
          el("h3", {}, section.title),
          section.sub ? el("p", { class: "sub" }, section.sub) : null,
        ),
      ),
      body,
    );
  }

  function renderQuestion(q) {
    const wrap = el("div", { class: "q" + (isUnknown(q) ? " q-unknown" : ""), "data-key": q.key });
    const errId = "err-" + q.key;

    wrap.append(
      el(
        "label",
        { class: "q-label", for: "in-" + q.key },
        q.label,
        q.required ? el("span", { class: "req", title: "שדה חובה" }, "*") : null,
      ),
    );
    if (q.help) wrap.append(el("p", { class: "q-help" }, q.help));
    if (q.example) wrap.append(el("p", { class: "q-example" }, "לדוגמה: " + q.example));

    wrap.append(renderControl(q));

    const unknownAllowed =
      (q.allowUnknown !== undefined ? q.allowUnknown : !!FORM.allowUnknown) && q.type !== "file";
    if (unknownAllowed) {
      const on = isUnknown(q);
      wrap.append(
        el(
          "button",
          {
            type: "button",
            class: "skip" + (on ? " on" : ""),
            onclick: () => setUnknown(q, !on),
          },
          on ? "✓ סומן «לא יודע/ת» — לחיצה לביטול" : "לא יודע/ת · מישהו אחר יענה",
        ),
      );
    }

    wrap.append(el("div", { class: "err", id: errId }, "יש להשלים את השדה הזה"));
    return wrap;
  }

  function setUnknown(q, on) {
    if (on) state[q.key] = UNKNOWN;
    else delete state[q.key];
    saveDraft();
    clearError(q.key);
    render();
  }

  function renderControl(q) {
    const unknown = isUnknown(q);
    const commit = (value) => {
      state[q.key] = value;
      saveDraft();
      clearError(q.key);
      updateProgress();
      // A conditional question (or chapter) may have just appeared or disappeared.
      if (FORM.hasConditionals) rerenderPreservingFocus();
    };

    switch (q.type) {
      case "long": {
        const ta = el("textarea", {
          id: "in-" + q.key,
          rows: q.rows || 4,
          placeholder: q.placeholder || "",
          disabled: unknown || undefined,
          oninput: (e) => commit(e.target.value),
        });
        ta.value = unknown ? "" : state[q.key] || "";
        return ta;
      }

      case "date": {
        const inp = el("input", {
          type: "date",
          id: "in-" + q.key,
          disabled: unknown || undefined,
          onchange: (e) => commit(e.target.value),
        });
        inp.value = unknown ? "" : state[q.key] || "";
        return inp;
      }

      case "single":
      case "yesno": {
        const options = q.type === "yesno" ? ["כן", "לא"] : q.options;
        const box = el("div", {
          class: "options" + (q.cols2 ? " cols-2" : "") + (unknown ? " muted" : ""),
          id: "in-" + q.key,
          role: "radiogroup",
          "aria-label": q.label,
        });
        options.forEach((opt) => {
          const checked = !unknown && state[q.key] === opt;
          const label = el(
            "label",
            { class: "opt" + (checked ? " checked" : "") },
            el("input", {
              type: "radio",
              name: q.key,
              value: opt,
              checked: checked || undefined,
              disabled: unknown || undefined,
              onchange: () => commit(opt),
            }),
            el("span", {}, opt),
          );
          box.append(label);
        });
        return box;
      }

      case "multi": {
        const chosen = !unknown && Array.isArray(state[q.key]) ? state[q.key] : [];
        const box = el("div", {
          class: "options" + (q.cols2 ? " cols-2" : "") + (unknown ? " muted" : ""),
          id: "in-" + q.key,
          role: "group",
          "aria-label": q.label,
        });
        q.options.forEach((opt) => {
          const checked = chosen.includes(opt);
          box.append(
            el(
              "label",
              { class: "opt" + (checked ? " checked" : "") },
              el("input", {
                type: "checkbox",
                value: opt,
                checked: checked || undefined,
                disabled: unknown || undefined,
                onchange: (e) => {
                  const next = new Set(Array.isArray(state[q.key]) ? state[q.key] : []);
                  e.target.checked ? next.add(opt) : next.delete(opt);
                  commit([...next]);
                },
              }),
              el("span", {}, opt),
            ),
          );
        });
        return box;
      }

      case "file":
        return renderFileControl(q);

      default: {
        const inp = el("input", {
          type: "text",
          id: "in-" + q.key,
          placeholder: q.placeholder || "",
          inputmode: q.inputmode,
          disabled: unknown || undefined,
          oninput: (e) => commit(e.target.value),
        });
        inp.value = unknown ? "" : state[q.key] || "";
        return inp;
      }
    }
  }

  function renderFileControl(q) {
    const box = el("div", {});
    const input = el("input", {
      type: "file",
      id: "in-" + q.key,
      multiple: true,
      accept: q.accept || undefined,
    });

    const drop = el(
      "label",
      { class: "file-drop", for: "in-" + q.key },
      el("strong", {}, q.fileLabel || "בחירת קבצים או צילום"),
      el(
        "span",
        {},
        `עד ${LIMITS.MAX_FILES_PER_QUESTION} קבצים · עד ${formatBytes(LIMITS.MAX_FILE_BYTES)} לקובץ`,
      ),
      input,
    );

    const chips = el("div", { class: "chips" });

    function refreshChips() {
      chips.replaceChildren();
      (files[q.key] || []).forEach((f, i) => {
        chips.append(
          el(
            "div",
            { class: "chip" },
            el("span", { class: "name", title: f.name }, f.name),
            el("span", { class: "size" }, formatBytes(f.size)),
            el(
              "button",
              {
                type: "button",
                "aria-label": "הסרת הקובץ " + f.name,
                onclick: () => {
                  files[q.key].splice(i, 1);
                  refreshChips();
                  updateProgress();
                },
              },
              "×",
            ),
          ),
        );
      });
    }

    input.addEventListener("change", (e) => {
      const incoming = [...e.target.files];
      e.target.value = ""; // let the same file be re-picked after removal
      files[q.key] = files[q.key] || [];

      for (const f of incoming) {
        if (files[q.key].length >= LIMITS.MAX_FILES_PER_QUESTION) {
          showError(q.key, `אפשר לצרף עד ${LIMITS.MAX_FILES_PER_QUESTION} קבצים לשאלה זו.`);
          break;
        }
        if (f.size > LIMITS.MAX_FILE_BYTES) {
          showError(
            q.key,
            `הקובץ "${f.name}" במשקל ${formatBytes(f.size)} — חורג מהמגבלה של ${formatBytes(LIMITS.MAX_FILE_BYTES)}. אפשר להעלות אותו ישירות לתיקיית הדרייב.`,
          );
          continue;
        }
        if (totalBytes() + f.size > LIMITS.MAX_TOTAL_BYTES) {
          showError(
            q.key,
            `סך הקבצים בשאלון חורג מ-${formatBytes(LIMITS.MAX_TOTAL_BYTES)}. הסירו קובץ או העלו אותו ישירות לתיקיית הדרייב.`,
          );
          break;
        }
        files[q.key].push(f);
      }

      refreshChips();
      updateProgress();
    });

    box.append(drop, chips);
    refreshChips(); // files survive a wizard re-render; show them again

    if (q.driveNote && CONFIG.DRIVE_UPLOAD_LINK !== "DRIVE_UPLOAD_LINK") {
      box.append(
        el("div", {
          class: "drive-note",
          html:
            `קבצים גדולים מ-${formatBytes(LIMITS.MAX_FILE_BYTES)}? ` +
            `<a href="${CONFIG.DRIVE_UPLOAD_LINK}" target="_blank" rel="noopener">העלו ישירות לתיקיית הדרייב המשותפת</a>`,
        }),
      );
    } else if (q.driveNote) {
      box.append(
        el(
          "div",
          { class: "drive-note" },
          `קבצים גדולים מ-${formatBytes(LIMITS.MAX_FILE_BYTES)}? שלחו אותם למייל ${CONFIG.FALLBACK_EMAIL} ונצרף אותם לשאלון.`,
        ),
      );
    }

    return box;
  }

  function totalBytes() {
    return Object.values(files).flat().reduce((sum, f) => sum + f.size, 0);
  }

  /* Re-render without losing the caret — only needed on forms with conditionals. */
  let rerenderTimer;
  function rerenderPreservingFocus() {
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      const active = document.activeElement;
      const id = active && active.id;
      const pos = active && active.selectionStart;
      render();
      if (id) {
        const next = document.getElementById(id);
        if (next) {
          next.focus({ preventScroll: true });
          if (pos != null && next.setSelectionRange) {
            try { next.setSelectionRange(pos, pos); } catch (_) {}
          }
        }
      }
    }, 60);
  }

  /* -------------------------------------------------------------  errors  */

  function showError(key, message) {
    const node = document.getElementById("err-" + key);
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    const control = document.getElementById("in-" + key);
    if (control) control.classList.add("invalid");
  }

  function clearError(key) {
    const node = document.getElementById("err-" + key);
    if (node) node.classList.remove("show");
    const control = document.getElementById("in-" + key);
    if (control) control.classList.remove("invalid");
  }

  /* -----------------------------------------------------------  progress  */

  function updateProgress() {
    const visible = [...FORM.metaQuestions, ...allQuestions()].filter(isVisible);
    const done = visible.filter(hasAnswer).length;
    const pct = visible.length ? Math.round((done / visible.length) * 100) : 0;
    if (progressFill) progressFill.style.width = pct + "%";
    const counter = $("#counter");
    if (!counter) return;
    if (FORM.wizard) {
      const total = steps().length - 1;
      const where = step === 0 ? "לפני הפרק הראשון" : `פרק ${step} מתוך ${total}`;
      counter.textContent = `${where} · ${done} מתוך ${visible.length} שאלות נענו`;
    } else {
      counter.textContent = `${done} מתוך ${visible.length} שאלות`;
    }
  }

  /* ------------------------------------------------------------  wizard  */

  function updateNav(list) {
    // Step 0 is never the last screen: before a role is chosen there are no
    // chapters yet, and the button must still read "לפרק הבא".
    const last = step > 0 && step === list.length - 1;
    if (submitBtn) {
      submitBtn.replaceChildren(
        document.createTextNode(last ? FORM.submitLabel || "שליחת השאלון" : FORM.nextLabel || "לפרק הבא"),
      );
      submitBtn.classList.toggle("is-next", !last);
    }
    if (prevBtn) prevBtn.hidden = step === 0;
  }

  function validateStep() {
    const list = steps();
    const current = list[step];
    let firstBad = null;
    for (const q of current.questions) {
      if (!isVisible(q) || !q.required) continue;
      if (hasAnswer(q)) { clearError(q.key); continue; }
      showError(q.key, q.type === "file" ? "יש לצרף לפחות קובץ אחד" : "יש להשלים את השדה הזה, או לסמן «לא יודע/ת»");
      if (!firstBad) firstBad = q.key;
    }
    return firstBad;
  }

  function goNext() {
    const bad = validateStep();
    if (bad) {
      focusBad(bad);
      return;
    }
    const list = steps();
    if (step === 0 && list.length === 1) {
      toast("בחרו תפקיד כדי שנדע אילו פרקים להציג", "warn");
      return;
    }
    step = Math.min(step + 1, list.length - 1);
    saveDraft();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goPrev() {
    step = Math.max(step - 1, 0);
    saveDraft();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusBad(key) {
    const node = document.querySelector(`[data-key="${key}"]`);
    if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
    toast("יש שאלות חובה שלא הושלמו", "warn");
  }

  /* -------------------------------------------------------------  submit  */

  function validate() {
    let firstBad = null;
    for (const q of [...FORM.metaQuestions, ...allQuestions()]) {
      if (!isVisible(q) || !q.required) continue;
      if (hasAnswer(q)) { clearError(q.key); continue; }
      showError(q.key, q.type === "file" ? "יש לצרף לפחות קובץ אחד" : "יש להשלים את השדה הזה");
      if (!firstBad) firstBad = q.key;
    }
    return firstBad;
  }

  function readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        resolve(result.slice(result.indexOf(",") + 1)); // strip the data: prefix
      };
      reader.onerror = () => reject(new Error("read failed: " + file.name));
      reader.readAsDataURL(file);
    });
  }

  function answerToText(q) {
    const v = state[q.key];
    if (q.type === "file") {
      const list = files[q.key] || [];
      return list.length ? list.map((f) => f.name).join(", ") : "";
    }
    if (Array.isArray(v)) return v.join(", ");
    return v === undefined || v === null ? "" : String(v);
  }

  function metaText(key) {
    const v = state[key];
    if (Array.isArray(v)) return v.join(", ");
    return v === undefined || v === null ? "" : String(v);
  }

  function buildMeta() {
    return {
      filledBy: metaText("filledBy"),
      clientContact: metaText("clientContact"),
      role: [metaText("roleTitle"), metaText("roles")].filter(Boolean).join(" — "),
      submittedAt: new Date().toISOString(),
    };
  }

  async function buildPayload() {
    const answers = [];
    for (const s of visibleSections()) {
      for (const q of s.questions) {
        if (!isVisible(q)) continue;
        answers.push({ q: q.label, a: answerToText(q), section: s.title });
      }
    }

    const payloadFiles = [];
    for (const q of allQuestions()) {
      if (q.type !== "file" || !isVisible(q)) continue;
      for (const f of files[q.key] || []) {
        payloadFiles.push({
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          data: await readAsBase64(f),
          // Beyond the minimum shape, and worth it: without this the email and
          // the Drive folder cannot say which question a file answered.
          q: q.label,
        });
      }
    }

    return {
      form: FORM.resolveFormId(state),
      answers,
      files: payloadFiles,
      meta: buildMeta(),
    };
  }

  /* A plain-text copy of the whole submission. Used by the no-server fallback
     and offered after a successful send, so the respondent always leaves with
     their own copy. */
  function summaryText() {
    const meta = buildMeta();
    const lines = [];
    lines.push(FORM.title || document.title);
    lines.push("ממלא/ת: " + (meta.filledBy || "—"));
    if (meta.role) lines.push("תפקיד: " + meta.role);
    if (meta.clientContact) lines.push("ליצירת קשר: " + meta.clientContact);
    lines.push("תאריך: " + new Date().toLocaleString("he-IL"));
    for (const s of visibleSections()) {
      lines.push("");
      lines.push("== " + s.title + " ==");
      for (const q of s.questions) {
        if (!isVisible(q)) continue;
        lines.push("• " + q.label);
        lines.push("  " + (answerToText(q) || "—").replace(/\n/g, "\n  "));
      }
    }
    return lines.join("\n");
  }

  function downloadSummary() {
    const text = "﻿" + summaryText(); // BOM so Windows Notepad shows Hebrew correctly
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const who = (metaText("filledBy") || "ללא-שם").replace(/[\\/:*?"<>|\s]+/g, "-");
    const stamp = new Date().toISOString().slice(0, 10);
    const a = el("a", { href: url, download: `שאלון-אפיון-${who}-${stamp}.txt` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryText());
      toast("התשובות הועתקו — אפשר להדביק בוואטסאפ או במייל");
    } catch (_) {
      const box = $("#summaryBox");
      if (box) { box.focus(); box.select(); }
      toast("סמנו את הטקסט והעתיקו ידנית", "warn");
    }
  }

  function mailtoHref() {
    const subject = "שאלון אפיון — " + (metaText("filledBy") || "תשובות");
    let body = summaryText();
    // mailto bodies are capped by the mail client (≈2,000 chars is the safe
    // floor). Keep the start, point at the downloadable file for the rest.
    if (body.length > 1800) {
      body = body.slice(0, 1700) + "\n\n[...] המשך התשובות בקובץ שהורדתם — אנא צרפו אותו למייל.";
    }
    return `mailto:${CONFIG.FALLBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function showFallback() {
    const screen = document.getElementById("screen-fallback");
    if (!screen) {
      toast("השאלון עדיין לא חובר לשרת. פנו למאיר.", "warn");
      return;
    }
    const box = $("#summaryBox");
    if (box) box.value = summaryText();
    const mail = $("#mailBtn");
    if (mail) mail.href = mailtoHref();
    showScreen("fallback");
  }

  async function submit() {
    const bad = validate();
    if (bad) {
      // In wizard mode the offending question may live on another step.
      if (FORM.wizard) {
        const list = steps();
        const idx = list.findIndex((s) => s.questions.some((q) => q.key === bad));
        if (idx > -1 && idx !== step) { step = idx; render(); }
      }
      focusBad(bad);
      return;
    }

    if (CONFIG.APPS_SCRIPT_URL === "PASTE_APPS_SCRIPT_URL_HERE") {
      showFallback();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.replaceChildren(el("span", { class: "spinner" }), document.createTextNode("שולח…"));

    try {
      const payload = await buildPayload();

      // Deliberately no headers: a custom Content-Type would turn this into a
      // preflighted request, and Apps Script does not answer OPTIONS. Default
      // text/plain keeps it a "simple request" that needs no preflight.
      const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      let result;
      try { result = JSON.parse(text); } catch (_) { result = { ok: false, error: text.slice(0, 300) }; }

      if (!result.ok) throw new Error(result.error || "השרת החזיר שגיאה");

      clearDraft();
      showScreen("success");
    } catch (err) {
      $("#failReason").textContent = String(err && err.message ? err.message : err).slice(0, 300);
      showScreen("fail");
    } finally {
      submitBtn.disabled = false;
      submitBtn.replaceChildren(document.createTextNode(FORM.submitLabel || "שליחת השאלון"));
    }
  }

  function showScreen(name) {
    ["form", "success", "fail", "fallback"].forEach((s) => {
      const node = document.getElementById("screen-" + s);
      if (node) node.classList.toggle("active", s === name);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------------------------------------------------------  boot  */

  const restored = loadDraft();
  render();

  if (restored) {
    toast("טיוטה שוחזרה — התשובות שמילאתם נשמרו במכשיר");
    // Files cannot be serialised, so a restored draft never carries them.
    const hadFiles = FORM.sections.some((s) => s.questions.some((q) => q.type === "file"));
    if (hadFiles) {
      setTimeout(() => toast("שימו לב: קבצים שצורפו קודם יש לצרף מחדש", "warn"), 4400);
    }
  }

  submitBtn.addEventListener("click", () => {
    if (FORM.wizard && (step === 0 || step < steps().length - 1)) goNext();
    else submit();
  });
  if (prevBtn) prevBtn.addEventListener("click", goPrev);

  const retry = $("#retryBtn");
  if (retry) retry.addEventListener("click", () => showScreen("form"));
  const back = $("#fallbackBackBtn");
  if (back) back.addEventListener("click", () => showScreen("form"));

  document.querySelectorAll("[data-action='download']").forEach((b) => b.addEventListener("click", downloadSummary));
  document.querySelectorAll("[data-action='copy']").forEach((b) => b.addEventListener("click", copySummary));

  // Last line of defence against a closed tab mid-meeting.
  window.addEventListener("beforeunload", (e) => {
    const anyAnswer = [...FORM.metaQuestions, ...allQuestions()].some(hasAnswer);
    const onForm = document.getElementById("screen-form").classList.contains("active");
    if (anyAnswer && onForm) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}
