import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, type LoginInput } from '@loadless/shared';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppException } from '../common/app.exception';
import { REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { clearAuthCookies, setAuthCookies } from './cookies';
import { CurrentUser, Public } from './decorators';
import type { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login(body.identifier, body.password, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    setAuthCookies(res, session.accessToken, session.refreshToken, this.config.isProduction);
    return { user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    try {
      const session = await this.auth.refresh(presented, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
      setAuthCookies(res, session.accessToken, session.refreshToken, this.config.isProduction);
      return { user: session.user };
    } catch (err) {
      clearAuthCookies(res, this.config.isProduction);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(presented);
    clearAuthCookies(res, this.config.isProduction);
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        email: true,
        normalizedPhone: true,
        role: true,
        vendor: { select: { id: true, businessName: true, logoKey: true, status: true } },
        driver: {
          select: { id: true, fullName: true, contactPhone: true, dutyStatus: true, status: true },
        },
      },
    });
    if (!record) throw AppException.unauthenticated();
    return { user: record };
  }
}
