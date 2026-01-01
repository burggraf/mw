import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "pexels" | "unsplash" | "pixabay";

interface SearchRequest {
  provider: Provider;
  query: string;
  page?: number;
  per_page?: number;
  type?: "image" | "video";
}

interface StockMediaItem {
  id: string;
  provider: Provider;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  attribution: string;
}

interface SearchResponse {
  results: StockMediaItem[];
  total: number;
  page: number;
  per_page: number;
}

const PER_PAGE = 20;

async function searchPexelsImages(query: string, page: number, apiKey: string): Promise<SearchResponse> {
  const response = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${PER_PAGE}&page=${page}`,
    { headers: { Authorization: apiKey } }
  );

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    results: data.photos.map((photo: any) => ({
      id: photo.id.toString(),
      provider: "pexels" as Provider,
      thumbnailUrl: photo.src.medium,
      previewUrl: photo.src.large,
      downloadUrl: photo.src.original,
      width: photo.width,
      height: photo.height,
      attribution: `Photo by ${photo.photographer} on Pexels`,
    })),
    total: data.total_results,
    page: data.page,
    per_page: PER_PAGE,
  };
}

async function searchPexelsVideos(query: string, page: number, apiKey: string): Promise<SearchResponse> {
  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`,
    { headers: { Authorization: apiKey } }
  );

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    results: data.videos.map((video: any) => {
      const videoFiles = video.video_files.sort((a: any, b: any) => b.width - a.width);
      const hdFile = videoFiles.find((f: any) => f.quality === "hd") || videoFiles[0];
      const sdFile = videoFiles.find((f: any) => f.quality === "sd") || videoFiles[0];

      return {
        id: video.id.toString(),
        provider: "pexels" as Provider,
        thumbnailUrl: video.image,
        previewUrl: sdFile?.link || video.image,
        downloadUrl: hdFile?.link || sdFile?.link,
        width: video.width,
        height: video.height,
        attribution: `Video by ${video.user.name} on Pexels`,
      };
    }),
    total: data.total_results,
    page: data.page,
    per_page: PER_PAGE,
  };
}

async function searchUnsplash(query: string, page: number, accessKey: string): Promise<SearchResponse> {
  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${PER_PAGE}&page=${page}`,
    { headers: { Authorization: `Client-ID ${accessKey}` } }
  );

  if (!response.ok) {
    throw new Error(`Unsplash API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    results: data.results.map((photo: any) => ({
      id: photo.id,
      provider: "unsplash" as Provider,
      thumbnailUrl: photo.urls.small,
      previewUrl: photo.urls.regular,
      downloadUrl: photo.urls.full,
      width: photo.width,
      height: photo.height,
      attribution: `Photo by ${photo.user.name} on Unsplash`,
    })),
    total: data.total,
    page,
    per_page: PER_PAGE,
  };
}

async function searchPixabayImages(query: string, page: number, apiKey: string): Promise<SearchResponse> {
  const response = await fetch(
    `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&orientation=horizontal&per_page=${PER_PAGE}&page=${page}&safesearch=true&image_type=photo`
  );

  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    results: data.hits.map((photo: any) => ({
      id: photo.id.toString(),
      provider: "pixabay" as Provider,
      thumbnailUrl: photo.webformatURL,
      previewUrl: photo.webformatURL,
      downloadUrl: photo.largeImageURL,
      width: photo.imageWidth,
      height: photo.imageHeight,
      attribution: `Image by ${photo.user} on Pixabay`,
    })),
    total: data.totalHits,
    page,
    per_page: PER_PAGE,
  };
}

async function searchPixabayVideos(query: string, page: number, apiKey: string): Promise<SearchResponse> {
  const response = await fetch(
    `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&safesearch=true`
  );

  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    results: data.hits.map((video: any) => {
      const videoFiles = video.videos;
      const downloadUrl = videoFiles.large?.url || videoFiles.medium?.url || videoFiles.small?.url || videoFiles.tiny?.url;
      const previewUrl = videoFiles.medium?.url || videoFiles.small?.url || videoFiles.tiny?.url || downloadUrl;

      return {
        id: video.id.toString(),
        provider: "pixabay" as Provider,
        thumbnailUrl: `https://i.vimeocdn.com/video/${video.picture_id}_295x166.jpg`,
        previewUrl: previewUrl || "",
        downloadUrl: downloadUrl || "",
        width: videoFiles.large?.width || videoFiles.medium?.width || 1920,
        height: videoFiles.large?.height || videoFiles.medium?.height || 1080,
        attribution: `Video by ${video.user} on Pixabay`,
      };
    }),
    total: data.totalHits,
    page,
    per_page: PER_PAGE,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, query, page = 1, type = "image" }: SearchRequest = await req.json();

    if (!provider || !query) {
      return new Response(JSON.stringify({ error: "provider and query are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: SearchResponse;

    switch (provider) {
      case "pexels": {
        const apiKey = Deno.env.get("PEXELS_API_KEY");
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "PEXELS_API_KEY not configured" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = type === "video"
          ? await searchPexelsVideos(query, page, apiKey)
          : await searchPexelsImages(query, page, apiKey);
        break;
      }
      case "unsplash": {
        const accessKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
        if (!accessKey) {
          return new Response(JSON.stringify({ error: "UNSPLASH_ACCESS_KEY not configured" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (type === "video") {
          return new Response(JSON.stringify({ error: "Unsplash does not support video search" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = await searchUnsplash(query, page, accessKey);
        break;
      }
      case "pixabay": {
        const apiKey = Deno.env.get("PIXABAY_API_KEY");
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "PIXABAY_API_KEY not configured" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = type === "video"
          ? await searchPixabayVideos(query, page, apiKey)
          : await searchPixabayImages(query, page, apiKey);
        break;
      }
      default:
        return new Response(JSON.stringify({ error: "Invalid provider" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stock media search error:", error);
    const message = error instanceof Error ? error.message : "search_failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
