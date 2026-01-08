# Structure Song Lyrics

Converts raw song lyrics into structured markdown with section headers and slide-sized chunks using Google Gemini AI.

## Environment Variables

- `GEMINI_API_KEY` - Google AI API key (optional - falls back to basic formatting if not set)

Get an API key: https://makersuite.google.com/app/apikey

## Request

```json
{
  "title": "Amazing Grace",
  "author": "John Newton",
  "lyrics": "Amazing grace how sweet the sound..."
}
```

## Response

```json
{
  "markdown": "---\ntitle: Amazing Grace\nauthor: John Newton\n---\n\n# Verse 1\nAmazing grace...",
  "sections": 4,
  "fallback": false
}
```

## Deploy

```bash
supabase functions deploy structure-song-lyrics
```
