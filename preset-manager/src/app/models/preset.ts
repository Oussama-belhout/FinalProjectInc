export interface Preset {
  id: string;
  name: string;
  category: string;
  description?: string;
  sounds: PresetSound[];
}

export interface PresetSound {
  pad: number;
  url: string;
  name: string;
}

export interface PresetSummary {
  id: string;
  name: string;
  category: string;
  description?: string;
  soundCount: number;
}
