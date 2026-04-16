import { pipeline, env } from '@xenova/transformers';
import { CVAnalysis, DetectedObject, ColorPalette } from '../types';

// Configure Transformers.js to strictly use remote models and CDN for WASM
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useBrowserCache = false; // Strictly disable cache to prevent loading poisoned HTML files
env.remoteHost = 'https://huggingface.co';
env.remotePathTemplate = '{model}/resolve/main/';

// Use the official Xenova CDN for WASM files to ensure compatibility
env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/';
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

// Custom fetch to prevent loading HTML when we expect model config/data
const originalFetch = window.fetch;
const customFetch = async (...args: any[]) => {
  const url = args[0].toString();
  
  // Block local fetches for model files that would hit the SPA fallback
  if ((url.startsWith('/') || url.startsWith(window.location.origin)) && !url.includes('/api/')) {
    const isModelFile = url.includes('.json') || url.includes('.bin') || url.includes('.onnx') || url.includes('.wasm');
    if (isModelFile) {
      console.warn(`[CV Fetch] Blocking local fetch for model file to prevent SPA fallback error: ${url}`);
      return new Response('Not Found', { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/plain' } });
    }
  }

  const response = await (originalFetch as any)(...args);
  
  if (response.ok) {
    const contentType = response.headers.get('content-type');
    // If we receive HTML instead of expected JSON config, it's a failure
    if (contentType && contentType.includes('text/html')) {
      const isModelConfig = url.includes('.json') || url.includes('config.json') || url.includes('preprocessor_config.json');
      if (isModelConfig && !url.includes('/api/')) {
        console.error(`[CV Fetch] ERROR: Received HTML instead of JSON from ${url}. Likely SPA fallback.`);
        throw new Error(`Model configuration not found at ${url}. Received HTML instead of JSON.`);
      }
    }
  }
  return response;
};

// Apply custom fetch to Transformers.js env
(env as any).fetch = customFetch;
// Also patch global fetch to catch any other library-internal requests
try {
  (window as any).fetch = customFetch;
} catch (e) {
  console.warn("[CV Fetch] Could not patch window.fetch");
}

let objectDetector: any = null;
let segmentationModel: any = null;
let samModel: any = null;
let loadPromise: Promise<void> | null = null;

async function loadModels() {
  if (objectDetector && segmentationModel) return;
  
  if (loadPromise) return loadPromise;
  
  loadPromise = (async () => {
    try {
      console.log("Initializing CV models...");
      
      const progressCallback = (info: any) => {
        if (info.status === 'progress') {
          console.log(`[CV Load] ${info.file}: ${Math.round(info.progress)}%`);
        } else if (info.status === 'done') {
          console.log(`[CV Load] ${info.file}: Done`);
        } else if (info.status === 'init') {
          console.log(`[CV Load] Initializing: ${info.file}`);
        }
      };

      const loadDetector = async () => {
        console.log("Loading DETR object detector...");
        const detector = await pipeline('object-detection', 'Xenova/detr-resnet-50', {
          progress_callback: progressCallback
        });
        console.log("DETR loaded successfully.");
        return detector;
      };

      const loadSegmentation = async () => {
        console.log("Loading SegFormer segmentation...");
        const seg = await pipeline('image-segmentation', 'Xenova/segformer-b0-finetuned-ade-512-512', {
          progress_callback: progressCallback
        });
        console.log("SegFormer loaded successfully.");
        return seg;
      };

      const loadHighPrecision = async () => {
        console.log("Loading SegFormer B2 (High Precision Mode)...");
        const model = await pipeline('image-segmentation', 'Xenova/segformer-b2-finetuned-ade-512-512', {
          progress_callback: progressCallback
        });
        console.log("SegFormer B2 loaded successfully.");
        return model;
      };

      // Load models sequentially to avoid hitting platform rate limits on concurrent network requests
      const detector = await loadDetector();
      const seg = await loadSegmentation();
      const highPrec = await loadHighPrecision();
      
      objectDetector = detector;
      segmentationModel = seg;
      samModel = highPrec;
    } catch (err) {
      console.error("Error loading CV models:", err);
      loadPromise = null; // Reset promise so we can retry
      throw err;
    }
  })();
  
  return loadPromise;
}

export async function analyzeImageCV(imageUrl: string, description?: string): Promise<CVAnalysis | null> {
  try {
    await loadModels();

    // Fetch image through proxy to bypass CORS
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const imageResp = await fetch(proxyUrl);
    if (!imageResp.ok) throw new Error("Failed to fetch image via proxy");
    
    const blob = await imageResp.blob();
    const img = await createImageBitmap(blob);

    // Resize image for analysis to improve performance and reliability
    const MAX_DIM = 800;
    let width = img.width;
    let height = img.height;
    
    if (width > MAX_DIM || height > MAX_DIM) {
      if (width > height) {
        height = Math.round((height * MAX_DIM) / width);
        width = MAX_DIM;
      } else {
        width = Math.round((width * MAX_DIM) / height);
        height = MAX_DIM;
      }
    }

    // Create a temporary canvas to get ImageData for models
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(img, 0, 0, width, height);
    
    // 1. Object Detection (DETR)
    const dataUrl = canvas.toDataURL('image/jpeg');
    const predictions = await objectDetector(dataUrl, { threshold: 0.5 });
    
    const objects: DetectedObject[] = predictions.map((p: any) => ({
      label: p.label,
      confidence: p.score,
      box_2d: [p.box.ymin, p.box.xmin, p.box.ymax, p.box.xmax] as [number, number, number, number]
    }));

    // 2. Color Analysis
    const { palette, averageHsv } = await extractColors(img);
    img.close(); // Free memory as soon as possible

    // 3. Segmentation (SegFormer)
    const segmentationResults = await segmentationModel(dataUrl);
    
    const segments: string[] = [];
    const segmentDetails: { label: string; box_2d: [number, number, number, number] }[] = [];

    for (const res of segmentationResults) {
      segments.push(`Region: ${res.label}`);
      
      try {
        const mask = res.mask;
        if (mask && mask.data && mask.width && mask.height) {
          let minX = mask.width, minY = mask.height, maxX = 0, maxY = 0;
          let found = false;

          for (let i = 0; i < mask.data.length; i++) {
            if (mask.data[i] > 0) {
              const x = i % mask.width;
              const y = Math.floor(i / mask.width);
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
              found = true;
            }
          }

          segmentDetails.push({
            label: res.label,
            box_2d: found ? [
              minY / mask.height, 
              minX / mask.width, 
              maxY / mask.height, 
              maxX / mask.width
            ] as [number, number, number, number] : [0, 0, 0, 0] as [number, number, number, number]
          });
        }
      } catch (e) {
        console.warn(`Failed to extract coordinates for segment: ${res.label}`, e);
      }
    }

    return {
      objects,
      colors: palette,
      segments,
      segmentDetails,
      dominantMood: determineMood(palette, objects),
      hsv: averageHsv
    };
  } catch (error) {
    console.error("CV Analysis error:", error);
    throw error; // Throw instead of returning null to help debugging
  }
}

export async function analyzeImageHighPrecision(imageUrl: string): Promise<Partial<CVAnalysis>> {
  try {
    await loadModels();

    // Fetch image through proxy
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const imageResp = await fetch(proxyUrl);
    if (!imageResp.ok) throw new Error("Failed to fetch image via proxy");
    
    const blob = await imageResp.blob();
    const img = await createImageBitmap(blob);

    // Create a temporary canvas for SAM input
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg');
    img.close();

    // Use SegFormer B2 for high precision semantic analysis
    console.log("Starting High Precision Semantic Analysis...");
    const results = await samModel(dataUrl);

    return {
      highPrecision: {
        model: "SegFormer-B2 (Xenova/segformer-b2-ade)",
        masksCount: results.length,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error("High precision analysis error:", error);
    throw error;
  }
}

async function extractColors(img: ImageBitmap): Promise<{ palette: ColorPalette[], averageHsv: { h: number, s: number, v: number } }> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { palette: [], averageHsv: { h: 0, s: 0, v: 0 } };

  const size = 100;
  canvas.width = size;
  canvas.height = size;
  ctx.drawImage(img, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size).data;
  const colorCounts: Record<string, number> = {};
  
  let totalH = 0, totalS = 0, totalV = 0;
  const totalPixels = size * size;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    
    // HSV conversion
    const { h, s, v } = rgbToHsv(r, g, b);
    totalH += h;
    totalS += s;
    totalV += v;
    
    // Quantize colors to reduce noise for palette
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    
    const hex = `#${qr.toString(16).padStart(2, '0')}${qg.toString(16).padStart(2, '0')}${qb.toString(16).padStart(2, '0')}`;
    colorCounts[hex] = (colorCounts[hex] || 0) + 1;
  }

  const sortedColors = Object.entries(colorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const palette = sortedColors.map(([hex, count]) => ({
    hex,
    percentage: Math.round((count / totalPixels) * 100),
    label: getColorLabel(hex)
  }));

  return {
    palette,
    averageHsv: {
      h: Math.round(totalH / totalPixels),
      s: Math.round(totalS / totalPixels),
      v: Math.round(totalV / totalPixels)
    }
  };
}

function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, v = max;
  const d = max - min;
  s = max === 0 ? 0 : d / max;
  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, v: v * 100 };
}

function getColorLabel(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  if (r > 200 && g > 200 && b > 200) return 'White';
  if (r < 50 && g < 50 && b < 50) return 'Black';
  if (r > g && r > b) return 'Red';
  if (g > r && g > b) return 'Green';
  if (b > r && b > g) return 'Blue';
  if (r > 150 && g > 150 && b < 100) return 'Yellow';
  return 'Neutral';
}

function generateSegments(objects: DetectedObject[], colors: ColorPalette[]): string[] {
  const segments: string[] = [];
  if (objects.length > 0) {
    segments.push(`Foreground contains: ${objects.slice(0, 2).map(o => o.label).join(', ')}`);
  }
  if (colors.length > 0) {
    segments.push(`Dominant color theme: ${colors[0].label}`);
  }
  segments.push("Visual regions determined by object density and color distribution.");
  return segments;
}

function determineMood(colors: ColorPalette[], objects: DetectedObject[]): string {
  const primaryColor = colors[0]?.label || 'Neutral';
  if (primaryColor === 'Blue') return 'Calm';
  if (primaryColor === 'Red') return 'Energetic';
  if (primaryColor === 'Yellow') return 'Cheerful';
  if (primaryColor === 'Black') return 'Mysterious';
  return 'Balanced';
}
