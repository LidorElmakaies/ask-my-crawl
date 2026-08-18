import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// Wire format matches docs/specs/api-contracts.md exactly (snake_case) — no mapping layer
// between the DTO and the request body.
export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone_number?: string;

  @IsOptional()
  @IsString()
  telegram_chat_id?: string;
}
