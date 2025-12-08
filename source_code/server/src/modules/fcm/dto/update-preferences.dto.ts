import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    description: 'Subscribe to alert notifications',
  })
  @IsOptional()
  @IsBoolean()
  subscribedToAlerts?: boolean;

  @ApiPropertyOptional({
    description: 'Subscribe to news notifications',
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
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  notifyRadius?: number;
}
