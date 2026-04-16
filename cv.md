# Computer Vision Pipeline

This application utilizes a sophisticated client-side Computer Vision (CV) pipeline powered by **Transformers.js** and **ONNX Runtime**. This allows for deep analysis of visual assets directly in the browser, ensuring user privacy and reducing server-side processing costs.

## Core Models

The pipeline uses three distinct types of analysis:

### 1. Object Detection
*   **Model**: `Xenova/detr-resnet-50` (Detection Transformer)
*   **Purpose**: Identifies and locates common objects within the frame.
*   **Output**: Labels, confidence scores, and normalized bounding boxes (`[ymin, xmin, ymax, xmax]`).

### 2. Semantic Segmentation
*   **Model**: `Xenova/segformer-b0-finetuned-ade-512-512`
*   **Purpose**: Partitions the image into meaningful semantic regions (e.g., "sky", "grass", "buildings", "road").
*   **Feature**: The application post-processes the segmentation masks to generate precise bounding boxes for each detected visual region.

### 3. Color & Mood Analysis
*   **Method**: Custom Canvas-based pixel quantization.
*   **Metrics**: 
    *   **Dominant Palette**: Extracting the top 5 colors with percentage distribution.
    *   **HSV Mapping**: Calculating the average Hue, Saturation, and Value.
    *   **Heuristic Mood Detection**: Assigning a visual "mood" (e.g., Calm, Energetic, Mysterious) based on color temperature and saturation levels.

## Technical Implementation

### Browser-Side Processing
All models are executed using **WebAssembly (WASM)**. The models are fetched from Hugging Face and run locally on the user's machine. This is managed via:
*   **WASM Direct Initialization**: No worker proxies are used to ensure maximum compatibility with the sandboxed environment.
*   **Memory Management**: Explicit cleanup of ImageBitmaps during bulk analysis to prevent browser tab crashes.

### Network Layer & CORS
To analyze images from external repositories (like Flickr or Wikimedia), the app uses a **Node.js Express Proxy** (`/api/proxy-image`). This bypasses Cross-Origin Resource Sharing (CORS) restrictions that would otherwise prevent the CV pipeline from "reading" the pixel data from external domains.

### Data Interceptor
A custom fetch interceptor (`src/lib/cv.ts`) guards against "SPA Fallback" errors. It prevents the system from accidentally loading the application's HTML entry point when a model file is missing, which would otherwise result in `JSON.parse` errors.

## Usage for Research
The results of this analysis are attached to the image metadata within the corpus. When the research dataset is exported as a ZIP, the CV metadata is included in the `corpus_metadata.json` file, providing researchers with a ready-to-use dataset for algorithmic or computational art history analysis.
