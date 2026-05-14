export interface Source {
  uri: string;
  title: string;
  index: number;
}

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  images?: string[];
  videos?: string[];
  places?: PlaceResult[];
  news?: NewsArticle[];
  products?: ShoppingProduct[];
  sources?: Source[];
  maps?: string[];
  related?: string[];
  isLoading?: boolean;
  ttsError?: string;
  progressStep?: 1 | 2 | 3;
  toolCalls?: ToolCall[];
  toolResult?: { call: ToolCall; output: any };
}

// Chat/search lightweight news item (from Serper news endpoint)
export interface SearchNewsItem {
  title: string;
  link: string;
  source: string;
}

// Full news article used by News page
export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  publishedAt: string;
  content?: string | null;
  category?: string;
  imageUrl?: string | null;
}

export interface ShoppingProduct {
  title: string;
  link: string;
  price: string;
  source: string;
  rating?: number;
  reviews?: number;
  imageUrl?: string;
}

export type AppView = 'search' | 'google-search' | 'browser' | 'news' | 'weather' | 'translate' | 'settings' | 'profile' | 'live' | 'safe-search' | 'incognito' | 'memory';

export type SearchMode = 'base' | 'universe' | 'canvas';

export interface VoiceOption {
  id: string;
  name: string;
}

export interface AppSettings {
  theme: string;
  noveraColor?: string; // custom background color for NovEra theme
  voiceEnabled?: boolean;
  voiceId?: string;
  language?: 'az' | 'tr' | 'ru' | 'en';
}

export interface WeatherData {
  current: {
    temp: number;
    condition: string;
    humidity: number;
    windSpeed: number;
    feelsLike: number;
    pressure: number;
    code: number; // For icon mapping
    uvIndex?: number;
    visibility?: number;
  };
  hourly: {
    time: string;
    temp: number;
    condition: string;
    code: number;
  }[];
  forecast: {
    day: string;
    temp: number;
    condition: string;
    code: number; // For icon mapping
    sunrise?: string;
    sunset?: string;
  }[];
  sunMoon?: {
    sunrise: string;
    sunset: string;
    moonrise: string;
    moonset: string;
    moonPhase: string;
  };
  airQuality?: {
    value: number;
    category: string;
    description?: string;
  };
  location: string;
}

export interface UserProfile {
  name: string;
  email: string;
}

// Normalized place result for Google Maps/Local via Serper
export interface PlaceResult {
  title: string;
  rating?: number | null;
  reviewsCount?: number | null;
  address?: string | null;
  phoneNumber?: string | null;
  category?: string | null;
  thumbnailUrl?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

declare class SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: SpeechGrammarList;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  serviceURI: string;

  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;

  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechGrammarList {
  addFromString(string: string, weight?: number): void;
  addFromURI(src: string, weight?: number): void;
  [index: number]: SpeechGrammar;
}

interface SpeechGrammar {
  src: string;
  weight: number;
}

// ================= Live Conversation Types =================
// Minimal types used by live UI components
export type ConversationAuthor = 'user' | 'model' | 'system';

export interface ConversationTurn {
  author: ConversationAuthor;
  text: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title?: string | null;
  } | null;
}

export type SearchResultItem =
  | { type: 'image'; title: string; source: string; imageUrl: string }
  | { type: 'video'; title: string; source: string; imageUrl?: string | null; duration?: string | null }
  | { type: 'product'; title: string; source: string; imageUrl?: string | null; price: string }
  | { type: 'location'; title: string; source: string; address?: string | null }
  | { type: 'map'; title: string; source: string; imageUrl?: string | null }
  | { type: 'music'; title: string; source: string; artist?: string | null };
