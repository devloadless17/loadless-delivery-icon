/**
 * E2E fixtures — NEVER run in production (guarded). Creates a known admin,
 * vendor, and driver for the Playwright golden path. Idempotent.
 */
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../auth/auth.service';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed e2e fixtures in production');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const hash = await AuthService.hashPassword('e2epassword1');

    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', defaultCommissionBps: 3000 },
      update: { defaultCommissionBps: 3000 },
    });

    await prisma.user.upsert({
      where: { email: 'admin@e2e.local' },
      create: { email: 'admin@e2e.local', passwordHash: hash, role: 'ADMIN' },
      update: {},
    });

    const vendorUser = await prisma.user.upsert({
      where: { email: 'vendor@e2e.local' },
      create: { email: 'vendor@e2e.local', passwordHash: hash, role: 'VENDOR' },
      update: {},
    });
    await prisma.vendor.upsert({
      where: { userId: vendorUser.id },
      create: { userId: vendorUser.id, businessName: 'E2E Burger House' },
      update: {},
    });

    const driverUser = await prisma.user.upsert({
      where: { normalizedPhone: '+96171999888' },
      create: { normalizedPhone: '+96171999888', passwordHash: hash, role: 'DRIVER' },
      update: {},
    });
    await prisma.driver.upsert({
      where: { userId: driverUser.id },
      create: {
        userId: driverUser.id,
        fullName: 'E2E Driver',
        contactPhone: '+96171999888',
        commissionOverrideBps: 2500,
      },
      update: { dutyStatus: 'OFF_DUTY' },
    });

    const driver2User = await prisma.user.upsert({
      where: { normalizedPhone: '+96171999777' },
      create: { normalizedPhone: '+96171999777', passwordHash: hash, role: 'DRIVER' },
      update: {},
    });
    await prisma.driver.upsert({
      where: { userId: driver2User.id },
      create: {
        userId: driver2User.id,
        fullName: 'E2E Driver Two',
        contactPhone: '+96171999777',
        commissionOverrideBps: null, // platform default 30%
      },
      update: { dutyStatus: 'OFF_DUTY' },
    });

    console.log('e2e fixtures ready');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
