import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenerativeAI } from 'npm:@google/generative-ai@0.21.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StructureRequest {
  title: string;
  author: string;
  lyrics: string;
}

interface StructureResponse {
  markdown: string;
  sections: number;
  fallback: boolean;
}

function escapeYaml(str: string): string {
  if (str.includes(':') || str.includes('#') || str.includes("'") || str.includes('"')) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

function countSectionsInMarkdown(markdown: string): number {
  const matches = markdown.match(/^#\s+.+$/gm);
  return matches ? matches.length : 0;
}

/**
 * Basic fallback formatter when AI is unavailable
 */
function formatLyricsAsMarkdownBasic(title: string, author: string, lyrics: string): StructureResponse {
  const frontmatter = `---
title: ${escapeYaml(title)}
author: ${escapeYaml(author)}
---`;

  if (!lyrics || lyrics.trim().length === 0) {
    return {
      markdown: `${frontmatter}

# Verse 1
(No lyrics available - add your lyrics here)
`,
      sections: 1,
      fallback: true,
    };
  }

  // Simple section detection
  const sectionPattern = /^\s*[\[(]?\s*(Verse|Chorus|Bridge|Pre-Chorus|Intro|Outro|Hook|Refrain|Tag|Interlude)[\s\d]*[\])]?\s*$/i;

  const lines = lyrics.split('\n');
  const sections: { label: string; lines: string[] }[] = [];
  let currentSection: { label: string; lines: string[] } | null = null;
  let verseCount = 0;

  for (const line of lines) {
    const sectionMatch = line.match(sectionPattern);

    if (sectionMatch) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push(currentSection);
      }

      const sectionType = sectionMatch[1].toLowerCase();
      let label = sectionMatch[0].trim().replace(/[\[\]()]/g, '');

      if (sectionType === 'verse') {
        verseCount++;
        if (!label.match(/\d/)) {
          label = `Verse ${verseCount}`;
        }
      }

      currentSection = { label, lines: [] };
    } else if (line.trim()) {
      if (!currentSection) {
        verseCount++;
        currentSection = { label: `Verse ${verseCount}`, lines: [] };
      }
      currentSection.lines.push(line);
    } else if (currentSection && currentSection.lines.length > 0) {
      currentSection.lines.push('');
    }
  }

  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  if (sections.length === 0) {
    return {
      markdown: `${frontmatter}

# Verse 1
${lyrics.trim()}
`,
      sections: 1,
      fallback: true,
    };
  }

  let content = frontmatter + '\n';

  for (const section of sections) {
    content += `\n# ${section.label}\n`;
    content += section.lines.join('\n').trim() + '\n';
  }

  return {
    markdown: content,
    sections: countSectionsInMarkdown(content),
    fallback: true,
  };
}

/**
 * Structure lyrics using Gemini AI
 */
async function structureWithGemini(
  title: string,
  author: string,
  lyrics: string,
  apiKey: string
): Promise<StructureResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a worship song lyric formatter. Your task is to structure raw song lyrics into slide-ready markdown format.

REQUIREMENTS:
1. Section Detection: If the lyrics show clear sections (Chorus, Verse, Bridge, Pre-Chorus, Outro, Tag, etc.), use those exact names.
2. Section Inference: If no clear sections exist, analyze patterns to identify verses, choruses, bridges.
3. Chunking: Split each section into chunks of 2-4 lines for slide display. Maximum 6 lines per chunk. Count ONLY actual lyric lines (exclude blank lines).
4. Clean Content: Remove directives like "Repeat", "4x", "(Guitar solo)", "[Ad-lib]", "[x2]", etc.
5. Output Format: Use markdown headers (# Verse 1, # Chorus, etc.) with content below each header.
6. Section names should be short: # Verse 1, # Chorus, # Bridge - not verbose descriptions.

OUTPUT FORMAT:
---
title: Song Title
author: Artist Name
---

# [Section Name]
[chunk 1 lines]
[chunk 2 lines]

# [Next Section]
...

Raw lyrics to process:
${lyrics}

Remember: Start with YAML frontmatter containing the title and author, then add sections with markdown headers.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const markdown = response.text();

    // Clean up the response - remove markdown code blocks if present
    let cleanedMarkdown = markdown;
    const codeBlockMatch = markdown.match(/```(?:markdown)?\n([\s\S]+)\n```/);
    if (codeBlockMatch) {
      cleanedMarkdown = codeBlockMatch[1];
    }

    // Ensure frontmatter has correct title/author
    const frontmatterMatch = cleanedMarkdown.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      let updatedFrontmatter = frontmatter;

      if (!frontmatter.includes('title:')) {
        updatedFrontmatter = `title: ${escapeYaml(title)}\n` + updatedFrontmatter;
      } else {
        updatedFrontmatter = updatedFrontmatter.replace(/title: .*/, `title: ${escapeYaml(title)}`);
      }

      if (!frontmatter.includes('author:')) {
        updatedFrontmatter += `\nauthor: ${escapeYaml(author)}`;
      } else {
        updatedFrontmatter = updatedFrontmatter.replace(/author: .*/, `author: ${escapeYaml(author)}`);
      }

      cleanedMarkdown = cleanedMarkdown.replace(
        /^---\n[\s\S]*?\n---/,
        `---\n${updatedFrontmatter}\n---`
      );
    } else {
      // Add frontmatter if missing
      cleanedMarkdown = `---
title: ${escapeYaml(title)}
author: ${escapeYaml(author)}
---\n\n${cleanedMarkdown}`;
    }

    return {
      markdown: cleanedMarkdown,
      sections: countSectionsInMarkdown(cleanedMarkdown),
      fallback: false,
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const { title, author, lyrics }: StructureRequest = await req.json();

    if (!title || !author) {
      return new Response(
        JSON.stringify({ error: "title and author are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Try AI structuring if API key is available
    if (apiKey) {
      try {
        const result = await structureWithGemini(title, author, lyrics || '', apiKey);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error('AI structuring failed, using fallback:', error);
        // Silent fallback to basic formatting
      }
    } else {
      console.warn('GEMINI_API_KEY not configured, using basic formatting');
    }

    // Fallback to basic formatting
    const result = formatLyricsAsMarkdownBasic(title, author, lyrics || '');
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Structure lyrics error:", error);
    const message = error instanceof Error ? error.message : "structure_failed";
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
