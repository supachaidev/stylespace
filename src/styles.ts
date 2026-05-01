/**
 * styles.ts — Interior Design Style Presets
 * ==========================================
 *
 * This module defines the 6 built-in interior design styles that users
 * can choose from. Each style includes:
 *   - A localized name and description (via the i18n `t()` function)
 *   - A CSS gradient thumbnail (shown before a render is generated)
 *   - A detailed English prompt for Gemini image generation
 *   - A list of matching SCG building material products
 *
 * Available styles:
 *   1. Modern Minimal    — White, clean lines, neutral palette
 *   2. Japanese Zen      — Natural wood, earth tones, calm
 *   3. Industrial Loft   — Concrete, metal, urban edge
 *   4. Scandinavian      — Bright, cozy, light wood
 *   5. Thai Contemporary — Teak, terracotta, tropical elegance
 *   6. Luxury Modern     — Marble, dark accents, gold details
 *
 * The quiz system (quiz.ts) assigns scores to these style IDs based on
 * user answers, then ranks them by match percentage.
 *
 * Additionally, `createCustomStyle()` generates a 7th "custom" style
 * based on the user's unique quiz answers — it uses the prompt tags
 * from their selected options instead of a predefined prompt.
 */

import type { StylePreset } from './types';
import { t, getLang } from './i18n';


/**
 * Create a custom style preset from quiz results.
 *
 * This is the "Made for You" style that appears at the top of the style
 * picker after the user completes the quiz. Its prompt is dynamically
 * built from the user's specific quiz answers (see quiz.ts).
 *
 * The optional `description` parameter is what shows under the title on
 * the custom style card and as the subhead on the result page; pass the
 * answer summary from buildAnswerSummary() so the user sees a real
 * description of the design rather than the generic placeholder.
 *
 * @param prompt         The custom Gemini prompt built from quiz promptTags
 * @param closestPreset  The highest-scoring predefined style (used for SCG products)
 * @param description    Optional human-readable summary; falls back to the i18n placeholder
 * @returns              A StylePreset with id="custom"
 */
export function createCustomStyle(
  prompt: string,
  closestPreset: StylePreset,
  description?: string,
): StylePreset {
  return {
    id: 'custom',
    label: t('custom.label'),
    description: description && description.trim() ? description : t('custom.desc'),
    // Gradient from accent red to gold — visually distinguishes the custom card
    thumbnail: 'linear-gradient(135deg, var(--accent), var(--accent-gold))',
    prompt,
    // Borrow product recommendations from the closest matching preset
    scgProducts: closestPreset.scgProducts,
  };
}


/**
 * Get all style presets with fresh translations.
 *
 * This function is called each time we need the style list to ensure
 * labels and descriptions reflect the current language setting.
 * (If the user switches from Thai to English, we need fresh `t()` calls.)
 *
 * @returns Array of 6 StylePreset objects
 */
export function getStylePresets(): StylePreset[] {
  return [
    {
      id: 'modern-minimal',
      label: t('style.modern-minimal'),
      description: t('style.modern-minimal.desc'),
      thumbnail: 'linear-gradient(135deg, #F5F5F0, #E0E0E0)',
      prompt: 'modern minimalist interior design with white walls, clean lines, neutral color palette, simple furniture, large windows with natural light, polished concrete or light wood floors, minimal decoration',
      scgProducts: ['SCG Super White Paint', 'SCG White Matte Tile', 'SCG Smooth Cement Board'],
    },
    {
      id: 'japanese-zen',
      label: t('style.japanese-zen'),
      description: t('style.japanese-zen.desc'),
      thumbnail: 'linear-gradient(135deg, #C4A882, #8B7355)',
      prompt: 'Japanese zen interior design with natural wood elements, sliding shoji screens, tatami-inspired flooring, earth tone walls, indoor plants, warm ambient lighting, minimal clutter, rock garden elements',
      scgProducts: ['SCG Warm Cream Paint', 'SCG Natural Wood Plank Tile', 'SCG Bamboo Texture Board'],
    },
    {
      id: 'industrial-loft',
      label: t('style.industrial-loft'),
      description: t('style.industrial-loft.desc'),
      thumbnail: 'linear-gradient(135deg, #4A4A4A, #2A2A2A)',
      prompt: 'industrial loft interior design with exposed concrete walls, metal fixtures, Edison bulb lighting, dark color palette, exposed pipes and ductwork, reclaimed wood furniture, brick accent walls',
      scgProducts: ['SCG Concrete Effect Paint', 'SCG Cement Board', 'SCG Dark Charcoal Tile'],
    },
    {
      id: 'scandinavian',
      label: t('style.scandinavian'),
      description: t('style.scandinavian.desc'),
      thumbnail: 'linear-gradient(135deg, #F8F4EF, #D4C5B0)',
      prompt: 'Scandinavian interior design with bright white walls, light oak wood floors, cozy textiles, sheepskin rugs, pendant lights, pastel accents, functional furniture, lots of natural light, hygge atmosphere',
      scgProducts: ['SCG Pure White Paint', 'SCG Light Oak Wood Tile', 'SCG Warm Gray Paint'],
    },
    {
      id: 'thai-contemporary',
      label: t('style.thai-contemporary'),
      description: t('style.thai-contemporary.desc'),
      thumbnail: 'linear-gradient(135deg, #8B5E3C, #C4714A)',
      prompt: 'Thai contemporary interior design with teak wood panels, terracotta tile floors, tropical plants, gold accent details, silk cushions, carved wood elements, warm lighting, traditional Thai patterns with modern twist',
      scgProducts: ['SCG Terracotta Floor Tile', 'SCG Teak Tone Paint', 'SCG Gold Accent Trim'],
    },
    {
      id: 'luxury-modern',
      label: t('style.luxury-modern'),
      description: t('style.luxury-modern.desc'),
      thumbnail: 'linear-gradient(135deg, #1A1A2E, #D4AF37)',
      prompt: 'luxury modern interior design with white marble floors, dark charcoal accent walls, gold fixtures and hardware, crystal chandelier, velvet furniture, dramatic lighting, high-end finishes, art deco inspired details',
      scgProducts: ['SCG Marble Effect Tile', 'SCG Charcoal Premium Paint', 'SCG Gold Trim Molding'],
    },
  ];
}

// Keep for backward compat — but prefer getStylePresets() for fresh translations
export const STYLE_PRESETS = getStylePresets();


/**
 * Generate a truly randomized interior design style by mixing and matching
 * design elements from different categories. Each call produces a unique
 * combination of atmosphere, colors, materials, furniture, and lighting.
 */
export function createRandomStyle(): StylePreset {
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const pickN = <T>(arr: T[], n: number): T[] => {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n);
  };
  const lang = getLang();

  // Each element has { en, th } — English is used for the Gemini prompt,
  // the current language is used for the user-facing description.
  const atmospheres = [
    { en: 'bright and airy', th: 'สว่างโปร่งสบาย' },
    { en: 'warm and cozy', th: 'อบอุ่นน่าอยู่' },
    { en: 'dark and moody', th: 'โทนเข้มลึกลับ' },
    { en: 'serene and calm', th: 'สงบเรียบง่าย' },
    { en: 'bold and dramatic', th: 'โดดเด่นทรงพลัง' },
    { en: 'playful and colorful', th: 'สนุกสดใสหลากสี' },
    { en: 'rustic and charming', th: 'รัสติกมีเสน่ห์' },
    { en: 'sleek and futuristic', th: 'ล้ำสมัยเรียบหรู' },
    { en: 'romantic and soft', th: 'โรแมนติกนุ่มนวล' },
    { en: 'eclectic and vibrant', th: 'ผสมผสานมีชีวิตชีวา' },
  ];

  const palettes = [
    { en: 'white and cream tones', th: 'โทนขาวและครีม' },
    { en: 'earth tones with terracotta accents', th: 'โทนดินกับเทอร์ราคอตตา' },
    { en: 'charcoal and deep navy', th: 'โทนเทาเข้มและกรมท่า' },
    { en: 'sage green and warm beige', th: 'เขียวเสจกับเบจอุ่น' },
    { en: 'blush pink and gold', th: 'ชมพูอ่อนกับทอง' },
    { en: 'ocean blue and sandy neutrals', th: 'ฟ้าทะเลกับทรายธรรมชาติ' },
    { en: 'burnt orange and olive', th: 'ส้มไหม้กับเขียวโอลีฟ' },
    { en: 'lavender and soft gray', th: 'ลาเวนเดอร์กับเทาอ่อน' },
    { en: 'forest green and walnut brown', th: 'เขียวป่ากับน้ำตาลวอลนัท' },
    { en: 'coral and teal accents', th: 'คอรัลกับเทลเป็นจุดเด่น' },
    { en: 'monochrome black and white', th: 'ขาวดำโมโนโครม' },
    { en: 'mustard yellow and slate', th: 'เหลืองมัสตาร์ดกับสเลท' },
  ];

  const wallMaterials = [
    { en: 'smooth white plaster walls', th: 'ผนังปูนฉาบเรียบสีขาว' },
    { en: 'exposed brick accent wall', th: 'ผนังอิฐเปลือยเป็นจุดเด่น' },
    { en: 'wood panel feature wall', th: 'ผนังไม้ตกแต่ง' },
    { en: 'textured concrete walls', th: 'ผนังคอนกรีตมีเท็กซ์เจอร์' },
    { en: 'wallpaper with botanical print', th: 'วอลเปเปอร์ลายใบไม้' },
    { en: 'lime wash painted walls', th: 'ผนังทาสีไลม์วอช' },
    { en: 'stone cladding accent', th: 'ผนังหินตกแต่ง' },
    { en: 'venetian plaster finish', th: 'ผนังปูนเวเนเชียน' },
  ];

  const floorMaterials = [
    { en: 'light oak hardwood floors', th: 'พื้นไม้โอ๊คสีอ่อน' },
    { en: 'polished concrete floors', th: 'พื้นคอนกรีตขัดมัน' },
    { en: 'herringbone parquet flooring', th: 'พื้นปาร์เกต์ลายก้างปลา' },
    { en: 'terracotta tile floors', th: 'พื้นกระเบื้องเทอร์ราคอตตา' },
    { en: 'dark walnut wood floors', th: 'พื้นไม้วอลนัทเข้ม' },
    { en: 'white marble tile floors', th: 'พื้นหินอ่อนสีขาว' },
    { en: 'bamboo flooring', th: 'พื้นไม้ไผ่' },
    { en: 'patterned cement tiles', th: 'พื้นกระเบื้องปูนลาย' },
  ];

  const furnitureStyles = [
    { en: 'mid-century modern furniture', th: 'เฟอร์นิเจอร์มิดเซ็นจูรี่โมเดิร์น' },
    { en: 'minimalist low-profile furniture', th: 'เฟอร์นิเจอร์มินิมอลเตี้ย' },
    { en: 'vintage and antique pieces', th: 'เฟอร์นิเจอร์วินเทจ' },
    { en: 'plush velvet upholstery', th: 'เฟอร์นิเจอร์กำมะหยี่นุ่ม' },
    { en: 'rattan and wicker furniture', th: 'เฟอร์นิเจอร์หวาย' },
    { en: 'sleek metal and glass furniture', th: 'เฟอร์นิเจอร์โลหะกระจก' },
    { en: 'handcrafted artisan pieces', th: 'เฟอร์นิเจอร์งานฝีมือ' },
    { en: 'modular contemporary furniture', th: 'เฟอร์นิเจอร์โมดูลาร์ร่วมสมัย' },
    { en: 'bohemian mixed textiles', th: 'เฟอร์นิเจอร์โบฮีเมียนผ้าผสม' },
    { en: 'Scandinavian functional pieces', th: 'เฟอร์นิเจอร์สแกนดิเนเวียน' },
  ];

  const lightingStyles = [
    { en: 'warm ambient pendant lights', th: 'โคมไฟแขวนแสงอุ่น' },
    { en: 'dramatic spotlight accents', th: 'สปอตไลท์เน้นจุดเด่น' },
    { en: 'natural light through large windows', th: 'แสงธรรมชาติผ่านหน้าต่างบาน​ใหญ่' },
    { en: 'paper lantern lighting', th: 'โคมไฟกระดาษ' },
    { en: 'industrial Edison bulb fixtures', th: 'โคมไฟหลอดเอดิสันอินดัสเทรียล' },
    { en: 'recessed LED strip lighting', th: 'ไฟ LED ซ่อนในฝ้า' },
    { en: 'chandelier centerpiece', th: 'โคมระย้าเป็นจุดเด่น' },
    { en: 'floor lamps with warm glow', th: 'โคมไฟตั้งพื้นแสงอุ่น' },
  ];

  const decor = [
    { en: 'abundant indoor plants', th: 'ต้นไม้ในร่มเยอะ ๆ' },
    { en: 'curated art collection on walls', th: 'งานศิลปะบนผนัง' },
    { en: 'sculptural decorative objects', th: 'ประติมากรรมตกแต่ง' },
    { en: 'woven textile wall hangings', th: 'ผ้าทอแขวนผนัง' },
    { en: 'ceramic vases and pottery', th: 'แจกันเซรามิก' },
    { en: 'books and floating shelves', th: 'หนังสือและชั้นลอย' },
    { en: 'candles and aromatic elements', th: 'เทียนหอมและของตกแต่ง' },
    { en: 'minimal carefully chosen pieces', th: 'ของตกแต่งน้อยชิ้นที่เลือกมาอย่างดี' },
  ];

  const atmosphere = pick(atmospheres);
  const palette = pick(palettes);
  const wall = pick(wallMaterials);
  const floor = pick(floorMaterials);
  const furniture = pick(furnitureStyles);
  const lighting = pick(lightingStyles);
  const decorPicks = pickN(decor, 2);

  // English prompt for Gemini (always English regardless of UI language)
  const prompt = `Interior design with a ${atmosphere.en} atmosphere, ${palette.en} color palette, ${wall.en}, ${floor.en}, ${furniture.en}, ${lighting.en}, decorated with ${decorPicks.map(d => d.en).join(', ')}. Professional architectural rendering, cohesive and intentional design.`;

  // User-facing description in the current language
  const desc = lang === 'th'
    ? `บรรยากาศ${atmosphere.th}, สี${palette.th}, ${wall.th}, ${floor.th}, ${furniture.th}, ${lighting.th}`
    : `${atmosphere.en} atmosphere, ${palette.en}, ${wall.en}, ${floor.en}, ${furniture.en}, ${lighting.en}`;

  const presets = getStylePresets();
  const randomPreset = pick(presets);

  return {
    id: 'random',
    label: t('btn.randomStyle'),
    description: desc,
    thumbnail: 'linear-gradient(135deg, #FF6B6B, #4ECDC4, #45B7D1)',
    prompt,
    scgProducts: randomPreset.scgProducts,
  };
}
