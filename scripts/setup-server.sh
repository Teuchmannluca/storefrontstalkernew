#!/bin/bash
# Initial server setup script for Hetzner CPX31
# Run this once on a fresh Ubuntu server

set -e

echo "🔧 Starting server setup for Strefrontstalker..."

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
apt install -y curl git nginx certbot python3-certbot-nginx ufw fail2ban

# Install Node.js 20 via NodeSource
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 globally
echo "📦 Installing PM2..."
npm install -g pm2

# Create deploy user
echo "👤 Creating deploy user..."
useradd -m -s /bin/bash deploy || echo "User deploy already exists"
usermod -aG sudo deploy

# Create application directory
echo "📁 Creating application directories..."
mkdir -p /home/deploy/strefrontstalker/logs
mkdir -p /home/deploy/backups
chown -R deploy:deploy /home/deploy

# Configure firewall
echo "🔥 Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp  # Remove this after setting up nginx
echo "y" | ufw enable

# Setup fail2ban
echo "🛡️ Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Setup nginx (will be configured later)
echo "🌐 Setting up nginx..."
systemctl enable nginx
systemctl start nginx

# Setup PM2 startup
echo "🚀 Setting up PM2 startup..."
su - deploy -c "pm2 startup systemd -u deploy --hp /home/deploy"
systemctl enable pm2-deploy

# Create swap file (2GB for CPX31)
echo "💾 Creating swap file..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
fi

# Setup log rotation
echo "📝 Setting up log rotation..."
cat > /etc/logrotate.d/strefrontstalker << EOF
/home/deploy/strefrontstalker/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 deploy deploy
    sharedscripts
    postrotate
        /usr/bin/pm2 reloadLogs
    endscript
}
EOF

echo "✅ Server setup completed!"
echo "📋 Next steps:"
echo "1. Add your SSH key to /home/deploy/.ssh/authorized_keys"
echo "2. Configure nginx with the provided nginx.conf"
echo "3. Deploy the application using deploy.sh"
echo "4. Set up SSL with: certbot --nginx -d your-domain.com"