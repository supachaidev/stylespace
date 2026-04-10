/**
 * i18n.ts — Internationalization (Thai / English)
 * ==================================================
 *
 * This module handles all text localization for the StyleSpace app.
 * It supports two languages:
 *   - Thai (th) — default language
 *   - English (en) — fallback language
 *
 * How it works:
 *   - All UI strings are stored in the UI_STRINGS dictionary below
 *   - The `t(key)` function returns the string for the current language
 *   - When the language changes, all registered listeners are notified
 *     so the UI can re-render with the new language
 *
 * Usage in other modules:
 *   import { t, getLang, setLang, onLangChange } from './i18n';
 *
 *   // Get a translated string
 *   const title = t('header.title');  // "StyleSpace"
 *
 *   // Switch language
 *   setLang('en');
 *
 *   // React to language changes
 *   onLangChange(() => { refreshUI(); });
 *
 * String interpolation:
 *   Some strings contain {placeholders} that must be replaced manually:
 *   t('quiz.step').replace('{current}', '3').replace('{total}', '6')
 *
 * Quiz strings are exported separately as QUIZ_I18N because they have
 * a different structure (arrays of questions/options) than the flat
 * key-value UI_STRINGS dictionary.
 */

// ─── Type & State ───────────────────────────────────────────────────────────

/** Supported languages */
export type Lang = 'en' | 'th';

/** Current active language — defaults to Thai */
let currentLang: Lang = 'th';

/** Listener functions called whenever the language changes */
const listeners: Array<() => void> = [];


// ─── Public API ─────────────────────────────────────────────────────────────

/** Get the current active language */
export function getLang(): Lang {
  return currentLang;
}

/**
 * Switch the active language and notify all listeners.
 * Also updates the <html lang="..."> attribute for accessibility.
 */
export function setLang(lang: Lang): void {
  currentLang = lang;
  document.documentElement.lang = lang;
  // Notify all registered listeners (e.g., main.ts refreshCurrentView)
  for (const fn of listeners) fn();
}

/**
 * Register a callback to be called whenever the language changes.
 * Used by main.ts to refresh all visible UI text.
 */
export function onLangChange(fn: () => void): void {
  listeners.push(fn);
}

/**
 * Translate a key to the current language's string.
 *
 * Lookup order:
 *   1. Current language (th or en)
 *   2. English fallback (if key exists but current lang is missing)
 *   3. The raw key itself (if key doesn't exist at all — useful for debugging)
 */
export function t(key: string): string {
  return UI_STRINGS[key]?.[currentLang] ?? UI_STRINGS[key]?.en ?? key;
}


// ─── UI String Dictionary ───────────────────────────────────────────────────
//
// All user-facing text in both languages. Organized by feature area.
// Keys use dot notation: "section.element" (e.g., "header.title").

const UI_STRINGS: Record<string, Record<Lang, string>> = {

  // ── Header ──
  'header.title': { en: 'StyleSpace', th: 'StyleSpace' },
  'header.tagline': { en: 'Upload your floor plan. Explore interior styles instantly.', th: 'อัปโหลดแปลนห้อง แล้วสำรวจสไตล์การตกแต่งได้ทันที' },

  // ── Upload Section ──
  'upload.title': { en: 'Drop your floor plan here', th: 'วางแปลนห้องของคุณที่นี่' },
  'upload.subtitle': { en: 'or click to browse \u00B7 JPG, PNG', th: 'หรือคลิกเพื่อเลือกไฟล์ \u00B7 JPG, PNG' },

  // ── Loading States ──
  // These are shown during API calls with different messages per stage
  'loading.analyzing': { en: 'Analyzing your floor plan...', th: 'กำลังวิเคราะห์แปลนห้อง...' },
  'loading.analyzing.sub': { en: 'Identifying rooms and layout', th: 'กำลังระบุห้องและผังพื้นที่' },
  'loading.generating': { en: 'Generating your personalized render...', th: 'กำลังสร้างภาพตามสไตล์ของคุณ...' },
  'loading.restyling': { en: 'Restyling the base render', th: 'กำลังปรับสไตล์ใหม่' },
  'loading.regenerating': { en: 'This may take a moment', th: 'รอสักครู่นะ' },

  // ── Error Messages ──
  'error.upload': { en: 'Please upload an image file (JPG, PNG, etc.)', th: 'กรุณาอัปโหลดไฟล์รูปภาพ (JPG, PNG)' },
  'error.server': { en: 'Could not reach the server. Is the backend running?', th: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่' },
  'error.render': { en: 'Render failed. Please try again.', th: 'สร้างภาพไม่สำเร็จ กรุณาลองใหม่' },
  'error.restyle': { en: 'Restyle failed. Please try again.', th: 'เปลี่ยนสไตล์ไม่สำเร็จ กรุณาลองใหม่' },

  // ── Button Labels ──
  'btn.tryAgain': { en: 'Try Again', th: 'ลองใหม่' },
  'btn.skipQuiz': { en: 'Skip quiz \u2192 Browse all styles', th: 'ข้ามแบบสอบถาม \u2192 ดูสไตล์ทั้งหมด' },
  'btn.retakeQuiz': { en: 'Retake Quiz', th: 'ทำแบบสอบถามใหม่' },
  'btn.uploadNew': { en: 'Upload New Image', th: 'อัปโหลดรูปใหม่' },
  'btn.regenerate': { en: 'Regenerate', th: 'สร้างใหม่' },
  'btn.tryAnother': { en: 'Try Another Style', th: 'ลองสไตล์อื่น' },
  'btn.home': { en: 'Home', th: 'หน้าแรก' },

  // ── Quiz ──
  // {current} and {total} are replaced at runtime (e.g., "Question 3 of 6")
  'quiz.step': { en: 'Question {current} of {total}', th: 'คำถามที่ {current} จาก {total}' },

  // ── Style Picker ──
  'styles.title': { en: 'Choose a Style', th: 'เลือกสไตล์ที่ชอบ' },
  'styles.rooms': { en: '{count} rooms detected: {list}', th: 'พบ {count} ห้อง: {list}' },
  'styles.madeForYou': { en: 'Made for You', th: 'ออกแบบให้คุณ' },
  'styles.match': { en: '{pct}% match', th: 'ตรง {pct}%' },

  // ── Result Section ──
  'result.products': { en: 'Recommended SCG Products', th: 'สินค้า SCG แนะนำ' },

  // ── Custom Style Card ──
  'custom.label': { en: 'Your Custom Style', th: 'สไตล์เฉพาะของคุณ' },
  'custom.desc': { en: 'Personalized design based on your quiz answers', th: 'การออกแบบเฉพาะตัว จากคำตอบของคุณ' },

  // ── Style Preset Names & Descriptions ──
  'style.modern-minimal': { en: 'Modern Minimal', th: 'โมเดิร์นมินิมอล' },
  'style.modern-minimal.desc': { en: 'Clean lines, neutral palette, open spaces', th: 'เรียบง่าย โทนสีกลาง พื้นที่โปร่ง' },
  'style.japanese-zen': { en: 'Japanese Zen', th: 'เซนญี่ปุ่น' },
  'style.japanese-zen.desc': { en: 'Natural materials, calm earth tones, harmony', th: 'วัสดุธรรมชาติ โทนดิน สงบเป็นหนึ่ง' },
  'style.industrial-loft': { en: 'Industrial Loft', th: 'อินดัสเทรียล ลอฟท์' },
  'style.industrial-loft.desc': { en: 'Raw concrete, exposed elements, urban edge', th: 'คอนกรีตดิบ โครงสร้างเปิด สไตล์เมือง' },
  'style.scandinavian': { en: 'Scandinavian', th: 'สแกนดิเนเวียน' },
  'style.scandinavian.desc': { en: 'Bright, cozy, light wood, functional', th: 'สว่าง อบอุ่น ไม้สีอ่อน ใช้งานได้จริง' },
  'style.thai-contemporary': { en: 'Thai Contemporary', th: 'ไทยร่วมสมัย' },
  'style.thai-contemporary.desc': { en: 'Teak warmth, terracotta, tropical elegance', th: 'ไม้สักอบอุ่น ดินเผา หรูแบบเขตร้อน' },
  'style.luxury-modern': { en: 'Luxury Modern', th: 'ลักชัวรี่โมเดิร์น' },
  'style.luxury-modern.desc': { en: 'Marble, dark accents, gold details, premium', th: 'หินอ่อน โทนเข้ม ดีเทลทอง พรีเมียม' },

  // ── Language Toggle ──
  // Shows the flag emoji of the CURRENT language
  'lang.flag': { en: '🇺🇸', th: '🇹🇭' },
};


// ─── Quiz Localization ──────────────────────────────────────────────────────
//
// Quiz strings are separate from UI_STRINGS because they have a different
// structure: an array of { question, options[] } per language.
//
// These are merged with the scoring data from quiz.ts at runtime.
// The question order here must match the QUIZ_BASE order in quiz.ts exactly.

export const QUIZ_I18N: Record<Lang, { question: string; options: string[] }[]> = {
  en: [
    { question: 'How should your home feel?', options: ['Fresh and bright, like a sunny morning', 'Quiet and relaxing, like a spa', 'Cool and eye-catching, like a trendy cafe', 'Cozy and comfortable, like a warm hug', 'Fancy and impressive, like a luxury hotel'] },
    { question: 'What colors make you feel at home?', options: ['White and light gray — clean and simple', 'Beige and brown — warm like coffee', 'Gray and blue — cool and modern', 'Dark and dramatic — like a night sky', 'Soft pink and sage — gentle and dreamy'] },
    { question: 'What surfaces do you love to touch?', options: ['Smooth light wood and soft fabric', 'Raw concrete and cool metal', 'Shiny marble and gold accents', 'Rich dark wood and clay tiles', 'Sleek glass and smooth finishes'] },
    { question: 'Pick the sofa you\'d buy tomorrow', options: ['Simple and clean — does the job perfectly', 'Low to the ground — sit close to the floor', 'Something old with a story behind it', 'Big, soft, and sink-right-in comfy', 'A fun mix — nothing has to match'] },
    { question: 'How do you like to decorate?', options: ['Keep it empty — I love blank walls', 'Just a few special things I really love', 'Plants, plants, and more plants', 'Art and cool objects on every shelf'] },
    { question: 'What will you do most at home?', options: ['Work and be productive', 'Have friends over and hang out', 'Rest, unwind, and do nothing', 'Spend time with family', 'Cook and eat good food'] },
  ],
  th: [
    { question: 'อยากให้บ้านรู้สึกยังไง?', options: ['สดใส สว่าง เหมือนเช้าวันแดดดี', 'เงียบสงบ ผ่อนคลาย เหมือนอยู่สปา', 'เท่ สะดุดตา เหมือนคาเฟ่ฮิป', 'อบอุ่น สบาย เหมือนถูกกอด', 'หรูหรา น่าประทับใจ เหมือนโรงแรม 5 ดาว'] },
    { question: 'สีไหนทำให้รู้สึกเหมือนอยู่บ้าน?', options: ['ขาวและเทาอ่อน — สะอาด เรียบง่าย', 'เบจและน้ำตาล — อุ่นเหมือนกาแฟ', 'เทาและฟ้า — เท่ ทันสมัย', 'โทนเข้ม ดราม่า — เหมือนท้องฟ้ายามค่ำ', 'ชมพูอ่อนและเขียวหม่น — นุ่มนวล ฝันดี'] },
    { question: 'ชอบสัมผัสพื้นผิวแบบไหน?', options: ['ไม้สีอ่อนเนียนและผ้านุ่ม', 'คอนกรีตดิบและโลหะเย็น', 'หินอ่อนมันวาวและทองเป็นจุดเด่น', 'ไม้เข้มอบอุ่นและกระเบื้องดินเผา', 'กระจกใสและผิวเรียบลื่น'] },
    { question: 'ถ้าจะซื้อโซฟาพรุ่งนี้ เลือกแบบไหน?', options: ['เรียบง่าย ใช้งานได้ดี แค่นี้พอ', 'เตี้ยติดพื้น นั่งสบายแบบญี่ปุ่น', 'ของเก่ามีเรื่องราว มีคาแรกเตอร์', 'ใหญ่ นุ่ม นั่งแล้วไม่อยากลุก', 'มิกซ์แอนด์แมทช์ ไม่ต้องเข้าชุดก็ได้'] },
    { question: 'ชอบตกแต่งบ้านแบบไหน?', options: ['ปล่อยว่างเลย ชอบผนังเรียบ', 'แค่ไม่กี่ชิ้นที่รักจริง ๆ', 'ต้นไม้ ต้นไม้ แล้วก็ต้นไม้', 'งานศิลปะและของสะสมเต็มชั้น'] },
    { question: 'อยู่บ้านแล้วทำอะไรบ่อยที่สุด?', options: ['ทำงาน โฟกัสเต็มที่', 'เรียกเพื่อนมาสังสรรค์', 'พักผ่อน นอนเล่น ไม่ทำอะไร', 'ใช้เวลากับครอบครัว', 'ทำอาหาร กินข้าวอร่อย ๆ'] },
  ],
};
