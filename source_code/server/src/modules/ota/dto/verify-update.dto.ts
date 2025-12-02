import { ApiProperty } from '@nestjs/swagger';

export class VerifyUpdateDto {
  @ApiProperty({
    description: 'Build identifier of the firmware that was updated',
    example: 'abc123-def456-ghi789',
  })
  buildId: string;

  @ApiProperty({
    description: 'Update status - whether the OTA update succeeded or failed',
    enum: ['success', 'failed'],
    example: 'success',
  })
  status: 'success' | 'failed';

  @ApiProperty({
    description: 'Error message if the update failed',
    example: 'Flash write error',
    required: false,
  })
  errorMessage?: string;
}
