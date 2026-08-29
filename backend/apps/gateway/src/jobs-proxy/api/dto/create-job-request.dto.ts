import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateJobRequestDto {
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  url!: string;

  @IsNotEmpty()
  @IsString()
  query!: string;
}
