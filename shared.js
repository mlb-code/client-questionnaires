/* ---------------------------------------------------------------------------
   Client onboarding questionnaires — shared engine.

   Each page declares a FORM schema and calls buildForm(FORM). Everything else
   (rendering, autosave, validation, file handling, submit) lives here so the
   two questionnaires cannot drift apart in behaviour.
   --------------------------------------------------------------------------- */

/* =====================  CONFIG — Meir edits these two  ===================== */

const CONFIG = {
  // Paste the Apps Script web app URL here (ends with /exec).
  APPS_SCRIPT_URL: "PASTE_APPS_SCRIPT_URL_HERE",

  // Shared Drive folder link for files too large to upload through the form.
  // Leave as-is to hide the "upload it directly" note entirely.
  DRIVE_UPLOAD_LINK: "DRIVE_UPLOAD_LINK",
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

  const formEl = $("#form");
  const progressFill = $("#progress");

  /* -----------------------------------------------------------  autosave  */

  const STORAGE_KEY = "cq_draft_" + FORM.storageKey;

  const saveDraft = debounce(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), state }),
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

  const allQuestions = () => FORM.sections.flatMap((s) => s.questions);
  const isVisible = (q) => (typeof q.showIf === "function" ? !!q.showIf(state) : true);

  function hasAnswer(q) {
    const v = state[q.key];
    if (q.type === "file") return (files[q.key] || []).length > 0;
    if (q.type === "multi") return Array.isArray(v) && v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== "";
  }

  /* -------------------------------------------------------------  render  */

  function render() {
    formEl.replaceChildren();

    // Meta block: who is filling this in, and with whom.
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

    FORM.sections.forEach((section, i) => {
      formEl.append(renderSection(section, i + 1));
    });

    updateProgress();
  }

  function renderSection(section, index) {
    const visible = section.questions.filter(isVisible);
    if (visible.length === 0) return document.createDocumentFragment();

    const body = el("div", { class: "section-body" });
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
    const wrap = el("div", { class: "q", "data-key": q.key });
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

    wrap.append(renderControl(q));
    wrap.append(el("div", { class: "err", id: errId }, "יש להשלים את השדה הזה"));
    return wrap;
  }

  function renderControl(q) {
    const commit = (value) => {
      state[q.key] = value;
      saveDraft();
      clearError(q.key);
      updateProgress();
      // A conditional question may have just appeared or disappeared.
      if (FORM.hasConditionals) rerenderPreservingFocus();
    };

    switch (q.type) {
      case "long": {
        const ta = el("textarea", {
          id: "in-" + q.key,
          rows: q.rows || 4,
          placeholder: q.placeholder || "",
          oninput: (e) => commit(e.target.value),
        });
        ta.value = state[q.key] || "";
        return ta;
      }

      case "date": {
        const inp = el("input", {
          type: "date",
          id: "in-" + q.key,
          onchange: (e) => commit(e.target.value),
        });
        inp.value = state[q.key] || "";
        return inp;
      }

      case "single":
      case "yesno": {
        const options = q.type === "yesno" ? ["כן", "לא"] : q.options;
        const box = el("div", {
          class: "options" + (q.cols2 ? " cols-2" : ""),
          id: "in-" + q.key,
          role: "radiogroup",
          "aria-label": q.label,
        });
        options.forEach((opt, i) => {
          const checked = state[q.key] === opt;
          const label = el(
            "label",
            { class: "opt" + (checked ? " checked" : "") },
            el("input", {
              type: "radio",
              name: q.key,
              value: opt,
              checked: checked || undefined,
              onchange: () => commit(opt),
            }),
            el("span", {}, opt),
          );
          box.append(label);
        });
        return box;
      }

      case "multi": {
        const chosen = Array.isArray(state[q.key]) ? state[q.key] : [];
        const box = el("div", {
          class: "options" + (q.cols2 ? " cols-2" : ""),
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
          oninput: (e) => commit(e.target.value),
        });
        inp.value = state[q.key] || "";
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
      el("strong", {}, "בחירת קבצים"),
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
          `קבצים גדולים מ-${formatBytes(LIMITS.MAX_FILE_BYTES)}? שלחו אותם למייל meir@ai-lab.co.il ונצרף אותם לשאלון.`,
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
    if (counter) counter.textContent = `${done} מתוך ${visible.length} שאלות`;
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

  async function buildPayload() {
    const answers = [];
    for (const q of allQuestions()) {
      if (!isVisible(q)) continue;
      answers.push({ q: q.label, a: answerToText(q) });
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
      meta: {
        filledBy: state.filledBy || "",
        clientContact: state.clientContact || "",
        submittedAt: new Date().toISOString(),
      },
    };
  }

  async function submit() {
    const bad = validate();
    if (bad) {
      const node = document.querySelector(`[data-key="${bad}"]`);
      if (node) node.scrollIntoView({ behavior: "smooth", block: "center" });
      toast("יש שאלות חובה שלא הושלמו", "warn");
      return;
    }

    if (CONFIG.APPS_SCRIPT_URL === "PASTE_APPS_SCRIPT_URL_HERE") {
      toast("השאלון עדיין לא חובר לשרת. פנו למאיר.", "warn");
      return;
    }

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.replaceChildren(el("span", { class: "spinner" }), document.createTextNode("שולח…"));

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
      btn.disabled = false;
      btn.replaceChildren(document.createTextNode(FORM.submitLabel || "שליחת השאלון"));
    }
  }

  function showScreen(name) {
    ["form", "success", "fail"].forEach((s) => {
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
    const hadFiles = allQuestions().some((q) => q.type === "file");
    if (hadFiles) {
      setTimeout(() => toast("שימו לב: קבצים שצורפו קודם יש לצרף מחדש", "warn"), 4400);
    }
  }

  $("#submitBtn").addEventListener("click", submit);
  const retry = $("#retryBtn");
  if (retry) retry.addEventListener("click", () => showScreen("form"));

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
