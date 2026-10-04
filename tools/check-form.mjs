// Loads the questionnaire schema in Node (no DOM) and checks what a browser
// would only reveal one click at a time: duplicate keys, conditions that throw,
// empty option lists, and how many questions each role actually gets.
//
//   node tools/check-form.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

globalThis.buildForm = () => {}; // the schema calls it only when a document exists
const { FORM, ROLE, ROLE_ALL } = require("../app-spec.form.js");

const problems = [];
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

if (problems.length) {
  console.error("\n❌ problems:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("\n✅ schema OK");
