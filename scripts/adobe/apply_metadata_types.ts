export type AdobeMetadata = {
  title?: string;
  title_char_count?: number;
  keywords?: string[];
  keyword_count?: number;
  category?: string;
  file_type?: string;
  created_with_ai?: boolean;
  people_are_fictional?: boolean;
  property_is_fictional?: boolean;
  editorial_use_only?: boolean;
};

export type Sidecar = {
  image_file?: string;
  source?: string;
  status?: string;
  applied_to_adobe_stock?: boolean;
  applied_at?: string;
  metadata_generation_mode?: string;
  generation_context?: {
    prompt_used?: string | null;
    commercial_use_cases?: string[];
    visual_keywords_from_trend?: string[];
    model_used?: string | null;
  };
  adobe_stock_metadata?: AdobeMetadata;
};

export type MatchResult = {
  sidecarPath: string | null;
  imagePath: string | null;
  sidecar: Sidecar;
  matchedBy: string;
};

export type PanelState = {
  originalName: string;
  currentTitle: string;
  currentKeywords: string[];
  currentCategory: string;
  currentFileType: string;
  currentLanguage: string;
  keywordSuggestions: string[];
  aiChecked: boolean;
  fictionalChecked: boolean;
};

export type RegistryEntry = Record<string, unknown> & {
  source?: string;
  final_name?: string;
  original_name?: string;
  source_path?: string | null;
  dimensions?: { width: number; height: number } | null;
  long_side?: number | null;
  assigned_scale?: number | "copy_only" | "low_res" | "external" | null;
  metadata_sidecar?: string | null;
  upscaled?: boolean;
  upscaled_path?: string | null;
  upscaled_dimensions?: { width: number; height: number } | null;
  registered_at?: string | null;
  upscaled_at?: string | null;
  adobe_stock_status?: string;
  adobe_apply_status?: string;
  adobe_applied_at?: string;
  trend_topic?: string | null;
  series_slot?: string | null;
  prompt_id?: number | null;
  media_name?: string | null;
  adobe_only?: boolean;
};

export type RegistryFile = {
  last_updated?: string;
  total_images?: number;
  images?: Record<string, RegistryEntry>;
};

export type MetadataPlan = {
  match: MatchResult;
  desiredMetadata: AdobeMetadata;
  action: "checked_only" | "update_from_sidecar" | "rebuilt_from_current" | "rebuilt_from_fallback";
  sourceType: "pipeline" | "outside_system";
  reason: string;
  needsApply: boolean;
  applyFields: ApplyFields;
};

export type ApplyFields = {
  language: boolean;
  fileType: boolean;
  category: boolean;
  aiDisclosure: boolean;
  fictional: boolean;
  title: boolean;
  keywords: boolean;
};
