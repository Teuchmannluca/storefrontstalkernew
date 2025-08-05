#!/bin/bash
# Deployment script for Strefrontstalker on Hetzner CPX31

set -e

echo "🚀 Starting deployment process..."

# Configuration
DEPLOY_USER="deploy"
DEPLOY_PATH="/home/${DEPLOY_USER}/strefrontstalker"
BACKUP_PATH="/home/${DEPLOY_USER}/backups"
NODE_VERSION="20"

# Create deployment directory if it doesn't exist
ssh ${DEPLOY_USER}@${SERVER_IP} "mkdir -p ${DEPLOY_PATH} ${BACKUP_PATH} ${DEPLOY_PATH}/logs"

# Create backup of current deployment
echo "📦 Creating backup of current deployment..."
ssh ${DEPLOY_USER}@${SERVER_IP} "
  if [ -d ${DEPLOY_PATH}/.next ]; then
    tar -czf ${BACKUP_PATH}/backup-$(date +%Y%m%d-%H%M%S).tar.gz -C ${DEPLOY_PATH} .next package.json
  fi
"

# Copy files to server
echo "📤 Copying files to server..."
rsync -avz --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude 'logs' \
  ./ ${DEPLOY_USER}@${SERVER_IP}:${DEPLOY_PATH}/

# Copy production environment file if it exists
if [ -f .env.production ]; then
  echo "📋 Copying production environment file..."
  scp .env.production ${DEPLOY_USER}@${SERVER_IP}:${DEPLOY_PATH}/.env.production
fi

# Install dependencies and build on server
echo "📦 Installing dependencies and building..."
ssh ${DEPLOY_USER}@${SERVER_IP} "
  cd ${DEPLOY_PATH}
  
  # Ensure correct Node.js version
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  nvm use ${NODE_VERSION}
  
  # Install dependencies
  npm ci --production=false
  
  # Source environment variables if they exist
  if [ -f \".env.production\" ]; then
    export \$(grep -v '^#' .env.production | xargs)
  fi
  
  # Build the application
  NODE_ENV=production npm run build
  
  # Check if standalone was created
  if [ ! -d \".next/standalone\" ]; then
    echo \"❌ Error: Standalone build not created. Check build logs.\"
    exit 1
  fi
  
  # Copy standalone files
  cp -r .next/standalone/* ./
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/
  if [ -d \"public\" ]; then
    cp -r public .next/standalone/
  fi
  
  # Copy package.json for standalone
  cp package.json .next/standalone/
  cp package-lock.json .next/standalone/
  
  # Make scripts executable
  chmod +x scripts/*.sh
"

# Restart the application
echo "🔄 Restarting application..."
ssh ${DEPLOY_USER}@${SERVER_IP} "
  cd ${DEPLOY_PATH}
  pm2 restart strefrontstalker || pm2 start ecosystem.config.js
"

# Update crontab
echo "⏰ Updating cron jobs..."
ssh ${DEPLOY_USER}@${SERVER_IP} "
  crontab ${DEPLOY_PATH}/scripts/crontab.txt
"

echo "✅ Deployment completed successfully!"
echo "🌐 Application should be available at http://${SERVER_IP}:3000"