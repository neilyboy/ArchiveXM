#!/bin/bash
# Development script for ArchiveXM

echo "🚀 Starting ArchiveXM Development Environment"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Please run from the ArchiveXM root directory"
    exit 1
fi

# Create data directories if they don't exist
mkdir -p data downloads

# Start backend
echo "📦 Starting backend..."
cd backend
pip install -r requirements.txt --quiet 2>/dev/null
uvicorn main:app --reload --host 0.0.0.0 --port 8742 &
BACKEND_PID=$!
cd ..

# Start frontend
echo "🎨 Starting frontend..."
cd frontend
npm install --silent 2>/dev/null
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ ArchiveXM is running!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8742"
echo "   API Docs: http://localhost:8742/docs"
echo ""
echo "Press Ctrl+C to stop..."

# Wait for interrupt
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
