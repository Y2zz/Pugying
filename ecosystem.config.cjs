// pm2 进程配置（本机部署，由 scripts/deploy-local.sh 调用）
const path = require('path');

const BACKEND_PORT = process.env.BACKEND_PORT || '3000';
const FRONTEND_PORT = process.env.FRONTEND_PORT || '8080';

module.exports = {
  apps: [
    {
      name: 'pugying-backend',
      cwd: path.join(__dirname, 'backend'),
      script: 'dist/src/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: BACKEND_PORT,
        JWT_SECRET: process.env.JWT_SECRET || '',
        CORS_ORIGINS:
          process.env.CORS_ORIGINS || `http://localhost:${FRONTEND_PORT}`,
      },
      max_memory_restart: '512M',
      time: true,
    },
    {
      // pm2 内置静态服务器托管前端产物（SPA 回退到 index.html）
      name: 'pugying-frontend',
      script: 'serve',
      env: {
        PM2_SERVE_PATH: path.join(__dirname, 'frontend', 'dist'),
        PM2_SERVE_PORT: FRONTEND_PORT,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
      time: true,
    },
  ],
};
