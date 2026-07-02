// PM2 process manifest for the sherset.biznesjon.uz deploy.
//
// Ports: api=4000, web=4002. Both bind to 127.0.0.1 only —
// nginx (deploy/nginx-sherset.biznesjon.uz.conf) reverse-proxies HTTPS
// traffic to them. The shared /var/www/sherset/.env is symlinked into
// each app dir so dotenv auto-loads it at startup (NestJS via
// @nestjs/config; Next.js natively).
//
// ⚠️ If these ports collide with another tenant on the same VPS, change
// the pair HERE (web `-p`, api `API_PORT`) AND in the nginx upstream
// blocks AND in the production .env (API_ORIGIN) so all three agree.
//
// API runs source-direct via tsx because the monorepo's @moysklad/db
// workspace package is source-only (no built dist output). tsx's node
// loader handles the .ts imports at runtime.
//
// Start:   pm2 start deploy/ecosystem.sherset.config.cjs
// Reload:  pm2 reload ecosystem.sherset.config.cjs   (zero-downtime)
// Persist: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'sherset-api',
      cwd: '/var/www/sherset/apps/api',
      // PM2 launches `node` (interpreter) with `--import tsx/esm`
      // (interpreter_args) so .ts source imports from sibling workspace
      // packages resolve at runtime. Direct `script: tsx` fails because
      // PM2 inspects the file extension and sends the shell wrapper
      // through the node loader.
      script: 'src/main.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
        API_PORT: '4000',
      },
      error_file: '/var/log/sherset/api.err.log',
      out_file: '/var/log/sherset/api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'sherset-web',
      cwd: '/var/www/sherset/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4002 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
      },
      error_file: '/var/log/sherset/web.err.log',
      out_file: '/var/log/sherset/web.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
