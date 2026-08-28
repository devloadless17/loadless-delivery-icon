/**
 * First-admin bootstrap. Idempotent: exits cleanly if any ADMIN exists.
 * Credentials come from env only — never seeded fixtures.
 *
 * Usage (dev):   ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="..." pnpm ts-node src/scripts/bootstrap-admin.ts
 * Usage (prod):  docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD api node dist/scripts/bootstrap-admin.js
 */
import { PrismaClient } from '@prisma/client';
import { emailSchema } from '@loadless/shared';
import { AuthService } from '../auth/auth.service';

async function main(): Promise<void> {
  const emailRaw = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!emailRaw || !password) {
    console.error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }
  const parsed = emailSchema.safeParse(emailRaw);
  if (!parsed.success) {
    console.error(`ADMIN_EMAIL is not a valid email: ${emailRaw}`);
    process.exit(1);
  }
  const email = parsed.data;

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    if (existing) {
      console.log('An admin account already exists — nothing to do.');
      return;
    }
    const passwordHash = await AuthService.hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'ADMIN' },
      select: { id: true, email: true },
    });
    console.log(`Admin created: ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
