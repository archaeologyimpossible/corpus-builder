import { ImageMetadata, SearchSource } from "../types";

const UNSPLASH_ACCESS_KEY = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY;

export async function searchImages(query: string, source: SearchSource = 'web', page: number = 1): Promise<ImageMetadata[]> {
  const results: ImageMetadata[] = [];
  const limit = 20;

  if (source === 'flickr' || source === 'web') {
    // 1. PUBLIC SOURCE: Openverse (Contemporary/Public Domain - No Key Required)
    try {
      const openverseSource = source === 'flickr' ? 'flickr' : 'flickr,wikimedia,behance';
      const response = await fetch(
        `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${limit}&page=${page}&source=${openverseSource}`
      );
      const data = await response.json();
      if (data.results) {
        results.push(
          ...data.results.map((item: any) => ({
            id: `openverse-${item.id}`,
            url: item.url,
            thumbnail: item.thumbnail,
            author: item.creator || "Unknown Creator",
            source: `Web (${item.source})`,
            description: item.title,
            tags: ["Web Photography", "Public Domain", "Creative Commons"],
            width: item.width || 1000,
            height: item.height || 1000,
            createdAt: new Date().toISOString(),
          }))
        );
      }
    } catch (error) {
      console.error("Openverse search error:", error);
    }
  }

  if (source === 'wikimedia') {
    // 2. PUBLIC SOURCE: Wikimedia Commons (Keyless - Great for web photography)
    try {
      const offset = (page - 1) * limit;
      const response = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}&gsroffset=${offset}&prop=imageinfo&iiprop=url|dimensions|user|extmetadata`
      );
      const data = await response.json();
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages);
        results.push(
          ...pages
            .filter((page: any) => page.imageinfo && page.imageinfo[0])
            .map((page: any) => {
              const info = page.imageinfo[0];
              const meta = info.extmetadata || {};
              return {
                id: `wiki-${page.pageid}`,
                url: info.url,
                thumbnail: info.url,
                author: meta.Artist?.value || info.user || "Unknown",
                source: "Wikimedia Commons",
                description: meta.ObjectName?.value || page.title,
                tags: ["Web Photography", "Commons"],
                width: info.width || 1000,
                height: info.height || 1000,
                createdAt: meta.DateTime?.value || new Date().toISOString(),
              };
            })
        );
      }
    } catch (error) {
      console.error("Wikimedia search error:", error);
    }
  }

  if (source === 'museum') {
    // 3. FALLBACK/SECONDARY: Museums
    try {
      const skip = (page - 1) * limit;
      const response = await fetch(
        `https://openaccess-api.clevelandart.org/api/artworks/?q=${encodeURIComponent(query)}&has_image=1&limit=${limit}&skip=${skip}`
      );
      const data = await response.json();
      if (data.data) {
        results.push(
          ...data.data.map((item: any) => ({
            id: `cleveland-${item.id}`,
            url: item.images?.web?.url || item.images?.print?.url,
            thumbnail: item.images?.web?.url,
            author: item.creators?.[0]?.description || "Unknown Artist",
            source: "Cleveland Museum (Archive)",
            description: item.title,
            tags: ["Archive"],
            width: 1000,
            height: 1000,
            createdAt: new Date().toISOString(),
          }))
        );
      }
    } catch (error) {
      console.error("Cleveland Museum search error:", error);
    }
  }

  if (source === 'unsplash' && UNSPLASH_ACCESS_KEY) {
    // 4. OPTIONAL: Unsplash
    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${limit}`,
        {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        }
      );
      const data = await response.json();
      if (data.results) {
        results.push(
          ...data.results.map((img: any) => ({
            id: `unsplash-${img.id}`,
            url: img.urls.regular,
            thumbnail: img.urls.small,
            author: img.user.name,
            source: "Unsplash",
            description: img.description || img.alt_description,
            tags: img.tags?.map((t: any) => t.title) || [],
            width: img.width,
            height: img.height,
            createdAt: img.created_at,
          }))
        );
      }
    } catch (error) {
      console.error("Unsplash search error:", error);
    }
  }

  if (source === 'pexels' && PEXELS_API_KEY) {
    // 5. OPTIONAL: Pexels
    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=20`,
        {
          headers: { Authorization: PEXELS_API_KEY },
        }
      );
      const data = await response.json();
      if (data.photos) {
        results.push(
          ...data.photos.map((img: any) => ({
            id: `pexels-${img.id}`,
            url: img.src.large2x,
            thumbnail: img.src.medium,
            author: img.photographer,
            source: "Pexels",
            description: img.alt,
            tags: [],
            width: img.width,
            height: img.height,
            createdAt: new Date().toISOString(),
          }))
        );
      }
    } catch (error) {
      console.error("Pexels search error:", error);
    }
  }

  return results;
}
