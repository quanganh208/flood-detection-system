import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export enum Platform {
  ANDROID = 'ANDROID',
  IOS = 'IOS',
  WEB = 'WEB',
}

export class RegisterTokenDto {
  @ApiProperty({
    description: 'FCM registration token from client',
    example: 'dGVzdF90b2tlbl8xMjM0NTY3ODkw...',
  })
  @IsString()
  token: string;

  @ApiPropertyOptional({
    description: 'Mobile platform',
    enum: Platform,
    default: Platform.ANDROID,
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({
    description: 'Device model name',
    example: 'Samsung Galaxy S21',
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: 'Operating system version',
    example: 'Android 14',
  })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional({
    description: 'Application version',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'User identifier (if authenticated)',
    example: 'user_123',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Subscribe to alert notifications',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  subscribedToAlerts?: boolean;

  @ApiPropertyOptional({
    description: 'Subscribe to news notifications',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  subscribedToNews?: boolean;

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

  @ApiPropertyOptional({
    description: 'Notification radius in kilometers',
    example: 5.0,
    default: 5.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  notifyRadius?: number;
}
