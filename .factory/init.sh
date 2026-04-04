#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   SERVICE — MCP Hub & Notification Center ║"
echo "║           Environment Setup               ║"
echo "╚══════════════════════════════════════════╝"
echo ""

PROJECT_DIR="/Users/teodorwaltervido/Desktop/service"
cd "$PROJECT_DIR"

# Verify Node.js
echo "🔍 Checking Node.js..."
node_version=$(node --version)
echo "   ✅ Node.js: $node_version"

# Verify npm
npm_version=$(npm --version)
echo "   ✅ npm: $npm_version"

# Check ports are available
echo ""
echo "🔍 Checking port availability..."
for port in 3333 3334; do
  if lsof -i ":$port" -sTCP:LISTEN -t > /dev/null 2>&1; then
    pid=$(lsof -i ":$port" -sTCP:LISTEN -t)
    echo "   ⚠️  Port $port is in use by PID $pid"
  else
    echo "   ✅ Port $port is available"
  fi
done

# Ensure ~/.service directory exists
echo ""
echo "🔧 Setting up data directory..."
mkdir -p ~/.service/logs
echo "   ✅ ~/.service/ ready"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
if [ ! -d "node_modules" ]; then
  npm install
  echo "   ✅ Dependencies installed"
else
  echo "   ✅ node_modules already present"
fi

# Build TypeScript (best effort — first feature creates the source)
echo ""
echo "🔨 Building TypeScript..."
if npm run build 2>/dev/null; then
  echo "   ✅ Build successful"
else
  echo "   ⚠️  Build skipped (source not yet created — first worker will scaffold)"
fi

echo ""
echo "✅ SERVICE environment ready!"
echo ""
echo "   MCP Hub:   http://localhost:3333/mcp"
echo "   Admin API: http://localhost:3334"
echo "   Data dir:  ~/.service/"
echo ""
