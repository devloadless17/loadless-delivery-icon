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

  /**
   * Set a new password AND clear the failed-login lockout, in one write.
   *
   * The lockout is checked before the password is verified, and was cleared
   * only by a SUCCESSFUL login — so a reset left it standing. That inverted the
   * whole point of an admin reset: the person locks themselves out, an admin
   * resets the password, the reset genuinely succeeds, and they still cannot
   * get in for up to fifteen minutes. What they see is a brand-new password
   * that does not work, and the admin who just fixed it has no way to tell.
   * It happened on production to the platform owner's own account.
   *
   * Clearing here rather than at each call site because this is the single
   * chokepoint every admin-initiated reset already goes through — admins,
   * vendors and drivers alike. A driver is the case that matters most: locked
   * out, on the street, with no other way back in.
   */
  async setPassword(tx: Tx, userId: string, password: string): Promise<void> {
    const passwordHash = await AuthService.hashPassword(password);
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    });
  }
}
