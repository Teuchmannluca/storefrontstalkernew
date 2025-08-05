module.exports = {
  apps: [{
    name: 'strefrontstalker',
    script: 'server.js',
    cwd: '/home/deploy/strefrontstalker',
    instances: 1, // CPX31 has 2 vCPUs, but we'll use 1 for stability
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOSTNAME: '0.0.0.0'
    },
    error_file: '/home/deploy/strefrontstalker/logs/pm2-error.log',
    out_file: '/home/deploy/strefrontstalker/logs/pm2-out.log',
    log_file: '/home/deploy/strefrontstalker/logs/pm2-combined.log',
    time: true,
    max_memory_restart: '1G', // Restart if memory usage exceeds 1GB
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git', '.next'],
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    // Health check
    health_check: {
      interval: 30000,
      path: '/api/health',
      timeout: 5000
    },
    // Log rotation handled by logrotate
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};