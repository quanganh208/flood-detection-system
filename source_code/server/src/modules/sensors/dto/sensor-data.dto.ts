import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SensorDataDto {
  @ApiProperty({
    description: 'Device ID (MAC address without colons)',
    example: 'AABBCCDDEEFF',
  })
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Full MAC address with colons',
    example: 'AA:BB:CC:DD:EE:FF',
  })
  mac?: string;

  @ApiPropertyOptional({
    description: 'Display name of the device',
    example: 'Sensor-Garden',
  })
  displayName?: string;

  @ApiProperty({
    description: 'Rain sensor analog value (0-4095, inverted: high=dry, low=wet)',
    example: 3500,
  })
  rainAnalog: number;

  @ApiProperty({
    description: 'Rain sensor digital value (true=no rain, false=rain)',
    example: true,
  })
  rainDigital: boolean;

  @ApiProperty({
    description: 'Water level sensor value (0-4095)',
    example: 1500,
  })
  waterLevel: number;

  @ApiPropertyOptional({
    description: 'WiFi signal strength in dBm',
    example: -65,
  })
  rssi?: number;

  @ApiPropertyOptional({
    description: 'Device IP address',
    example: '192.168.1.100',
  })
  ip?: string;

  @ApiPropertyOptional({
    description: 'Current firmware version',
    example: '1.2.0',
  })
  firmwareVersion?: string;
}
