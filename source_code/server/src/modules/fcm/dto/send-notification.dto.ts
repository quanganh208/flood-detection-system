import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';

export class SendNotificationDto {
  @ApiProperty({
    description: 'Notification title',
    example: '⚠️ Cảnh báo ngập nước',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Notification body/message',
    example: 'Mực nước tại Quận 1 đang tăng cao. Hãy cẩn thận khi di chuyển!',
  })
  @IsString()
  body: string;

  @ApiPropertyOptional({
    description: 'Image URL for rich notification',
    example: 'https://example.com/flood-warning.png',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Additional data payload',
    example: { alertId: '123', deviceId: 'ESP32-001', type: 'WATER_DANGER' },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, string>;
}

export class SendToTopicDto extends SendNotificationDto {
  @ApiProperty({
    description: 'FCM topic to send notification to',
    example: 'flood-alerts',
  })
  @IsString()
  topic: string;
}

export class SendToTokensDto extends SendNotificationDto {
  @ApiProperty({
    description: 'Array of FCM tokens to send notification to',
    example: ['token1', 'token2'],
  })
  @IsArray()
  @IsString({ each: true })
  tokens: string[];
}
