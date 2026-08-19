import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '@app/auth-kernel';
import { CurrentUser, JwtAuthGuard } from '@app/auth-kernel';
import { UpdateMeDto } from '@app/dtos';
import { USER_SERVICE } from '../../tokens';
import type { IUserService } from '../../application/interfaces/user-service.interface';
import { toUserResponse } from '../dto/user-response';

@Controller()
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    @Inject(USER_SERVICE) private readonly userService: IUserService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() identity: AuthTokenPayload) {
    const user = await this.userService.getById(identity.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toUserResponse(user);
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() identity: AuthTokenPayload,
    @Body() dto: UpdateMeDto,
  ) {
    const user = await this.userService.updateSelf(identity.userId, {
      email: dto.email,
      name: dto.name,
      phoneNumber: dto.phone_number,
      telegramChatId: dto.telegram_chat_id,
      password: dto.password,
    });
    return toUserResponse(user);
  }
}
