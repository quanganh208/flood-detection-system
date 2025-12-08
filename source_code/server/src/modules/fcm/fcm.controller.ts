import {
  Controller,
  Post,
  Delete,
  Patch,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FcmService } from './fcm.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { SendToTopicDto, SendToTokensDto } from './dto/send-notification.dto';

@ApiTags('FCM - Push Notifications')
@Controller('fcm')
export class FcmController {
  constructor(private readonly fcmService: FcmService) {}

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register FCM token',
    description: 'Register or update an FCM token for push notifications',
  })
  @ApiResponse({
    status: 200,
    description: 'Token registered successfully',
  })
  async registerToken(@Body() dto: RegisterTokenDto) {
    const result = await this.fcmService.registerToken(dto);
    return {
      success: true,
      message: 'Token registered successfully',
      data: { id: result.id },
    };
  }

  @Delete('unregister/:token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unregister FCM token',
    description: 'Unregister an FCM token to stop receiving notifications',
  })
  @ApiParam({
    name: 'token',
    description: 'FCM registration token',
  })
  @ApiResponse({
    status: 200,
    description: 'Token unregistered successfully',
  })
  async unregisterToken(@Param('token') token: string) {
    return this.fcmService.unregisterToken(token);
  }

  @Patch('preferences/:token')
  @ApiOperation({
    summary: 'Update location preferences',
    description: 'Update location for a token',
  })
  @ApiParam({
    name: 'token',
    description: 'FCM registration token',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
  })
  async updatePreferences(@Param('token') token: string, @Body() dto: UpdatePreferencesDto) {
    const result = await this.fcmService.updatePreferences(token, dto);
    return {
      success: true,
      message: 'Preferences updated successfully',
      data: {
        latitude: result.latitude,
        longitude: result.longitude,
      },
    };
  }

  @Post('send/topic')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send notification to topic',
    description: 'Send push notification to all subscribers of a topic',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification sent successfully',
  })
  async sendToTopic(@Body() dto: SendToTopicDto) {
    const { topic, ...payload } = dto;
    return this.fcmService.sendToTopic(topic, payload);
  }

  @Post('send/tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send notification to specific tokens',
    description: 'Send push notification to specific FCM tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications sent successfully',
  })
  async sendToTokens(@Body() dto: SendToTokensDto) {
    const { tokens, ...payload } = dto;
    return this.fcmService.sendToTokens(tokens, payload);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get FCM statistics',
    description: 'Get statistics about registered FCM tokens',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats() {
    const stats = await this.fcmService.getStats();
    return {
      success: true,
      data: stats,
    };
  }
}
