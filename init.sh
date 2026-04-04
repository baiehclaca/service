#!/bin/bash
set -e

echo "🚀 SERVICE TUI — Initializing project..."

PROJECT_DIR="/Users/teodorwaltervido/Desktop/service"
cd "$PROJECT_DIR"

# Check Node.js
NODE_MAJOR=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "❌ Node.js >=20 required. Got: $(node --version)"
  exit 1
fi
echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"

# Install dependencies if needed
if [ ! -d "node_modules" ] || ! node -e "require('ink')" 2>/dev/null; then
  echo "📦 Installing dependencies (including Ink TUI framework)..."
  npm install
fi

# Verify Ink is installed
if ! node -e "require('ink')" 2>/dev/null; then
  echo "📦 Installing Ink and TUI dependencies..."
  npm install ink @inkjs/ui react react-dom @clack/prompts ink-table
  npm install --save-dev ink-testing-library @types/react @types/react-dom
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build 2>/dev/null || echo "⚠️  Build will be done by first worker"

echo "✅ SERVICE TUI environment ready"
echo ""
echo "Ports reserved for SERVICE:"
echo "  3333 — MCP Hub HTTP server"
echo "  3334 — Admin API / SSE stream"
echo ""
echo "TUI framework: Ink v6 (React for CLI)"
echo "Wizard framework: @clack/prompts"
