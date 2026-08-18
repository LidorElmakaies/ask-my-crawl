import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import type { UserRole } from '@app/auth-kernel';

export class UpdateUserAdminDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: UserRole;
}
