#!/bin/bash
set -e

echo "🚀 SERVICE — Initializing project..."

PROJECT_DIR="/Users/teodorwaltervido/Desktop/service"
cd "$PROJECT_DIR"

# Check Node.js
echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build 2>/dev/null || echo "⚠️  Build will be done by first worker"

echo "✅ SERVICE environment ready"
echo ""
echo "Ports reserved for SERVICE:"
echo "  3333 — MCP Hub HTTP server"
echo "  3334 — Admin API / Dashboard"
echo "  3335 — WebSocket notification bus"
