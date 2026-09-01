import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { changePasswordSchema, loginSchema, type ChangePasswordInput, type LoginInput } from '@loadless/shared';
import type { Request, Response } from 'express';
import { AppConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppException } from '../common/app.exception';
import { REFRESH_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './login-throttler.guard';
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
  // Per ACCOUNT-on-an-address, not per address — see LoginThrottlerGuard for
  // why the default per-IP tracker locks out innocent users behind CGNAT.
  @UseGuards(LoginThrottlerGuard)
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

  /**
   * Change your own password. Authenticated — any role, including the admin
   * created by the deploy's bootstrap, which is the whole reason this exists:
   * the seeded password is a bootstrap value and must be replaceable from the
   * app.
   *
   * Throttled like login: it takes the current password, so without a limit it
   * is a password oracle for anyone holding a stolen session.
   *
   * Returns fresh cookies. Every other session is revoked, so the caller stays
   * signed in HERE and is signed out everywhere else.
   */
  @Post('change-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.changePassword(
      user.userId,
      body.currentPassword,
      body.newPassword,
      { userAgent: req.headers['user-agent'], ip: req.ip },
    );
    setAuthCookies(res, session.accessToken, session.refreshToken, this.config.isProduction);
    return { user: session.user };
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
