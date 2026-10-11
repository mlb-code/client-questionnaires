/* ---------------------------------------------------------------------------
   שאלון מוצר — סרטון הדרכת התקנה (ניופאן: סמסונג / האייר).

   Filled once per product by the brand's contact person. Short on purpose:
   the video is built from the photos + captions and the manual, so the
   questions only cover what those cannot tell us (audience, scope, warnings,
   the mistakes people make, approvals).
   --------------------------------------------------------------------------- */

const MAX_STEPS = 15;

function stepAnswered(state, key) {
  const t = state[key];
  return (typeof t === "string" && t.trim() !== "") || (state["__n_" + key] || 0) > 0;
}

function photoSteps() {
  const list = [];
  for (let i = 1; i <= MAX_STEPS; i++) {
    const key = "step_" + String(i).padStart(2, "0");
    const prev = "step_" + String(i - 1).padStart(2, "0");
    list.push({
      key: key,
      type: "photostep",
      label: "שלב " + i,
      required: i === 1,
      filePrefix: "שלב-" + String(i).padStart(2, "0"),
      fileLabel: i === 1 ? "צילום או בחירת תמונה" : "צילום או בחירת תמונה (עד 3)",
      accept: "image/*",
      help: i === 1 ? "למשל: «מוציאים את המקרר מהקרטון ומסירים את סרטי ההדבקה מהדלתות»." : undefined,
      // Step N appears once step N-1 has a photo or a caption.
      showIf: i === 1 ? undefined : function (s) { return stepAnswered(s, prev); },
    });
  }
  return list;
}

const BRAND_FORM = { "סמסונג": "video_samsung", "האייר": "video_haier" };

const FORM = {
  storageKey: "install_video",
  title: "שאלון מוצר — סרטון הדרכת התקנה",
  submitLabel: "שליחת השאלון והתמונות",
  nextLabel: "לשלב הבא",
  hasConditionals: true,
  wizard: true,
  maxTotalBytes: 30 * 1024 * 1024,
  resolveFormId: function (state) { return BRAND_FORM[state.brand] || "video_samsung"; },

  metaTitle: "פרטים",
  metaSub: "מי ממלא, ועל איזה מוצר",
  metaQuestions: [
    { key: "filledBy", type: "short", label: "שם מלא", required: true },
    { key: "roleTitle", type: "short", label: "תפקיד", placeholder: "למשל: מנהל מוצר, מנהל שירות" },
    { key: "clientContact", type: "short", label: "טלפון לשאלת השלמה קצרה",
      placeholder: "050-0000000", inputmode: "tel" },
    { key: "brand", type: "single", required: true, cols2: true,
      label: "על איזה מותג הסרטון?",
      help: "ממלאים את השאלון פעם אחת לכל מוצר.",
      options: ["סמסונג", "האייר"] },
  ],

  renderOverview: function (sections, state, el) {
    const box = el("div", { class: "overview" });
    box.append(el("h4", {}, "מה צריך להכין"));
    box.append(el("p", {}, "בערך 15 דקות, ועוד זמן הצילום. התשובות נשמרות במכשיר — אפשר לצלם, לעצור ולחזור."));
    const ul = el("ol", {});
    ["המוצר ומה בדיוק הסרטון מלמד",
     "למי הסרטון ואיפה יוצג",
     "אזהרות וטעויות נפוצות",
     "שלבי ההתקנה בתמונות — תמונה ומשפט לכל שלב",
     "חוברת ההדרכה (קובץ PDF או קישור)"].forEach(function (t) { ul.append(el("li", {}, t)); });
    box.append(ul);
    return box;
  },

  sections: [

    /* ======================================================= 1. המוצר */
    {
      id: "product",
      title: "המוצר",
      sub: "על מה הסרטון",
      questions: [
        { key: "model", type: "short", required: true,
          label: "שם הדגם המדויק",
          help: "כפי שמופיע על המדבקה שעל המוצר או על הקרטון.",
          placeholder: "למשל: RF65DG960ESR" },
        { key: "category", type: "single", required: true, cols2: true,
          label: "סוג המוצר",
          options: ["מקרר", "מכונת כביסה", "מייבש כביסה", "מדיח כלים", "מזגן", "תנור / כיריים",
                    "טלוויזיה", "שואב אבק", "אחר"] },
        { key: "category_other", type: "short", label: "איזה מוצר?",
          showIf: function (s) { return s.category === "אחר"; } },
        { key: "product_photos", type: "file", required: true, compress: true, accept: "image/*",
          label: "צילום של המוצר השלם, וצילום של מדבקת הדגם",
          fileLabel: "צילום או בחירת תמונות",
          filePrefix: "00-מוצר" },
        { key: "scope", type: "long", required: true, rows: 3,
          label: "מה בדיוק הסרטון צריך ללמד? מאיפה הוא מתחיל ואיפה הוא נגמר?",
          help: "כמה שיותר מדויק. סרטון אחד = תהליך אחד.",
          example: "מהרגע שהמקרר יוצא מהקרטון ועד שמחברים את קו המים ובודקים שאין נזילה" },
        { key: "out_of_scope", type: "long", rows: 2,
          label: "יש משהו שחשוב שלא יופיע בסרטון?",
          help: "למשל: פעולה שמותרת רק לטכנאי מוסמך, או דגם אחר שנראה דומה." },
      ],
    },

    /* ================================================== 2. קהל ופרסום */
    {
      id: "audience",
      title: "למי הסרטון, ואיפה יוצג",
      sub: "זה קובע את השפה, הקצב והאורך",
      questions: [
        { key: "viewer", type: "multi", required: true,
          label: "מי יצפה בסרטון?",
          options: ["לקוח בבית, שמתקין לבד", "טכנאי או מתקין מטעמכם", "מתקין של חנות / משווק",
                    "אנשי מכירות בחנויות", "צוות שירות לקוחות"] },
        { key: "where", type: "multi", required: true, cols2: true,
          label: "איפה הסרטון יוצג?",
          options: ["יוטיוב", "אתר החברה", "QR על הקרטון או בחוברת", "וואטסאפ ללקוחות אחרי רכישה",
                    "רשתות חברתיות", "הדרכה פנימית"] },
        { key: "length", type: "single", required: true, cols2: true,
          label: "אורך רצוי",
          options: ["עד דקה", "1–3 דקות", "3–5 דקות", "כמה שצריך כדי שיהיה ברור"] },
        { key: "format", type: "single", cols2: true,
          label: "מסך רוחב או לאורך?",
          options: ["רוחב (יוטיוב, אתר)", "לאורך (טלפון, רשתות)", "שניהם"] },
        { key: "language", type: "multi", required: true, cols2: true,
          label: "שפה",
          options: ["קריינות בעברית", "כתוביות בעברית", "כתוביות בערבית", "כתוביות ברוסית",
                    "בלי קריינות — רק טקסט על המסך"] },
        { key: "example_video", type: "short",
          label: "סרטון שאהבתם ושכדאי שנכיר (קישור)",
          help: "שלחתם לנו את סרטון ההתקנה של LG. יש עוד דוגמה, או משהו שלא אהבתם בה?" },
      ],
    },

    /* =========================================== 3. אזהרות וטעויות */
    {
      id: "safety",
      title: "אזהרות וטעויות נפוצות",
      sub: "מה שהחוברת לא מספרת",
      intro: "החלק הזה הוא מה שהופך סרטון התקנה לטוב באמת: מה אנשים עושים לא נכון, ומה חייב להיאמר.",
      questions: [
        { key: "mistakes", type: "long", required: true, rows: 4,
          label: "מה הטעויות הנפוצות בהתקנה של המוצר הזה, שמגיעות אחר כך לשירות?",
          example: "לא מוציאים את ברגי ההובלה · לא מחכים 4 שעות לפני הפעלת מקרר · מהדקים חזק מדי את צינור המים" },
        { key: "warnings", type: "long", required: true, rows: 3,
          label: "אזהרות בטיחות שחייבות להופיע בסרטון",
          help: "חשמל, גז, משקל, הרמה בשני אנשים, מים." },
        { key: "tools", type: "multi", cols2: true,
          label: "אילו כלים צריך להתקנה?",
          options: ["מברג פיליפס", "מברג שטוח", "מפתח שוודי / ברגים", "פלס", "מקדחה",
                    "סכין חיתוך", "מטלית / דלי", "לא צריך כלים"] },
        { key: "tools_other", type: "short", label: "כלים או חלקים נוספים",
          placeholder: "למשל: ערכת חיבור מים שמגיעה בקרטון" },
        { key: "certified_only", type: "yesno", cols2: true,
          label: "האם חלק מההתקנה מותר רק לטכנאי מוסמך?" },
        { key: "certified_detail", type: "short", label: "איזה חלק?",
          showIf: function (s) { return s.certified_only === "כן"; } },
      ],
    },

    /* ============================================== 4. שלבים בתמונות */
    {
      id: "steps",
      title: "שלבי ההתקנה בתמונות",
      sub: "תמונה ומשפט לכל שלב, לפי הסדר",
      intro: "צלמו כל שלב בהתקנה לפי הסדר — אפשר מהטלפון, ישר מכאן. ליד כל תמונה כתבו במשפט אחד מה רואים ומה עושים. אחרי שמסיימים שלב, נפתח השלב הבא. אין צורך בצילום מקצועי — העיקר שרואים את הפרטים.",
      questions: photoSteps(),
    },

    /* ======================================================= 5. חומרים */
    {
      id: "materials",
      title: "חוברת הדרכה ואישורים",
      sub: "כמעט סיימנו",
      questions: [
        { key: "manual_file", type: "file", accept: ".pdf,application/pdf,image/*",
          label: "חוברת ההדרכה הדיגיטלית (PDF)",
          help: "אם הקובץ גדול מ-20MB — הדביקו קישור בשאלה הבאה במקום.",
          fileLabel: "בחירת קובץ PDF",
          filePrefix: "חוברת" },
        { key: "manual_link", type: "short",
          label: "או: קישור לחוברת ההדרכה",
          placeholder: "קישור לאתר היצרן, לדרייב או לוואטרנספר" },
        { key: "brand_assets", type: "file", compress: true, accept: "image/*,.pdf,.svg,.ai,.eps",
          label: "לוגו או הנחיות מיתוג (אם יש)",
          help: "סמסונג והאייר מקפידים על המיתוג. אם יש הנחיות לשימוש בלוגו, בצבעים או בפונטים — צרפו כאן.",
          filePrefix: "מיתוג" },
        { key: "approver", type: "short", required: true,
          label: "מי מאשר את הסרטון לפני פרסום?",
          placeholder: "שם ותפקיד" },
        { key: "deadline", type: "date",
          label: "עד מתי תרצו את הסרטון?" },
        { key: "anything_else", type: "long", rows: 3,
          label: "עוד משהו שחשוב שנדע?" },
      ],
    },
  ],
};

if (typeof document !== "undefined") buildForm(FORM);
if (typeof module !== "undefined") module.exports = { FORM, MAX_STEPS, stepAnswered };
