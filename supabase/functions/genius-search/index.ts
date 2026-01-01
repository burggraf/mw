import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  action: "search" | "lyrics";
  query?: string;
  title?: string;
  artist?: string;
}

interface GeniusSong {
  id: number;
  title: string;
  artist: string;
  albumArt: string;
  url: string;
}

interface SearchResponse {
  results: GeniusSong[];
}

interface LyricsResponse {
  lyrics: string | null;
}

async function searchSongs(query: string, accessToken: string): Promise<SearchResponse> {
  const url = `https://api.genius.com/search?q=${encodeURIComponent(query)}`;
  console.log("Genius API request to:", url);
  console.log("Token length:", accessToken?.length || 0);
  console.log("Token prefix:", accessToken?.substring(0, 10) || "MISSING");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Genius API error response:", errorText);
    throw new Error(`Genius API error: ${response.status}`);
  }

  const data = await response.json();

  const results: GeniusSong[] = data.response.hits.map((hit: any) => ({
    id: hit.result.id,
    title: hit.result.title,
    artist: hit.result.primary_artist.name,
    albumArt: hit.result.song_art_image_thumbnail_url,
    url: hit.result.url,
  }));

  return { results };
}

async function fetchLyrics(title: string, artist: string): Promise<LyricsResponse> {
  // Try lrclib.net first (free, no auth required)
  const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
  console.log("Fetching lyrics from lrclib:", lrclibUrl);

  try {
    const response = await fetch(lrclibUrl, {
      headers: {
        "User-Agent": "MobileWorship/1.0",
      },
    });

    if (response.ok) {
      const data = await response.json();
      // Prefer plain lyrics over synced lyrics
      if (data.plainLyrics) {
        return { lyrics: data.plainLyrics };
      }
      if (data.syncedLyrics) {
        // Strip timestamp tags from synced lyrics [00:00.00]
        const plain = data.syncedLyrics
          .split("\n")
          .map((line: string) => line.replace(/^\[\d{2}:\d{2}\.\d{2}\]\s*/, ""))
          .join("\n");
        return { lyrics: plain };
      }
    }
  } catch (err) {
    console.error("lrclib fetch error:", err);
  }

  // Fallback: try lyrics.ovh
  const ovhUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  console.log("Trying lyrics.ovh:", ovhUrl);

  try {
    const response = await fetch(ovhUrl);
    if (response.ok) {
      const data = await response.json();
      if (data.lyrics) {
        return { lyrics: data.lyrics.trim() };
      }
    }
  } catch (err) {
    console.error("lyrics.ovh fetch error:", err);
  }

  return { lyrics: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const accessToken = Deno.env.get("GENIUS_ACCESS_TOKEN");
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "GENIUS_ACCESS_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, query, title, artist }: SearchRequest = await req.json();

    if (action === "search") {
      if (!query) {
        return new Response(JSON.stringify({ error: "query is required for search" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await searchSongs(query, accessToken);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "lyrics") {
      if (!title || !artist) {
        return new Response(JSON.stringify({ error: "title and artist are required for lyrics" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await fetchLyrics(title, artist);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'search' or 'lyrics'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Genius search error:", error);
    const message = error instanceof Error ? error.message : "search_failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
