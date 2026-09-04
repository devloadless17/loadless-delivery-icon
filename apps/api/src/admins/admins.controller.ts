import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createAdminSchema,
  offsetPaginationSchema,
  updateAdminSchema,
  type CreateAdminInput,
  type OffsetPagination,
  type UpdateAdminInput,
} from '@loadless/shared';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { AuthUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AdminsService } from './admins.service';

const listQuerySchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
});

/**
 * Admins managing admins.
 *
 * Every admin is equal here: any of them may create, suspend, reset or delete
 * any other. The two things none of them may do — act on their own account, or
 * remove the last one who can still sign in — are enforced in the service, and
 * the second is backed by a database trigger for anything that never comes
 * through this controller.
 */
@Controller('admin/admins')
@Roles('ADMIN')
export class AdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createAdminSchema)) body: CreateAdminInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admins.create(body, user);
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(listQuerySchema))
    query: OffsetPagination & { q?: string },
  ) {
    return this.admins.list(query, query.q);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.admins.get(id);
  }

  /** Reset another admin's password, or suspend/reactivate them. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAdminSchema)) body: UpdateAdminInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admins.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.admins.remove(id, user);
  }
}
