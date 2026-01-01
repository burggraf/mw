#!/bin/bash
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env.server ]; then
  echo "Error: .env.server not found"
  echo "Copy .env.server.example to .env.server and fill in your API keys"
  exit 1
fi

source .env.server

if [ -z "$PEXELS_API_KEY" ] || [ "$PEXELS_API_KEY" = "your_pexels_key_here" ]; then
  echo "Error: PEXELS_API_KEY not set in .env.server"
  exit 1
fi

if [ -z "$UNSPLASH_ACCESS_KEY" ] || [ "$UNSPLASH_ACCESS_KEY" = "your_unsplash_key_here" ]; then
  echo "Error: UNSPLASH_ACCESS_KEY not set in .env.server"
  exit 1
fi

if [ -z "$PIXABAY_API_KEY" ] || [ "$PIXABAY_API_KEY" = "your_pixabay_key_here" ]; then
  echo "Error: PIXABAY_API_KEY not set in .env.server"
  exit 1
fi

if [ -z "$GENIUS_ACCESS_TOKEN" ] || [ "$GENIUS_ACCESS_TOKEN" = "your_genius_token_here" ]; then
  echo "Error: GENIUS_ACCESS_TOKEN not set in .env.server"
  exit 1
fi

echo "Deploying secrets to Supabase..."

supabase secrets set PEXELS_API_KEY="$PEXELS_API_KEY"
supabase secrets set UNSPLASH_ACCESS_KEY="$UNSPLASH_ACCESS_KEY"
supabase secrets set PIXABAY_API_KEY="$PIXABAY_API_KEY"
supabase secrets set GENIUS_ACCESS_TOKEN="$GENIUS_ACCESS_TOKEN"

echo "Secrets deployed successfully!"
