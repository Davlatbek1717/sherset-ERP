import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedUser } from '../auth/auth.schema.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermission } from '../permissions/require-permission.decorator.js';
import { ImageService } from './image.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class ImageController {
  constructor(@Inject(ImageService) private readonly svc: ImageService) {}

  /** GET /products/:productId/images */
  @Get('products/:productId/images')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  async list(@CurrentUser() user: AuthenticatedUser, @Param('productId') productId: string) {
    return this.svc.listForProduct(user.accountId, productId);
  }

  /** POST /products/:productId/images — JSON body { filename, mime, dataBase64 } */
  @Post('products/:productId/images')
  @RequirePermission({ entity: 'attachment', action: 'create' })
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    return this.svc.upload(user.accountId, productId, body);
  }

  /**
   * GET /images/:imageId/raw — returns the binary with the right
   * Content-Type. Used as <img src=...> in the web UI.
   */
  @Get('images/:imageId/raw')
  @RequirePermission({ entity: 'attachment', action: 'view' })
  @Header('Cache-Control', 'private, max-age=300')
  async raw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('imageId') imageId: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<StreamableFile> {
    const { buffer, mime, filename } = await this.svc.getRaw(user.accountId, imageId);
    res.header('Content-Type', mime);
    res.header('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
    return new StreamableFile(buffer);
  }

  @Put('products/:productId/images/:imageId/main')
  @RequirePermission({ entity: 'attachment', action: 'update' })
  async setMain(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    await this.svc.setMain(user.accountId, productId, imageId);
    return { ok: true };
  }

  @Put('products/:productId/images/reorder')
  @RequirePermission({ entity: 'attachment', action: 'update' })
  async reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() body: unknown,
  ) {
    await this.svc.reorder(user.accountId, productId, body);
    return { ok: true };
  }

  @Delete('products/:productId/images/:imageId')
  @RequirePermission({ entity: 'attachment', action: 'delete' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.svc.delete(user.accountId, productId, imageId);
  }
}
