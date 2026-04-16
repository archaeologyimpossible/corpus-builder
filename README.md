# Photo Corpus Assembler

A professional-grade research tool for acquiring web photography and performing local Computer Vision (CV) analysis to build structured datasets.

## Features

- **Multi-Source Acquisition**: Search and collect imagery from Flickr Commons, Wikimedia Commons, and general web photography.
- **Local CV Analysis**: Performs analysis directly in the browser using TensorFlow.js (no external AI APIs required for core tasks):
  - **Object Detection**: Identifies objects using the COCO-SSD model.
  - **Semantic Segmentation**: Identifies visual regions using the DeepLab model.
  - **Color Analysis**: Extracts 5-color palettes and calculates average HSV (Hue, Saturation, Value) metrics.
- **Structured Export**: Export your collected corpus as a ZIP file containing all original images and a comprehensive `corpus_metadata.json` file.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher is recommended.
- **npm**: Version 9.0.0 or higher.

## Installation

1. **Clone the repository** (or download the source).
2. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: If you encounter peer dependency errors (common with React 19), try:*
   ```bash
   npm install --legacy-peer-deps
   ```

## Environment Setup

Create a `.env` file in the root directory based on `.env.example`:

```env
# Optional: Image Search API Keys (for Unsplash/Pexels integration)
VITE_UNSPLASH_ACCESS_KEY="your_key_here"
VITE_PEXELS_API_KEY="your_key_here"
```

*Note: Flickr Commons and Wikimedia Commons searches work without API keys.*

## Development

To start the full-stack development server (Express + Vite):

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Production Build

To create a production-ready build:

1. **Build the frontend**:
   ```bash
   npm run build
   ```
2. **Start the server**:
   ```bash
   NODE_ENV=production npm start
   ```

## Troubleshooting

### `npm install` fails
This project uses **React 19** and **Tailwind CSS v4**. Some community components or older libraries may have strict peer dependency requirements for React 18. 
- Use `npm install --legacy-peer-deps` to bypass these checks.
- Ensure you are using a modern version of Node.js (v18+).

### CV Analysis is slow
The first time you run CV analysis, the application downloads the TensorFlow.js models (COCO-SSD and DeepLab). This may take a few moments depending on your connection. Models are cached by the browser after the first load.

### Images fail to load/export
The application uses a server-side proxy to bypass CORS restrictions. Ensure the `npm run dev` command is running, as the frontend relies on the Express backend for image acquisition.
