#!/bin/bash
set -euo pipefail

# macOS launcher for Mahakal Premier League.
# This project uses Node.js/npm only; it does not use Python or a virtual environment.

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 22.16 or later, then run this file again."
  echo "Download: https://nodejs.org/"
  read -r -p "Press Return to close..." _
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Reinstall Node.js 22.16 or later (npm is included with Node.js)."
  read -r -p "Press Return to close..." _
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
NODE_MINOR="$(node -p 'Number(process.versions.node.split(".")[1])')"
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 16 ]; }; then
  echo "This project requires Node.js 22.16 or later for SQLite. Current version: $(node --version)"
  echo "Update Node.js from https://nodejs.org/ and run this file again."
  read -r -p "Press Return to close..." _
  exit 1
fi

echo ""
echo "=============================================="
echo "       MAHAKAL PREMIER LEAGUE WEBSITE"
echo "=============================================="
echo ""

if [ ! -x "node_modules/.bin/concurrently" ] || [ ! -x "node_modules/.bin/vite" ]; then
  echo "Installing project packages with npm (one-time setup)..."
  npm install
fi

# The backend works with built-in defaults. Create this optional configuration
# file automatically so the user does not need to copy it manually.
if [ ! -f "backend/.env" ]; then
  cp "backend/.env.example" "backend/.env"
fi

echo ""
echo "Checking the SQLite database..."
npm run db:check
echo ""
echo "Starting the MPL website and API..."
echo "Website: http://localhost:5173"
echo "API:     http://localhost:4000/api/health"
echo "Keep this Terminal window open while using the website."
echo "Press Control+C to stop both services."
echo ""

exec npm run dev
