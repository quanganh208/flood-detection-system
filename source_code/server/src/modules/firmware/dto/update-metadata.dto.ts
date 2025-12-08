import { ApiProperty } from '@nestjs/swagger';

export class UpdateMetadataDto {
  @ApiProperty({
    description: 'Firmware version number (semantic versioning)',
    example: '1.0.0',
    required: false,
  })
  version?: string;

  @ApiProperty({
    description: 'Brief description of the firmware build',
    example: 'Stable release with bug fixes',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Detailed release notes and changelog',
    example: 'Fixed water level sensor calibration, improved battery management',
    required: false,
  })
  releaseNotes?: string;
}
