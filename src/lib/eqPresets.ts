export interface EqPreset {
  label: string;
  gains: number[];
}

export const EQ_PRESETS: Record<string, EqPreset> = {
  flat:       { label: 'Flat',       gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  bassBoost: { label: 'Bass Boost', gains: [7, 6, 5, 1, 0, 0, 0, 0, 0, 0] },
  trebleBoost:{ label: 'Treble',     gains: [0, 0, 0, 0, 0, 0, 2, 4, 5, 6] },
  vocal:     { label: 'Vocal',      gains: [0, 0, 0, 1, 4, 4, 3, 1, 0, 0] },
  electronic:{ label: 'Electronic', gains: [5, 4, 0, -2, -1, 1, 2, 4, 5, 5] },
  rock:      { label: 'Rock',       gains: [5, 4, -1, -2, 1, 3, 3, 4, 4, 4] },
  jazz:      { label: 'Jazz',       gains: [4, 3, 1, 2, 0, 2, 1, 3, 4, 3] },
  classical: { label: 'Classical',  gains: [4, 3, 2, 1, -1, -1, 1, 3, 4, 4] },
  pop:       { label: 'Pop',        gains: [0, 1, 2, 2, 3, 3, 2, 1, 0, 0] },
};

export const PRESET_ORDER = ['flat', 'bassBoost', 'trebleBoost', 'vocal', 'electronic', 'rock', 'jazz', 'classical', 'pop'] as const;
