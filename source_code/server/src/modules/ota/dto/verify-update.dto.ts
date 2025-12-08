import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyUpdateDto {
  @ApiPropertyOptional({
    description: 'Build identifier of the firmware (legacy field)',
    example: 'abc123-def456-ghi789',
  })
  buildId?: string;

  @ApiPropertyOptional({
    description: 'Firmware version (preferred over buildId)',
    example: '1.2.0',
  })
  version?: string;

  @ApiProperty({
    description: 'Update status - whether the OTA update succeeded or failed',
    enum: ['success', 'failed'],
    example: 'success',
  })
  status: 'success' | 'failed';

  @ApiPropertyOptional({
    description: 'Error message if the update failed',
    example: 'Flash write error',
  })
  errorMessage?: string;

  @ApiPropertyOptional({
    description: 'Full MAC address with colons',
    example: 'AA:BB:CC:DD:EE:FF',
  })
  mac?: string;

  @ApiPropertyOptional({
    description: 'Display name configured on the device',
    example: 'Sensor-Garden',
  })
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Current IP address of the device',
    example: '192.168.1.100',
  })
  ip?: string;

  @ApiPropertyOptional({
    description: 'WiFi signal strength in dBm',
    example: -65,
  })
  rssi?: number;
}
