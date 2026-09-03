import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { SystemService } from './system.service';

@Controller('system')
@UseGuards(AuthGuard, RolesGuard)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Post('wipe')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  async wipePlatform(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.system.wipePlatform(user.id);
  }
}
