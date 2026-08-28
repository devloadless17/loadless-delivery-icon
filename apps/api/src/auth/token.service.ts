import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';
import type { AccessTokenClaims } from './auth.types';

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  signAccessToken(claims: AccessTokenClaims): string {
    return this.jwt.sign(claims, {
      secret: this.config.env.JWT_SECRET,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  verifyAccessToken(token: string): AccessTokenClaims | null {
    try {
      return this.jwt.verify<AccessTokenClaims & { iat: number; exp: number }>(token, {
        secret: this.config.env.JWT_SECRET,
      });
    } catch {
      return null;
    }
  }
}
