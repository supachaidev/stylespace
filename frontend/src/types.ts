export interface StylePreset {
  id: string;
  label: string;
  description: string;
  thumbnail: string;  // CSS gradient as placeholder
  prompt: string;     // style description for Gemini
  scgProducts: string[];
}

export interface RoomInfo {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface AnalyzeResponse {
  rooms: RoomInfo[];
  total_rooms: number;
  error?: string;
}

export interface RenderResponse {
  render_url: string;
  error?: string;
}

export interface QuizOption {
  label: string;
  icon: string;
  scores: Record<string, number>;  // style_id -> points
  promptTags: string[];            // prompt fragments contributed by this choice
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}
