// PM2 process manifest for the climart.biznesjon.uz deploy.
//
// Ports: api=4000 (free), web=4002 (free). Both bind to 127.0.0.1
// only — nginx reverse-proxies HTTPS traffic to them. The shared
// /var/www/moysklad/.env is symlinked into each app dir so dotenv
// auto-loads it at startup (NestJS via @nestjs/config; Next.js
// natively).
//
// API runs source-direct via tsx because the monorepo's @moysklad/db
// workspace package is source-only (no built dist output). tsx's
// node loader handles the .ts imports at runtime. Switching the db
// package to a built output is a follow-up cleanup.

module.exports = {
  apps: [
    {
      name: 'moysklad-api',
      cwd: '/var/www/moysklad/apps/api',
      // PM2 launches `node` (interpreter) with `--import tsx/esm`
      // (interpreter_args) so .ts source imports from sibling
      // workspace packages resolve at runtime. Direct `script: tsx`
      // fails because PM2 inspects the file extension and sends the
      // shell wrapper through the node loader.
      script: 'src/main.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
      },
      error_file: '/var/log/moysklad/api.err.log',
      out_file: '/var/log/moysklad/api.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'moysklad-web',
      cwd: '/var/www/moysklad/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4002 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        TZ: 'Asia/Tashkent',
      },
      error_file: '/var/log/moysklad/web.err.log',
      out_file: '/var/log/moysklad/web.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
