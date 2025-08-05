# Strefrontstalker Deployment Guide for Hetzner CPX31

This guide covers the complete deployment process for migrating from Vercel to a self-hosted Hetzner CPX31 server.

## Prerequisites

- Hetzner CPX31 server (or similar) with Ubuntu 22.04 LTS
- Domain name (optional, but recommended for SSL)
- SSH access to the server
- All environment variables from `.env.production.example`

## Initial Server Setup

1. **SSH into your server as root**
   ```bash
   ssh root@your-server-ip
   ```

2. **Run the server setup script**
   ```bash
   wget https://raw.githubusercontent.com/your-repo/strefrontstalker/main/scripts/setup-server.sh
   chmod +x setup-server.sh
   ./setup-server.sh
   ```

3. **Add your SSH key for the deploy user**
   ```bash
   mkdir -p /home/deploy/.ssh
   echo "your-ssh-public-key" >> /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh
   chmod 600 /home/deploy/.ssh/authorized_keys
   ```

4. **Log out and log back in as deploy user**
   ```bash
   exit
   ssh deploy@your-server-ip
   ```

## Application Deployment

1. **Clone the repository on your local machine**
   ```bash
   git clone https://github.com/your-repo/strefrontstalker.git
   cd strefrontstalker
   ```

2. **Create production environment file**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with your actual values
   ```

3. **Make deployment script executable**
   ```bash
   chmod +x scripts/deploy.sh
   ```

4. **Set server IP and deploy**
   ```bash
   export SERVER_IP=your-server-ip
   ./scripts/deploy.sh
   ```

## Nginx Configuration

1. **SSH into server as deploy user**
   ```bash
   ssh deploy@your-server-ip
   ```

2. **Copy nginx configuration**
   ```bash
   sudo cp /home/deploy/strefrontstalker/nginx.conf /etc/nginx/sites-available/strefrontstalker
   sudo ln -s /etc/nginx/sites-available/strefrontstalker /etc/nginx/sites-enabled/
   ```

3. **Update server_name in nginx config**
   ```bash
   sudo nano /etc/nginx/sites-available/strefrontstalker
   # Replace your-domain.com with your actual domain or server IP
   ```

4. **Test and reload nginx**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

## SSL Setup (Optional but Recommended)

1. **Install SSL certificate with Certbot**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

2. **Follow the prompts to configure SSL**

3. **Verify auto-renewal**
   ```bash
   sudo certbot renew --dry-run
   ```

## Cron Jobs Setup

The deployment script automatically installs the cron jobs. To verify:

```bash
crontab -l
```

You should see:
- Storefront updates at 2:00 AM UTC daily
- Arbitrage scans at 3:15 AM UTC daily

## Process Management

The application runs under PM2 for process management.

### Common PM2 Commands

```bash
# View application status
pm2 status

# View logs
pm2 logs strefrontstalker

# Restart application
pm2 restart strefrontstalker

# Stop application
pm2 stop strefrontstalker

# Start application
pm2 start ecosystem.config.js
```

## Monitoring and Logs

### Application Logs
```bash
# PM2 logs
tail -f /home/deploy/strefrontstalker/logs/pm2-out.log
tail -f /home/deploy/strefrontstalker/logs/pm2-error.log

# Cron logs
tail -f /home/deploy/strefrontstalker/logs/cron-storefront-updates.log
tail -f /home/deploy/strefrontstalker/logs/cron-arbitrage-scans.log
```

### Nginx Logs
```bash
sudo tail -f /var/log/nginx/strefrontstalker-access.log
sudo tail -f /var/log/nginx/strefrontstalker-error.log
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

## Updating the Application

To deploy updates:

1. **On your local machine**
   ```bash
   git pull origin main
   export SERVER_IP=your-server-ip
   ./scripts/deploy.sh
   ```

The deployment script handles:
- Creating backups
- Installing dependencies
- Building the application
- Restarting PM2
- Updating cron jobs

## Troubleshooting

### Application Won't Start
1. Check environment variables: `pm2 logs strefrontstalker`
2. Verify all required env vars are set in `.env.production`
3. Check health endpoint: `curl http://localhost:3000/api/health`

### Cron Jobs Not Running
1. Check cron logs in `/home/deploy/strefrontstalker/logs/`
2. Verify CRON_SECRET matches in `.env.production`
3. Test cron endpoints manually:
   ```bash
   curl -H "Authorization: Bearer your-cron-secret" http://localhost:3000/api/cron/check-schedules
   ```

### High Memory Usage
1. Check PM2 memory: `pm2 monit`
2. Application auto-restarts at 1GB memory usage
3. Adjust in `ecosystem.config.js` if needed

### SSL Issues
1. Ensure domain points to server IP
2. Check firewall allows ports 80 and 443
3. Regenerate certificate: `sudo certbot certonly --nginx -d your-domain.com`

## Security Considerations

1. **Firewall is configured to allow only**:
   - SSH (port 22)
   - HTTP (port 80)
   - HTTPS (port 443)

2. **Application runs as non-root user** (deploy)

3. **Sensitive data in environment variables** - never commit `.env.production`

4. **Regular updates**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

## Backup Strategy

1. **Database**: Handled by Supabase (automatic backups)

2. **Application backups** created on each deployment in:
   ```
   /home/deploy/backups/
   ```

3. **Manual backup**:
   ```bash
   cd /home/deploy
   tar -czf backup-$(date +%Y%m%d).tar.gz strefrontstalker/
   ```

## Performance Optimization

1. **PM2 is configured for**:
   - Single instance (can increase for higher traffic)
   - Auto-restart on crashes
   - Memory limit of 1GB

2. **Nginx handles**:
   - Gzip compression
   - Static file caching
   - Connection pooling

3. **Next.js optimizations**:
   - Standalone build reduces size
   - Static assets cached for 1 year
   - API routes have 5-minute timeout

## Migration Notes from Vercel

Key changes from Vercel deployment:

1. **Removed Vercel-specific dependencies**:
   - @vercel/speed-insights
   - vercel.json configuration

2. **Cron jobs** now use system cron instead of Vercel cron

3. **Environment variables** in `.env.production` instead of Vercel dashboard

4. **Function timeouts** handled by nginx proxy timeouts

5. **Deployment** via SSH/rsync instead of Git push

## Support

For issues or questions:
1. Check logs first (PM2, nginx, cron)
2. Verify environment variables
3. Test health endpoint
4. Review this documentation

Remember to keep your server updated and monitor resource usage regularly!