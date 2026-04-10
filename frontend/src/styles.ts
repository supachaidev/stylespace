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
import { t } from './i18n';


/**
 * Create a custom style preset from quiz results.
 *
 * This is the "Made for You" style that appears at the top of the style
 * picker after the user completes the quiz. Its prompt is dynamically
 * built from the user's specific quiz answers (see quiz.ts).
 *
 * @param prompt         The custom Gemini prompt built from quiz promptTags
 * @param closestPreset  The highest-scoring predefined style (used for SCG products)
 * @returns              A StylePreset with id="custom"
 */
export function createCustomStyle(prompt: string, closestPreset: StylePreset): StylePreset {
  return {
    id: 'custom',
    label: t('custom.label'),
    description: t('custom.desc'),
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
