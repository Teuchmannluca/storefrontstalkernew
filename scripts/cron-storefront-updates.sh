#!/bin/bash
# Cron job script for scheduled storefront updates
# Run daily at 2:00 AM UTC

# Load environment variables
source /home/deploy/strefrontstalker/.env.production

# Set the API endpoint
API_URL="${NEXT_PUBLIC_SITE_URL}/api/cron/check-schedules"

# Execute the cron job with authentication
curl -X GET \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "User-Agent: system-cron/1.0" \
  -H "Content-Type: application/json" \
  --max-time 300 \
  "${API_URL}" \
  >> /home/deploy/strefrontstalker/logs/cron-storefront-updates.log 2>&1

# Log completion
echo "[$(date)] Storefront update cron job completed" >> /home/deploy/strefrontstalker/logs/cron-storefront-updates.log