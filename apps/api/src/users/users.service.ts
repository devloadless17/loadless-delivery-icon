import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type Role } from '@loadless/shared';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { AuthService } from '../auth/auth.service';

type Tx = Prisma.TransactionClient;

/** Login identity per role: DRIVER -> phone, ADMIN/VENDOR -> email (DB CHECK-backed). */
export type UserIdentity =
  | { email: string; normalizedPhone?: undefined }
  | { normalizedPhone: string; email?: undefined };

@Injectable()
export class UsersService {
  async createUser(
    tx: Tx,
    identity: UserIdentity,
    password: string,
    role: Role,
  ): Promise<{ id: string }> {
    const passwordHash = await AuthService.hashPassword(password);
    try {
      return await tx.user.create({
        data: {
          email: identity.email ?? null,
          normalizedPhone: identity.normalizedPhone ?? null,
          passwordHash,
          role,
        },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ERROR_CODES.PHONE_ALREADY_EXISTS,
          identity.email
            ? 'An account with this email already exists'
            : 'An account with this phone number already exists',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
  }

  async setPassword(tx: Tx, userId: string, password: string): Promise<void> {
    const passwordHash = await AuthService.hashPassword(password);
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
  }
}
