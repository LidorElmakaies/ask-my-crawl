import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UpdateUserAdminDto } from '@app/dtos';
import { USER_SERVICE } from '../../tokens';
import type { IUserService } from '../../application/interfaces/user-service.interface';
import { Roles } from '../decorators/roles.decorator';
import { toUserResponse } from '../dto/user-response';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';

@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(
    @Inject(USER_SERVICE) private readonly userService: IUserService,
  ) {}

  @Get()
  async list() {
    const users = await this.userService.listAll();
    return users.map(toUserResponse);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.userService.getById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserAdminDto) {
    const user = await this.userService.updateByAdmin(id, {
      email: dto.email,
      phoneNumber: dto.phone_number,
      role: dto.role,
    });
    return toUserResponse(user);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string): Promise<void> {
    await this.userService.deleteByAdmin(id);
  }
}
