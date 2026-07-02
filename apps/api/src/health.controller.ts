import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: string; uptime: number; version: string } {
    return {
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.APP_VERSION ?? '0.0.1',
    };
  }
}
