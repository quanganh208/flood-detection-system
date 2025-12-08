import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAlertsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by severity',
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: string;

  @ApiPropertyOptional({
    description: 'Filter by alert type',
    enum: [
      'WATER_WARNING',
      'WATER_DANGER',
      'HEAVY_RAIN',
      'DEVICE_OFFLINE',
      'SENSOR_ERROR',
      'OTA_FAILED',
    ],
  })
  @IsOptional()
  @IsEnum([
    'WATER_WARNING',
    'WATER_DANGER',
    'HEAVY_RAIN',
    'DEVICE_OFFLINE',
    'SENSOR_ERROR',
    'OTA_FAILED',
  ])
  type?: string;

  @ApiPropertyOptional({
    description: 'Number of alerts to return',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class AlertItemDto {
  @ApiProperty({ description: 'Alert UUID' })
  id: string;

  @ApiProperty({
    description: 'Alert type',
    enum: [
      'WATER_WARNING',
      'WATER_DANGER',
      'HEAVY_RAIN',
      'DEVICE_OFFLINE',
      'SENSOR_ERROR',
      'OTA_FAILED',
    ],
  })
  type: string;

  @ApiProperty({ description: 'Alert severity', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  severity: string;

  @ApiProperty({ description: 'Alert message' })
  message: string;

  @ApiProperty({ description: 'Device ID' })
  deviceId: string;

  @ApiProperty({ description: 'Device name' })
  deviceName: string;

  @ApiProperty({ description: 'Device location', required: false })
  location: string | null;

  @ApiProperty({ description: 'Latitude', required: false })
  lat: number | null;

  @ApiProperty({ description: 'Longitude', required: false })
  lng: number | null;

  @ApiProperty({ description: 'Water level at alert time', required: false })
  waterLevel: number | null;

  @ApiProperty({ description: 'Rain analog at alert time', required: false })
  rainAnalog: number | null;

  @ApiProperty({ description: 'Alert creation timestamp' })
  createdAt: Date;
}

export class AlertsResponseDto {
  @ApiProperty({ type: [AlertItemDto], description: 'List of alerts' })
  alerts: AlertItemDto[];

  @ApiProperty({ description: 'Total number of unresolved alerts' })
  total: number;

  @ApiProperty({ description: 'Whether there are more alerts' })
  hasMore: boolean;

  @ApiProperty({ description: 'Server timestamp for sync' })
  serverTime: Date;
}
