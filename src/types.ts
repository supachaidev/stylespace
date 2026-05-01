/**
 * types.ts — Shared TypeScript Interfaces
 * =========================================
 *
 * This file defines ALL shared data structures used across the frontend.
 * Every other module imports types from here — there are no inline type
 * definitions elsewhere in the codebase.
 *
 * These types mirror the data flowing between:
 *   - Backend API responses (AnalyzeResponse, RenderResponse)
 *   - Style configuration (StylePreset)
 *   - Quiz system (QuizQuestion, QuizOption)
 */


/**
 * A predefined interior design style that users can choose from.
 *
 * Each preset includes:
 *   - A localized label and description (via i18n `t()` function)
 *   - A CSS gradient used as a placeholder thumbnail before the render is generated
 *   - A detailed English prompt sent to Gemini for image generation
 *   - A list of recommended SCG products that match the style
 */
export interface StylePreset {
  id: string;           // Unique identifier (e.g., "modern-minimal", "japanese-zen")
  label: string;        // Display name (localized)
  description: string;  // Short description (localized)
  thumbnail: string;    // CSS gradient string used as placeholder before render exists
  prompt: string;       // Detailed English description sent to Gemini for generation
  scgProducts: string[];// List of SCG product names that complement this style
}


/**
 * A single room detected in the floor plan by Claude Vision.
 *
 * Coordinates use a normalized 0.0–1.0 system where:
 *   - (0, 0) = top-left corner of the floor plan
 *   - (1, 1) = bottom-right corner
 *   - (x, y) = top-left corner of this room's bounding box
 *   - width extends rightward, depth extends downward
 */
export interface RoomInfo {
  id: string;          // Unique room identifier (e.g., "room_1")
  label: string;       // Human-readable name (e.g., "Living Room")
  type: string;        // Room type: living, bedroom, kitchen, bathroom, etc.
  x: number;           // Left edge position (0.0–1.0)
  y: number;           // Top edge position (0.0–1.0)
  width: number;       // Horizontal span (0.0–1.0)
  depth: number;       // Vertical span (0.0–1.0)
  area_sqm: number;    // Estimated floor area in square metres (used for BOM tile/paint quantities)
  zone: 'wet' | 'dry'; // Bathrooms/kitchens are "wet"; sanitary ware is only recommended for wet zones
  fixtures: string[];  // Visible fixtures: "toilet" | "basin" | "shower" | "bathtub" | "kitchen_sink" | "stove" | "fridge"
}


/**
 * A bill-of-materials line item recommended for a specific room.
 * Returned by /api/recommend; rendered in the BOM panel.
 */
export interface BomLine {
  sku: string;
  name_en: string;
  name_th: string;
  category: string;
  swatch: string;
  unit: string;
  unit_price_thb: number;
  quantity: number;          // m² for tiles/paint, count for fixtures
  line_total_thb: number;
  reason_en: string;         // Short Claude-generated rationale (≤ 120 chars)
  reason_th: string;
  room_id: string;
}


/**
 * Response from POST /api/recommend.
 */
export interface RecommendResponse {
  bom: BomLine[];
  grand_total_thb: number;
  rationale_en: string;      // Overall design narrative (1-3 sentences)
  rationale_th: string;
  material_summary: string;  // Compact phrase describing materials, fed into the Gemini render prompt
  error?: string;
}


/**
 * Response from the POST /api/analyze endpoint.
 *
 * Contains the structured room data extracted from a floor plan image.
 * The `error` field is present only when analysis fails.
 */
export interface AnalyzeResponse {
  rooms: RoomInfo[];     // List of detected rooms with bounding boxes
  total_rooms: number;   // Total number of rooms detected
  error?: string;        // Error message if analysis failed
}


/**
 * Response from POST /api/generate and POST /api/restyle endpoints.
 *
 * Contains the generated render as a data URL that can be used directly
 * as an <img> src attribute (e.g., "data:image/png;base64,...").
 */
export interface RenderResponse {
  render_url: string;  // Full data URL: "data:image/png;base64,..."
  error?: string;      // Error message if generation failed
}


/**
 * A single answer option within a quiz question.
 *
 * Each option contributes:
 *   - Scores toward one or more style presets (used to rank styles)
 *   - Prompt tags that describe design preferences in English (used to
 *     build the custom style prompt for Gemini)
 */
export interface QuizOption {
  label: string;                    // Display text (localized)
  icon: string;                     // HTML entity for the option's emoji icon
  scores: Record<string, number>;   // style_id → points (e.g., {"modern-minimal": 3})
  promptTags: string[];             // English fragments for Gemini prompt building
}


/**
 * A single quiz question with its answer options.
 *
 * The quiz has 6 questions covering:
 *   1. Desired atmosphere/mood
 *   2. Preferred color palette
 *   3. Favorite materials/surfaces
 *   4. Furniture style preference
 *   5. Decoration approach
 *   6. Primary home activity
 */
export interface QuizQuestion {
  question: string;       // The question text (localized)
  options: QuizOption[];  // Available answer choices
}
