#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}=== Mobile Worship Cloudflare Deployment ===${NC}"

cd "$APP_DIR"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: wrangler is not installed${NC}"
    echo "Install it with: pnpm add -g wrangler"
    echo "Or run: npx wrangler"
    exit 1
fi

# Check if logged in to Cloudflare
echo -e "${YELLOW}Checking Cloudflare authentication...${NC}"
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Cloudflare. Running login...${NC}"
    wrangler login
fi

# Build the frontend
echo -e "${YELLOW}Building frontend...${NC}"
pnpm build

# Check if build was successful
if [ ! -d "$APP_DIR/dist" ]; then
    echo -e "${RED}Error: Build failed - dist directory not found${NC}"
    exit 1
fi

# Deploy to Cloudflare Pages
# Set your Cloudflare account ID (find it at: https://dash.cloudflare.com -> Workers & Pages -> Overview)
# export CLOUDFLARE_ACCOUNT_ID="your-account-id-here"
echo -e "${YELLOW}Deploying to Cloudflare Pages...${NC}"
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID environment variable}" wrangler pages deploy dist --project-name mobileworship

echo -e "${GREEN}=== Deployment complete! ===${NC}"
