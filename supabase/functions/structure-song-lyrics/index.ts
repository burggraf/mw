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
  // More comprehensive escaping for YAML special characters
  if (/[:#\n'"{}\[\]>|*\\&!%@`]/.test(str)) {
    return `"${str.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
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

CRITICAL REQUIREMENTS:
1. MUST identify and label ALL sections: Verse, Chorus, Bridge, Pre-Chorus, Outro, Tag, etc.
2. MUST split each section into chunks of 2-4 lines. MAXIMUM 6 lines per chunk - NO EXCEPTIONS.
3. Count ONLY actual lyric lines - exclude blank lines when counting.
4. Repeated content MUST be labeled as "Chorus" or "Refrain"
5. Remove ALL directives: "Repeat", "4x", "(Guitar solo)", "[Ad-lib]", "[x2]", "(repeat)", etc.
6. Each chunk gets its own markdown header: # Chorus, # Chorus (2), # Chorus (3), etc.

SECTION IDENTIFICATION RULES:
- Content that repeats multiple times → Chorus
- First distinct section → Verse 1
- Second distinct section → Verse 2
- Building section → Bridge
- Opening → Intro
- Closing → Outro or Tag

OUTPUT FORMAT (FOLLOW THIS EXACTLY):
---
title: Song Title
author: Artist Name
---

# Verse 1
Line 1
Line 2
Line 3
Line 4

# Verse 2
Line 1
Line 2
Line 3

# Chorus
Line 1
Line 2
Line 3
Line 4

# Chorus (2)
Line 1
Line 2
Line 3
Line 4

# Bridge
Line 1
Line 2
Line 3

IMPORTANT RULES:
- NEVER put more than 6 lines under one header
- If a section is longer than 6 lines, split it into multiple numbered chunks
- Always use section headers (Verse, Chorus, Bridge, etc.)
- Use parentheses for repeated sections: Chorus (2), Chorus (3), etc.
- Remove any content in parentheses or brackets that are directions not lyrics

Raw lyrics to process:
${lyrics}

Remember: Start with YAML frontmatter, then add ALL sections with proper markdown headers. NEVER put more than 6 lines under one header.`;

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

    // Validate AI response structure
    const sectionCount = countSectionsInMarkdown(cleanedMarkdown);
    if (sectionCount > 100 || sectionCount < 1) {
      throw new Error('Invalid AI response structure: unexpected section count');
    }

    return {
      markdown: cleanedMarkdown,
      sections: sectionCount,
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

    const MAX_LYRICS_LENGTH = 50000; // ~50K characters

    if (lyrics && lyrics.length > MAX_LYRICS_LENGTH) {
      return new Response(
        JSON.stringify({ error: "lyrics too large" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
