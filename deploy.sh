#!/bin/bash

# Deployment script for Strefrontstalker
# Run this to deploy the latest changes to your server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting deployment...${NC}"

# 1. Pull latest changes from GitHub
echo -e "${YELLOW}📥 Pulling latest code from GitHub...${NC}"
git pull origin main

# 2. Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# 3. Build the application
echo -e "${YELLOW}🔨 Building production version...${NC}"
npm run build

# 4. Check if build was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
else
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

# 5. Stop existing process (if using PM2)
if command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}🔄 Restarting with PM2...${NC}"
    pm2 restart strefrontstalker || pm2 start npm --name "strefrontstalker" -- start
else
    echo -e "${YELLOW}To run the application:${NC}"
    echo "  npm run start"
    echo ""
    echo -e "${YELLOW}Or run in background with PM2:${NC}"
    echo "  npm install -g pm2"
    echo "  pm2 start npm --name 'strefrontstalker' -- start"
    echo "  pm2 save"
    echo "  pm2 startup"
fi

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📝 Manual tasks:${NC}"
echo "1. Trigger Keepa enrichment manually:"
echo "   curl -H 'Authorization: Bearer YOUR_CRON_SECRET' http://localhost:3000/api/cron/keepa-enrichment"
echo ""
echo "2. Check application status:"
echo "   pm2 status"
echo ""
echo "3. View logs:"
echo "   pm2 logs strefrontstalker"