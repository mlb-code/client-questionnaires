/* ---------------------------------------------------------------------------
   שאלון מוצר — סרטון הדרכת התקנה (ניופאן: סמסונג / האייר).

   Filled once per product by the brand's contact person. Short on purpose:
   the video is built from the photos + captions and the manual, so the
   questions only cover what those cannot tell us (audience, scope, warnings,
   the mistakes people make, approvals).
   --------------------------------------------------------------------------- */

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
    { key: "clientContact", type: "short", label: "טלפון", placeholder: "050-0000000", inputmode: "tel" },
    { key: "brand", type: "single", required: true, cols2: true,
      label: "על איזה מותג הסרטון?",
      help: "ממלאים את השאלון פעם אחת לכל מוצר.",
      options: ["סמסונג", "האייר"] },
  ],

  renderOverview: function (sections, state, el) {
    const box = el("div", { class: "overview" });
    box.append(el("h4", {}, "4 עמודים קצרים"));
    box.append(el("p", {}, "כ־10 דקות, ועוד זמן הצילום. התשובות נשמרות במכשיר — אפשר לצלם, לעצור ולחזור."));
    const ol = el("ol", {});
    sections.forEach(function (s) { ol.append(el("li", {}, s.title)); });
    box.append(ol);
    return box;
  },

  sections: [

    /* ============================================ 1. המוצר והסרטון */
    {
      id: "product",
      title: "המוצר והסרטון",
      sub: "על מה הסרטון ולמי",
      questions: [
        { key: "model", type: "short", required: true,
          label: "שם הדגם המדויק",
          help: "כפי שמופיע על המדבקה שעל המוצר או על הקרטון.",
          placeholder: "למשל: RF65DG960ESR" },
        { key: "product_photos", type: "file", compress: true, accept: "image/*",
          label: "צילום של המוצר השלם, וצילום של מדבקת הדגם",
          fileLabel: "צילום או בחירת תמונות",
          filePrefix: "00-מוצר" },
        { key: "scope", type: "long", rows: 3,
          label: "מה בדיוק הסרטון צריך ללמד? מאיפה מתחיל ואיפה נגמר?",
          example: "מהרגע שהמקרר יוצא מהקרטון ועד שמחברים את קו המים ובודקים שאין נזילה" },
        { key: "viewer", type: "multi", cols2: true,
          label: "מי יצפה בסרטון?",
          options: ["לקוח בבית", "טכנאי / מתקין", "אנשי מכירות", "שירות לקוחות"] },
        { key: "where", type: "multi", cols2: true,
          label: "איפה הסרטון יוצג?",
          options: ["יוטיוב / אתר", "QR על הקרטון", "וואטסאפ ללקוחות", "רשתות חברתיות", "הדרכה פנימית"] },
        { key: "language", type: "multi", cols2: true,
          label: "קריינות",
          help: "אפשר לבחור יותר מאחד.",
          options: ["קריינות באנגלית", "רק טקסט על המסך", "לא משנה לנו"] },
      ],
    },

    /* ============================================== 2. חשוב לדעת */
    {
      id: "safety",
      title: "מה שהחוברת לא מספרת",
      sub: "שתי שאלות",
      questions: [
        { key: "mistakes", type: "long", rows: 4,
          label: "מה הטעויות הנפוצות בהתקנה של המוצר הזה?",
          help: "הדברים שאנשים עושים לא נכון ומגיעים אחר כך לשירות.",
          example: "לא מוציאים את ברגי ההובלה · מפעילים מקרר לפני שעברו 4 שעות" },
        { key: "warnings", type: "long", rows: 3,
          label: "אזהרות שחייבות להופיע בסרטון",
          help: "בטיחות (חשמל, משקל, מים), או שלב שמותר רק לטכנאי מוסמך." },
      ],
    },

    /* ============================================== 3. תמונות והסבר */
    {
      id: "steps",
      title: "תמונות ההתקנה",
      sub: "כל התמונות בבת אחת, והסבר אחד",
      intro: "צלמו את שלבי ההתקנה לפי הסדר, והעלו את כל התמונות כאן בבת אחת. אחר כך כתבו בכמה שורות מה עושים, לפי הסדר. לא צריך צילום מקצועי — העיקר שרואים את הפרטים.",
      questions: [
        { key: "install_photos", type: "file", compress: true, accept: "image/*", maxFiles: 30,
          label: "תמונות ההתקנה",
          help: "אפשר לבחור כמה תמונות ביחד מהגלריה. עד 30 תמונות.",
          fileLabel: "בחירת תמונות מהגלריה או צילום",
          filePrefix: "התקנה" },
        { key: "install_steps", type: "long", rows: 8,
          label: "השלבים, לפי הסדר",
          help: "שורה לכל שלב. אם נוח, ציינו ליד השלב איזו תמונה מראה אותו.",
          placeholder: "1. מוציאים את המקרר מהקרטון ומסירים את סרטי ההדבקה\n2. מסירים את ברגי ההובלה מהגב (תמונה 3)\n3. ..." },
      ],
    },

    /* ======================================================= 4. חוברת */
    {
      id: "materials",
      title: "חוברת ההדרכה",
      sub: "וסיימנו",
      questions: [
        { key: "manual_file", type: "file", accept: ".pdf,application/pdf,image/*",
          label: "חוברת ההדרכה הדיגיטלית (PDF)",
          help: "קובץ גדול מ-20MB? הדביקו קישור בשאלה הבאה במקום.",
          fileLabel: "בחירת קובץ PDF",
          filePrefix: "חוברת" },
        { key: "manual_link", type: "short",
          label: "או: קישור לחוברת",
          placeholder: "קישור לאתר היצרן או לדרייב" },
        { key: "approver", type: "short",
          label: "מי מאשר את הסרטון לפני פרסום?",
          placeholder: "שם ותפקיד" },
      ],
    },
  ],
};

if (typeof document !== "undefined") buildForm(FORM);
if (typeof module !== "undefined") module.exports = { FORM };
