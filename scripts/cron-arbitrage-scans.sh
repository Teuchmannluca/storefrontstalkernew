#!/bin/bash
# Cron job script for scheduled arbitrage scans
# Run daily at 3:15 AM UTC

# Load environment variables
source /home/deploy/strefrontstalker/.env.production

# Set the API endpoint
API_URL="${NEXT_PUBLIC_SITE_URL}/api/cron/check-arbitrage-schedules"

# Execute the cron job with authentication
curl -X GET \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "User-Agent: system-cron/1.0" \
  -H "Content-Type: application/json" \
  --max-time 300 \
  "${API_URL}" \
  >> /home/deploy/strefrontstalker/logs/cron-arbitrage-scans.log 2>&1

# Log completion
echo "[$(date)] Arbitrage scan cron job completed" >> /home/deploy/strefrontstalker/logs/cron-arbitrage-scans.log