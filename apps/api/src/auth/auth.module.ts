import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OriginCheckGuard } from './origin-check.guard';
import { PolicyService } from './policy.service';
import { RevocationService } from './revocation.service';
import { RolesGuard } from './roles.guard';
import { TokenService } from './token.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    RevocationService,
    PolicyService,
    JwtAuthGuard,
    RolesGuard,
    OriginCheckGuard,
  ],
  exports: [AuthService, TokenService, RevocationService, PolicyService, JwtAuthGuard, RolesGuard, OriginCheckGuard],
})
export class AuthModule {}
