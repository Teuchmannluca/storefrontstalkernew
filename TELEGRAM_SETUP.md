# Telegram Bot Setup Guide

## Fixing "Bot token configured: No" Error

The error indicates that the `TELEGRAM_BOT_TOKEN` environment variable is not set on your Linux server.

## Steps to Fix:

### 1. Get Your Telegram Bot Token
If you don't have a bot token yet:
1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the bot token provided

### 2. Add Token to Your Linux Server

#### Option A: Using PM2 (Recommended)
If you're using PM2 to run the application:

```bash
# Stop the application
pm2 stop strefrontstalker

# Set environment variable in PM2
pm2 set strefrontstalker:TELEGRAM_BOT_TOKEN "YOUR_BOT_TOKEN_HERE"

# Or update your ecosystem.config.js file
nano ecosystem.config.js
```

Add to the env section:
```javascript
env: {
  TELEGRAM_BOT_TOKEN: "YOUR_BOT_TOKEN_HERE",
  // ... other variables
}
```

Then restart:
```bash
pm2 restart strefrontstalker --update-env
```

#### Option B: Using .env.local file
```bash
# Navigate to your application directory
cd /path/to/strefrontstalker

# Edit the .env.local file
nano .env.local

# Add this line:
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE

# Save and exit (Ctrl+X, then Y, then Enter)

# Restart the application
pm2 restart strefrontstalker
```

#### Option C: Using systemd service
If running as a systemd service:

```bash
# Edit the service file
sudo nano /etc/systemd/system/strefrontstalker.service

# Add under [Service] section:
Environment="TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE"

# Reload systemd and restart
sudo systemctl daemon-reload
sudo systemctl restart strefrontstalker
```

### 3. Verify the Bot Has Access to Your Chat

Make sure the bot is added to your Telegram group/channel:
1. Add the bot to your group (`-1002836176596`)
2. Make the bot an administrator (required for channels)
3. Send a test message to activate the bot

### 4. Test the Configuration

After restarting, check the logs:
```bash
pm2 logs strefrontstalker --lines 50
```

You should see:
- `Bot token configured: Yes` instead of `No`
- Successful message delivery without 404 errors

## Troubleshooting

### Still Getting 404 Error?
1. **Verify the chat ID**: The chat ID `-1002836176596` must be correct
2. **Check bot permissions**: Bot must be admin in channels/supergroups
3. **Test with a simple chat**: Try sending to your personal chat first (get your chat ID by messaging the bot and checking updates)

### Get Your Chat ID
```bash
# Use curl to get updates (replace YOUR_BOT_TOKEN)
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
```

Look for the `chat` object in the response to find your chat ID.

## Environment Variables Summary

Add these to your server's environment:

```bash
# Required for Telegram notifications
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Optional: Override default chat ID
TELEGRAM_CHAT_ID=-1002836176596
```

## Security Note

Never commit your bot token to version control. Always use environment variables or secure secret management systems.