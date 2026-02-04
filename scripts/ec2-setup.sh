#!/bin/bash
# EC2 Setup Script - Run this once on a fresh EC2 instance (Amazon Linux 2023 or Ubuntu)
# Usage: curl -sSL <raw-github-url> | bash

set -e

echo "=== Grand Secretariat EC2 Setup ==="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

echo "Detected OS: $OS"

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    if [ "$OS" = "amzn" ]; then
        sudo yum update -y
        sudo yum install -y docker
        sudo systemctl start docker
        sudo systemctl enable docker
    elif [ "$OS" = "ubuntu" ]; then
        sudo apt-get update
        sudo apt-get install -y docker.io
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
    sudo usermod -aG docker $USER
    echo "Docker installed. You may need to log out and back in for group changes."
else
    echo "Docker already installed"
fi

# Install Docker Compose (standalone)
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    # Also install as docker plugin
    mkdir -p ~/.docker/cli-plugins
    curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o ~/.docker/cli-plugins/docker-compose
    chmod +x ~/.docker/cli-plugins/docker-compose
else
    echo "Docker Compose already installed"
fi

# Create deployment directory
echo "Creating deployment directory..."
mkdir -p ~/grand-secretariat
cd ~/grand-secretariat

# Create environment file template
if [ ! -f .env ]; then
    echo "Creating .env template..."
    cat > .env << 'EOF'
# GitHub repository (format: username/repo-name)
GITHUB_REPO=your-username/grand-secretariat

# OpenRouter API Key
OPENROUTER_API_KEY=your-openrouter-api-key
EOF
    echo "Created .env file - please edit with your values"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit ~/grand-secretariat/.env with your values"
echo "2. Log out and back in (for docker group)"
echo "3. Test docker: docker run hello-world"
echo ""
echo "The GitHub Actions workflow will deploy automatically on push to main."
