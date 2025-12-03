import { ApiProperty } from '@nestjs/swagger';

export class DeviceMapItemDto {
  @ApiProperty({ description: 'Device UUID' })
  id: string;

  @ApiProperty({ description: 'Device ID from ESP32' })
  deviceId: string;

  @ApiProperty({ description: 'Display name' })
  name: string;

  @ApiProperty({ description: 'Text location', required: false })
  location: string | null;

  @ApiProperty({ description: 'Latitude coordinate', required: false })
  lat: number | null;

  @ApiProperty({ description: 'Longitude coordinate', required: false })
  lng: number | null;

  @ApiProperty({ description: 'Device online status' })
  isOnline: boolean;

  @ApiProperty({
    description: 'Water status',
    enum: ['SAFE', 'LOW', 'WARNING', 'DANGER', 'CRITICAL'],
  })
  waterStatus: string | null;

  @ApiProperty({ description: 'Rain status', enum: ['DRY', 'LIGHT', 'HEAVY'] })
  rainStatus: string | null;

  @ApiProperty({ description: 'Raw water level ADC value (0-4095)' })
  waterLevel: number | null;

  @ApiProperty({ description: 'Raw rain analog value (0-4095)' })
  rainAnalog: number | null;

  @ApiProperty({ description: 'Last sensor update timestamp' })
  lastUpdate: Date | null;

  @ApiProperty({ description: 'Number of unresolved alerts' })
  alertCount: number;
}

export class MapStatsDto {
  @ApiProperty({ description: 'Total number of devices' })
  total: number;

  @ApiProperty({ description: 'Online devices count' })
  online: number;

  @ApiProperty({ description: 'Offline devices count' })
  offline: number;

  @ApiProperty({ description: 'Devices with SAFE water status' })
  safe: number;

  @ApiProperty({ description: 'Devices with WARNING water status' })
  warning: number;

  @ApiProperty({ description: 'Devices with DANGER or CRITICAL water status' })
  danger: number;
}

export class MapDataResponseDto {
  @ApiProperty({ type: [DeviceMapItemDto], description: 'List of devices' })
  devices: DeviceMapItemDto[];

  @ApiProperty({ type: MapStatsDto, description: 'Statistics summary' })
  stats: MapStatsDto;

  @ApiProperty({ description: 'Server timestamp for sync' })
  serverTime: Date;
}
