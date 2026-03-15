module.exports = {
  apps: [
    {
      name: 'botmart',
      script: './server/src/index.js',
      cwd: '/var/www/botmart',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 4100,
      },
      env_file: '/var/www/botmart/server/.env',
      error_file: '/var/www/botmart/logs/error.log',
      out_file: '/var/www/botmart/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
