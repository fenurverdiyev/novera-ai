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
  sources?: Source[];
  related?: string[];
  isLoading?: boolean;
  ttsError?: string;
  images?: string[];
  videos?: string[];
  toolCalls?: ToolCall[];
  toolResult?: { call: ToolCall; output: any };
}

export type AppView = 'search' | 'news' | 'weather' | 'translate' | 'settings' | 'profile';

export interface VoiceOption {
  id: string;
  name: string;
}

export interface AppSettings {
  voiceEnabled: boolean;
  voiceId: string;
  theme: string;
}

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
    language?: string;
    country?: string[];
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
