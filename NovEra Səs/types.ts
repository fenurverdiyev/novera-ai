
import type { GroundingMetadata } from '@google/genai';

export interface ConversationTurn {
  author: 'user' | 'model' | 'system';
  text: string;
}

// Extracting the specific type for a single chunk for easier use.
export type GroundingChunk = GroundingMetadata['groundingChunks'][number];

// Types for Rich Search Results from Serper API
export interface ImageSearchResult {
    type: 'image';
    imageUrl: string;
    title: string;
    source: string;
}

export interface VideoSearchResult {
    type: 'video';
    imageUrl: string;
    title: string;
    source: string;
    duration: string;
}

export interface ProductSearchResult {
    type: 'product';
    imageUrl: string;
    title: string;
    source: string;
    price: string;
    rating: number;
}

export interface LocationSearchResult {
    type: 'location';
    title: string;
    address: string;
    source: string;
}

export interface MapSearchResult {
    type: 'map';
    imageUrl?: string;
    title: string;
    address?: string;
    source: string;
}

export interface MusicSearchResult {
    type: 'music';
    title: string;
    artist: string;
    source: string;
    imageUrl?: string;
}

export type SearchResultItem = ImageSearchResult | VideoSearchResult | ProductSearchResult | LocationSearchResult | MapSearchResult | MusicSearchResult;