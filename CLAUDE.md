# CLAUDE.md — Floorplan to 3D Visualizer
# Project: "All in" × SCG | Bangkok University Senior Project

## 🎯 Project Overview
Build a web app where a user uploads a 2D floor plan image and gets:
1. A **photorealistic isometric render** (via Gemini image generation — "Nano Banana")
2. An **interactive 3D viewer** (Three.js) with simplified room boxes
3. **SCG material swapping** — click wall/floor → apply SCG paint/tile presets

This is a competition demo. Priority = visual impact + reliability. Not research accuracy.

---

## 📁 Project Structure to Create

```
floorplan-3d/
├── CLAUDE.md                        ← this file
├── backend/
│   ├── main.py                      ← FastAPI app (all routes)
│   ├── render.py                    ← Gemini image generation
│   ├── analyze.py                   ← Claude Vision room detection
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html                   ← Vite entry point
│   ├── style.css
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── package.json
│   └── src/
│       ├── types.ts                 ← ALL shared TypeScript interfaces
│       ├── materials.ts             ← SCG material presets
│       ├── viewer3d.ts              ← Three.js 3D viewer
│       └── main.ts                 ← upload flow, UI, tab switching
├── sample_plans/                    ← put 3 test floor plan images here
└── README.md
```

---

## 🔑 Environment Variables

Create `backend/.env`:
```
ANTHROPIC_API_KEY=your_key_here
GOOGLE_API_KEY=your_key_here
```

Create `backend/.env.example` with same keys but empty values.

---

## 🛠️ Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Backend | FastAPI + Python 3.11+ | Uvicorn server |
| Render API | Google Gemini (`google-generativeai`) | Image generation |
| Analyze API | Anthropic Claude (`anthropic`) | Vision + JSON |
| 3D Viewer | Three.js (npm) | Typed via @types/three |
| Frontend | TypeScript + Vite | Fast HMR, no framework |
| Env | python-dotenv | Load .env |

---

## 📦 backend/requirements.txt

```
fastapi==0.115.0
uvicorn==0.30.0
python-multipart==0.0.9
anthropic==0.40.0
google-generativeai==0.8.3
python-dotenv==1.0.1
Pillow==10.4.0
httpx==0.27.0
```

---

## 📦 frontend/package.json

```json
{
  "name": "floorplan-3d-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "^0.168.0"
  },
  "devDependencies": {
    "@types/three": "^0.168.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

---

## ⚙️ frontend/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

---

## ⚙️ frontend/vite.config.ts

```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
```

Vite dev server at port 3000 proxies all /api/* → FastAPI at port 8000.
In production, FastAPI serves the built frontend/dist/ directly.

---

## 🧩 frontend/src/types.ts

Define ALL shared types here. Import from this file everywhere else — no inline types.

```typescript
export type RoomType =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'dining'
  | 'corridor'
  | 'balcony'
  | 'other';

export interface Room {
  id: string;
  label: string;
  type: RoomType;
  x: number;       // 0.0–1.0 fraction of total floor plan width
  y: number;       // 0.0–1.0 fraction of total floor plan depth
  width: number;   // 0.0–1.0 fraction
  depth: number;   // 0.0–1.0 fraction
  color: string;   // hex string e.g. "#E8D5B7"
}

export interface RoomData {
  rooms: Room[];
  total_rooms: number;
}

export interface MaterialPreset {
  id: string;
  label: string;
  color: string;   // hex string
}

export interface SCGMaterialLibrary {
  walls: MaterialPreset[];
  floors: MaterialPreset[];
}

export interface RenderResponse {
  render_url: string;   // "data:image/png;base64,..."
  error?: string;
}

export interface AnalyzeResponse extends RoomData {
  error?: string;
}

export type SurfaceType = 'walls' | 'floor';
```

---

## 🎨 frontend/src/materials.ts

```typescript
import type { SCGMaterialLibrary } from './types';

export const SCG_MATERIALS: SCGMaterialLibrary = {
  walls: [
    { id: 'white',       label: 'Pure White',    color: '#F5F5F0' },
    { id: 'cream',       label: 'Warm Cream',    color: '#F5EDD6' },
    { id: 'sage',        label: 'Sage Green',    color: '#B2C4B2' },
    { id: 'slate',       label: 'Slate Gray',    color: '#8A9BB0' },
    { id: 'terracotta',  label: 'Terracotta',    color: '#C4714A' },
    { id: 'charcoal',    label: 'Charcoal',      color: '#3A3A3A' },
  ],
  floors: [
    { id: 'oak',             label: 'Oak Wood',        color: '#C4924A' },
    { id: 'marble',          label: 'White Marble',    color: '#E8E4E0' },
    { id: 'concrete',        label: 'Concrete',        color: '#9A9A9A' },
    { id: 'terracotta_tile', label: 'Terracotta Tile', color: '#C4714A' },
    { id: 'dark_wood',       label: 'Dark Teak',       color: '#4A3020' },
    { id: 'white_tile',      label: 'White Tile',      color: '#EFEFEF' },
  ],
};
```

---

## 🧊 frontend/src/viewer3d.ts

### Imports
```typescript
import * as THREE from 'three';
import type { RoomData, SurfaceType, MaterialPreset } from './types';
```

### Module-level state (needed so applyMaterial works after init):
```typescript
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let renderer: THREE.WebGLRenderer | null = null;
```

### Export: `initViewer(containerId: string, roomData: RoomData): void`

Scene setup:
- `scene = new THREE.Scene(); scene.background = new THREE.Color('#0D0D0D');`
- Container = `document.getElementById(containerId)` — assert non-null
- Renderer fills container; `renderer.setPixelRatio(window.devicePixelRatio)`
- `camera = new THREE.PerspectiveCamera(50, width/height, 0.1, 200)`

Scale rule: room fractions × 20 = Three.js units. Room height = 3 units.

For each room in `roomData.rooms`:
```typescript
const geo = new THREE.BoxGeometry(room.width * 20, 3, room.depth * 20);
const mat = new THREE.MeshStandardMaterial({
  color: new THREE.Color(room.color),
  roughness: 0.8,
});
const mesh = new THREE.Mesh(geo, mat);
mesh.userData = { roomId: room.id, label: room.label, surface: 'room' };
mesh.position.set(
  room.x * 20 + (room.width * 20) / 2,
  1.5,
  room.y * 20 + (room.depth * 20) / 2
);
scene.add(mesh);
```

Floor plane:
```typescript
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(22, 22),
  new THREE.MeshStandardMaterial({ color: '#C4924A', roughness: 0.9 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(10, 0, 10);
floor.userData = { surface: 'floor' };
scene.add(floor);
```

Lighting:
```typescript
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 15, 10);
scene.add(dirLight);
```

Manual orbit (implement fully, no external import):
```typescript
const spherical = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 28 };

function updateCamera(): void {
  if (!camera) return;
  camera.position.set(
    spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
    spherical.radius * Math.cos(spherical.phi),
    spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta)
  );
  camera.lookAt(10, 0, 10);
}

let isDragging = false;
let prevMouse = { x: 0, y: 0 };

renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
  isDragging = true;
  prevMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { isDragging = false; });
renderer.domElement.addEventListener('mousemove', (e: MouseEvent) => {
  if (!isDragging) return;
  spherical.theta -= (e.clientX - prevMouse.x) * 0.01;
  spherical.phi = Math.max(0.2, Math.min(Math.PI / 2.2,
    spherical.phi - (e.clientY - prevMouse.y) * 0.01));
  prevMouse = { x: e.clientX, y: e.clientY };
  updateCamera();
});
renderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
  spherical.radius = Math.max(10, Math.min(50, spherical.radius + e.deltaY * 0.05));
  updateCamera();
}, { passive: true });

updateCamera();
```

Room labels: create absolutely-positioned div over container for each room.
Update positions each animation frame by projecting 3D → screen coords:
```typescript
function updateLabel(labelEl: HTMLElement, mesh: THREE.Mesh): void {
  if (!camera || !renderer) return;
  const pos = mesh.position.clone().project(camera);
  const x = (pos.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
  const y = (-pos.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
  labelEl.style.left = `${x}px`;
  labelEl.style.top = `${y}px`;
}
```

Animation loop: `renderer.setAnimationLoop(() => { renderer.render(scene!, camera!); /* update labels */ })`

Handle resize with ResizeObserver on container.

---

### Export: `applyMaterial(surface: SurfaceType, preset: MaterialPreset): void`

```typescript
export function applyMaterial(surface: SurfaceType, preset: MaterialPreset): void {
  if (!scene) return;
  const targetColor = new THREE.Color(preset.color);

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (obj.userData['surface'] !== surface) return;

    const mat = obj.material as THREE.MeshStandardMaterial;
    const startColor = mat.color.clone();
    const startTime = performance.now();
    const duration = 300;

    function animate(): void {
      const t = Math.min((performance.now() - startTime) / duration, 1);
      mat.color.lerpColors(startColor, targetColor, t);
      if (t < 1) requestAnimationFrame(animate);
    }
    animate();
  });
}
```

---

## 📱 frontend/src/main.ts

```typescript
import { SCG_MATERIALS } from './materials';
import { initViewer, applyMaterial } from './viewer3d';
import type {
  RenderResponse, AnalyzeResponse, SurfaceType, MaterialPreset
} from './types';
```

Implement these functions:

```typescript
async function fetchRender(file: File): Promise<RenderResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/render', { method: 'POST', body: form });
  return res.json() as Promise<RenderResponse>;
}

async function fetchAnalyze(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/analyze', { method: 'POST', body: form });
  return res.json() as Promise<AnalyzeResponse>;
}

async function handleFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    showError('Please upload an image file (JPG, PNG, etc.)');
    return;
  }
  showSection('loading');
  try {
    const [renderRes, analyzeRes] = await Promise.all([
      fetchRender(file),
      fetchAnalyze(file),
    ]);
    if (renderRes.error || analyzeRes.error) {
      showError(renderRes.error ?? analyzeRes.error ?? 'Processing failed');
      return;
    }
    showResults(renderRes.render_url, analyzeRes);
  } catch (_err) {
    showError('Could not reach the server. Is the backend running?');
  }
}

function showResults(renderUrl: string, analyzeData: AnalyzeResponse): void {
  const img = document.getElementById('render-image') as HTMLImageElement;
  img.src = renderUrl;
  showSection('results');
  switchTab('render');
  initViewer('viewer-container', analyzeData);
  renderMaterialPanel();
}

function renderMaterialPanel(): void {
  const container = document.getElementById('material-swatches')!;
  container.innerHTML = '';

  (['walls', 'floors'] as const).forEach((surface) => {
    const section = document.createElement('div');
    section.className = 'material-section';
    section.innerHTML = `<h4>${surface === 'walls' ? '🎨 Walls' : '🪵 Floors'}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'swatch-grid';

    SCG_MATERIALS[surface].forEach((preset: MaterialPreset) => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.title = preset.label;
      swatch.style.backgroundColor = preset.color;
      swatch.addEventListener('click', () => {
        grid.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        applyMaterial(surface === 'walls' ? 'walls' : 'floor' as SurfaceType, preset);
      });
      const label = document.createElement('span');
      label.textContent = preset.label;
      const wrapper = document.createElement('div');
      wrapper.className = 'swatch-wrapper';
      wrapper.appendChild(swatch);
      wrapper.appendChild(label);
      grid.appendChild(wrapper);
    });

    section.appendChild(grid);
    container.appendChild(section);
  });
}

function switchTab(tab: 'render' | '3d'): void {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
  });
  document.getElementById('tab-render')!.classList.toggle('hidden', tab !== 'render');
  document.getElementById('tab-3d')!.classList.toggle('hidden', tab !== '3d');
}

function showSection(section: 'upload' | 'loading' | 'results' | 'error'): void {
  ['upload-section', 'loading-section', 'results-section', 'error-section'].forEach(id => {
    document.getElementById(id)!.classList.add('hidden');
  });
  document.getElementById(`${section}-section`)!.classList.remove('hidden');
}

function showError(message: string): void {
  document.getElementById('error-message')!.textContent = message;
  showSection('error');
}
```

Setup on DOMContentLoaded:
```typescript
document.addEventListener('DOMContentLoaded', () => {
  const uploadZone = document.getElementById('upload-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });
  uploadZone.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab') as 'render' | '3d';
      switchTab(tab);
    });
  });

  document.getElementById('retry-btn')!.addEventListener('click', () => {
    showSection('upload');
    fileInput.value = '';
  });
});
```

---

## 🖥️ frontend/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SCG Space Visualizer | All in</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>

  <header>
    <div class="logo">
      <span class="logo-scg">SCG</span>
      <span class="logo-sep">×</span>
      <span class="logo-allin">All in</span>
    </div>
    <h1>Space Visualizer</h1>
    <p class="tagline">Upload your floor plan. See it in 3D instantly.</p>
  </header>

  <main>
    <!-- Upload -->
    <section id="upload-section">
      <div id="upload-zone">
        <input type="file" id="file-input" accept="image/*" hidden />
        <div class="upload-icon">⬆</div>
        <p class="upload-text">Drop your floor plan here</p>
        <p class="upload-subtext">or click to browse · JPG, PNG</p>
      </div>
    </section>

    <!-- Loading -->
    <section id="loading-section" class="hidden">
      <div class="spinner"></div>
      <p class="loading-text">Analyzing your floor plan...</p>
      <p class="loading-subtext">Generating render & 3D model simultaneously</p>
    </section>

    <!-- Error -->
    <section id="error-section" class="hidden">
      <p class="error-text" id="error-message"></p>
      <button id="retry-btn">Try Again</button>
    </section>

    <!-- Results -->
    <section id="results-section" class="hidden">
      <div class="tabs">
        <button class="tab-btn active" data-tab="render">🎨 AI Render</button>
        <button class="tab-btn" data-tab="3d">🧊 3D Explorer</button>
      </div>

      <div id="tab-render" class="tab-content">
        <img id="render-image" src="" alt="AI Render" />
      </div>

      <div id="tab-3d" class="tab-content hidden">
        <div class="explorer-layout">
          <div id="viewer-container"></div>
          <aside id="material-panel">
            <h3>SCG Materials</h3>
            <div id="material-swatches"></div>
          </aside>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <p>Bangkok University × SCG | Senior Project 2026</p>
  </footer>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

---

## 🎨 frontend/style.css

Design tokens:
- `--bg: #0A0A0A`
- `--surface: #141414`
- `--border: #2A2A2A`
- `--accent: #E8401C` (SCG red-orange)
- `--accent-gold: #F5A623`
- `--text: #FFFFFF`
- `--text-muted: #888888`
- `--font: 'Inter', sans-serif`

Implement styles for:
- `body`: dark bg, font, min-height 100vh
- `header`: centered, 40px padding, `.logo` with gradient text
- `.logo-scg`: bold, accent color. `.logo-allin`: italic
- `#upload-zone`: 300px tall, dashed border `#333`, border-radius 16px, flex center, cursor pointer, transition 0.2s. `.drag-over`: border-color accent, bg `#1A1A1A`
- `#loading-section`, `#error-section`: centered flex column
- `.spinner`: 48px, border 3px solid `#333`, border-top accent, border-radius 50%, animation spin 0.8s linear infinite
- `.tabs`: flex, gap 12px, margin-bottom 24px
- `.tab-btn`: pill, padding 10px 24px, bg `#1A1A1A`, border none, color `--text-muted`, cursor pointer. `.active`: bg accent, color white
- `.tab-content`: fade-in transition on show
- `#render-image`: max-width 100%, border-radius 12px, display block, margin auto
- `.explorer-layout`: flex row, gap 20px
- `#viewer-container`: flex 1, height 520px, bg `#0D0D0D`, border-radius 12px, overflow hidden, position relative
- `#material-panel`: width 240px, flex-shrink 0, bg `--surface`, border-radius 12px, padding 20px
- `.swatch-grid`: flex, flex-wrap wrap, gap 12px
- `.swatch-wrapper`: flex column, align-items center, gap 4px
- `.swatch`: 48px circle, cursor pointer, border 3px solid transparent, transition 0.2s. `.active`: border-color accent, box-shadow 0 0 12px accent with 40% opacity
- `.swatch span`: 10px font, `--text-muted`, text-align center, max-width 56px
- `.room-label`: position absolute, background rgba(0,0,0,0.75), color white, padding 2px 8px, border-radius 10px, font-size 11px, pointer-events none, transform translate(-50%, -50%), white-space nowrap
- `.hidden`: display none
- `footer`: text-align center, padding 20px, color `--text-muted`, font-size 12px
- `button#retry-btn`: accent background, white text, padding 12px 32px, border-radius 8px, border none, cursor pointer, font-size 16px

---

## 🚀 Backend Files

### backend/main.py

```python
from fastapi import FastAPI, File, UploadFile
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
from render import generate_render
from analyze import analyze_rooms

load_dotenv()
app = FastAPI(title="SCG Space Visualizer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/render")
async def render_endpoint(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        mime_type = file.content_type or "image/jpeg"
        b64 = await generate_render(image_bytes, mime_type)
        return {"render_url": f"data:{mime_type};base64,{b64}"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/analyze")
async def analyze_endpoint(file: UploadFile = File(...)):
    try:
        image_bytes = await file.read()
        return await analyze_rooms(image_bytes)
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# Serve built frontend in production
dist_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(dist_path):
    app.mount("/", StaticFiles(directory=dist_path, html=True), name="static")
```

### backend/render.py

```python
import google.generativeai as genai
import base64
import os
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

RENDER_PROMPT = """Transform this 2D architectural floor plan into a stunning
photorealistic isometric 3D visualization. Show the interior layout without a
roof so all rooms are visible from above at a 45-degree angle. Use warm natural
lighting, hardwood floors, white walls, and modern minimal furniture. Make it
look like a professional architectural rendering. Keep the room proportions
accurate to the floor plan."""

async def generate_render(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """Returns base64 PNG string (no data: prefix)."""
    model = genai.GenerativeModel("gemini-2.0-flash-exp")
    response = model.generate_content(
        [
            RENDER_PROMPT,
            {"mime_type": mime_type, "data": base64.b64encode(image_bytes).decode()}
        ],
        generation_config=genai.GenerationConfig(response_mime_type="image/png")
    )
    for part in response.candidates[0].content.parts:
        if hasattr(part, "inline_data") and part.inline_data:
            return part.inline_data.data
    raise ValueError(
        "Gemini did not return an image. "
        "Try changing model to 'gemini-1.5-pro' in render.py."
    )
```

### backend/analyze.py

```python
import anthropic
import base64
import json
import os
from dotenv import load_dotenv

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

ANALYZE_PROMPT = """Analyze this floor plan image and identify all rooms.
For each room, estimate position and size as fractions of the total floor plan
dimensions (0.0 to 1.0). Return ONLY valid JSON, no markdown, no code blocks.

Schema:
{
  "rooms": [
    {
      "id": "room_1",
      "label": "Living Room",
      "type": "living",
      "x": 0.0,
      "y": 0.0,
      "width": 0.4,
      "depth": 0.3,
      "color": "#E8D5B7"
    }
  ],
  "total_rooms": 5
}

Types: living, bedroom, kitchen, bathroom, dining, corridor, balcony, other
Colors: living=#E8D5B7, bedroom=#B7C4E8, kitchen=#E8E4B7, bathroom=#B7E8E4,
        dining=#E8C4B7, corridor=#D4D4D4, balcony=#C4E8B7, other=#E0E0E0

Rules: x + width <= 1.0, y + depth <= 1.0, minimal overlap between rooms."""

FALLBACK = {
    "rooms": [{"id": "room_1", "label": "Room", "type": "other",
               "x": 0.1, "y": 0.1, "width": 0.8, "depth": 0.8,
               "color": "#E0E0E0"}],
    "total_rooms": 1
}

async def analyze_rooms(image_bytes: bytes) -> dict:
    b64 = base64.standard_b64encode(image_bytes).decode()
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64", "media_type": "image/jpeg", "data": b64
                }},
                {"type": "text", "text": ANALYZE_PROMPT}
            ]
        }]
    )
    try:
        data = json.loads(message.content[0].text.strip())
        for room in data.get("rooms", []):
            for k in ["x", "y", "width", "depth"]:
                room[k] = max(0.02, min(0.95, float(room[k])))
        return data if data.get("rooms") else FALLBACK
    except (json.JSONDecodeError, KeyError, IndexError):
        return FALLBACK
```

---

## 🏃 How to Run

### Development (two terminals):

**Terminal 1 — Backend:**
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env       # add your API keys
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm run dev                # opens http://localhost:3000
```

Vite proxies /api/* → FastAPI automatically via vite.config.ts.

### Production:
```bash
cd frontend && npm run build   # outputs frontend/dist/
cd ../backend
uvicorn main:app --port 8000   # serves frontend/dist/ as static
```

---

## ✅ Claude Code: Implementation Order

Follow this order exactly. Complete each before starting the next.

1. Create all folders and empty files (full project structure)
2. `backend/requirements.txt`
3. `backend/.env.example`
4. `frontend/package.json`
5. `frontend/tsconfig.json`
6. `frontend/vite.config.ts`
7. `frontend/src/types.ts` ← define all interfaces first
8. `frontend/src/materials.ts`
9. `backend/analyze.py`
10. `backend/render.py`
11. `backend/main.py`
12. `frontend/src/viewer3d.ts`
13. `frontend/style.css`
14. `frontend/index.html`
15. `frontend/src/main.ts`

After all files exist:
16. Run `cd frontend && npm install`
17. Run `cd backend && pip install -r requirements.txt`
18. Verify `npm run build` passes with zero TypeScript errors
19. Test `/api/analyze` with a sample image via curl
20. Test `/api/render` with a sample image via curl
21. Run both servers and verify full flow in browser

---

## ⚠️ Critical Constraints

- NO React, Vue, or any UI framework — Vite + TypeScript only
- NO `any` types — everything must be properly typed
- NO OrbitControls from CDN or npm — implement manually in viewer3d.ts
- NO `claude-opus` — only `claude-sonnet-4-20250514`
- ALWAYS call both APIs in parallel with `Promise.all`
- ALWAYS show loading state for the full duration of both calls
- ALWAYS handle errors gracefully with retry option shown
- Keep module-level `scene` in viewer3d.ts so `applyMaterial` works after `initViewer`
- `npm run build` must complete with zero errors before demo day

---

## 🧪 Test Commands

```bash
# Test analyze
curl -X POST http://localhost:8000/api/analyze \
  -F "file=@sample_plans/test.jpg" | python3 -m json.tool

# Test render (saves output image)
curl -X POST http://localhost:8000/api/render \
  -F "file=@sample_plans/test.jpg" | python3 -c \
  "import sys,json,base64; d=json.load(sys.stdin); \
   open('out.png','wb').write(base64.b64decode(d['render_url'].split(',')[1]))"
open out.png
```

---

## 🎯 Demo Success Criteria

- [ ] Upload floor plan → both APIs respond within 30 seconds
- [ ] Tab 1 shows a photorealistic isometric render (Nano Banana)
- [ ] Tab 2 shows distinct colored 3D room boxes with floating labels
- [ ] Clicking a wall color swatch changes all wall colors smoothly
- [ ] Clicking a floor swatch changes floor color smoothly
- [ ] Drag to orbit, scroll to zoom — 60fps
- [ ] `npm run build` passes with zero TypeScript errors
- [ ] No crashes or console errors during the demo flow

