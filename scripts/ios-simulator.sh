#!/bin/bash
# iOS Simulator Build & Run Script for Mobile Worship
# Usage: ./scripts/ios-simulator.sh [device-name]
# Example: ./scripts/ios-simulator.sh "iPhone 17 Pro Max"

set -e
cd "$(dirname "$0")/.."

DEVICE="${1:-iPhone 17 Pro}"

echo "📱 Building and running Mobile Worship on: $DEVICE"
echo ""

# Kill any running vite processes to free port 5173
pkill -f "vite" 2>/dev/null || true
sleep 1

# Run Tauri iOS dev (builds and launches on simulator)
pnpm tauri ios dev "$DEVICE"
