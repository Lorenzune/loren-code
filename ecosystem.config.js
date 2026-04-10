module.exports = {
  apps: [{
    name: 'claude-ollama-bridge',
    script: 'src/server.js',
    instances: 'max', // Usa tutti i CPU core disponibili
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug'
    },
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    // Log files
    error_file: '.runtime/pm2-error.log',
    out_file: '.runtime/pm2-out.log',
    log_file: '.runtime/pm2-combined.log',
    time: true,

    // Auto restart
    watch: false,
    ignore_watch: ['node_modules', 'logs', '.git', '.runtime'],
    watch_options: {
      followSymlinks: false
    },

    // Memory management
    max_memory_restart: '500M',

    // Restart policy
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',

    // Health monitoring
    health_check_url: 'http://localhost:8788/health',
    health_check_grace_period: 3000,

    // Advanced options
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 8000,

    // Environment specific
    instance_var: 'INSTANCE_ID'
  }],

  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'https://github.com/your-username/claude-ollama-cloud-bridge.git',
      path: '/var/www/claude-ollama-bridge',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get update && apt-get install -y git nodejs npm',
      'post-setup': 'ln -s /var/www/claude-ollama-bridge/.env.local /var/www/claude-ollama-bridge/shared/.env.local'
    }
  }
};
