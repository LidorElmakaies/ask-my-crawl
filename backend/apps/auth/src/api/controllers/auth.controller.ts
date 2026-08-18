import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { LoginDto, RefreshTokenDto, RegisterDto } from '@app/dtos';
import { AUTH_SERVICE } from '../../tokens';
import type { IAuthService } from '../../application/interfaces/auth-service.interface';
import { toUserResponse } from '../dto/user-response';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_SERVICE) private readonly authService: IAuthService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const { user, tokens } = await this.authService.register({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      phoneNumber: dto.phone_number,
      telegramChatId: dto.telegram_chat_id,
    });
    return {
      user: toUserResponse(user),
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const { user, tokens } = await this.authService.login({
      email: dto.email,
      password: dto.password,
    });
    return {
      user: toUserResponse(user),
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refresh(dto.refresh_token);
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(dto.refresh_token);
  }
}
