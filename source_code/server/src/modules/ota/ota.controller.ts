import { Controller, Get, Post, Param, Query, Res, Body, Header, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { OtaService } from './ota.service';
import { VerifyUpdateDto } from './dto/verify-update.dto';
import * as fs from 'fs';

@ApiTags('ota')
@Controller('ota')
export class OtaController {
  private readonly logger = new Logger(OtaController.name);

  constructor(private readonly otaService: OtaService) {}

  @Get('check/:deviceId')
  @ApiOperation({
    summary: 'Check for firmware update',
    description: 'ESP32 device checks if a newer firmware version is available',
  })
  @ApiParam({ name: 'deviceId', description: 'Unique device identifier' })
  @ApiQuery({
    name: 'version',
    required: false,
    description: 'Current firmware version on the device',
    example: '1.0.0',
  })
  @ApiResponse({
    status: 200,
    description: 'Update availability checked successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            updateAvailable: { type: 'boolean', example: true },
            version: { type: 'string', example: '1.1.0' },
            downloadUrl: { type: 'string', example: '/api/ota/download/abc123' },
            size: { type: 'number', example: 524288 },
            md5: { type: 'string', example: 'a1b2c3d4e5f6' },
          },
        },
      },
    },
  })
  async checkForUpdate(
    @Param('deviceId') deviceId: string,
    @Query('version') currentVersion: string = '0.0.0',
  ) {
    this.logger.log(`Device ${deviceId} checking for update (current: ${currentVersion})`);

    const result = await this.otaService.checkForUpdate(deviceId, currentVersion);

    return {
      success: true,
      data: result,
    };
  }

  @Get('download/:buildId')
  @ApiOperation({
    summary: 'Download firmware binary',
    description: 'Download the compiled firmware binary file for OTA update',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Firmware binary file',
    content: {
      'application/octet-stream': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
    headers: {
      'Content-Length': {
        description: 'Size of the firmware file in bytes',
        schema: { type: 'integer' },
      },
      'x-MD5': {
        description: 'MD5 checksum of the firmware file',
        schema: { type: 'string' },
      },
    },
  })
  @Header('Content-Type', 'application/octet-stream')
  @Header('Content-Disposition', 'attachment; filename="firmware.bin"')
  async downloadFirmware(@Param('buildId') buildId: string, @Res() res: Response) {
    this.logger.log(`Downloading firmware: ${buildId}`);

    const info = await this.otaService.getFirmwareDownloadInfo(buildId);

    res.setHeader('Content-Length', info.size);
    res.setHeader('x-MD5', info.md5);

    const fileStream = fs.createReadStream(info.path);
    fileStream.pipe(res);
  }

  @Post('verify/:deviceId')
  @ApiOperation({
    summary: 'Verify OTA update',
    description: 'ESP32 device reports the result of an OTA update attempt',
  })
  @ApiParam({ name: 'deviceId', description: 'Unique device identifier' })
  @ApiResponse({
    status: 200,
    description: 'Update verification recorded successfully',
  })
  async verifyUpdate(@Param('deviceId') deviceId: string, @Body() body: VerifyUpdateDto) {
    const result = await this.otaService.verifyUpdate(
      deviceId,
      body.buildId,
      body.status,
      body.errorMessage,
    );

    return {
      success: true,
      data: result,
    };
  }
}
