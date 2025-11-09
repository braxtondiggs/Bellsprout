import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty({ description: 'New email address' })
  @IsEmail()
  newEmail!: string;
}
