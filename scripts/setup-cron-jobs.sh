#!/bin/bash

# setup-cron-jobs.sh
# Sets up cron jobs for Strefrontstalker scheduling systems
# Should be run as the deploy user on the server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Strefrontstalker cron jobs...${NC}"

# Check if running as deploy user
if [ "$USER" != "deploy" ]; then
    echo -e "${RED}Error: This script should be run as the 'deploy' user${NC}"
    echo "Switch to deploy user: sudo -u deploy -s"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: package.json not found. Please run this from the application root directory.${NC}"
    exit 1
fi

# Get the application directory (current directory)
APP_DIR=$(pwd)
echo "Application directory: $APP_DIR"

# Check if CRON_SECRET is set in .env.production
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production file not found${NC}"
    exit 1
fi

# Source the environment file to get CRON_SECRET
if ! grep -q "CRON_SECRET=" .env.production; then
    echo -e "${RED}Error: CRON_SECRET not found in .env.production${NC}"
    echo "Please add CRON_SECRET=your-secret-key to .env.production"
    exit 1
fi

CRON_SECRET=$(grep "CRON_SECRET=" .env.production | cut -d '=' -f2 | tr -d '"')
if [ -z "$CRON_SECRET" ]; then
    echo -e "${RED}Error: CRON_SECRET is empty${NC}"
    exit 1
fi

# Get the site URL
SITE_URL=$(grep "NEXT_PUBLIC_SITE_URL=" .env.production | cut -d '=' -f2 | tr -d '"')
if [ -z "$SITE_URL" ]; then
    SITE_URL="http://localhost:3000"
    echo -e "${YELLOW}Warning: NEXT_PUBLIC_SITE_URL not found, using localhost${NC}"
fi

echo "Site URL: $SITE_URL"

# Create logs directory
mkdir -p "$APP_DIR/logs"

# Create temporary cron file
TEMP_CRON=$(mktemp)

# Get existing crontab (if any)
crontab -l 2>/dev/null > "$TEMP_CRON" || true

# Remove any existing Strefrontstalker cron jobs
sed -i '/# Strefrontstalker/d' "$TEMP_CRON" 2>/dev/null || true
sed -i '/check-schedules/d' "$TEMP_CRON" 2>/dev/null || true
sed -i '/check-arbitrage-schedules/d' "$TEMP_CRON" 2>/dev/null || true

# Add new cron jobs
cat >> "$TEMP_CRON" << EOF

# Strefrontstalker - Storefront Updates (every hour at :00)
0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/check-schedules" >> "$APP_DIR/logs/cron-storefront.log" 2>&1

# Strefrontstalker - Arbitrage Scans (every hour at :30)  
30 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/check-arbitrage-schedules" >> "$APP_DIR/logs/cron-arbitrage.log" 2>&1

EOF

# Install the new crontab
crontab "$TEMP_CRON"

# Clean up
rm "$TEMP_CRON"

echo -e "${GREEN}✓ Cron jobs installed successfully!${NC}"
echo
echo "Installed cron jobs:"
echo "- Storefront updates: Every hour at :00 minutes"
echo "- Arbitrage scans: Every hour at :30 minutes"
echo
echo "Log files:"
echo "- Storefront: $APP_DIR/logs/cron-storefront.log"
echo "- Arbitrage: $APP_DIR/logs/cron-arbitrage.log"
echo
echo "To verify cron jobs are installed:"
echo "  crontab -l"
echo
echo "To view recent logs:"
echo "  tail -f $APP_DIR/logs/cron-storefront.log"
echo "  tail -f $APP_DIR/logs/cron-arbitrage.log"
echo
echo -e "${GREEN}Setup complete!${NC}"

# Test the cron endpoints
echo
echo "Testing cron endpoints..."

echo -n "Testing storefront endpoint... "
if curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/check-schedules" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "  Make sure the application is running and accessible at $SITE_URL"
fi

echo -n "Testing arbitrage endpoint... "
if curl -s -H "Authorization: Bearer $CRON_SECRET" "$SITE_URL/api/cron/check-arbitrage-schedules" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ OK${NC}"
else
    echo -e "${RED}✗ Failed${NC}"
    echo "  Make sure the application is running and accessible at $SITE_URL"
fi

echo
echo -e "${YELLOW}Note: The cron jobs will only execute tasks that are actually due${NC}"
echo -e "${YELLOW}based on user schedule settings in the database.${NC}"