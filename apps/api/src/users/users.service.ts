import { HttpStatus, Injectable } from '@nestjs/common';
import { ERROR_CODES, type Role } from '@loadless/shared';
import { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { AuthService } from '../auth/auth.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class UsersService {
  /** Creates the auth identity for a profile; maps phone uniqueness to a clean 409. */
  async createUser(
    tx: Tx,
    normalizedPhone: string,
    password: string,
    role: Role,
  ): Promise<{ id: string }> {
    const passwordHash = await AuthService.hashPassword(password);
    try {
      return await tx.user.create({
        data: { normalizedPhone, passwordHash, role },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          ERROR_CODES.PHONE_ALREADY_EXISTS,
          'An account with this phone number already exists',
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
