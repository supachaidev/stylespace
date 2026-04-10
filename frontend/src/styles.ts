import type { StylePreset } from './types';
import { t } from './i18n';

export function createCustomStyle(prompt: string, closestPreset: StylePreset): StylePreset {
  return {
    id: 'custom',
    label: t('custom.label'),
    description: t('custom.desc'),
    thumbnail: 'linear-gradient(135deg, var(--accent), var(--accent-gold))',
    prompt,
    scgProducts: closestPreset.scgProducts,
  };
}

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
