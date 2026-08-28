/**
 * First-admin bootstrap. Idempotent: exits cleanly if any ADMIN exists.
 * Credentials come from env only — never seeded fixtures.
 *
 * Usage (dev):   ADMIN_PHONE="03123456" ADMIN_PASSWORD="..." pnpm ts-node src/scripts/bootstrap-admin.ts
 * Usage (prod):  docker compose run --rm -e ADMIN_PHONE -e ADMIN_PASSWORD api node dist/scripts/bootstrap-admin.js
 */
import { PrismaClient } from '@prisma/client';
import { normalizeLebanesePhone } from '@loadless/shared';
import { AuthService } from '../auth/auth.service';

async function main(): Promise<void> {
  const phoneRaw = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phoneRaw || !password) {
    console.error('ADMIN_PHONE and ADMIN_PASSWORD are required');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters');
    process.exit(1);
  }
  const phone = normalizeLebanesePhone(phoneRaw);
  if (!phone) {
    console.error(`ADMIN_PHONE is not a valid Lebanese phone number: ${phoneRaw}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
    if (existing) {
      console.log('An admin account already exists — nothing to do.');
      return;
    }
    const passwordHash = await AuthService.hashPassword(password);
    const user = await prisma.user.create({
      data: { normalizedPhone: phone, passwordHash, role: 'ADMIN' },
      select: { id: true, normalizedPhone: true },
    });
    console.log(`Admin created: ${user.normalizedPhone} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
