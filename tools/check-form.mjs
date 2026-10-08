// Loads the questionnaire schema in Node (no DOM) and checks what a browser
// would only reveal one click at a time: duplicate keys, conditions that throw,
// empty option lists, and how many questions each role actually gets.
//
//   node tools/check-form.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

globalThis.buildForm = () => {}; // the schema calls it only when a document exists
const { FORM, ROLE, ROLE_ALL, applyMeetingMode, MEETING_AGENDA, applyCfoMode, CFO_PLAN } = require("../app-spec.form.js");

const problems = [];

// Meeting mode must cover every chapter exactly once, before we mutate FORM below.
const ids = FORM.sections.map((s) => s.id);
for (const s of FORM.sections) if (!s.id) problems.push(`section "${s.title}" has no id`);
const agendaIds = MEETING_AGENDA.map((a) => a.id);
for (const id of ids) if (!agendaIds.includes(id)) problems.push(`meeting agenda misses section "${id}"`);
for (const id of agendaIds) if (!ids.includes(id)) problems.push(`meeting agenda has unknown section "${id}"`);
if (new Set(agendaIds).size !== agendaIds.length) problems.push("meeting agenda lists a section twice");
const keys = new Map();
const all = [...FORM.metaQuestions.map((q) => ({ q, s: "meta" })),
  ...FORM.sections.flatMap((s) => s.questions.map((q) => ({ q, s: s.title })))];

for (const { q, s } of all) {
  if (!q.key) problems.push(`question without key in "${s}": ${q.label}`);
  if (keys.has(q.key)) problems.push(`duplicate key "${q.key}" in "${s}" and "${keys.get(q.key)}"`);
  keys.set(q.key, s);
  if (!q.label) problems.push(`"${q.key}" has no label`);
  if ((q.type === "single" || q.type === "multi") && !(Array.isArray(q.options) && q.options.length >= 2))
    problems.push(`"${q.key}" (${q.type}) needs at least two options`);
  if (q.type === "single" || q.type === "multi") {
    const dup = q.options.filter((o, i) => q.options.indexOf(o) !== i);
    if (dup.length) problems.push(`"${q.key}" has duplicate options: ${dup.join(", ")}`);
  }
  if (!["short", "long", "single", "multi", "yesno", "file", "date"].includes(q.type))
    problems.push(`"${q.key}" has unknown type ${q.type}`);
  // Conditions must survive an empty state and a state full of "unknown"s.
  if (typeof q.showIf === "function") {
    for (const st of [{}, Object.fromEntries([...keys.keys()].map((k) => [k, "לא יודע/ת"]))]) {
      try { q.showIf(st); } catch (e) { problems.push(`"${q.key}".showIf threw: ${e.message}`); }
    }
  }
}
for (const s of FORM.sections) {
  if (typeof s.showIf === "function") {
    try { s.showIf({}); s.showIf({ roles: [ROLE_ALL] }); } catch (e) { problems.push(`section "${s.title}".showIf threw: ${e.message}`); }
  }
}

// Per-role path: which chapters, how many questions (counting conditionals as
// hidden, the way a first-time respondent sees them), how many are required.
const roles = [...Object.values(ROLE), ROLE_ALL];
console.log("\nper-role path (visible on a fresh form / incl. conditionals / required):");
for (const r of roles) {
  const state = { roles: [r] };
  const secs = FORM.sections.filter((s) => (typeof s.showIf === "function" ? s.showIf(state) : true));
  const vis = secs.flatMap((s) => s.questions.filter((q) => (typeof q.showIf === "function" ? q.showIf(state) : true)));
  const total = secs.flatMap((s) => s.questions);
  const req = vis.filter((q) => q.required).length;
  console.log(`  ${r.padEnd(28)} ${String(secs.length).padStart(2)} chapters  ${String(vis.length).padStart(3)} / ${String(total.length).padStart(3)}  required ${req}`);
  console.log(`  ${"".padEnd(28)} ${secs.map((s) => s.title).join(" · ")}`);
}

const files = all.filter(({ q }) => q.type === "file").map(({ q }) => q.key);
console.log(`\nfile questions: ${files.join(", ")}`);
console.log(`total questions: ${all.length} (meta ${FORM.metaQuestions.length})`);

// CFO mode: a fresh copy of the schema (the transform mutates), then key checks.
try {
  delete require.cache[require.resolve("../app-spec.form.js")];
  const fresh = require("../app-spec.form.js");
  const cfo = applyCfoMode(fresh.FORM);
  const ckeys = [...cfo.metaQuestions, ...cfo.sections.flatMap((s) => s.questions)].map((q) => q.key);
  const cdups = ckeys.filter((k, i) => ckeys.indexOf(k) !== i);
  if (cdups.length) problems.push(`cfo mode duplicate keys: ${cdups.join(", ")}`);
  const st = { filledBy: "x", roleTitle: "y" };
  const all = fresh.FORM.sections.length;
  const missing = ["big","visit","terms","checks","office","it","phones","outputs","end"].filter((id) => !cfo.sections.some((s) => s.id === id));
  if (missing.length) problems.push(`cfo mode misses chapters: ${missing.join(", ")}`);
  const cvis = cfo.sections.flatMap((s) => s.questions.filter((q) => (typeof q.showIf === "function" ? q.showIf(st) : true)));
  console.log(`\ncfo mode: ${cfo.sections.length} chapters, ${cvis.length} visible / ${ckeys.length - cfo.metaQuestions.length} questions, required ${cvis.filter((q) => q.required).length}`);
  console.log(`  ${cfo.sections.map((s, i) => `${i + 1}. ${s.title} (${s.questions.length})`).join("\n  ")}`);
} catch (e) {
  problems.push(`applyCfoMode threw: ${e.message}`);
}

// Meeting mode: apply the transform and re-check keys (notes_* must not collide).
try {
  applyMeetingMode(FORM);
  const mkeys = [...FORM.metaQuestions, ...FORM.sections.flatMap((s) => s.questions)].map((q) => q.key);
  const dups = mkeys.filter((k, i) => mkeys.indexOf(k) !== i);
  if (dups.length) problems.push(`meeting mode duplicate keys: ${dups.join(", ")}`);
  const hidden = FORM.sections.filter((s) => typeof s.showIf === "function");
  if (hidden.length) problems.push("meeting mode left a chapter condition in place");
  const minutes = FORM.sections.reduce((n, s) => n + (s.minutes || 0), 0);
  console.log(`\nmeeting mode: ${FORM.sections.length} chapters in agenda order, ${mkeys.length} questions, ~${minutes} min`);
  console.log(`  ${FORM.sections.map((s, i) => `${i + 1}. ${s.title} (${s.minutes}׳)`).join("\n  ")}`);
} catch (e) {
  problems.push(`applyMeetingMode threw: ${e.message}`);
}

if (problems.length) {
  console.error("\n❌ problems:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("\n✅ schema OK");
