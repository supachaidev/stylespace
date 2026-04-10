import { getStylePresets, createCustomStyle } from './styles';
import { getQuizQuestions, calculateResult, getMaxScore, type QuizResult } from './quiz';
import { t, getLang, setLang, onLangChange } from './i18n';
import type { StylePreset, AnalyzeResponse, RenderResponse } from './types';


let currentAnalysis: AnalyzeResponse | null = null;
let uploadedFile: File | null = null;
let baseRender: string | null = null;
const renderCache = new Map<string, string>();
let currentStyle: StylePreset | null = null;

// Quiz state
let quizAnswers: number[] = [];
let quizStep = 0;
let quizResult: QuizResult | null = null;
let customStyle: StylePreset | null = null;

// Track current view for language refresh
let currentView: 'upload' | 'loading' | 'quiz' | 'styles' | 'result' | 'error' = 'upload';

// --- History ---
type AppView = 'upload' | 'quiz' | 'styles' | 'result';
interface AppState { view: AppView; styleId?: string }

function pushState(state: AppState): void {
  history.pushState(state, '', null);
}

function restoreState(state: AppState | null): void {
  if (!state) { showSectionRaw('upload'); return; }
  switch (state.view) {
    case 'upload': showSectionRaw('upload'); break;
    case 'quiz':
      if (currentAnalysis) { showSectionRaw('quiz'); renderQuizStep(); }
      else showSectionRaw('upload');
      break;
    case 'styles':
      if (currentAnalysis && baseRender) showStylePicker(false);
      else showSectionRaw('upload');
      break;
    case 'result':
      if (state.styleId) {
        const cached = renderCache.get(state.styleId);
        const style = (state.styleId === 'custom' ? customStyle : null)
          ?? getStylePresets().find(s => s.id === state.styleId);
        if (cached && style) { showResultRaw(cached, style); return; }
      }
      if (currentAnalysis && baseRender) showStylePicker(false);
      else showSectionRaw('upload');
      break;
  }
}

// --- Upload ---
async function handleUpload(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    showError(t('error.upload'));
    return;
  }
  uploadedFile = file;
  renderCache.clear();
  baseRender = null;
  quizAnswers = [];
  quizStep = 0;
  showSectionRaw('loading');
  updateLoadingText(t('loading.analyzing'), t('loading.analyzing.sub'));

  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/analyze', { method: 'POST', body: form });
    const data = await res.json() as AnalyzeResponse;
    if (data.error) { showError(data.error); return; }
    currentAnalysis = data;
    console.log('Room data:', JSON.stringify(data, null, 2));

    showSectionRaw('quiz');
    renderQuizStep();
    pushState({ view: 'quiz' });
  } catch {
    showError(t('error.server'));
  }
}

// --- Quiz ---
function renderQuizStep(): void {
  const questions = getQuizQuestions();
  const q = questions[quizStep];
  const total = questions.length;

  document.getElementById('quiz-step')!.textContent =
    t('quiz.step').replace('{current}', String(quizStep + 1)).replace('{total}', String(total));
  document.getElementById('quiz-question')!.textContent = q.question;

  const bar = document.getElementById('quiz-progress-bar')!;
  bar.style.width = `${((quizStep) / total) * 100}%`;

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
      container.querySelectorAll('.quiz-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      setTimeout(() => {
        quizAnswers[quizStep] = idx;
        quizStep++;

        if (quizStep >= questions.length) {
          finishQuiz();
        } else {
          renderQuizStep();
        }
      }, 250);
    });
    container.appendChild(btn);
  });
}

async function finishQuiz(): Promise<void> {
  const bar = document.getElementById('quiz-progress-bar')!;
  bar.style.width = '100%';

  quizResult = calculateResult(quizAnswers);
  const closestPreset = getStylePresets().find(s => s.id === quizResult!.topStyleId) ?? getStylePresets()[0];
  customStyle = createCustomStyle(quizResult.customPrompt, closestPreset);

  await generateFirstRender(customStyle);
}

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
    baseRender = data.render_url;
    renderCache.set(style.id, data.render_url);
    showResult(data.render_url, style);
  } catch {
    showError(t('error.render'));
  }
}

// --- Style Picker ---
function showStylePicker(pushHistory: boolean): void {
  showSectionRaw('styles');
  if (pushHistory) pushState({ view: 'styles' });

  if (currentAnalysis) {
    document.getElementById('room-summary')!.textContent =
      t('styles.rooms')
        .replace('{count}', String(currentAnalysis.total_rooms))
        .replace('{list}', currentAnalysis.rooms.map(r => r.label).join(', '));
  }

  const grid = document.getElementById('style-grid')!;
  grid.innerHTML = '';

  const scoreMap = new Map<string, number>();
  if (quizResult) {
    for (const entry of quizResult.ranked) {
      scoreMap.set(entry.styleId, entry.score);
    }
  }
  const maxScore = getMaxScore();
  const presets = getStylePresets();
  const sortedStyles = [...presets].sort((a, b) => {
    return (scoreMap.get(b.id) ?? -1) - (scoreMap.get(a.id) ?? -1);
  });

  // Rebuild custom style with current language
  if (customStyle && quizResult) {
    const closestPreset = presets.find(s => s.id === quizResult!.topStyleId) ?? presets[0];
    customStyle = createCustomStyle(quizResult.customPrompt, closestPreset);
  }

  const allStyles: StylePreset[] = customStyle ? [customStyle, ...sortedStyles] : sortedStyles;

  for (const style of allStyles) {
    const card = document.createElement('div');
    card.className = 'style-card';
    if (style.id === 'custom') card.classList.add('custom-style-card');
    card.setAttribute('data-style-id', style.id);

    const cached = renderCache.get(style.id);
    const thumbContent = cached
      ? `<div class="style-thumbnail" style="background-image: url(${cached}); background-size: cover; background-position: center;"></div>`
      : `<div class="style-thumbnail" style="background: ${style.thumbnail};"></div>`;

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

async function selectStyle(style: StylePreset): Promise<void> {
  const grid = document.getElementById('style-grid')!;
  grid.querySelectorAll('.style-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`[data-style-id="${style.id}"]`)?.classList.add('selected');

  const cached = renderCache.get(style.id);
  if (cached) { showResult(cached, style); return; }

  if (!baseRender) {
    await generateFirstRender(style);
    return;
  }

  showSectionRaw('loading');
  updateLoadingText(`${style.label}`, t('loading.restyling'));

  try {
    const form = new FormData();
    form.append('base_image', baseRender);
    form.append('style_prompt', style.prompt);
    const res = await fetch('/api/restyle', { method: 'POST', body: form });
    const data = await res.json() as RenderResponse;
    if (data.error) { showError(data.error); return; }
    renderCache.set(style.id, data.render_url);
    updateStyleCard(style.id, data.render_url);

    showResult(data.render_url, style);
  } catch {
    showError(t('error.restyle'));
  }
}

function updateStyleCard(styleId: string, renderUrl: string): void {
  const card = document.querySelector(`[data-style-id="${styleId}"]`);
  if (!card) return;
  const thumb = card.querySelector('.style-thumbnail') as HTMLElement;
  if (!thumb) return;
  thumb.style.cssText = `background-image: url(${renderUrl}); background-size: cover; background-position: center;`;
}

// --- Result ---
function showResult(renderUrl: string, style: StylePreset): void {
  showResultRaw(renderUrl, style);
  pushState({ view: 'result', styleId: style.id });
}

function showResultRaw(renderUrl: string, style: StylePreset): void {
  currentStyle = style;
  showSectionRaw('result');
  document.getElementById('regenerate-btn')!.classList.remove('hidden');
  document.getElementById('try-another-style-btn')!.classList.remove('hidden');

  (document.getElementById('render-image') as HTMLImageElement).src = renderUrl;
  document.getElementById('result-style-name')!.textContent = style.label;
  document.getElementById('result-style-desc')!.textContent = style.description;
}

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
    renderCache.set(style.id, data.render_url);
    updateStyleCard(style.id, data.render_url);

    showResultRaw(data.render_url, style);
  } catch {
    showError(t('error.restyle'));
  }
}

// --- Helpers ---
function updateLoadingText(title: string, subtitle: string): void {
  document.getElementById('loading-text')!.textContent = title;
  document.getElementById('loading-subtext')!.textContent = subtitle;
}

function showSectionRaw(section: 'upload' | 'loading' | 'quiz' | 'styles' | 'result' | 'error'): void {
  currentView = section;
  ['upload-section', 'loading-section', 'quiz-section', 'styles-section', 'result-section', 'error-section'].forEach(id => {
    document.getElementById(id)!.classList.add('hidden');
  });
  document.getElementById(`${section}-section`)!.classList.remove('hidden');

  // Show home button when not on upload page
  const homeBtn = document.getElementById('home-btn')!;
  if (section === 'upload') {
    homeBtn.classList.add('hidden');
  } else {
    homeBtn.classList.remove('hidden');
  }
}

function showError(message: string): void {
  document.getElementById('error-message')!.textContent = message;
  showSectionRaw('error');
}

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

// --- i18n: update all static UI text ---
function updateStaticText(): void {
  document.querySelector('header h1')!.textContent = t('header.title');
  document.querySelector('.tagline')!.textContent = t('header.tagline');
  document.querySelector('.upload-text')!.textContent = t('upload.title');
  document.querySelector('.upload-subtext')!.textContent = t('upload.subtitle');
  document.getElementById('retry-btn')!.textContent = t('btn.tryAgain');
  document.getElementById('skip-quiz-btn')!.textContent = t('btn.skipQuiz');
  document.getElementById('retake-quiz-btn')!.textContent = t('btn.retakeQuiz');
  document.getElementById('new-upload-btn')!.textContent = t('btn.uploadNew');
  document.getElementById('regenerate-btn')!.textContent = t('btn.regenerate');
  document.getElementById('try-another-style-btn')!.textContent = t('btn.tryAnother');
  document.querySelector('.styles-header h2')!.textContent = t('styles.title');
  document.getElementById('home-btn')!.textContent = t('btn.home');
  document.getElementById('lang-btn')!.textContent = t('lang.flag');
}

function refreshCurrentView(): void {
  updateStaticText();
  if (currentView === 'quiz') renderQuizStep();
  if (currentView === 'styles') showStylePicker(false);
  if (currentView === 'result' && currentStyle) {
    // Refresh labels with new language
    const presets = getStylePresets();
    const freshStyle = currentStyle.id === 'custom'
      ? createCustomStyle(currentStyle.prompt, presets.find(s => s.id === quizResult?.topStyleId) ?? presets[0])
      : presets.find(s => s.id === currentStyle!.id) ?? currentStyle;
    currentStyle = freshStyle;
    document.getElementById('result-style-name')!.textContent = freshStyle.label;
    document.getElementById('result-style-desc')!.textContent = freshStyle.description;
  }
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('upload-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  updateStaticText();

  // Logo and home button go to upload
  const goHome = (e: Event) => { e.preventDefault(); resetApp(); pushState({ view: 'upload' }); };
  document.getElementById('logo-link')!.addEventListener('click', goHome);
  document.getElementById('home-btn')!.addEventListener('click', goHome);

  // Language toggle
  document.getElementById('lang-btn')!.addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'th' : 'en');
  });
  onLangChange(refreshCurrentView);

  history.replaceState({ view: 'upload' } as AppState, '', null);
  window.addEventListener('popstate', (e) => restoreState(e.state as AppState | null));

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
  document.getElementById('new-upload-btn')!.addEventListener('click', () => { resetApp(); pushState({ view: 'upload' }); });
  document.getElementById('skip-quiz-btn')!.addEventListener('click', () => showStylePicker(true));
  document.getElementById('retake-quiz-btn')!.addEventListener('click', () => {
    quizAnswers = [];
    quizStep = 0;
    quizResult = null;
    customStyle = null;
    showSectionRaw('quiz');
    renderQuizStep();
    pushState({ view: 'quiz' });
  });
});
