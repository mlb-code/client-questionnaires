/* ---------------------------------------------------------------------------
   שאלון אפיון — אפליקציית גבייה לסוכני שטח.

   Schema only: no DOM access at load, so tools/check-form.mjs can load it in
   Node and verify keys, conditions and per-role chapter counts. The page calls
   buildForm(FORM) at the bottom when a document exists.

   Design rules that shaped the questions:
   - Respondents are not technical. Every question is about *what happens*,
     never about how software should be built. Technical conclusions (login,
     offline, integration, OCR fields, retention) are inferred from the answers.
   - Chapters are routed by role, so each person sees 12–36 questions, not 90.
   - Any question can be answered «לא יודע/ת» — a real, recorded answer that
     tells Meir who else to ask.
   --------------------------------------------------------------------------- */

const ROLE = {
  mgmt: "הנהלה",
  fin: "כספים וגבייה",
  sales: "מכירות וניהול סוכנים",
  agent: "סוכן/ת שטח",
  it: "מחשוב / ספק התוכנה",
};
const ROLE_ALL = "אני אענה על כל הפרקים";

/** Chapter condition: visible when the respondent picked one of these roles. */
function forRoles() {
  const roles = Array.prototype.slice.call(arguments);
  return function (state) {
    const chosen = Array.isArray(state.roles) ? state.roles : [];
    if (chosen.indexOf(ROLE_ALL) > -1) return true;
    return roles.some(function (r) { return chosen.indexOf(r) > -1; });
  };
}

const FORM = {
  storageKey: "app_spec_v2",
  title: "שאלון אפיון — אפליקציית גבייה לסוכני שטח",
  submitLabel: "שליחת השאלון",
  nextLabel: "לפרק הבא",
  hasConditionals: true,
  wizard: true,
  allowUnknown: true,
  resolveFormId: function () { return "app_spec"; },

  metaTitle: "נעים להכיר",
  metaSub: "כמה פרטים כדי שנציג רק את הפרקים שרלוונטיים לך",
  metaQuestions: [
    { key: "filledBy", type: "short", label: "שם מלא", required: true, allowUnknown: false,
      placeholder: "שם פרטי ומשפחה" },
    { key: "roleTitle", type: "short", label: "התפקיד שלך בחברה", required: true, allowUnknown: false,
      placeholder: "למשל: מנהלת גבייה · סוכן שטח אזור צפון · מנכ״ל" },
    { key: "roles", type: "multi", required: true, allowUnknown: false,
      label: "על מה הכי נכון לשאול אותך?",
      help: "אפשר לבחור יותר מאחד. לפי הבחירה נציג רק את הפרקים שמתאימים — לא צריך לדעת הכול.",
      options: [ROLE.mgmt, ROLE.fin, ROLE.sales, ROLE.agent, ROLE.it, ROLE_ALL] },
    { key: "clientContact", type: "short", allowUnknown: false,
      label: "טלפון או מייל לשאלת השלמה קצרה (לא חובה)",
      placeholder: "050-0000000 או name@company.co.il" },
  ],

  /** Shown under the role picker: which chapters this person will get. */
  renderOverview: function (sections, state, el) {
    const chosen = Array.isArray(state.roles) ? state.roles : [];
    const box = el("div", { class: "overview" });
    box.append(el("h4", {}, "הפרקים שלך"));
    if (!chosen.length) {
      box.append(el("p", { class: "empty" }, "בחרו תפקיד למעלה כדי לראות את הפרקים."));
      return box;
    }
    const count = sections.reduce(function (n, s) { return n + s.questions.length; }, 0);
    const minutes = Math.max(5, Math.round(count * 0.45 / 5) * 5);
    box.append(el("p", {}, `${sections.length} פרקים · כ־${count} שאלות · בערך ${minutes} דקות. התשובות נשמרות אוטומטית, אפשר לעצור ולחזור.`));
    const ol = el("ol", {});
    sections.forEach(function (s) {
      ol.append(el("li", {}, s.title, el("small", {}, `(${s.questions.length})`)));
    });
    box.append(ol);
    return box;
  },

  sections: [

    /* ================================================== 1. התמונה הגדולה */
    {
      id: "big",
      title: "התמונה הגדולה",
      sub: "למה עושים את זה, ואיך נדע שהצליח",
      showIf: forRoles(ROLE.mgmt, ROLE.sales),
      intro: "כמה שאלות על המטרה. אין צורך בפרטים טכניים — רק מה כואב ומה ייחשב הצלחה.",
      questions: [
        { key: "goal_pain", type: "long", required: true, rows: 5,
          label: "מה הדבר הכי כואב היום בגבייה בשטח — שאם האפליקציה תפתור אותו, הפרויקט הצליח?",
          help: "אם אפשר, תארו מקרה אמיתי מהחודשים האחרונים: מה קרה, מה זה עלה, מי גילה ומתי." },
        { key: "goal_success", type: "long", rows: 4,
          label: "איך תדעו בסוף הפיילוט שזה עבד?",
          help: "נסו להיות מספריים.",
          example: "פחות 5 חריגות בחודש · הכסף רשום במערכת באותו יום · אפס ויכוחים עם לקוחות על תאריכים." },
        { key: "scope_teams", type: "long", required: true, rows: 4,
          label: "מי בפועל גובה כסף בשטח היום? (צוותים, אזורים, סוגי לקוחות)",
          example: "סוכני 'הפרטיות' מול חנויות חשמל · סוכנים מוסדיים · נהגים-מחלקים שגם אוספים צ׳קים." },
        { key: "agents_count", type: "short", required: true, inputmode: "numeric",
          label: "כמה סוכנים ישתמשו באפליקציה כשהיא תפעל אצל כולם?",
          placeholder: "מספר משוער" },
        { key: "customers_count", type: "single", cols2: true,
          label: "כמה לקוחות פעילים (חנויות / סוחרים) יש בסך הכול?",
          options: ["עד 100", "100–300", "300–1,000", "מעל 1,000"] },
        { key: "pilot_scope", type: "long", rows: 3,
          label: "אם מתחילים בפיילוט — עם כמה סוכנים, באיזה אזור, ומי הסוכן/ת שתרצו שיתנסה ראשון?",
          help: "הסוכן הראשון הוא לא תמיד הכי טכנולוגי — עדיף מישהו עם הרבה צ׳קים וסבלנות לדבר איתנו." },
        { key: "timeline", type: "single", cols2: true,
          label: "מתי הייתם רוצים שהסוכנים הראשונים יתחילו להשתמש?",
          options: ["בתוך חודש", "בתוך 2–3 חודשים", "עד סוף השנה", "אין דחיפות מיוחדת"] },
        { key: "owner", type: "short",
          label: "מי אצלכם יהיה איש/אשת הקשר היומיומי שלנו לפרויקט?",
          placeholder: "שם ותפקיד" },
        { key: "past_attempts", type: "long", rows: 3,
          label: "האם ניסיתם בעבר פתרון לנושא הזה (אפליקציה, אקסל, נוהל חדש)? מה קרה?" },
      ],
    },

    /* ============================================== 2. הביקור אצל הלקוח */
    {
      id: "visit",
      title: "הביקור אצל הלקוח, שלב אחרי שלב",
      sub: "איך זה באמת קורה בשטח",
      showIf: forRoles(ROLE.agent, ROLE.sales),
      intro: "כאן אנחנו רוצים לראות את הביקור בעיניים שלכם. תארו איך זה באמת קורה — לא איך זה אמור לקרות.",
      questions: [
        { key: "visit_story", type: "long", required: true, rows: 6,
          label: "תארו ביקור טיפוסי שבו גובים תשלום — מהרגע שנכנסים לחנות ועד שיוצאים",
          help: "מה מוציאים מהתיק, מה אומרים ללקוח, מה הלקוח נותן, מה רושמים, למי מודיעים." },
        { key: "visits_per_day", type: "single", cols2: true,
          label: "כמה ביקורים עושה סוכן ביום רגיל?",
          options: ["עד 5", "6–10", "11–15", "מעל 15"] },
        { key: "know_before", type: "multi", required: true,
          label: "מה הסוכן יודע על החוב של הלקוח לפני שהוא נכנס לחנות — ומאיפה?",
          options: ["דף מודפס מהמשרד", "קובץ אקסל בטלפון", "מתקשר למשרד לפני או בזמן הביקור",
                    "זוכר בעל-פה / הלקוח אומר לו", "אפליקציה או מערכת בטלפון", "בדרך כלל לא יודע מראש"] },
        { key: "payment_methods", type: "multi", required: true, cols2: true,
          label: "איך לקוחות משלמים לסוכן בשטח?",
          options: ["צ׳קים דחויים", "צ׳קים ליום (לא דחויים)", "מזומן", "העברה בנקאית (הלקוח מעביר בעצמו)",
                    "כרטיס אשראי", "ביט / פייבוקס / אפליקציות", "אחר"] },
        { key: "checks_share", type: "single", cols2: true,
          label: "מתוך כל הכסף שנגבה בשטח — כמה בערך מגיע בצ׳קים?",
          options: ["כמעט הכול", "בערך 70–90%", "בערך חצי", "פחות מחצי"] },
        { key: "stack_size", type: "single", cols2: true,
          label: "כמה צ׳קים נותן לקוח בביקור טיפוסי?",
          options: ["1–3", "4–6", "7–12", "מעל 12 (ערימה)"] },
        { key: "gives_customer", type: "multi",
          label: "מה הלקוח מקבל מהסוכן אחרי שמסר תשלום?",
          options: ["קבלה ידנית מפנקס", "קבלה מודפסת ממכשיר נייד", "הודעת וואטסאפ / צילום",
                    "כלום במקום — המשרד שולח קבלה אחר כך", "אחר"] },
        { key: "physical_checks", type: "single", required: true,
          label: "מה קורה לצ׳קים הפיזיים אחרי הביקור?",
          options: ["הסוכן מביא למשרד באותו יום", "הסוכן מביא למשרד פעם בכמה ימים או בשבוע",
                    "שליח אוסף מהסוכן", "הסוכן מפקיד בבנק בעצמו", "אחר"] },
        { key: "report_office", type: "multi", required: true,
          label: "איך הסוכן מדווח למשרד מה גבה?",
          options: ["וואטסאפ עם תמונות של הצ׳קים", "טלפון", "טופס / פנקס נייר", "אקסל",
                    "מערכת או אפליקציה קיימת", "לא מדווח — המשרד מגלה כשהצ׳קים מגיעים"] },
        { key: "field_decisions", type: "multi",
          label: "מה הסוכן מחליט לבד בשטח, בלי לשאול אף אחד?",
          options: ["לקבל ערימה שחורגת קצת מהתנאים", "לסרב לצ׳ק", "לבקש השלמה במזומן",
                    "לפצל תשלום לשני ביקורים", "לקבל צ׳ק של צד שלישי",
                    "כלום — על כל דבר חריג מתקשרים למשרד"] },
        { key: "approval_how", type: "single", cols2: true,
          label: "כשצריך אישור מהמשרד תוך כדי ביקור — איך זה קורה היום?",
          options: ["טלפון למנהל", "וואטסאפ", "מייל", "אין כזה דבר — הסוכן מחליט", "אחר"] },
        { key: "approval_time", type: "single", cols2: true,
          label: "ותוך כמה זמן בדרך כלל מגיעה התשובה?",
          options: ["תוך דקות, בזמן הביקור", "תוך שעות", "למחרת או יותר", "משתנה מאוד"],
          showIf: function (s) { return s.approval_how && s.approval_how !== "אין כזה דבר — הסוכן מחליט"; } },
        { key: "visit_time", type: "single", cols2: true,
          label: "כמה זמן יש לסוכן בחנות לעניין התשלום, לפני שבעל החנות מאבד סבלנות?",
          options: ["דקה-שתיים", "עד 5 דקות", "עד 10 דקות", "אין לחץ זמן"] },
        { key: "visit_pains", type: "long", required: true, rows: 4,
          label: "שלושת הדברים שהכי משתבשים או מעצבנים בחלק של התשלום בביקור — מהגרוע ביותר",
          help: "1. הכי גרוע · 2. · 3." },
        { key: "visit_sample", type: "file", accept: "image/*,.pdf,application/pdf",
          label: "אם יש — צלמו דוגמה: דף גבייה, טופס דיווח, פנקס קבלות, או הודעת וואטסאפ טיפוסית למשרד",
          help: "אפשר להסתיר שמות וסכומים. אנחנו צריכים לראות את הצורה, לא את הנתונים.",
          fileLabel: "צילום או בחירת קובץ" },
      ],
    },

    /* ================================================== 3. תנאי האשראי */
    {
      id: "terms",
      title: "תנאי האשראי — הלב של החישוב",
      sub: "התשובות כאן קובעות איך האפליקציה תחשב",
      showIf: forRoles(ROLE.fin),
      intro: "זה הפרק החשוב ביותר. לפי התשובות כאן האפליקציה תחליט אם ערימת צ׳קים «בסדר» או לא. עדיף תשובה מדויקת ואיטית מתשובה מהירה.",
      questions: [
        { key: "terms_start", type: "single", required: true,
          label: "כשאומרים אצלכם «שוטף + 60» — מאיזה יום מתחילים לספור את ה-60?",
          options: ["מתאריך החשבונית", "מסוף החודש שבו הוצאה החשבונית", "מתאריך המשלוח / האספקה",
                    "מסוף החודש של המשלוח", "אחר / תלוי בלקוח"] },
        { key: "terms_example", type: "long", required: true, rows: 4,
          label: "דוגמה מספרית אחת, שלב-שלב: חשבונית מ-15/03 בתנאי שוטף+60 — מה התאריך האחרון שמותר לצ׳ק להיות?",
          help: "כתבו גם איך הגעתם לתאריך. אם יש כלל עיגול (למשל: תמיד ל-10 בחודש), ציינו אותו." },
        { key: "terms_tracks", type: "short", required: true,
          label: "אילו תנאי אשראי קיימים בפועל אצל הלקוחות?",
          example: "שוטף+30, שוטף+60, שוטף+90, מזומן בלבד" },
        { key: "terms_vary_brand", type: "single",
          label: "האם לאותו לקוח יכולים להיות תנאים שונים למותגים או מחלקות שונות?",
          options: ["לא — תנאי אחד ללקוח", "כן — לפי מותג / מחלקה", "כן — לפי סוג מוצר או עסקה"] },
        { key: "stack_check", type: "single", required: true,
          label: "כשלקוח נותן כמה צ׳קים בתאריכים שונים — איך בודקים שהם עומדים בתנאים?",
          options: ["כל צ׳ק לבד — אף צ׳ק לא עובר את התאריך המותר",
                    "ממוצע של כל הערימה — צ׳ק מוקדם «מכסה» על צ׳ק מאוחר",
                    "גם ממוצע, וגם תקרה לצ׳ק הבודד",
                    "היום לא בודקים את זה בשטח — רק במשרד, אחרי"] },
        { key: "weighted_how", type: "long", rows: 3,
          label: "איך מחשבים את הממוצע?",
          help: "האם צ׳ק גדול «שוקל» יותר מצ׳ק קטן? איך סופרים מזומן — כיום אפס? ומה עם צ׳ק ליום?",
          showIf: function (s) { return typeof s.stack_check === "string" && s.stack_check.indexOf("ממוצע") > -1; } },
        { key: "tolerance", type: "single", required: true, cols2: true,
          label: "כמה ימי חריגה «מבליגים» עליהם בלי אישור מיוחד?",
          options: ["אפס — אין חריגה", "עד שבוע", "עד שבועיים", "עד חודש", "תלוי בלקוח"] },
        { key: "breach_action", type: "single", required: true,
          label: "כשערימה חורגת מהתנאים — מה קורה היום בפועל?",
          options: ["הסוכן מתקשר ומבקש אישור במקום", "הסוכן לוקח את הצ׳קים, והמשרד מגלה אחר כך",
                    "הסוכן מסרב ומבקש צ׳קים אחרים", "משתנה מסוכן לסוכן"] },
        { key: "approver", type: "short", required: true,
          label: "מי מאשר חריגה מתנאי האשראי?",
          placeholder: "תפקיד, ואם אפשר גם שם" },
        { key: "against_what", type: "single", required: true,
          label: "כשלקוח משלם — התשלום הוא על חשבוניות מסוימות, או «על החשבון» בלי לשייך לחשבונית?",
          help: "זה קובע מה הסוכן יראה: רשימת חשבוניות פתוחות, או רק יתרה כוללת.",
          options: ["תמיד מול חשבוניות מסוימות", "בדרך כלל על החשבון — המשרד משייך אחר כך", "שניהם קורים"] },
        { key: "credit_limit", type: "single",
          label: "האם לכל לקוח יש «מסגרת» (אובליגו), ומה קורה כשהוא מתקרב אליה?",
          options: ["יש מסגרת, ועוצרים משלוחים כשחורגים", "יש מסגרת, אבל היא בעיקר להתראה", "אין מסגרת פורמלית"] },
        { key: "early_late", type: "multi", cols2: true,
          label: "האם יש הנחה לתשלום מוקדם או במזומן, או חיוב על איחור?",
          options: ["הנחת מזומן", "הנחה לתשלום לפני הזמן", "ריבית / חיוב פיגורים", "אין כאלה"] },
      ],
    },

    /* ================================================== 4. כללי הצ׳קים */
    {
      id: "checks",
      title: "כללי הצ׳קים — מה מותר ומה לא",
      sub: "מה האפליקציה צריכה לבדוק בכל צ׳ק, מעבר לתאריך",
      showIf: forRoles(ROLE.fin),
      questions: [
        { key: "max_postdate", type: "short", required: true,
          label: "מה המרחק המקסימלי המותר לצ׳ק דחוי מיום הביקור?",
          example: "עד 120 יום קדימה" },
        { key: "third_party", type: "single", required: true,
          label: "צ׳קים של צד שלישי (צ׳ק שהלקוח קיבל ממישהו אחר ומעביר לכם) — מקבלים?",
          options: ["כן, בלי הגבלה", "כן, עד סכום מסוים", "כן, רק באישור מהמשרד", "לא מקבלים בכלל"] },
        { key: "third_party_checks", type: "multi",
          label: "מה בודקים היום בצ׳ק של צד שלישי לפני שמקבלים אותו?",
          help: "רקע: לפי החוק לצמצום השימוש במזומן, אסור לקבל צ׳ק מוסב בלי שם ומספר זהות של המסב על גב הצ׳ק.",
          options: ["שבגב הצ׳ק רשומים שם ומספר זהות של מי שהעביר", "שהצ׳ק לא מסומן «למוטב בלבד»",
                    "מי בעל הצ׳ק המקורי — האם מוכר", "הסכום", "לא בודקים במיוחד"],
          showIf: function (s) { return s.third_party && s.third_party !== "לא מקבלים בכלל"; } },
        { key: "third_party_share", type: "single", cols2: true,
          label: "כמה מהצ׳קים שמגיעים הם של צד שלישי?",
          options: ["כמעט אף אחד", "בערך רבע", "בערך חצי", "רוב הצ׳קים"],
          showIf: function (s) { return s.third_party && s.third_party !== "לא מקבלים בכלל"; } },
        { key: "solo_cap", type: "single",
          label: "האם יש כלל לגבי כמה מהערימה יכול להיות צ׳קים של הסוחר עצמו (סולו), לעומת צ׳קים של לקוחות שלו?",
          options: ["אין כלל", "יש תקרה לסולו", "דווקא מעדיפים סולו", "אחר"] },
        { key: "solo_cap_detail", type: "short",
          label: "מה הכלל?",
          example: "עד 50% מסכום הגבייה בסולו",
          showIf: function (s) { return s.solo_cap && s.solo_cap !== "אין כלל"; } },
        { key: "cash_rules", type: "single",
          label: "מזומן — מותר לסוכן לקבל? עד כמה?",
          options: ["לא מקבלים מזומן", "כן, עד סכום קבוע", "כן, בלי הגבלה פנימית"] },
        { key: "cash_limit", type: "short", inputmode: "numeric",
          label: "מה הסכום?", placeholder: "₪",
          showIf: function (s) { return s.cash_rules === "כן, עד סכום קבוע"; } },
        { key: "bounced", type: "long", rows: 3,
          label: "כמה צ׳קים חוזרים בחודש, בערך? ומה עושים כשצ׳ק חוזר?" },
        { key: "blacklist", type: "single",
          label: "האם יש לקוחות שהסוכן צריך לדעת עליהם משהו לפני הביקור? (צ׳קים שחזרו, חוב ישן, «רק מזומן»)",
          options: ["כן, ויש רשימה כתובה", "כן, אבל זה בעל-פה", "לא ממש"] },
        { key: "blacklist_how", type: "short",
          label: "איך הסוכן יודע את זה היום?",
          showIf: function (s) { return s.blacklist && s.blacklist !== "לא ממש"; } },
        { key: "new_vs_old", type: "yesno", cols2: true,
          label: "האם הכללים שונים ללקוח חדש לעומת לקוח ותיק?" },
        { key: "new_rules", type: "long", rows: 2,
          label: "מה שונה?",
          showIf: function (s) { return s.new_vs_old === "כן"; } },
        { key: "check_fields", type: "multi", required: true, cols2: true,
          label: "אילו פרטים מהצ׳ק המשרד צריך לרשום היום?",
          help: "למשל להקלדה במערכת או לשובר ההפקדה בבנק.",
          options: ["סכום", "תאריך פירעון", "מספר צ׳ק", "בנק וסניף", "מספר חשבון",
                    "שם המושך (בעל החשבון)", "האם רשום «למוטב בלבד»", "לא רושמים — הבנק סורק"] },
      ],
    },

    /* ======================================================= 5. במשרד */
    {
      id: "office",
      title: "במשרד — מה קורה אחרי הביקור",
      sub: "מהדיווח של הסוכן ועד שהכסף רשום על הלקוח",
      showIf: forRoles(ROLE.fin),
      intro: "מה קורה לדיווח ולצ׳קים כשהם מגיעים למשרד. גם פה — איך זה באמת, לא איך זה אמור להיות.",
      questions: [
        { key: "office_flow", type: "long", required: true, rows: 5,
          label: "מהרגע שהצ׳קים או הדיווח מגיעים מהסוכן ועד שהכסף רשום על הלקוח במערכת — מי עושה מה, לפי הסדר?",
          help: "כולל מי מקליד, מי בודק, מי משייך לחשבוניות, ומי מטפל בבעיות." },
        { key: "office_latency", type: "single", required: true, cols2: true,
          label: "תוך כמה זמן מהביקור המשרד יודע מה נגבה בפועל?",
          options: ["באותו יום", "1–3 ימים", "4–7 ימים", "מעל שבוע"] },
        { key: "system_name", type: "short", required: true,
          label: "באיזו תוכנה מנהלים במשרד את הלקוחות, החשבוניות והחובות?",
          help: "השם שמופיע על המסך כשנכנסים. אם לא בטוחים — צלמו את המסך בשאלה הבאה.",
          example: "פריוריטי, SAP, חשבשבת, Comax, ריווחית" },
        { key: "system_screenshot", type: "file", accept: "image/*,.pdf,application/pdf",
          label: "צילום מסך של «כרטיס לקוח» או «חובות לקוח» במערכת",
          help: "אפשר להסתיר שמות ומספרים. אנחנו רוצים לראות אילו שדות קיימים.",
          fileLabel: "צילום מסך או בחירת קובץ" },
        { key: "export_possible", type: "single", required: true,
          label: "האם מישהו במשרד יודע להוציא מהמערכת לאקסל רשימה של לקוחות עם חוב, חשבוניות פתוחות ותנאי תשלום?",
          options: ["כן — זה קיים ומוציאים באופן קבוע", "כן — אפשר, אבל צריך לבקש ממישהו",
                    "לא בטוח — צריך לבדוק", "לא"] },
        { key: "export_file", type: "file", driveNote: true,
          accept: ".xlsx,.xls,.csv,.pdf,application/pdf",
          label: "אם אפשר — צרפו קובץ אקסל כזה לדוגמה",
          help: "אפשר לשנות שמות ולהשאיר 10 שורות. אנחנו צריכים את מבנה העמודות, לא את הנתונים.",
          fileLabel: "בחירת קובץ" },
        { key: "customer_id", type: "single", cols2: true,
          label: "איך מזהים לקוח במערכת באופן חד-משמעי?",
          options: ["מספר לקוח פנימי", "ח.פ. / מספר עוסק", "לפי שם בלבד", "אחר"] },
        { key: "receipt_issuer", type: "single", required: true,
          label: "מי מפיק ללקוח את הקבלה הרשמית על התשלום, ומאיפה?",
          options: ["המערכת במשרד, אחרי שהתקבול מוקלד", "הסוכן, מפנקס קבלות ידני",
                    "הסוכן, ממכשיר או אפליקציה", "לא מפיקים קבלה בנפרד — רק חשבונית"] },
        { key: "deposit", type: "long", rows: 3,
          label: "מי מפקיד את הצ׳קים בבנק, ואיך מכינים את רשימת ההפקדה?",
          help: "ידנית, מהמערכת, או שהבנק סורק את הצ׳קים." },
        { key: "office_pains", type: "long", required: true, rows: 4,
          label: "מה הכי משתבש היום בצד של המשרד?",
          help: "טעויות הקלדה, צ׳קים בלי שיוך, ויכוחים עם לקוח על תאריכים, עבודה כפולה, צ׳קים שנעלמים." },
        { key: "office_gets", type: "multi", required: true,
          label: "מה המשרד צריך לקבל מהאפליקציה, ומתי?",
          options: ["הודעה מיידית על כל גבייה", "סיכום בסוף היום לכל סוכן", "קובץ אקסל להקלדה או לטעינה למערכת",
                    "תמונות הצ׳קים", "רשימה מוכנה לשובר הפקדה", "התראה על חריגה או צ׳ק חשוד"] },
        { key: "images_keep", type: "single", required: true,
          label: "האם לשמור את תמונות הצ׳קים באפליקציה — ולכמה זמן?",
          options: ["כן, לשמור לתמיד", "כן, עד שהצ׳ק הופקד או נפרע", "רק הנתונים, בלי התמונה",
                    "לא בטוח — צריך לשאול את רואה החשבון"] },
      ],
    },

    /* ============================================== 6. מערכות ומחשוב */
    {
      id: "it",
      title: "מערכות ומחשוב — למי שמכיר",
      sub: "שאלות למי שאחראי על המחשוב או עובד מול ספק התוכנה",
      showIf: forRoles(ROLE.it),
      intro: "אם משהו לא ברור — סמנו «לא יודע/ת». אנחנו נשלים עם ספק התוכנה בשיחה קצרה.",
      questions: [
        { key: "it_system", type: "short", required: true,
          label: "שם המערכת הראשית (ERP) והגרסה, אם ידועה",
          example: "פריוריטי 23 · SAP Business One · חשבשבת" },
        { key: "it_vendor", type: "short",
          label: "מי מתחזק את המערכת — ספק / בית תוכנה, ואיש קשר?" },
        { key: "it_exports", type: "single",
          label: "האם המערכת יכולה להפיק באופן אוטומטי קובץ יומי (אקסל / CSV) עם לקוחות, חובות ותנאי תשלום?",
          options: ["כן — כבר קיים", "אפשר להגדיר", "לא"] },
        { key: "it_import", type: "single",
          label: "האם ניתן לטעון למערכת תקבולים מקובץ, במקום הקלדה ידנית?",
          options: ["כן — עושים זאת היום", "כנראה אפשר, לא ניסינו", "לא"] },
        { key: "it_integration", type: "single",
          label: "האם חיברתם בעבר מערכת חיצונית (אפליקציה, אתר, CRM) למערכת הראשית?",
          options: ["כן — יש חיבור פעיל", "ניסינו בעבר", "מעולם לא"] },
        { key: "it_integration_detail", type: "long", rows: 3,
          label: "מה חובר, ואיך זה עבד?",
          showIf: function (s) { return s.it_integration && s.it_integration !== "מעולם לא"; } },
        { key: "it_m365", type: "single",
          label: "האם העובדים מתחברים עם חשבון חברה של מיקרוסופט (Outlook / Teams) — וגם סוכני השטח?",
          options: ["כן — לכולם, כולל סוכנים", "כן — אבל לא לסוכני השטח", "לא"] },
        { key: "it_policy", type: "long", rows: 3,
          label: "האם יש דרישות אבטחה או נהלים לאפליקציה חיצונית שנוגעת בנתוני לקוחות?",
          help: "למשל: שרתים בישראל בלבד, אישור של מישהו מסוים, איסור על שמירת תמונות, התחברות דרך חשבון החברה." },
        { key: "it_mobile", type: "multi", cols2: true,
          label: "אילו אפליקציות עבודה כבר מותקנות אצל הסוכנים?",
          options: ["אפליקציית הזמנות של המערכת", "CRM", "וואטסאפ עסקי", "מייל ארגוני",
                    "ניהול מכשירים (MDM)", "כלום מעבר לוואטסאפ"] },
        { key: "it_contact", type: "short",
          label: "למי לפנות בשאלות טכניות בהמשך?",
          placeholder: "שם, תפקיד, טלפון או מייל" },
      ],
    },

    /* ===================================== 7. הסוכנים, הטלפונים והשטח */
    {
      id: "phones",
      title: "הסוכנים, הטלפונים והשטח",
      sub: "כדי שהאפליקציה תתאים למי שישתמש בה בפועל",
      showIf: forRoles(ROLE.agent, ROLE.sales),
      questions: [
        { key: "phone_owner", type: "single", required: true, cols2: true,
          label: "הטלפונים של הסוכנים",
          options: ["של החברה", "אישיים", "מעורב"] },
        { key: "phone_os", type: "multi", required: true, cols2: true,
          label: "אנדרואיד או אייפון?",
          options: ["אנדרואיד", "אייפון"] },
        { key: "reception", type: "single", required: true,
          label: "קליטה בחנויות ובמחסנים",
          options: ["כמעט תמיד יש קליטה", "לפעמים אין (מחסנים, מרתפים, קניונים)", "הרבה פעמים אין"] },
        { key: "languages", type: "multi", cols2: true,
          label: "באילו שפות מדברים הסוכנים ובעלי החנויות?",
          options: ["עברית", "ערבית", "רוסית", "אנגלית", "אחר"] },
        { key: "tech_comfort", type: "single", required: true,
          label: "כמה הסוכנים «חברים» של הטלפון?",
          options: ["מאוד — משתמשים באפליקציות בלי בעיה", "בסדר — וואטסאפ ו-Waze", "חלק יתקשו",
                    "מאוד משתנה בין סוכנים"] },
        { key: "handwriting", type: "single", required: true,
          label: "הצ׳קים שמקבלים — בכתב יד או מודפסים?",
          options: ["רובם בכתב יד", "רובם מודפסים (מהמחשב או מהבנק)", "חצי-חצי"] },
        { key: "other_scripts", type: "yesno", cols2: true,
          label: "האם יש צ׳קים עם כתב יד בשפות אחרות, למשל ערבית או רוסית?" },
        { key: "agent_apps", type: "multi", cols2: true,
          label: "באילו אפליקציות הסוכנים עובדים היום?",
          options: ["וואטסאפ", "אפליקציית הזמנות של החברה", "אקסל / גוגל שיטס", "מייל של החברה",
                    "Waze / ניווט", "מחשבון", "אחר"] },
        { key: "agent_wish", type: "long", rows: 3,
          label: "אם האפליקציה הייתה חוסכת לסוכן דבר אחד ביום — מה זה היה?" },
        { key: "agent_fear", type: "long", rows: 3,
          label: "מה יגרום לסוכנים לא להשתמש באפליקציה?",
          help: "בכנות — מה הם יגידו עליה בינם לבין עצמם." },
      ],
    },

    /* ============================== 8. מה האפליקציה צריכה להציג ולהפיק */
    {
      id: "outputs",
      title: "מה האפליקציה צריכה להציג, להתריע ולהפיק",
      sub: "דמיינו אותה ביד של הסוכן",
      showIf: forRoles(ROLE.mgmt),
      intro: "דמיינו את האפליקציה ביד של הסוכן. מה חייב להיות שם — ומה חייב להגיע למשרד.",
      questions: [
        { key: "show_fields", type: "multi", required: true,
          label: "מה הסוכן צריך לראות על הלקוח כשהוא פותח אותו באפליקציה?",
          options: ["יתרת חוב כוללת", "רשימת חשבוניות פתוחות עם תאריכים", "תנאי האשראי של הלקוח",
                    "מסגרת האשראי והמרחק ממנה", "היסטוריית תשלומים", "צ׳קים שחזרו בעבר",
                    "הערות מהמשרד («רק מזומן», «לא לקחת צד שלישי»)", "פרטי קשר של הלקוח", "אחר"] },
        { key: "breach_behavior", type: "single", required: true,
          label: "כשהערימה שהסוכן סרק חורגת מהתנאים — מה האפליקציה צריכה לעשות?",
          options: ["להציע פתרון (כמה מזומן להשלים / איזה צ׳ק להחליף) ולתת לסוכן להחליט",
                    "לשלוח בקשת אישור למנהל ולחכות לתשובה בתוך האפליקציה",
                    "רק להזהיר, ולרשום שהייתה חריגה",
                    "לחסום — אי אפשר לסגור ביקור עם חריגה"] },
        { key: "customer_gets", type: "multi", required: true, cols2: true,
          label: "מה הלקוח צריך לקבל ברגע התשלום?",
          options: ["אישור / סיכום בוואטסאפ", "אישור במייל", "הדפסה", "כלום — הקבלה הרשמית תגיע מהמשרד"] },
        { key: "office_format", type: "multi", cols2: true,
          label: "באיזו צורה נוח למשרד לקבל את המידע מהאפליקציה?",
          options: ["מייל", "וואטסאפ", "אקסל", "מסך ניהול באינטרנט", "ישירות לתוך המערכת הראשית"] },
        { key: "admin_access", type: "multi", required: true,
          label: "מי צריך גישה למסך ניהול — לראות את כל הביקורים והגבייה?",
          options: ["מנהל/ת הגבייה", "מנהל/ת מכירות", "הנהלה", "הנהלת חשבונות / רואה חשבון",
                    "כל סוכן רואה רק את עצמו"] },
        { key: "alerts", type: "multi",
          label: "על מה ולמי כדאי שיישלחו התראות?",
          options: ["חריגה מתנאי אשראי — למנהל", "לקוח מתקרב למסגרת — לסוכן, לפני הביקור",
                    "צ׳ק של צד שלישי — למשרד", "סוכן שלא דיווח עד סוף היום", "לא צריך התראות בהתחלה"] },
        { key: "reports", type: "long", rows: 3,
          label: "איזה דוח הייתם רוצים לראות כל שבוע, שהיום אין לכם?" },
        { key: "extra_wish", type: "long", rows: 3,
          label: "אם האפליקציה הייתה עושה עוד דבר אחד מחוץ לגבייה — מה?" },
      ],
    },

    /* ====================================================== 9. לסיום */
    {
      id: "end",
      title: "לסיום",
      sub: "שתי דקות אחרונות",
      showIf: function (s) { return Array.isArray(s.roles) && s.roles.length > 0; },
      questions: [
        { key: "more_people", type: "long", rows: 3,
          label: "עם מי עוד כדאי שנדבר, ועל מה?",
          placeholder: "שם ותפקיד" },
        { key: "anything_else", type: "long", rows: 3,
          label: "מה חשוב שנדע — ולא שאלנו?" },
        { key: "call_ok", type: "single",
          label: "אם נצטרך הבהרה קטנה — איך נוח לך?",
          options: ["שיחה של 10 דקות", "שאלה בוואטסאפ", "דרך איש הקשר של הפרויקט"] },
      ],
    },
  ],
};

/* ---------------------------------------------------------------------------
   Meeting mode — app-spec.html?mode=meeting

   Meir shares his screen on Zoom and types while the client's people talk.
   Chapters follow the meeting agenda (the agent first, so nobody "corrects"
   him; finance next; management last), no role step, nothing required, a
   notes field per chapter, and hints on who answers and for how long.
   --------------------------------------------------------------------------- */

const MEETING_AGENDA = [
  { id: "visit",   who: "הסוכן/ת — כולם מקשיבים, לא מתקנים", minutes: 15 },
  { id: "phones",  who: "הסוכן/ת (ואז הסוכן יכול ללכת)",        minutes: 5 },
  { id: "terms",   who: "ליאת ורז — לעצור על הדוגמה המספרית",  minutes: 15 },
  { id: "checks",  who: "ליאת ורז",                              minutes: 10 },
  { id: "office",  who: "ליאת — עם האקסל פתוח על המסך",         minutes: 15 },
  { id: "outputs", who: "רז (הנהלה)",                            minutes: 10 },
  { id: "it",      who: "מחשוב — או רק לקבל שם וטלפון",         minutes: 5 },
  { id: "big",     who: "רז / הנהלה",                            minutes: 5 },
  { id: "end",     who: "כולם",                                  minutes: 5 },
];

function applyMeetingMode(form) {
  const byId = {};
  form.sections.forEach(function (s) { byId[s.id] = s; });

  form.sections = MEETING_AGENDA.map(function (item, i) {
    const s = byId[item.id];
    if (!s) throw new Error("meeting agenda references unknown section: " + item.id);
    s.showIf = undefined; // every chapter, in agenda order
    s.who = item.who;
    s.minutes = item.minutes;
    s.questions = s.questions.concat([
      { key: "notes_" + item.id, type: "long", rows: 2, allowUnknown: false,
        label: "הערות מהפגישה לפרק הזה (לא חובה)",
        placeholder: "דברים שנאמרו ולא התאימו לאף שאלה, מי אמר, מה לברר" },
    ]);
    return s;
  });

  form.storageKey = "app_spec_meeting";
  form.meeting = true;
  form.skipRequired = true;
  form.jumpMenu = true;
  form.unknownLabel = "לא ידוע בפגישה · לברר אחר כך";
  form.unknownOnLabel = "✓ סומן «לברר אחר כך» — לחיצה לביטול";
  form.metaTitle = "פרטי הפגישה";
  form.metaSub = "שתי שורות ואפשר להתחיל";
  form.metaQuestions = [
    { key: "filledBy", type: "short", label: "מנחה הפגישה", allowUnknown: false },
    { key: "clientContact", type: "short", allowUnknown: false,
      label: "מי משתתף בפגישה (שמות ותפקידים)",
      placeholder: "ליאת (גבייה), רז (כספים), שם הסוכן, IT" },
  ];
  form.initialState = { filledBy: "מאיר לביא", roleTitle: "מנחה הפגישה" };
  form.renderOverview = function (sections, state, el) {
    const box = el("div", { class: "overview" });
    const total = sections.reduce(function (n, s) { return n + (s.minutes || 0); }, 0);
    box.append(el("h4", {}, "סדר הפגישה"));
    box.append(el("p", {}, `${sections.length} פרקים · כ־${total} דקות · אפשר לקפוץ בין פרקים מהתפריט למעלה · שמירת עותק בכל רגע מהקישור למטה.`));
    const ul = el("ul", { class: "agenda" });
    sections.forEach(function (s, i) {
      ul.append(el("li", {}, el("span", {}, `${i + 1}. ${s.title}`), el("span", {}, `${s.who ? s.who.split(" — ")[0] : ""} · ${s.minutes} דק׳`)));
    });
    box.append(ul);
    return box;
  };
  return form;
}

/* ---------------------------------------------------------------------------
   CFO mode — app-spec.html?for=cfo

   One person (the client's CFO) is the single source for the whole spec, so he
   gets every chapter and every question. No role step, his name and title
   pre-filled, chapters ordered by what a CFO knows best (finance first, the
   field last) with intros that make «לא יודע/ת» an easy way through.
   --------------------------------------------------------------------------- */

/* Short CFO path (~20 min). Dropped questions are duplicates of another
   chapter, decisions we make ourselves, or better asked in the follow-up call —
   the list lives in Meir's internal notes so nothing is lost. */
const CFO_PLAN = [
  { id: "terms" },
  { id: "checks", drop: ["third_party_share", "blacklist_how", "new_vs_old", "new_rules", "bounced"] },
  { id: "office", drop: ["deposit", "office_pains"] },
  { id: "it", title: "מערכות — בקצרה",
    intro: "רק ארבע שאלות. אם משהו טכני מדי — «לא יודע/ת», ותן לנו שם של מי שמכיר.",
    drop: ["it_system", "it_vendor", "it_exports", "it_integration_detail", "it_policy", "it_mobile"] },
  { id: "outputs", drop: ["reports", "extra_wish"] },
  { id: "big", drop: ["pilot_scope", "past_attempts", "goal_success"],
    override: { scope_teams: { type: "short", rows: undefined,
      example: "סוכני הפרטיות מול חנויות חשמל, סוכנים מוסדיים" } } },
  { id: "visit",
    intro: "הביקור אצל הלקוח, כפי שאתה מכיר אותו. אם אינך בטוח בפרט מסוים — «לא יודע/ת», ואנחנו נאמת מול סוכן בשיחה קצרה.",
    drop: ["visit_pains", "gives_customer", "visit_time"],
    override: { visit_story: { required: false, rows: 4 } } },
  { id: "phones", intro: "תשובה משוערת עדיפה על «לא יודע/ת».",
    drop: ["agent_apps", "agent_wish", "agent_fear"] },
  { id: "end", drop: ["more_people", "call_ok"] },
];

/** Rough minutes: open text is what takes time, choices are quick. */
function estimateMinutes(questions) {
  const secs = questions.reduce(function (t, q) {
    if (q.type === "long") return t + 75;
    if (q.type === "short") return t + 25;
    if (q.type === "file") return t + 30;
    return t + 15;
  }, 0);
  return Math.max(5, Math.round(secs / 60 / 5) * 5);
}

function applyCfoMode(form, person) {
  person = person || { name: "רז שוורץ", title: "סמנכ\"ל כספים" };
  const byId = {};
  form.sections.forEach(function (s) { byId[s.id] = s; });
  form.sections = CFO_PLAN.map(function (item) {
    const base = byId[item.id];
    if (!base) throw new Error("cfo plan references unknown section: " + item.id);
    const drop = item.drop || [];
    drop.forEach(function (k) {
      if (!base.questions.some(function (q) { return q.key === k; }))
        throw new Error("cfo plan drops unknown question: " + item.id + "." + k);
    });
    const questions = base.questions
      .filter(function (q) { return drop.indexOf(q.key) === -1; })
      .map(function (q) {
        const o = item.override && item.override[q.key];
        return o ? Object.assign({}, q, o) : q;
      });
    return { id: base.id, title: item.title || base.title, sub: base.sub, intro: item.intro || base.intro, questions: questions };
  });

  form.storageKey = "app_spec_cfo";
  form.bodyClass = "cfo";
  form.metaTitle = "פרטים";
  form.metaSub = "ממולא מראש — רק לאשר ולהמשיך";
  form.metaQuestions = [
    { key: "filledBy", type: "short", label: "שם", required: true, allowUnknown: false },
    { key: "roleTitle", type: "short", label: "תפקיד", required: true, allowUnknown: false },
    { key: "clientContact", type: "short", allowUnknown: false,
      label: "טלפון או מייל לשאלת השלמה קצרה (לא חובה)" },
  ];
  form.initialState = { filledBy: person.name, roleTitle: person.title };
  form.renderOverview = function (sections, state, el) {
    const box = el("div", { class: "overview" });
    const count = sections.reduce(function (n, s) {
      return n + s.questions.filter(function (q) { return typeof q.showIf !== "function" || q.showIf(state); }).length;
    }, 0);
    box.append(el("h4", {}, "מה בשאלון"));
    const visible = sections.flatMap(function (s) {
      return s.questions.filter(function (q) { return typeof q.showIf !== "function" || q.showIf(state); });
    });
    box.append(el("p", {}, `${sections.length} פרקים · ${count} שאלות, רובן בחירה בלחיצה · ${estimateMinutes(visible) - 5}–${estimateMinutes(visible)} דקות. אפשר לעצור ולחזור — התשובות נשמרות במכשיר.`));
    const ol = el("ol", {});
    sections.forEach(function (s) { ol.append(el("li", {}, s.title)); });
    box.append(ol);
    return box;
  };
  return form;
}

if (typeof location !== "undefined") {
  if (/[?&]mode=meeting(&|$)/.test(location.search)) applyMeetingMode(FORM);
  else if (/[?&]for=cfo(&|$)/.test(location.search)) applyCfoMode(FORM);
}
if (typeof document !== "undefined") buildForm(FORM);
if (typeof module !== "undefined") module.exports = { FORM, ROLE, ROLE_ALL, applyMeetingMode, MEETING_AGENDA, applyCfoMode, CFO_PLAN, estimateMinutes };
