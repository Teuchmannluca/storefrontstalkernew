# Cron Job Setup Guide

## What is CRON_SECRET?

`CRON_SECRET` is a security token that protects your cron endpoints from unauthorized access. It acts like a password that only your cron jobs know, preventing random people from triggering your scheduled tasks.

## How to Create a CRON_SECRET

Generate a strong, random secret key. Here are a few methods:

### Method 1: OpenSSL (Recommended)
```bash
openssl rand -base64 32
```

### Method 2: Node.js
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Method 3: Manual (Less Secure)
Create a long, random string like: `my-super-secret-cron-key-2024-change-this`

## Setup Instructions

### 1. Add to Environment Variables

Add the generated secret to your `.env.local` file:
```bash
CRON_SECRET=your-generated-secret-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 2. Install Cron Jobs (Local Development)

Run the setup script:
```bash
./setup-local-cron.sh
```

This will:
- Install cron jobs that run every hour
- Storefront updates at :00 minutes
- Arbitrage scans at :30 minutes
- Create log files in `logs/` directory

### 3. Manual Cron Setup (Alternative)

If the script doesn't work, add manually with `crontab -e`:

```bash
# Storefront Updates (every hour at :00)
0 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/check-schedules" >> /path/to/project/logs/cron-storefront.log 2>&1

# Arbitrage Scans (every hour at :30)
30 * * * * curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/check-arbitrage-schedules" >> /path/to/project/logs/cron-arbitrage.log 2>&1
```

### 4. For Production Server

Use the production setup script:
```bash
./scripts/setup-cron-jobs.sh
```

This requires:
- `.env.production` file with `CRON_SECRET`
- Running as the `deploy` user
- Application running on the server

## Testing

Test the endpoints manually:
```bash
# Test storefront updates
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/check-schedules"

# Test arbitrage scans
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "http://localhost:3000/api/cron/check-arbitrage-schedules"
```

Expected response when no schedules are due:
```json
{
  "message": "No schedules due for execution",
  "processed": 0
}
```

## Monitoring

Check cron logs:
```bash
# View storefront update logs
tail -f logs/cron-storefront.log

# View arbitrage scan logs
tail -f logs/cron-arbitrage.log

# List installed cron jobs
crontab -l
```

## How It Works

1. **Cron runs every hour** but only processes schedules that are actually due
2. **User settings in dashboard** determine when tasks should run
3. **Database views** (`schedules_due_for_execution`) filter for due tasks
4. **Authentication** via CRON_SECRET prevents unauthorized access
5. **Logs** track all executions and errors

## Troubleshooting

### "Authentication required" error
- Check CRON_SECRET is set in environment variables
- Restart the Next.js server after adding environment variables
- Verify the secret matches in both .env file and cron command

### No schedules running
- Check user has enabled scheduling in dashboard settings
- Verify next_run time in database is in the past
- Check cron job is installed: `crontab -l`

### Cron not executing
- Check cron service is running: `service cron status`
- Verify paths in crontab are absolute, not relative
- Check log file permissions