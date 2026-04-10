import type { QuizQuestion } from './types';
import { getLang, QUIZ_I18N } from './i18n';

// Base quiz data (scores + promptTags are language-independent)
const QUIZ_BASE: { options: { icon: string; scores: Record<string, number>; promptTags: string[] }[] }[] = [
  {
    options: [
      { icon: '&#x2728;', scores: { 'modern-minimal': 3, 'scandinavian': 2 }, promptTags: ['bright open spaces', 'clean airy atmosphere', 'lots of natural light'] },
      { icon: '&#x1F343;', scores: { 'japanese-zen': 3, 'scandinavian': 1 }, promptTags: ['serene tranquil atmosphere', 'zen-like calm', 'soft ambient lighting'] },
      { icon: '&#x26A1;', scores: { 'industrial-loft': 3, 'luxury-modern': 1 }, promptTags: ['bold dramatic atmosphere', 'high-contrast design', 'statement pieces'] },
      { icon: '&#x2615;', scores: { 'scandinavian': 2, 'thai-contemporary': 2 }, promptTags: ['warm inviting atmosphere', 'cozy textiles', 'soft warm lighting'] },
      { icon: '&#x1F451;', scores: { 'luxury-modern': 3, 'thai-contemporary': 1 }, promptTags: ['luxurious elegant atmosphere', 'rich sophisticated feel', 'premium finishes'] },
    ],
  },
  {
    options: [
      { icon: '&#x1F90D;', scores: { 'modern-minimal': 3, 'scandinavian': 1 }, promptTags: ['white and neutral color palette', 'monochrome tones', 'clean white walls'] },
      { icon: '&#x1F33E;', scores: { 'japanese-zen': 2, 'thai-contemporary': 2 }, promptTags: ['warm earth tone palette', 'beige sand brown colors', 'natural warm hues'] },
      { icon: '&#x1F9CA;', scores: { 'industrial-loft': 2, 'modern-minimal': 1 }, promptTags: ['cool gray and blue palette', 'steel blue accents', 'slate tones'] },
      { icon: '&#x1F311;', scores: { 'industrial-loft': 2, 'luxury-modern': 2 }, promptTags: ['dark moody color palette', 'charcoal and deep tones', 'dramatic dark walls'] },
      { icon: '&#x1F338;', scores: { 'scandinavian': 3 }, promptTags: ['soft pastel accents', 'blush and sage tones', 'light airy palette'] },
    ],
  },
  {
    options: [
      { icon: '&#x1FAB5;', scores: { 'scandinavian': 3, 'japanese-zen': 1 }, promptTags: ['light oak wood furniture', 'linen and cotton textiles', 'natural wood grain'] },
      { icon: '&#x1F9F1;', scores: { 'industrial-loft': 3 }, promptTags: ['exposed concrete walls', 'raw metal fixtures', 'industrial steel elements'] },
      { icon: '&#x1F48E;', scores: { 'luxury-modern': 3 }, promptTags: ['white marble surfaces', 'gold brass hardware', 'polished stone countertops'] },
      { icon: '&#x1F3FA;', scores: { 'thai-contemporary': 3 }, promptTags: ['dark teak wood panels', 'terracotta tile accents', 'handcrafted wood elements'] },
      { icon: '&#x1FA9E;', scores: { 'modern-minimal': 2, 'luxury-modern': 1 }, promptTags: ['glass partitions', 'polished smooth surfaces', 'reflective minimalist materials'] },
    ],
  },
  {
    options: [
      { icon: '&#x1FA91;', scores: { 'modern-minimal': 2, 'scandinavian': 2 }, promptTags: ['simple functional furniture', 'clean-lined seating', 'minimal practical pieces'] },
      { icon: '&#x1F9CE;', scores: { 'japanese-zen': 3 }, promptTags: ['low-profile furniture', 'floor-level seating', 'platform bed', 'tatami-inspired'] },
      { icon: '&#x1F3F7;', scores: { 'industrial-loft': 2, 'thai-contemporary': 1 }, promptTags: ['vintage character furniture', 'reclaimed wood pieces', 'antique accent items'] },
      { icon: '&#x1F6CB;', scores: { 'luxury-modern': 3 }, promptTags: ['plush velvet furniture', 'oversized comfortable sofa', 'luxurious upholstery'] },
      { icon: '&#x1F3A8;', scores: { 'thai-contemporary': 2, 'scandinavian': 1 }, promptTags: ['eclectic furniture mix', 'curated collected-over-time look', 'personality-filled pieces'] },
    ],
  },
  {
    options: [
      { icon: '&#x25FB;', scores: { 'modern-minimal': 3, 'japanese-zen': 1 }, promptTags: ['minimal decoration', 'clutter-free surfaces', 'intentional empty space'] },
      { icon: '&#x1F5BC;', scores: { 'japanese-zen': 2, 'scandinavian': 2 }, promptTags: ['carefully curated decor', 'a few statement art pieces', 'intentional decorative objects'] },
      { icon: '&#x1F33F;', scores: { 'scandinavian': 1, 'thai-contemporary': 2 }, promptTags: ['abundant indoor plants', 'lush greenery throughout', 'tropical plants and hanging vines'] },
      { icon: '&#x1F3DB;', scores: { 'luxury-modern': 2, 'industrial-loft': 2 }, promptTags: ['gallery wall artwork', 'sculptural decorative objects', 'curated art collection displayed'] },
    ],
  },
  {
    options: [
      { icon: '&#x1F4BB;', scores: { 'modern-minimal': 2, 'scandinavian': 1 }, promptTags: ['dedicated home office area', 'ergonomic workspace', 'good task lighting'] },
      { icon: '&#x1F37B;', scores: { 'industrial-loft': 2, 'luxury-modern': 1 }, promptTags: ['open social gathering space', 'bar area or serving counter', 'ambient mood lighting'] },
      { icon: '&#x1F6C0;', scores: { 'japanese-zen': 3 }, promptTags: ['relaxation-focused layout', 'spa-like bathroom', 'meditation corner', 'calming elements'] },
      { icon: '&#x1F46A;', scores: { 'scandinavian': 2, 'thai-contemporary': 1 }, promptTags: ['family-friendly open layout', 'durable comfortable furniture', 'warm communal dining area'] },
      { icon: '&#x1F373;', scores: { 'thai-contemporary': 2, 'luxury-modern': 1 }, promptTags: ['chef-worthy kitchen design', 'prominent dining table', 'open kitchen layout'] },
    ],
  },
];

export function getQuizQuestions(): QuizQuestion[] {
  const lang = getLang();
  const strings = QUIZ_I18N[lang];
  return QUIZ_BASE.map((q, qi) => ({
    question: strings[qi].question,
    options: q.options.map((opt, oi) => ({
      label: strings[qi].options[oi],
      icon: opt.icon,
      scores: opt.scores,
      promptTags: opt.promptTags,
    })),
  }));
}

export interface QuizResult {
  ranked: { styleId: string; score: number }[];
  topStyleId: string;
  customPrompt: string;
}

export function calculateResult(answers: number[]): QuizResult {
  const questions = getQuizQuestions();
  const scores: Record<string, number> = {};
  const allTags: string[] = [];

  answers.forEach((optionIdx, questionIdx) => {
    const option = questions[questionIdx].options[optionIdx];
    for (const [styleId, points] of Object.entries(option.scores)) {
      scores[styleId] = (scores[styleId] ?? 0) + points;
    }
    allTags.push(...option.promptTags);
  });

  const ranked = Object.entries(scores)
    .map(([styleId, score]) => ({ styleId, score }))
    .sort((a, b) => b.score - a.score);

  const customPrompt = buildCustomPrompt(allTags);

  return {
    ranked,
    topStyleId: ranked[0]?.styleId ?? 'modern-minimal',
    customPrompt,
  };
}

function buildCustomPrompt(tags: string[]): string {
  const unique = [...new Set(tags)];
  return `Interior design with the following specific requirements:
${unique.map(t => `- ${t}`).join('\n')}

Create a cohesive, professionally designed interior that combines all these elements harmoniously.
The design should feel intentional and curated, not random.`;
}

export function getMaxScore(): number {
  return QUIZ_BASE.length * 3;
}
