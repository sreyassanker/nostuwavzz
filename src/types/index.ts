export interface Station {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string | null;
  homepage?: string | null;
  favicon?: string | null;
  tags?: string | null;
  country?: string | null;
  countrycode?: string | null;
  state?: string | null;
  language?: string | null;
  languagecodes?: string | null;
  votes?: number | null;
  clickcount?: number | null;
  bitrate?: number | null;
  codec?: string | null;
  lastcheckok?: number | null;
  lastchecktime?: string | null;
  clicktimestamp?: string | null;
  geo_lat?: number | null;
  geo_long?: number | null;
  source?: string | null;
  validated?: boolean;
  lastValidated?: number;
}

export interface Filters {
  query: string;
  countries: string[];
  tags: string[];
  bitrates: string[];
  favoritesOnly: boolean;
  continent: string;
}

export interface BitrateBucket {
  label: string;
  min: number;
  max: number;
}

export const BITRATE_BUCKETS: BitrateBucket[] = [
  { label: '0-64 kbps', min: 0, max: 64 },
  { label: '64-128 kbps', min: 64, max: 128 },
  { label: '128-192 kbps', min: 128, max: 192 },
  { label: '192-320 kbps', min: 192, max: 320 },
  { label: '320+ kbps', min: 320, max: Infinity },
];

export const CONTINENTS = [
  'All',
  'N. America',
  'S. America',
  'Europe',
  'Africa',
  'Asia',
  'Oceania',
] as const;


