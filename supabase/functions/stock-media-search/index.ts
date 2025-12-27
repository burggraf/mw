import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface StockMediaItem {
  id: string;
  provider: "pexels" | "unsplash";
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  attribution: string;
}

interface SearchRequest {
  provider: "pexels" | "unsplash";
  query: string;
  page?: number;
  per_page?: number;
  type?: "image" | "video";
}

interface SearchResponse {
  results: StockMediaItem[];
  total: number;
  page: number;
  per_page: number;
}

async function searchPexelsImages(
  query: string,
  page: number,
  perPage: number,
  apiKey: string
): Promise<SearchResponse> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = await response.json();

  const results: StockMediaItem[] = data.photos.map((photo: any) => ({
    id: photo.id.toString(),
    provider: "pexels" as const,
    thumbnailUrl: photo.src.small,
    previewUrl: photo.src.large,
    downloadUrl: photo.src.original,
    width: photo.width,
    height: photo.height,
    attribution: `Photo by ${photo.photographer} on Pexels`,
  }));

  return {
    results,
    total: data.total_results,
    page: data.page,
    per_page: perPage,
  };
}

async function searchPexelsVideos(
  query: string,
  page: number,
  perPage: number,
  apiKey: string
): Promise<SearchResponse> {
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.status}`);
  }

  const data = await response.json();

  const results: StockMediaItem[] = data.videos.map((video: any) => {
    // Get video files sorted by quality
    const videoFiles = video.video_files.sort(
      (a: any, b: any) => b.width - a.width
    );
    const hdFile = videoFiles.find((f: any) => f.quality === "hd") || videoFiles[0];
    const sdFile = videoFiles.find((f: any) => f.quality === "sd") || videoFiles[0];

    return {
      id: video.id.toString(),
      provider: "pexels" as const,
      thumbnailUrl: video.image,
      previewUrl: sdFile?.link || video.image,
      downloadUrl: hdFile?.link || sdFile?.link,
      width: video.width,
      height: video.height,
      attribution: `Video by ${video.user.name} on Pexels`,
    };
  });

  return {
    results,
    total: data.total_results,
    page: data.page,
    per_page: perPage,
  };
}

async function searchUnsplash(
  query: string,
  page: number,
  perPage: number,
  accessKey: string
): Promise<SearchResponse> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("page", page.toString());
  url.searchParams.set("per_page", perPage.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unsplash API error: ${response.status}`);
  }

  const data = await response.json();

  const results: StockMediaItem[] = data.results.map((photo: any) => ({
    id: photo.id,
    provider: "unsplash" as const,
    thumbnailUrl: photo.urls.small,
    previewUrl: photo.urls.regular,
    downloadUrl: photo.urls.full,
    width: photo.width,
    height: photo.height,
    attribution: `Photo by ${photo.user.name} on Unsplash`,
  }));

  return {
    results,
    total: data.total,
    page,
    per_page: perPage,
  };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Check for authorization header
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: SearchRequest = await req.json();
    const { provider, query, page = 1, per_page = 20, type = "image" } = body;

    // Validate required fields
    if (!provider || !query) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: provider, query" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate provider
    if (!["pexels", "unsplash"].includes(provider)) {
      return new Response(
        JSON.stringify({ error: "Invalid provider. Use 'pexels' or 'unsplash'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let result: SearchResponse;

    if (provider === "pexels") {
      const pexelsApiKey = Deno.env.get("PEXELS_API_KEY");
      if (!pexelsApiKey) {
        return new Response(
          JSON.stringify({ error: "Pexels API key not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (type === "video") {
        result = await searchPexelsVideos(query, page, per_page, pexelsApiKey);
      } else {
        result = await searchPexelsImages(query, page, per_page, pexelsApiKey);
      }
    } else {
      // Unsplash
      const unsplashAccessKey = Deno.env.get("UNSPLASH_ACCESS_KEY");
      if (!unsplashAccessKey) {
        return new Response(
          JSON.stringify({ error: "Unsplash access key not configured" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Unsplash only supports images
      if (type === "video") {
        return new Response(
          JSON.stringify({ error: "Unsplash does not support video search" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      result = await searchUnsplash(query, page, per_page, unsplashAccessKey);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stock media search error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
