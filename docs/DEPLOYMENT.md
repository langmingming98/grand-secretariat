# Deployment Guide

## Overview

```
Push to main → GitHub Actions → Build Docker images → Push to ghcr.io → Deploy to EC2
```

## One-Time Setup

### 1. GitHub Repository Setup

Create a new private repo and push this code:

```bash
cd /path/to/grand-secretariat
git init
git add .
git commit -m "Initial commit"
git remote add origin git@github.com:YOUR_USERNAME/grand-secretariat.git
git branch -M main
git push -u origin main
```

### 2. GitHub Secrets

Go to your repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret | Value | Description |
|--------|-------|-------------|
| `EC2_HOST` | `3.16.44.162` | Your EC2 public IP |
| `EC2_USER` | `ec2-user` or `ubuntu` | SSH username |
| `EC2_SSH_KEY` | Contents of your .pem file | SSH private key |
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | OpenRouter API key |
| `GH_PAT` | Personal Access Token | For pulling images on EC2 |

#### Creating a GitHub Personal Access Token (GH_PAT)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these scopes:
   - `read:packages` (to pull container images)
3. Copy the token and add it as `GH_PAT` secret

### 3. EC2 Setup

SSH into your EC2 instance and run:

```bash
# Download and run setup script
curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/grand-secretariat/main/scripts/ec2-setup.sh | bash

# Log out and back in for docker group
exit
# SSH back in

# Edit environment file
nano ~/grand-secretariat/.env

# Test docker works
docker run hello-world
```

### 4. First Deploy

Either:
- Push to main branch (triggers auto-deploy)
- Go to Actions tab → Build and Deploy → Run workflow

## Monitoring

SSH into EC2 and check:

```bash
cd ~/grand-secretariat

# View running containers
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f gateway
```

## Manual Rollback

```bash
# SSH to EC2
cd ~/grand-secretariat

# Pull specific version (use SHA from GitHub Actions)
docker compose -f docker-compose.prod.yml pull
# Or specify a tag: ghcr.io/username/repo/chat:abc1234

# Restart
docker compose -f docker-compose.prod.yml up -d
```

## Local Development

```bash
# Run all services locally
./scripts/dev.sh

# Or with Docker (builds from source)
docker-compose up --build
```
