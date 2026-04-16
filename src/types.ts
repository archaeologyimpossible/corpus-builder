export interface DetectedObject {
  label: string;
  confidence: number;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

export interface ColorPalette {
  hex: string;
  percentage: number;
  label: string;
}

export interface CVAnalysis {
  objects: DetectedObject[];
  colors: ColorPalette[];
  segments: string[]; // Descriptions of segmented regions
  segmentDetails?: { label: string; box_2d: [number, number, number, number] }[];
  dominantMood: string;
  hsv?: { h: number; s: number; v: number };
  highPrecision?: {
    model: string;
    masksCount: number;
    timestamp: string;
  };
}

export type SearchSource = 'flickr' | 'wikimedia' | 'web' | 'museum' | 'unsplash' | 'pexels';

export interface ImageMetadata {
  id: string;
  url: string;
  thumbnail: string;
  author: string;
  source: string;
  description?: string;
  tags: string[];
  width: number;
  height: number;
  createdAt: string;
  cvAnalysis?: CVAnalysis;
}

export interface Corpus {
  id: string;
  name: string;
  description: string;
  images: ImageMetadata[];
  createdAt: string;
}
