#!/bin/bash

# Voice Assistant - Quick Start Script
# This script sets up and runs both backend and frontend

set -e

echo "Voice Assistant - Quick Start Setup"
echo "======================================"
echo ""

# Check Python version
echo "Checking Python version..."
python3 --version

# Setup Backend
echo ""
echo "📦 Setting up Backend..."
cd backend || exit

if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

echo "Activating virtual environment..."
source .venv/bin/activate

echo "Installing Python dependencies..."
pip install -r requirements.txt --quiet

echo "✅ Backend setup complete"

# Return to root
cd ..

# Setup Frontend
echo ""
echo "📦 Setting up Frontend..."
cd frontend || exit

if [ ! -d "node_modules" ]; then
    echo "Installing Node dependencies..."
    npm install
else
    echo "Node dependencies already installed"
fi

echo "✅ Frontend setup complete"

# Return to root
cd ..

echo ""
echo "======================================"
echo "✨ Setup Complete!"
echo ""
echo "To start the application:"
echo ""
echo "Terminal 1 - Backend:"
echo "  cd backend"
echo "  source .venv/bin/activate"
echo "  python fastapi_server.py"
echo ""
echo "Terminal 2 - Frontend:"
echo "  cd frontend"
echo "  npm run dev"
echo ""
echo "Then open: http://localhost:3000"
echo ""
