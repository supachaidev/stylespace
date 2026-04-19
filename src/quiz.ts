/**
 * quiz.ts — Lifestyle Quiz Engine
 * =================================
 *
 * This module powers the 6-question lifestyle quiz that personalizes
 * the interior design experience. The quiz flow works like this:
 *
 *   1. User answers 6 questions about their lifestyle preferences
 *   2. Each answer adds points to one or more style presets
 *   3. Each answer also contributes English "prompt tags" (design keywords)
 *   4. After all questions, we:
 *      a. Rank styles by total score → determines match percentages
 *      b. Combine all prompt tags → builds a custom Gemini prompt
 *      c. The top-scoring style's SCG products are borrowed for the custom style
 *
 * The quiz data is split into two parts:
 *   - QUIZ_BASE (this file): Scores, prompt tags, and icons — language-independent
 *   - QUIZ_I18N (i18n.ts): Localized question text and option labels — Thai/English
 *
 * These are merged at runtime by getQuizQuestions() so that switching
 * languages instantly updates the quiz without losing the scoring logic.
 *
 * Quiz Questions:
 *   Q1: Desired atmosphere (fresh/quiet/cool/cozy/fancy)
 *   Q2: Color preferences (white/beige/gray/dark/pastel)
 *   Q3: Surface materials (wood/concrete/marble/teak/glass)
 *   Q4: Furniture style (simple/low/vintage/plush/eclectic)
 *   Q5: Decoration approach (minimal/curated/plants/gallery)
 *   Q6: Primary home activity (work/social/rest/family/cooking)
 */

import type { QuizQuestion } from './types';
import { getLang, QUIZ_I18N } from './i18n';

// ─── Quiz Base Data ─────────────────────────────────────────────────────────
//
// This array contains the language-independent scoring logic for each question.
// Each option has:
//   - icon: An HTML entity emoji displayed next to the option
//   - scores: Points awarded to style presets when this option is selected
//             (e.g., { 'modern-minimal': 3, 'scandinavian': 2 })
//   - promptTags: English phrases that describe the design preference
//                 (collected from all answers to build the custom prompt)
//
// The scoring uses a 1-3 point scale:
//   3 = strong match (this option strongly indicates this style)
//   2 = moderate match
//   1 = slight match
//
// Maximum possible score per style = 6 questions × 3 points = 18

const QUIZ_BASE: { options: { icon: string; scores: Record<string, number>; promptTags: string[] }[] }[] = [
  // ── Question 1: How should your home feel? ──
  {
    options: [
      { icon: '&#x2728;', scores: { 'modern-minimal': 3, 'scandinavian': 2 }, promptTags: ['bright open spaces', 'clean airy atmosphere', 'lots of natural light'] },
      { icon: '&#x1F343;', scores: { 'japanese-zen': 3, 'scandinavian': 1 }, promptTags: ['serene tranquil atmosphere', 'zen-like calm', 'soft ambient lighting'] },
      { icon: '&#x26A1;', scores: { 'industrial-loft': 3, 'luxury-modern': 1 }, promptTags: ['bold dramatic atmosphere', 'high-contrast design', 'statement pieces'] },
      { icon: '&#x2615;', scores: { 'scandinavian': 2, 'thai-contemporary': 2 }, promptTags: ['warm inviting atmosphere', 'cozy textiles', 'soft warm lighting'] },
      { icon: '&#x1F451;', scores: { 'luxury-modern': 3, 'thai-contemporary': 1 }, promptTags: ['luxurious elegant atmosphere', 'rich sophisticated feel', 'premium finishes'] },
    ],
  },
  // ── Question 2: What colors make you feel at home? ──
  {
    options: [
      { icon: '&#x1F90D;', scores: { 'modern-minimal': 3, 'scandinavian': 1 }, promptTags: ['white and neutral color palette', 'monochrome tones', 'clean white walls'] },
      { icon: '&#x1F33E;', scores: { 'japanese-zen': 2, 'thai-contemporary': 2 }, promptTags: ['warm earth tone palette', 'beige sand brown colors', 'natural warm hues'] },
      { icon: '&#x1F9CA;', scores: { 'industrial-loft': 2, 'modern-minimal': 1 }, promptTags: ['cool gray and blue palette', 'steel blue accents', 'slate tones'] },
      { icon: '&#x1F311;', scores: { 'industrial-loft': 2, 'luxury-modern': 2 }, promptTags: ['dark moody color palette', 'charcoal and deep tones', 'dramatic dark walls'] },
      { icon: '&#x1F338;', scores: { 'scandinavian': 3 }, promptTags: ['soft pastel accents', 'blush and sage tones', 'light airy palette'] },
    ],
  },
  // ── Question 3: What surfaces do you love to touch? ──
  {
    options: [
      { icon: '&#x1FAB5;', scores: { 'scandinavian': 3, 'japanese-zen': 1 }, promptTags: ['light oak wood furniture', 'linen and cotton textiles', 'natural wood grain'] },
      { icon: '&#x1F9F1;', scores: { 'industrial-loft': 3 }, promptTags: ['exposed concrete walls', 'raw metal fixtures', 'industrial steel elements'] },
      { icon: '&#x1F48E;', scores: { 'luxury-modern': 3 }, promptTags: ['white marble surfaces', 'gold brass hardware', 'polished stone countertops'] },
      { icon: '&#x1F3FA;', scores: { 'thai-contemporary': 3 }, promptTags: ['dark teak wood panels', 'terracotta tile accents', 'handcrafted wood elements'] },
      { icon: '&#x1FA9E;', scores: { 'modern-minimal': 2, 'luxury-modern': 1 }, promptTags: ['glass partitions', 'polished smooth surfaces', 'reflective minimalist materials'] },
    ],
  },
  // ── Question 4: Pick the sofa you'd buy tomorrow ──
  {
    options: [
      { icon: '&#x1FA91;', scores: { 'modern-minimal': 2, 'scandinavian': 2 }, promptTags: ['simple functional furniture', 'clean-lined seating', 'minimal practical pieces'] },
      { icon: '&#x1F9CE;', scores: { 'japanese-zen': 3 }, promptTags: ['low-profile furniture', 'floor-level seating', 'platform bed', 'tatami-inspired'] },
      { icon: '&#x1F3F7;', scores: { 'industrial-loft': 2, 'thai-contemporary': 1 }, promptTags: ['vintage character furniture', 'reclaimed wood pieces', 'antique accent items'] },
      { icon: '&#x1F6CB;', scores: { 'luxury-modern': 3 }, promptTags: ['plush velvet furniture', 'oversized comfortable sofa', 'luxurious upholstery'] },
      { icon: '&#x1F3A8;', scores: { 'thai-contemporary': 2, 'scandinavian': 1 }, promptTags: ['eclectic furniture mix', 'curated collected-over-time look', 'personality-filled pieces'] },
    ],
  },
  // ── Question 5: How do you like to decorate? ──
  {
    options: [
      { icon: '&#x25FB;', scores: { 'modern-minimal': 3, 'japanese-zen': 1 }, promptTags: ['minimal decoration', 'clutter-free surfaces', 'intentional empty space'] },
      { icon: '&#x1F5BC;', scores: { 'japanese-zen': 2, 'scandinavian': 2 }, promptTags: ['carefully curated decor', 'a few statement art pieces', 'intentional decorative objects'] },
      { icon: '&#x1F33F;', scores: { 'scandinavian': 1, 'thai-contemporary': 2 }, promptTags: ['abundant indoor plants', 'lush greenery throughout', 'tropical plants and hanging vines'] },
      { icon: '&#x1F3DB;', scores: { 'luxury-modern': 2, 'industrial-loft': 2 }, promptTags: ['gallery wall artwork', 'sculptural decorative objects', 'curated art collection displayed'] },
    ],
  },
  // ── Question 6: What will you do most at home? ──
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


/**
 * Get quiz questions with localized text for the current language.
 *
 * Merges the language-independent QUIZ_BASE (scores + promptTags) with
 * the localized QUIZ_I18N strings (question text + option labels).
 *
 * @returns Array of 6 QuizQuestion objects ready for rendering
 */
export function getQuizQuestions(): QuizQuestion[] {
  const lang = getLang();
  const strings = QUIZ_I18N[lang];

  return QUIZ_BASE.map((q, qi) => ({
    question: strings[qi].question,
    options: q.options.map((opt, oi) => ({
      label: strings[qi].options[oi],  // Localized label from i18n
      icon: opt.icon,                   // HTML entity emoji
      scores: opt.scores,               // Style scoring map
      promptTags: opt.promptTags,        // English tags for Gemini prompt
    })),
  }));
}


/**
 * Result of processing quiz answers.
 */
export interface QuizResult {
  ranked: { styleId: string; score: number }[];  // All styles sorted by score (highest first)
  topStyleId: string;                             // ID of the highest-scoring style
  customPrompt: string;                           // Custom Gemini prompt built from all answer tags
}


/**
 * Calculate quiz results from the user's answers.
 *
 * For each answer, this function:
 *   1. Adds the option's score points to the corresponding style presets
 *   2. Collects the option's prompt tags for the custom style prompt
 *
 * After processing all answers, styles are ranked by total score and
 * a custom prompt is built from all collected tags.
 *
 * @param answers Array of option indices (one per question, e.g., [0, 2, 1, 3, 0, 4])
 * @returns       QuizResult with ranked styles and custom prompt
 */
export function calculateResult(answers: number[]): QuizResult {
  const questions = getQuizQuestions();
  const scores: Record<string, number> = {};
  const allTags: string[] = [];

  // Tally up scores and collect prompt tags from each answer
  answers.forEach((optionIdx, questionIdx) => {
    const option = questions[questionIdx].options[optionIdx];

    // Add this option's score points to each style it maps to
    for (const [styleId, points] of Object.entries(option.scores)) {
      scores[styleId] = (scores[styleId] ?? 0) + points;
    }

    // Collect prompt tags for the custom style
    allTags.push(...option.promptTags);
  });

  // Sort styles by score (highest first)
  const ranked = Object.entries(scores)
    .map(([styleId, score]) => ({ styleId, score }))
    .sort((a, b) => b.score - a.score);

  // Build a cohesive custom prompt from all selected tags
  const customPrompt = buildCustomPrompt(allTags);

  return {
    ranked,
    topStyleId: ranked[0]?.styleId ?? 'modern-minimal',
    customPrompt,
  };
}


/**
 * Build a custom Gemini prompt from collected quiz answer tags.
 *
 * Deduplicates tags (in case multiple answers contributed the same tag)
 * and formats them into a coherent prompt that Gemini can use to
 * generate a personalized interior design render.
 *
 * @param tags Array of English design preference phrases
 * @returns    A formatted prompt string for Gemini
 */
function buildCustomPrompt(tags: string[]): string {
  const unique = [...new Set(tags)];
  return `Interior design with the following specific requirements:
${unique.map(t => `- ${t}`).join('\n')}

Create a cohesive, professionally designed interior that combines all these elements harmoniously.
The design should feel intentional and curated, not random.`;
}


/**
 * Get the maximum possible score for any single style.
 *
 * This is used to calculate match percentages:
 *   matchPercent = (actualScore / maxScore) * 100
 *
 * Max = 6 questions × 3 points per question = 18
 *
 * @returns The theoretical maximum score (18)
 */
export function getMaxScore(): number {
  return QUIZ_BASE.length * 3;
}
