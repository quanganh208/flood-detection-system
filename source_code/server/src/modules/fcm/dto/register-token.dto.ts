import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class RegisterTokenDto {
  @ApiProperty({
    description: 'FCM registration token from client',
    example: 'dGVzdF90b2tlbl8xMjM0NTY3ODkw...',
  })
  @IsString()
  token: string;

  @ApiPropertyOptional({
    description: 'User latitude for location-based notifications',
    example: 10.762622,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    description: 'User longitude for location-based notifications',
    example: 106.660172,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
