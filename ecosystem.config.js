// PM2 process manager configuration.
// Pakai: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'netra',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      watch: false,
      env: {
        NODE_ENV: 'production'
      },
      out_file: 'logs/out.log',
      error_file: 'logs/err.log',
      merge_logs: true,
      time: true
    }
  ]
};
