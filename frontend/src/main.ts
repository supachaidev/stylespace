/**
 * main.ts — Application Entry Point & UI Orchestration
 * ======================================================
 *
 * This is the main module that wires everything together. It manages:
 *   - The complete user flow: Upload → Quiz → Style Picker → Result
 *   - All API calls to the backend (analyze, generate, restyle)
 *   - Browser history for back/forward navigation
 *   - Language switching (re-renders current view on change)
 *   - In-memory render cache for instant style switching
 *
 * Application Flow:
 *   ┌──────────┐   upload   ┌───────────┐   analyze   ┌──────┐
 *   │  Upload  │ ─────────▶ │  Loading   │ ─────────▶ │ Quiz │
 *   └──────────┘            └───────────┘             └──┬───┘
 *                                                        │
 *                      ┌─────────────────────────────────┘
 *                      │ finish quiz (or skip)
 *                      ▼
 *   ┌──────────┐   generate   ┌───────────┐   done   ┌────────┐
 *   │  Styles  │ ──────────▶  │  Loading   │ ──────▶ │ Result │
 *   └──────────┘              └───────────┘          └────────┘
 *                                                       │
 *                   "Try Another Style" ◀───────────────┘
 *
 * State Management:
 *   This app uses simple module-level variables instead of a state
 *   management library. The key state variables are:
 *   - currentAnalysis: Room data from Claude (persists until new upload)
 *   - uploadedFile: The original floor plan image file
 *   - baseRender: The first generated render (reused for restyling)
 *   - renderCache: Map of styleId → data URL (for instant switching)
 *   - quizAnswers/quizStep/quizResult: Quiz progress
 *   - currentView: Which section is currently visible
 */

import { getStylePresets, createCustomStyle, createRandomStyle } from './styles';
import { getQuizQuestions, calculateResult, getMaxScore, type QuizResult } from './quiz';
import { t, getLang, setLang, onLangChange } from './i18n';
import type { StylePreset, AnalyzeResponse, RenderResponse } from './types';


// ─── Application State ──────────────────────────────────────────────────────
//
// These module-level variables hold the entire app state. They persist
// for the lifetime of the page (reset on full page reload or resetApp()).

/** Room analysis data returned by Claude Vision (null until upload completes) */
let currentAnalysis: AnalyzeResponse | null = null;

/** The uploaded floor plan image file (kept for re-generating renders) */
let uploadedFile: File | null = null;

/** The first render generated (used as base image for restyling) */
let baseRender: string | null = null;

/**
 * In-memory cache: styleId → data URL of the generated render.
 * This allows instant switching between already-generated styles
 * without hitting the API again. Cleared on new upload.
 */
const renderCache = new Map<string, string>();

/** The style currently being displayed in the result view */
let currentStyle: StylePreset | null = null;

// Quiz state
let quizAnswers: number[] = [];  // Array of selected option indices (one per question)
let quizStep = 0;                 // Current question index (0-based)
let quizResult: QuizResult | null = null;   // Computed quiz result (null until quiz finishes)
let customStyle: StylePreset | null = null; // The "Made for You" custom style preset

/** Tracks which section is currently visible (used for language refresh) */
let currentView: 'upload' | 'loading' | 'quiz' | 'styles' | 'result' | 'error' = 'upload';


// ─── Browser History (Back/Forward Navigation) ──────────────────────────────
//
// We use the History API (pushState/popState) so that:
//   - Pressing the browser back button goes to the previous view
//   - Each major view (upload, quiz, styles, result) is a history entry
//   - The result view also stores the styleId for restoration

type AppView = 'upload' | 'quiz' | 'styles' | 'result';
interface AppState { view: AppView; styleId?: string }

/** Push a new entry onto the browser history stack */
function pushState(state: AppState): void {
  history.pushState(state, '', null);
}

/**
 * Restore the app to a previous state when the user presses back/forward.
 * Falls back to the upload view if the required data is no longer available.
 */
function restoreState(state: AppState | null): void {
  if (!state) { showSectionRaw('upload'); return; }
  switch (state.view) {
    case 'upload': showSectionRaw('upload'); break;
    case 'quiz':
      // Can only show quiz if we still have analysis data
      if (currentAnalysis) { showSectionRaw('quiz'); renderQuizStep(); }
      else showSectionRaw('upload');
      break;
    case 'styles':
      // Can only show style picker if we have analysis + base render
      if (currentAnalysis && baseRender) showStylePicker(false);
      else showSectionRaw('upload');
      break;
    case 'result':
      // Try to restore the specific style's cached render
      if (state.styleId) {
        const cached = renderCache.get(state.styleId);
        const style = (state.styleId === 'custom' ? customStyle : null)
          ?? getStylePresets().find(s => s.id === state.styleId);
        if (cached && style) { showResultRaw(cached, style); return; }
      }
      // Can't restore result → fall back to style picker or upload
      if (currentAnalysis && baseRender) showStylePicker(false);
      else showSectionRaw('upload');
      break;
  }
}


// ─── Upload Handler ─────────────────────────────────────────────────────────
//
// When the user drops or selects a floor plan image:
//   1. Validate it's an image file
//   2. Reset all previous state (new upload = fresh start)
//   3. Show loading spinner
//   4. Call POST /api/analyze to detect rooms
//   5. On success → show the lifestyle quiz

async function handleUpload(file: File): Promise<void> {
  // Validate file type — only accept images
  if (!file.type.startsWith('image/')) {
    showError(t('error.upload'));
    return;
  }

  // Store the file and reset all state for the new session
  uploadedFile = file;
  renderCache.clear();
  baseRender = null;
  quizAnswers = [];
  quizStep = 0;

  // Show loading with analysis-specific text
  showSectionRaw('loading');
  updateLoadingText(t('loading.analyzing'), t('loading.analyzing.sub'));

  try {
    // Call the backend to analyze the floor plan
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/analyze', { method: 'POST', body: form });
    const data = await res.json() as AnalyzeResponse;

    if (data.error) { showError(data.error); return; }

    // Store the analysis result — used throughout the rest of the session
    currentAnalysis = data;
    console.log('Room data:', JSON.stringify(data, null, 2));

    // Proceed to the quiz
    showSectionRaw('quiz');
    renderQuizStep();
    pushState({ view: 'quiz' });
  } catch {
    showError(t('error.server'));
  }
}


// ─── Quiz Rendering ─────────────────────────────────────────────────────────
//
// The quiz is rendered one question at a time. When the user clicks an
// option, we briefly show a "selected" highlight (250ms), then advance
// to the next question or finish the quiz.

function renderQuizStep(): void {
  const questions = getQuizQuestions();
  const q = questions[quizStep];
  const total = questions.length;

  // Update the step indicator (e.g., "Question 3 of 6")
  document.getElementById('quiz-step')!.textContent =
    t('quiz.step').replace('{current}', String(quizStep + 1)).replace('{total}', String(total));
  document.getElementById('quiz-question')!.textContent = q.question;

  // Animate the progress bar to reflect current position
  const bar = document.getElementById('quiz-progress-bar')!;
  bar.style.width = `${((quizStep) / total) * 100}%`;

  // Build option buttons dynamically
  const container = document.getElementById('quiz-options')!;
  container.innerHTML = '';

  q.options.forEach((option, idx) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-option';
    btn.innerHTML = `
      <span class="quiz-option-icon">${option.icon}</span>
      <span class="quiz-option-label">${option.label}</span>
    `;
    btn.addEventListener('click', () => {
      // Show selection highlight on the clicked option
      container.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      // Short delay for visual feedback, then advance
      setTimeout(() => {
        quizAnswers[quizStep] = idx;
        quizStep++;

        if (quizStep >= questions.length) {
          finishQuiz();  // All questions answered → calculate results
        } else {
          renderQuizStep();  // Show next question
        }
      }, 250);
    });
    container.appendChild(btn);
  });
}


// ─── Quiz Completion ────────────────────────────────────────────────────────
//
// After all 6 questions are answered:
//   1. Fill the progress bar to 100%
//   2. Calculate scores and determine the top style
//   3. Create a custom "Made for You" style from prompt tags
//   4. Generate the first render using that custom style

async function finishQuiz(): Promise<void> {
  // Fill progress bar to 100% for visual completeness
  const bar = document.getElementById('quiz-progress-bar')!;
  bar.style.width = '100%';

  // Calculate which styles match the user's answers
  quizResult = calculateResult(quizAnswers);

  // Create the custom style using the quiz's prompt tags
  const closestPreset = getStylePresets().find(s => s.id === quizResult!.topStyleId) ?? getStylePresets()[0];
  customStyle = createCustomStyle(quizResult.customPrompt, closestPreset);

  // Generate the first render with the user's custom style
  await generateFirstRender(customStyle);
}


// ─── First Render Generation ────────────────────────────────────────────────
//
// This calls POST /api/generate which sends the floor plan image +
// room data + style prompt to Gemini. The result becomes the "base render"
// that all subsequent restyle calls build upon.

async function generateFirstRender(style: StylePreset): Promise<void> {
  if (!uploadedFile || !currentAnalysis) return;

  showSectionRaw('loading');
  updateLoadingText(`${style.label}`, t('loading.generating'));

  try {
    const form = new FormData();
    form.append('file', uploadedFile);
    form.append('style_prompt', style.prompt);
    form.append('room_data', JSON.stringify(currentAnalysis));

    const res = await fetch('/api/generate', { method: 'POST', body: form });
    const data = await res.json() as RenderResponse;

    if (data.error) { showError(data.error); return; }

    // Store as the base render for future restyling
    baseRender = data.render_url;
    // Cache this style's render for instant switching later
    renderCache.set(style.id, data.render_url);

    showResult(data.render_url, style);
  } catch {
    showError(t('error.render'));
  }
}


// ─── Style Picker ───────────────────────────────────────────────────────────
//
// Displays all available styles as cards in a grid. If the user completed
// the quiz, styles are sorted by match percentage and the custom "Made for
// You" style appears at the top. Cards with cached renders show the actual
// render as their thumbnail instead of the placeholder gradient.

function showStylePicker(pushHistory: boolean): void {
  showSectionRaw('styles');
  if (pushHistory) pushState({ view: 'styles' });

  // Show detected room summary (e.g., "3 rooms detected: Living Room, Bedroom, Kitchen")
  if (currentAnalysis) {
    document.getElementById('room-summary')!.textContent =
      t('styles.rooms')
        .replace('{count}', String(currentAnalysis.total_rooms))
        .replace('{list}', currentAnalysis.rooms.map(r => r.label).join(', '));
  }

  const grid = document.getElementById('style-grid')!;
  grid.innerHTML = '';

  // Build a score lookup map from quiz results (if available)
  const scoreMap = new Map<string, number>();
  if (quizResult) {
    for (const entry of quizResult.ranked) {
      scoreMap.set(entry.styleId, entry.score);
    }
  }
  const maxScore = getMaxScore();

  // Sort presets by quiz score (highest first), so best matches appear first
  const presets = getStylePresets();
  const sortedStyles = [...presets].sort((a, b) => {
    return (scoreMap.get(b.id) ?? -1) - (scoreMap.get(a.id) ?? -1);
  });

  // Rebuild custom style with current language labels
  if (customStyle && quizResult) {
    const closestPreset = presets.find(s => s.id === quizResult!.topStyleId) ?? presets[0];
    customStyle = createCustomStyle(quizResult.customPrompt, closestPreset);
  }

  // Show "Download All" only when multiple renders have been generated
  updateDownloadAllVisibility();

  // Prepend the custom style card if the user took the quiz
  const allStyles: StylePreset[] = customStyle ? [customStyle, ...sortedStyles] : sortedStyles;

  // Render a card for each style
  for (const style of allStyles) {
    const card = document.createElement('div');
    card.className = 'style-card';
    if (style.id === 'custom') card.classList.add('custom-style-card');
    card.setAttribute('data-style-id', style.id);

    // Use cached render as thumbnail if available, otherwise show CSS gradient
    const cached = renderCache.get(style.id);
    const thumbContent = cached
      ? `<div class="style-thumbnail" style="background-image: url(${cached}); background-size: cover; background-position: center;"></div>`
      : `<div class="style-thumbnail" style="background: ${style.thumbnail};"></div>`;

    // Show match percentage badge if quiz was completed
    let badge = '';
    if (quizResult) {
      if (style.id === 'custom') {
        badge = `<span class="style-badge recommended">${t('styles.madeForYou')}</span>`;
      } else {
        const score = scoreMap.get(style.id) ?? 0;
        const pct = Math.round((score / maxScore) * 100);
        badge = `<span class="style-badge">${t('styles.match').replace('{pct}', String(pct))}</span>`;
      }
    }

    card.innerHTML = `${thumbContent}<div class="style-info"><h3>${style.label}${badge}</h3><p>${style.description}</p></div>`;
    card.addEventListener('click', () => selectStyle(style));
    grid.appendChild(card);
  }
}


// ─── Style Selection ────────────────────────────────────────────────────────
//
// When a user clicks a style card:
//   1. If we have a cached render → show it instantly
//   2. If no base render exists yet → generate from scratch
//   3. Otherwise → restyle the base render into the new style

async function selectStyle(style: StylePreset): Promise<void> {
  // Highlight the selected card
  const grid = document.getElementById('style-grid')!;
  grid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`[data-style-id="${style.id}"]`)?.classList.add('selected');

  // Check if we already have this style's render cached
  const cached = renderCache.get(style.id);
  if (cached) { showResult(cached, style); return; }

  // If no base render exists, we need to generate from scratch
  if (!baseRender) {
    await generateFirstRender(style);
    return;
  }

  // Restyle the existing base render into the new style
  showSectionRaw('loading');
  updateLoadingText(`${style.label}`, t('loading.restyling'));

  try {
    const form = new FormData();
    form.append('base_image', baseRender);
    form.append('style_prompt', style.prompt);

    const res = await fetch('/api/restyle', { method: 'POST', body: form });
    const data = await res.json() as RenderResponse;

    if (data.error) { showError(data.error); return; }

    // Cache the result and update the style card's thumbnail
    renderCache.set(style.id, data.render_url);
    updateStyleCard(style.id, data.render_url);

    showResult(data.render_url, style);
  } catch {
    showError(t('error.restyle'));
  }
}

/**
 * Update a style card's thumbnail to show the actual render
 * instead of the placeholder gradient.
 */
function updateStyleCard(styleId: string, renderUrl: string): void {
  const card = document.querySelector(`[data-style-id="${styleId}"]`);
  if (!card) return;
  const thumb = card.querySelector('.style-thumbnail') as HTMLElement;
  if (!thumb) return;
  thumb.style.cssText = `background-image: url(${renderUrl}); background-size: cover; background-position: center;`;
}


// ─── Result Display ─────────────────────────────────────────────────────────

/** Show the render result and push a history entry */
function showResult(renderUrl: string, style: StylePreset): void {
  showResultRaw(renderUrl, style);
  pushState({ view: 'result', styleId: style.id });
}

/** Show the render result without pushing history (used by restoreState) */
function showResultRaw(renderUrl: string, style: StylePreset): void {
  currentStyle = style;
  showSectionRaw('result');

  // Ensure action buttons are visible
  document.getElementById('regenerate-btn')!.classList.remove('hidden');
  document.getElementById('try-another-style-btn')!.classList.remove('hidden');

  // Display the render image and style info
  (document.getElementById('render-image') as HTMLImageElement).src = renderUrl;
  document.getElementById('result-style-name')!.textContent = style.label;
  document.getElementById('result-style-desc')!.textContent = style.description;
}


// ─── Regenerate ─────────────────────────────────────────────────────────────
//
// The "Regenerate" button calls the restyle API again with the same style
// prompt. Because Gemini is non-deterministic, each regeneration produces
// a slightly different render — useful if the user doesn't like the first one.

async function regenerateRender(style: StylePreset): Promise<void> {
  if (!baseRender) return;

  showSectionRaw('loading');
  updateLoadingText(`${style.label}`, t('loading.regenerating'));

  try {
    const form = new FormData();
    form.append('base_image', baseRender);
    form.append('style_prompt', style.prompt);

    const res = await fetch('/api/restyle', { method: 'POST', body: form });
    const data = await res.json() as RenderResponse;

    if (data.error) { showError(data.error); return; }

    // Update the cache with the new render
    renderCache.set(style.id, data.render_url);
    updateStyleCard(style.id, data.render_url);

    showResultRaw(data.render_url, style);
  } catch {
    showError(t('error.restyle'));
  }
}


// ─── Download ───────────────────────────────────────────────────────────────

/** Convert a data URL to a Blob and trigger a file download */
function downloadDataUrl(dataUrl: string, filename: string): void {
  const [header, b64] = dataUrl.split(',', 2);
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Download the current style's render */
function downloadCurrentRender(): void {
  if (!currentStyle) return;
  const url = renderCache.get(currentStyle.id);
  if (!url) return;
  downloadDataUrl(url, `stylespace-${currentStyle.id}.png`);
}

/** Download all cached renders (one file per style, staggered to avoid browser blocking) */
function downloadAllRenders(): void {
  const presets = getStylePresets();
  const entries = [...renderCache.entries()];
  entries.forEach(([styleId, url], i) => {
    const preset = styleId === 'custom' ? customStyle : presets.find(s => s.id === styleId);
    const name = preset ? preset.id : styleId;
    // Stagger downloads — browsers block rapid successive downloads
    setTimeout(() => downloadDataUrl(url, `stylespace-${name}.png`), i * 300);
  });
}

/** Show/hide the "Download All" button based on how many renders are cached */
function updateDownloadAllVisibility(): void {
  const btn = document.getElementById('download-all-btn')!;
  if (renderCache.size > 1) {
    btn.classList.remove('hidden');
  } else {
    btn.classList.add('hidden');
  }
}


// ─── UI Helpers ─────────────────────────────────────────────────────────────

/** Update the loading screen's title and subtitle text */
function updateLoadingText(title: string, subtitle: string): void {
  document.getElementById('loading-text')!.textContent = title;
  document.getElementById('loading-subtext')!.textContent = subtitle;
}

/**
 * Show a specific section and hide all others.
 * Also toggles the home button visibility (hidden on upload page).
 */
function showSectionRaw(section: 'upload' | 'loading' | 'quiz' | 'styles' | 'result' | 'error'): void {
  currentView = section;

  // Hide all sections first
  ['upload-section', 'loading-section', 'quiz-section', 'styles-section', 'result-section', 'error-section'].forEach(id => {
    document.getElementById(id)!.classList.add('hidden');
  });

  // Show the target section
  document.getElementById(`${section}-section`)!.classList.remove('hidden');

  // Show the home button on all pages except the upload page
  const homeBtn = document.getElementById('home-btn')!;
  if (section === 'upload') {
    homeBtn.classList.add('hidden');
  } else {
    homeBtn.classList.remove('hidden');
  }
}

/** Show the error section with a specific message */
function showError(message: string): void {
  document.getElementById('error-message')!.textContent = message;
  showSectionRaw('error');
}

/** Reset all state and return to the upload screen */
function resetApp(): void {
  showSectionRaw('upload');
  uploadedFile = null;
  baseRender = null;
  currentAnalysis = null;
  currentStyle = null;
  renderCache.clear();
  quizAnswers = [];
  quizStep = 0;
  quizResult = null;
  customStyle = null;
  (document.getElementById('file-input') as HTMLInputElement).value = '';
}


// ─── Language Switching ─────────────────────────────────────────────────────
//
// When the language changes, we need to update all visible text.
// updateStaticText() handles elements that are always in the DOM.
// refreshCurrentView() re-renders the current section to pick up
// new translations (e.g., quiz questions, style cards, result labels).

/** Update all static text elements with current language strings */
function updateStaticText(): void {
  document.querySelector('header h1')!.textContent = t('header.title');
  document.querySelector('.tagline')!.textContent = t('header.tagline');
  document.querySelector('.upload-text')!.textContent = t('upload.title');
  document.querySelector('.upload-subtext')!.textContent = t('upload.subtitle');
  document.getElementById('retry-btn')!.textContent = t('btn.tryAgain');
  document.getElementById('skip-quiz-btn')!.textContent = t('btn.skipQuiz');
  document.getElementById('retake-quiz-btn')!.textContent = t('btn.retakeQuiz');
  document.getElementById('new-upload-btn')!.textContent = t('btn.uploadNew');
  document.getElementById('random-style-btn')!.textContent = t('btn.randomStyle');
  document.getElementById('random-style-picker-btn')!.textContent = t('btn.randomStylePicker');
  document.getElementById('regenerate-btn')!.textContent = t('btn.regenerate');
  document.getElementById('try-another-style-btn')!.textContent = t('btn.tryAnother');
  document.getElementById('download-btn')!.textContent = t('btn.download');
  document.getElementById('download-all-btn')!.textContent = t('btn.downloadAll');
  document.querySelector('.styles-header h2')!.textContent = t('styles.title');
  document.getElementById('home-btn')!.textContent = t('btn.home');
  document.getElementById('lang-btn')!.textContent = t('lang.flag');
}

/** Re-render the current view to reflect a language change */
function refreshCurrentView(): void {
  updateStaticText();

  // Re-render dynamic sections that contain translated content
  if (currentView === 'quiz') renderQuizStep();
  if (currentView === 'styles') showStylePicker(false);
  if (currentView === 'result' && currentStyle) {
    // Refresh the result view with re-translated style labels
    const presets = getStylePresets();
    const freshStyle = currentStyle.id === 'custom'
      ? createCustomStyle(currentStyle.prompt, presets.find(s => s.id === quizResult?.topStyleId) ?? presets[0])
      : presets.find(s => s.id === currentStyle!.id) ?? currentStyle;
    currentStyle = freshStyle;
    document.getElementById('result-style-name')!.textContent = freshStyle.label;
    document.getElementById('result-style-desc')!.textContent = freshStyle.description;
  }
}


// ─── Initialization ─────────────────────────────────────────────────────────
//
// All event listeners and setup logic runs once the DOM is ready.

document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('upload-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  // Set all static text to the default language (Thai)
  updateStaticText();

  // ── Navigation: Logo and Home button both reset to upload ──
  const goHome = (e: Event) => { e.preventDefault(); resetApp(); pushState({ view: 'upload' }); };
  document.getElementById('logo-link')!.addEventListener('click', goHome);
  document.getElementById('home-btn')!.addEventListener('click', goHome);

  // ── Language toggle: switch between Thai and English ──
  document.getElementById('lang-btn')!.addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'th' : 'en');
  });
  // Re-render the current view whenever language changes
  onLangChange(refreshCurrentView);

  // ── Browser history: handle back/forward button presses ──
  history.replaceState({ view: 'upload' } as AppState, '', null);
  window.addEventListener('popstate', (e) => restoreState(e.state as AppState | null));

  // ── Upload zone: click to browse, drag and drop ──
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleUpload(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleUpload(file);
  });

  // ── Button event listeners ──
  document.getElementById('retry-btn')!.addEventListener('click', () => { resetApp(); pushState({ view: 'upload' }); });
  document.getElementById('try-another-style-btn')!.addEventListener('click', () => {
    if (currentAnalysis && baseRender) {
      showStylePicker(true);
    } else {
      resetApp();
      pushState({ view: 'upload' });
    }
  });
  document.getElementById('regenerate-btn')!.addEventListener('click', () => { if (currentStyle) regenerateRender(currentStyle); });
  document.getElementById('download-btn')!.addEventListener('click', downloadCurrentRender);
  document.getElementById('download-all-btn')!.addEventListener('click', downloadAllRenders);
  document.getElementById('new-upload-btn')!.addEventListener('click', () => { resetApp(); pushState({ view: 'upload' }); });
  document.getElementById('skip-quiz-btn')!.addEventListener('click', () => showStylePicker(true));
  document.getElementById('random-style-picker-btn')!.addEventListener('click', () => {
    selectStyle(createRandomStyle());
  });
  document.getElementById('random-style-btn')!.addEventListener('click', () => {
    generateFirstRender(createRandomStyle());
  });
  document.getElementById('retake-quiz-btn')!.addEventListener('click', () => {
    // Reset quiz state and start over
    quizAnswers = [];
    quizStep = 0;
    quizResult = null;
    customStyle = null;
    showSectionRaw('quiz');
    renderQuizStep();
    pushState({ view: 'quiz' });
  });
});
