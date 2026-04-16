/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from "react";
import { useState, useEffect } from "react";
import { 
  Search, 
  Library, 
  Plus, 
  Trash2, 
  Download, 
  Info, 
  Sparkles, 
  Loader2, 
  ChevronRight, 
  Image as ImageIcon,
  Archive,
  Star,
  Cpu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { searchImages } from "./lib/api";
import { analyzeImageCV, analyzeImageHighPrecision } from "./lib/cv";
import { ImageMetadata, Corpus, CVAnalysis, SearchSource } from "./types";
import JSZip from "jszip";

export default function App() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ImageMetadata[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "corpus">("search");
  const [corpus, setCorpus] = useState<Corpus>(() => {
    const saved = localStorage.getItem("corpus-builder-data");
    return saved ? JSON.parse(saved) : {
      id: "default",
      name: "My Research Corpus",
      description: "A collection of images for visual research.",
      images: [],
      createdAt: new Date().toISOString()
    };
  });
  const [selectedImage, setSelectedImage] = useState<ImageMetadata | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingHighPrecision, setIsAnalyzingHighPrecision] = useState(false);
  const [cvResult, setCvResult] = useState<CVAnalysis | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(corpus.name);
  const [selectedSource, setSelectedSource] = useState<SearchSource>("web");
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);

  useEffect(() => {
    localStorage.setItem("corpus-builder-data", JSON.stringify(corpus));
  }, [corpus]);

  useEffect(() => {
    setCvResult(selectedImage?.cvAnalysis || null);
  }, [selectedImage]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    setCurrentPage(1);
    try {
      const results = await searchImages(searchQuery, selectedSource, 1);
      setSearchResults(results);
      setCanLoadMore(results.length >= 20);
      if (results.length === 0) {
        toast.info("No results found. Try a different query.");
      }
    } catch (error) {
      toast.error("Failed to fetch images.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleLoadMore = async () => {
    if (isSearching) return;
    const nextPage = currentPage + 1;
    setIsSearching(true);
    try {
      const results = await searchImages(searchQuery, selectedSource, nextPage);
      setSearchResults(prev => [...prev, ...results]);
      setCurrentPage(nextPage);
      setCanLoadMore(results.length >= 20);
      if (results.length === 0) {
        setCanLoadMore(false);
        toast.info("No more results available.");
      }
    } catch (error) {
      toast.error("Failed to fetch more images.");
    } finally {
      setIsSearching(false);
    }
  };

  const addToCorpus = (image: ImageMetadata) => {
    if (corpus.images.find(img => img.id === image.id)) {
      toast.warning("Image already in corpus.");
      return;
    }
    setCorpus(prev => ({
      ...prev,
      images: [...prev.images, image]
    }));
    toast.success("Added to corpus.");
  };

  const removeFromCorpus = (imageId: string) => {
    setCorpus(prev => ({
      ...prev,
      images: prev.images.filter(img => img.id !== imageId)
    }));
    if (selectedImage?.id === imageId) setSelectedImage(null);
    toast.info("Removed from corpus.");
  };

  const handleAnalyze = async (image: ImageMetadata) => {
    setIsAnalyzing(true);
    setCvResult(null);
    try {
      const result = await analyzeImageCV(image.url, image.description || "");
      if (result) {
        setCvResult(result);
        
        // Update the image object itself if it's the selected one
        if (selectedImage?.id === image.id) {
          setSelectedImage(prev => prev ? { ...prev, cvAnalysis: result } : null);
        }

        // Persist CV analysis to corpus if the image is in it
        setCorpus(prev => ({
          ...prev,
          images: prev.images.map(img => 
            img.id === image.id ? { ...img, cvAnalysis: result } : img
          )
        }));

        // Also update search results so if it's added later, it has the data
        setSearchResults(prev => prev.map(img => 
          img.id === image.id ? { ...img, cvAnalysis: result } : img
        ));
        
        toast.success("CV Analysis complete.");
      }
    } catch (error) {
      toast.error("CV Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleHighPrecisionAnalysis = async () => {
    if (!selectedImage || isAnalyzingHighPrecision) return;
    
    // Only allow for images already in corpus
    const corpusImage = corpus.images.find(img => img.id === selectedImage.id);
    if (!corpusImage) {
      toast.error("Please add the image to your corpus before running high precision analysis.");
      return;
    }

    setIsAnalyzingHighPrecision(true);
    try {
      const results = await analyzeImageHighPrecision(selectedImage.url);
      
      const updatedAnalysis = { ...(selectedImage.cvAnalysis as CVAnalysis), ...results };

      setCorpus(prev => ({
        ...prev,
        images: prev.images.map(img => 
          img.id === selectedImage.id 
            ? { ...img, cvAnalysis: updatedAnalysis }
            : img
        )
      }));

      // Update local view
      setSelectedImage(prev => prev ? ({ ...prev, cvAnalysis: updatedAnalysis }) : null);

      toast.success("High precision analysis complete.");
    } catch (error) {
      toast.error("High precision analysis failed.");
    } finally {
      setIsAnalyzingHighPrecision(false);
    }
  };

  const handleBulkAnalyze = async () => {
    const unanalyzed = corpus.images.filter(img => !img.cvAnalysis);
    if (unanalyzed.length === 0) {
      toast.info("All images in corpus are already analyzed.");
      return;
    }

    setIsAnalyzing(true);
    const total = unanalyzed.length;
    let successCount = 0;
    
    const toastId = toast.loading(`Starting bulk analysis (0/${total})...`);
    
    for (let i = 0; i < unanalyzed.length; i++) {
      const img = unanalyzed[i];
      try {
        toast.loading(`Analyzing image ${i + 1}/${total}...`, { id: toastId });
        const result = await analyzeImageCV(img.url, img.description || "");
        
        if (result) {
          successCount++;
          
          // Update corpus
          setCorpus(prev => ({
            ...prev,
            images: prev.images.map(item => 
              item.id === img.id ? { ...item, cvAnalysis: result } : item
            )
          }));

          // Update selected image if it's this one
          if (selectedImage?.id === img.id) {
            setSelectedImage(prev => prev ? { ...prev, cvAnalysis: result } : null);
            setCvResult(result);
          }
        }
      } catch (err) {
        console.error(`Failed to analyze ${img.id}:`, err);
      }
    }

    setIsAnalyzing(false);
    toast.success(`Bulk analysis complete: ${successCount}/${total} successful.`, { id: toastId });
  };

  const exportCorpusAsZip = async () => {
    if (corpus.images.length === 0) {
      toast.error("Corpus is empty. Add images before exporting.");
      return;
    }

    setIsExporting(true);
    toast.info("Preparing research dataset (this may take a moment)...");

    try {
      const zip = new JSZip();
      const imgFolder = zip.folder("images");
      
      // Add metadata JSON
      zip.file("corpus_metadata.json", JSON.stringify(corpus, null, 2));

      // Fetch and add images
      const fetchPromises = corpus.images.map(async (img) => {
        try {
          const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(img.url)}`);
          const blob = await response.blob();
          const extension = img.url.split('.').pop()?.split('?')[0] || 'jpg';
          const filename = `${img.id.replace(/[^a-z0-9]/gi, '_')}.${extension}`;
          imgFolder?.file(filename, blob);
        } catch (err) {
          console.error(`Failed to fetch image ${img.id}:`, err);
        }
      });

      await Promise.all(fetchPromises);
      
      const content = await zip.generateAsync({ type: "blob" });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(content);
      const safeName = corpus.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      downloadLink.download = `${safeName}_dataset.zip`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      toast.success("Research dataset exported successfully.");
    } catch (error) {
      toast.error("Failed to generate dataset export.");
      console.error(error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="h-screen w-screen overflow-hidden grid grid-cols-[200px_1fr_280px] grid-rows-[48px_1fr_32px] border border-line bg-bg text-ink font-sans">
        {/* Header */}
        <header className="col-span-full border-b border-line flex items-center justify-between px-4 bg-header">
          <div className="flex items-center gap-2 font-mono font-bold tracking-wider">
            <span className="bg-ink text-bg px-1.5 py-0.5">PHO</span>
            CORPUS ASSEMBLE v1.2
          </div>
          <div className="flex gap-6 items-center">
            <div 
              className="flex flex-col items-end cursor-pointer group"
              onClick={() => {
                setTempName(corpus.name);
                setIsEditingName(true);
              }}
            >
              <span className="data-label opacity-40 group-hover:opacity-100 transition-opacity">Active Project [Click to Rename]</span>
              <span className="data-value border-b border-transparent group-hover:border-accent group-hover:text-accent transition-all">
                [{corpus.name.toUpperCase().replace(/\s+/g, '_')}]
              </span>
            </div>
          </div>
        </header>

        <Dialog open={isEditingName} onOpenChange={setIsEditingName}>
          <DialogContent className="sm:max-w-md bg-bg border-line rounded-none font-sans">
            <DialogHeader>
              <DialogTitle className="font-serif italic text-xl">Project Configuration</DialogTitle>
              <DialogDescription className="text-xs uppercase tracking-tight opacity-60">
                Update the identifier for this specialized research corpus.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                defaultValue={corpus.name}
                onChange={(e) => setTempName(e.target.value)}
                className="rounded-none border-line focus-visible:ring-ink"
                placeholder="Enter project name..."
                autoFocus
              />
            </div>
            <DialogFooter className="sm:justify-end gap-2">
              <button
                className="btn-hd px-4 py-2 border-line hover:bg-ink/5"
                onClick={() => setIsEditingName(false)}
              >
                CANCEL
              </button>
              <button
                className="btn-hd px-4 py-2 bg-ink text-bg"
                onClick={() => {
                  if (tempName.trim()) {
                    setCorpus(prev => ({ ...prev, name: tempName.trim() }));
                    setIsEditingName(false);
                    toast.success("Project updated.");
                  }
                }}
              >
                SAVE_IDENTIFIER
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sidebar */}
        <nav className="border-r border-line flex flex-col bg-bg overflow-y-auto">
          <div className="py-4 border-b border-ink/10">
            <div className="sidebar-label">Navigation</div>
            <div 
              className={`nav-item-hd ${activeTab === 'search' ? 'active' : ''}`}
              onClick={() => setActiveTab('search')}
            >
              <Search className="w-3.5 h-3.5" />
              Acquisition
            </div>
            <div 
              className={`nav-item-hd ${activeTab === 'corpus' ? 'active' : ''}`}
              onClick={() => setActiveTab('corpus')}
            >
              <Library className="w-3.5 h-3.5" />
              Collection
            </div>
          </div>

          <div className="py-4 border-b border-ink/10">
            <div className="sidebar-label">Search source:</div>
            <div 
              className={`nav-item-hd ${selectedSource === 'flickr' ? 'active' : ''}`}
              onClick={() => setSelectedSource('flickr')}
            >
              <div className={`w-2 h-2 rounded-full ${selectedSource === 'flickr' ? 'bg-green-500' : 'bg-gray-400'}`} />
              Flickr Commons
            </div>
            <div 
              className={`nav-item-hd ${selectedSource === 'wikimedia' ? 'active' : ''}`}
              onClick={() => setSelectedSource('wikimedia')}
            >
              <div className={`w-2 h-2 rounded-full ${selectedSource === 'wikimedia' ? 'bg-green-500' : 'bg-gray-400'}`} />
              Wikimedia Commons
            </div>
            <div 
              className={`nav-item-hd ${selectedSource === 'web' ? 'active' : ''}`}
              onClick={() => setSelectedSource('web')}
            >
              <div className={`w-2 h-2 rounded-full ${selectedSource === 'web' ? 'bg-green-500' : 'bg-gray-400'}`} />
              Web Photography (All)
            </div>
            <div 
              className={`nav-item-hd ${selectedSource === 'museum' ? 'active' : ''}`}
              onClick={() => setSelectedSource('museum')}
            >
              <div className={`w-2 h-2 rounded-full ${selectedSource === 'museum' ? 'bg-green-500' : 'bg-gray-400'}`} />
              Museum Archives
            </div>
          </div>

          <div className="mt-auto p-4 flex flex-col gap-2">
            <button 
              className="btn-hd w-full flex items-center justify-center gap-2 bg-ink text-bg" 
              onClick={exportCorpusAsZip}
              disabled={isExporting}
            >
              {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
              Export Dataset
            </button>
            <p className="text-[9px] opacity-40 text-center italic">Exports ZIP with images + JSON</p>
          </div>
        </nav>

        {/* Main Workspace */}
        <main className="flex flex-col bg-workspace overflow-hidden">
          <div className="h-10 border-b border-line flex items-center px-3 gap-4 bg-bg/50">
            <div className="flex items-center gap-2">
              <span className="data-label">Filter:</span>
              <select className="bg-transparent border-none text-[10px] font-mono focus:ring-0 cursor-pointer">
                <option>Most Recent</option>
                <option>Alphabetical</option>
              </select>
            </div>
            <Separator orientation="vertical" className="h-4 bg-line/20" />
            <div className="flex items-center gap-2">
              <span className="data-label">View:</span>
              <span className="data-value">Grid</span>
            </div>
            <div className="ml-auto flex items-center gap-4">
              {activeTab === 'corpus' && corpus.images.length > 0 && (
                <button 
                  className="btn-hd flex items-center gap-1.5 px-2 py-1 rounded-none"
                  onClick={handleBulkAnalyze}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  BULK_ANALYZE
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="data-label">Items:</span>
                <span className="data-value">
                  {activeTab === 'search' ? searchResults.length : corpus.images.length} visible
                </span>
              </div>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto">
            <div className="p-4">
              {activeTab === 'search' ? (
                <div className="space-y-6">
                  <form onSubmit={handleSearch} className="flex gap-1 max-w-xl">
                    <Input 
                      placeholder="Search repositories..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 bg-white border-line rounded-none focus-visible:ring-0 text-xs font-mono"
                    />
                    <button type="submit" disabled={isSearching} className="btn-hd h-8 px-4 bg-ink text-bg">
                      {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "SEARCH"}
                    </button>
                  </form>

                  <div className="flex flex-col gap-6">
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {searchResults.map((img) => (
                        <ImageCell 
                          key={img.id} 
                          image={img} 
                          isSelected={selectedImage?.id === img.id}
                          isInCorpus={!!corpus.images.find(i => i.id === img.id)}
                          onClick={() => setSelectedImage(img)}
                          onAdd={() => addToCorpus(img)}
                        />
                      ))}
                    </div>

                    {canLoadMore && (
                      <div className="flex justify-center py-4">
                        <button 
                          onClick={handleLoadMore}
                          disabled={isSearching}
                          className="btn-hd px-8 py-2 bg-bg border-line hover:bg-ink hover:text-bg transition-colors flex items-center gap-2"
                        >
                          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          LOAD_MORE_RESULTS
                        </button>
                      </div>
                    )}
                    
                    {searchResults.length === 0 && !isSearching && (
                      <div className="col-span-full py-20 text-center border border-dashed border-line/20 bg-bg/30">
                        <ImageIcon className="w-8 h-8 mx-auto opacity-10 mb-2" />
                        <p className="font-serif italic opacity-40 text-xs">
                          {hasSearched ? `No results found for "${searchQuery}" in ${selectedSource}.` : "No assets acquired. Initiate search."}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {corpus.images.map((img) => (
                    <ImageCell 
                      key={img.id} 
                      image={img} 
                      isSelected={selectedImage?.id === img.id}
                      isInCorpus={true}
                      onClick={() => setSelectedImage(img)}
                      onRemove={() => removeFromCorpus(img.id)}
                    />
                  ))}
                  {corpus.images.length === 0 && (
                    <div className="col-span-full py-20 text-center border border-dashed border-line/20 bg-bg/30">
                      <Library className="w-8 h-8 mx-auto opacity-10 mb-2" />
                      <p className="font-serif italic opacity-40 text-xs">Corpus is empty.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Inspector */}
        <aside className="border-l border-line bg-bg p-4 flex flex-col gap-6 overflow-y-auto">
          <div className="font-serif italic text-base border-b border-line pb-2">
            Selection Details
          </div>

          {selectedImage ? (
            <div className="flex flex-col gap-5 flex-grow">
              <div className="flex flex-col gap-1">
                <span className="data-label">Source ID</span>
                <span className="data-value">{selectedImage.id}</span>
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="data-label">Resolution</span>
                <span className="data-value">{selectedImage.width} x {selectedImage.height} px</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="data-label">Author</span>
                <span className="data-value">{selectedImage.author}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="data-label">Source Tags</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedImage.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 border border-line rounded-full font-mono">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <Separator className="bg-line/10" />

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="data-label">CV Analysis</span>
                  <button 
                    className="btn-hd py-0.5 px-2 text-[9px]"
                    onClick={() => handleAnalyze(selectedImage)}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? "..." : (selectedImage.cvAnalysis || cvResult ? "RE-RUN" : "RUN CV")}
                  </button>
                </div>

                {isAnalyzing && (
                  <div className="py-4 text-center">
                    <Loader2 className="w-4 h-4 animate-spin mx-auto opacity-20" />
                    <p className="text-[9px] mt-2 opacity-40">Detecting objects & colors...</p>
                  </div>
                )}

                {(selectedImage.cvAnalysis || cvResult) && !isAnalyzing && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {/* Object Detection */}
                    <div className="flex flex-col gap-1">
                      <span className="data-label">Detected Objects</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(selectedImage.cvAnalysis || cvResult).objects?.map((obj, idx) => (
                          <span key={idx} className="text-[9px] px-1.5 py-0.5 bg-ink text-bg font-mono flex items-center gap-1">
                            {obj.label}
                            <span className="opacity-50 text-[7px]">{Math.round(obj.confidence * 100)}%</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Color Palette */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <span className="data-label">Color Palette</span>
                        {(selectedImage.cvAnalysis || cvResult).hsv && (
                          <span className="text-[8px] font-mono opacity-40">
                            HSV: {(selectedImage.cvAnalysis || cvResult).hsv?.h}°, {(selectedImage.cvAnalysis || cvResult).hsv?.s}%, {(selectedImage.cvAnalysis || cvResult).hsv?.v}%
                          </span>
                        )}
                      </div>
                      <div className="flex h-4 w-full border border-line mt-1">
                        {(selectedImage.cvAnalysis || cvResult).colors?.map((color, idx) => (
                          <div 
                            key={idx} 
                            style={{ backgroundColor: color.hex, width: `${color.percentage}%` }}
                            title={`${color.label} (${color.percentage}%)`}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Segmentation */}
                    <div className="flex flex-col gap-1">
                      <span className="data-label">Visual Segments</span>
                      <ul className="list-none space-y-1">
                        {(selectedImage.cvAnalysis || cvResult).segments?.map((seg, idx) => {
                          const details = (selectedImage.cvAnalysis || cvResult).segmentDetails?.[idx];
                          return (
                            <li key={idx} className="text-[10px] opacity-80 leading-tight flex flex-col gap-0.5">
                              <div className="flex gap-2">
                                <span className="opacity-30">•</span> {seg}
                              </div>
                              {details && details.box_2d && (
                                <div className="pl-4 text-[8px] font-mono opacity-40">
                                  BOX: [{details.box_2d.map(v => v.toFixed(3)).join(', ')}]
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="data-label">Dominant Mood</span>
                      <span className="data-value italic">{(selectedImage.cvAnalysis || cvResult).dominantMood}</span>
                    </div>

                    {/* High Precision Analysis Section */}
                    {corpus.images.find(img => img.id === selectedImage.id) && (
                      <div className="pt-4 border-t border-line/10 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="data-label">High Precision Mode</span>
                          <p className="text-[9px] opacity-40 leading-relaxed italic">
                            High-fidelity SegFormer-B2 for detailed semantic parsing. Provides greater accuracy than base bulk models.
                          </p>
                        </div>
                        
                        {(selectedImage.cvAnalysis || cvResult).highPrecision ? (
                          <div className="bg-ink/5 p-2 border border-line/10 flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 text-[9px] text-ink font-bold">
                              <Star className="w-3 h-3 fill-ink text-ink" />
                              PRECISION_MAPPING_READY
                            </div>
                            <div className="text-[8px] font-mono opacity-60 flex flex-col gap-0.5">
                              <div>ENGINE: {(selectedImage.cvAnalysis || cvResult).highPrecision.model}</div>
                              <div>LAYERS: {(selectedImage.cvAnalysis || cvResult).highPrecision.masksCount}</div>
                              <div>COMPLETE: {new Date((selectedImage.cvAnalysis || cvResult).highPrecision.timestamp).toLocaleString()}</div>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={handleHighPrecisionAnalysis}
                            disabled={isAnalyzingHighPrecision}
                            className="w-full py-2 bg-ink text-bg text-[10px] font-bold tracking-widest hover:opacity-90 disabled:opacity-30 transition-all flex items-center justify-center gap-2 shadow-sm"
                          >
                            {isAnalyzingHighPrecision ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Cpu className="w-3 h-3" />
                            )}
                            {isAnalyzingHighPrecision ? "PROCESSING_PRECISION..." : "RUN_HIGH_PRECISION_SEGMENTATION"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2">
                {corpus.images.find(i => i.id === selectedImage.id) ? (
                  <button 
                    className="btn-hd w-full bg-red-50 text-red-600 border-red-200 hover:bg-red-600 hover:text-white"
                    onClick={() => removeFromCorpus(selectedImage.id)}
                  >
                    REMOVE FROM CORPUS
                  </button>
                ) : (
                  <button 
                    className="btn-hd w-full bg-ink text-bg"
                    onClick={() => addToCorpus(selectedImage)}
                  >
                    ADD TO CORPUS
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center text-center p-8">
              <p className="font-serif italic opacity-30 text-sm">Select an asset to view metadata and analysis.</p>
            </div>
          )}
        </aside>

        {/* Footer */}
        <footer className="col-span-full border-t border-line flex items-center justify-between px-4 bg-ink text-bg font-mono text-[10px]">
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2 animate-pulse" />
            API CONNECTED: SECURE_NODE_04
          </div>
          <div className="flex gap-6 opacity-60">
            <span>LATENCY: 38ms</span>
            <span>SESSION: {new Date().toLocaleTimeString()}</span>
          </div>
        </footer>

        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

interface ImageCellProps {
  image: ImageMetadata;
  isSelected: boolean;
  isInCorpus?: boolean;
  onClick: () => void;
  onAdd?: () => void;
  onRemove?: () => void;
  key?: React.Key;
}

function ImageCell({ 
  image, 
  isSelected,
  isInCorpus,
  onClick,
  onAdd,
  onRemove
}: ImageCellProps) {
  return (
    <div 
      className={`group relative flex flex-col border border-line bg-bg overflow-hidden cursor-pointer transition-all ${isSelected ? 'ring-2 ring-accent ring-inset z-10' : 'hover:border-ink/40'}`}
      onClick={onClick}
    >
      <div className="aspect-[4/3] bg-black/5 overflow-hidden relative">
        <img 
          src={image.thumbnail} 
          alt={image.description} 
          className={`w-full h-full object-cover transition-all duration-500 ${isSelected ? 'grayscale-0' : 'grayscale group-hover:grayscale-0'}`}
          referrerPolicy="no-referrer"
        />
        
        {/* Quick Actions Overlay */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          {isInCorpus ? (
            onRemove && (
              <button 
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="p-1 bg-red-600 text-white hover:bg-red-700 transition-colors"
                title="Remove from Corpus"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )
          ) : (
            onAdd && (
              <button 
                onClick={(e) => { e.stopPropagation(); onAdd(); }}
                className="p-1 bg-ink text-bg hover:bg-accent transition-colors"
                title="Add to Corpus"
              >
                <Plus className="w-3 h-3" />
              </button>
            )
          )}
        </div>

        {isInCorpus && (
          <div className="absolute top-1 left-1">
            <div className="bg-green-500 text-white text-[8px] px-1 py-0.5 font-mono uppercase">Collected</div>
          </div>
        )}
      </div>
      <div className="p-2 bg-meta border-t border-ink/10 flex flex-col gap-0.5">
        <div className="font-mono text-[9px] truncate opacity-80">{image.id.split('-')[1] || image.id}</div>
        <div className="font-serif italic text-[10px] truncate leading-tight">
          {image.description || "Untitled Asset"}
        </div>
      </div>
    </div>
  );
}
