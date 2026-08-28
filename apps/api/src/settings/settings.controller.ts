import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateSettingsSchema, type UpdateSettingsInput } from '@loadless/shared';
import { Roles, CurrentUser } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from './settings.service';

@Controller('admin/settings')
@Roles('ADMIN')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Patch()
  async update(
    @Body(new ZodValidationPipe(updateSettingsSchema)) body: UpdateSettingsInput,
    @CurrentUser() user: AuthUser,
  ) {
    const before = await this.settings.get();
    const after = await this.settings.update(body);
    this.audit.log({
      actor: user,
      action: 'SETTINGS_UPDATED',
      entityType: 'PlatformSetting',
      entityId: 'singleton',
      metadata: { before, after },
    });
    return after;
  }
}
