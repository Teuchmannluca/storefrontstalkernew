#!/bin/bash

# Local development cron setup
# This sets up cron jobs for testing on your local machine

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up local Strefrontstalker cron jobs...${NC}"

# Get the application directory
APP_DIR=$(pwd)
echo "Application directory: $APP_DIR"

# Get CRON_SECRET from .env.local
if [ -f ".env.local" ]; then
    CRON_SECRET=$(grep "^CRON_SECRET=" .env.local | cut -d '=' -f2 | tr -d '"')
    SITE_URL=$(grep "^NEXT_PUBLIC_SITE_URL=" .env.local | cut -d '=' -f2 | tr -d '"')
else
    echo -e "${RED}Error: .env.local not found${NC}"
    exit 1
fi

if [ -z "$CRON_SECRET" ]; then
    echo -e "${RED}Error: CRON_SECRET not found in .env.local${NC}"
    exit 1
fi

if [ -z "$SITE_URL" ]; then
    SITE_URL="http://localhost:3000"
    echo -e "${YELLOW}Using default SITE_URL: $SITE_URL${NC}"
fi

echo "CRON_SECRET: [hidden]"
echo "SITE_URL: $SITE_URL"

# Create logs directory if it doesn't exist
mkdir -p "$APP_DIR/logs"

# Create temporary cron file
TEMP_CRON=$(mktemp)

# Get existing crontab (if any)
crontab -l 2>/dev/null > "$TEMP_CRON" || true

# Remove any existing Strefrontstalker cron jobs
sed -i '' '/# Strefrontstalker/d' "$TEMP_CRON" 2>/dev/null || true
sed -i '' '/check-schedules/d' "$TEMP_CRON" 2>/dev/null || true
sed -i '' '/check-arbitrage-schedules/d' "$TEMP_CRON" 2>/dev/null || true

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
echo "To view logs:"
echo "  tail -f $APP_DIR/logs/cron-storefront.log"
echo "  tail -f $APP_DIR/logs/cron-arbitrage.log"
echo
echo "To test manually right now:"
echo "  curl -H \"Authorization: Bearer $CRON_SECRET\" \"$SITE_URL/api/cron/check-schedules\""
echo "  curl -H \"Authorization: Bearer $CRON_SECRET\" \"$SITE_URL/api/cron/check-arbitrage-schedules\""
echo
echo -e "${GREEN}Setup complete!${NC}"