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
  news?: SearchNewsItem[];
  products?: ShoppingProduct[];
  sources?: Source[];
  related?: string[];
  isLoading?: boolean;
  ttsError?: string;
  progressStep?: 1 | 2 | 3; // 1: Thinking, 2: Searching, 3: Answering
  toolCalls?: ToolCall[];
  toolResult?: { call: ToolCall; output: any };
}

// Chat/search lightweight news item (from Serper news endpoint)
export interface SearchNewsItem {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet: string;
  thumbnail?: string;
}

// Full news article used by News page
export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  imageUrl: string | null;
  publishedAt: string;
  content?: string | null;
  category?: string;
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

export type AppView = 'search' | 'google-search' | 'browser' | 'news' | 'weather' | 'translate' | 'settings' | 'profile';

export type SearchMode = 'base' | 'universe';

export interface VoiceOption {
  id: string;
  name: string;
}

export interface AppSettings {
  voiceEnabled: boolean;
  voiceId: string;
  theme: string;
  noveraColor?: string; // custom background color for NovEra theme
}

export interface WeatherData {
  current: {
    temp: number;
    condition: string;
  };
  forecast: {
    day: string;
    temp: number;
    condition: string;
  }[];
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
  length: number;
  addFromString(string: string, weight?: number): void;
  addFromURI(src: string, weight?: number): void;
  [index: number]: SpeechGrammar;
}

interface SpeechGrammar {
  src: string;
  weight: number;
}
