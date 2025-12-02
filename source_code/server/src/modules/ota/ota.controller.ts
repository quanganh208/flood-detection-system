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
    description:
      'ESP32 device checks if a newer firmware version is available. Device ID should be MAC address without colons (e.g., "AABBCCDDEEFF")',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'MAC address without colons (e.g., "AABBCCDDEEFF")',
    example: 'AABBCCDDEEFF',
  })
  @ApiQuery({
    name: 'version',
    required: false,
    description: 'Current firmware version on the device',
    example: '1.0.0',
  })
  @ApiQuery({
    name: 'mac',
    required: false,
    description: 'Full MAC address with colons (e.g., "AA:BB:CC:DD:EE:FF")',
    example: 'AA:BB:CC:DD:EE:FF',
  })
  @ApiQuery({
    name: 'name',
    required: false,
    description: 'Display name configured on the device',
    example: 'Sensor-Garden',
  })
  @ApiQuery({
    name: 'ip',
    required: false,
    description: 'Current IP address of the device',
    example: '192.168.1.100',
  })
  @ApiQuery({
    name: 'rssi',
    required: false,
    description: 'WiFi signal strength in dBm',
    example: '-65',
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
            available: { type: 'boolean', example: true },
            version: { type: 'string', example: '1.1.0' },
            buildId: { type: 'string', example: 'abc123-def456' },
            url: { type: 'string', example: '/api/ota/download/abc123' },
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
    @Query('mac') mac?: string,
    @Query('name') name?: string,
    @Query('ip') ip?: string,
    @Query('rssi') rssi?: string,
  ) {
    this.logger.log(
      `Device ${deviceId} checking for update (version: ${currentVersion}, mac: ${mac}, name: ${name}, ip: ${ip}, rssi: ${rssi})`,
    );

    const deviceInfo = {
      mac,
      name,
      ip,
      rssi: rssi ? parseInt(rssi, 10) : undefined,
    };

    const result = await this.otaService.checkForUpdate(deviceId, currentVersion, deviceInfo);

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
    description:
      'ESP32 device reports the result of an OTA update attempt. Device ID should be MAC address without colons.',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'MAC address without colons (e.g., "AABBCCDDEEFF")',
    example: 'AABBCCDDEEFF',
  })
  @ApiResponse({
    status: 200,
    description: 'Update verification recorded successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Update success recorded' },
          },
        },
      },
    },
  })
  async verifyUpdate(@Param('deviceId') deviceId: string, @Body() body: VerifyUpdateDto) {
    this.logger.log(`Device ${deviceId} verifying update: ${JSON.stringify(body)}`);

    const deviceInfo = {
      mac: body.mac,
      displayName: body.displayName,
      ip: body.ip,
      rssi: body.rssi,
    };

    const versionOrBuildId = body.version || body.buildId || 'unknown';

    const result = await this.otaService.verifyUpdate(
      deviceId,
      versionOrBuildId,
      body.status,
      body.errorMessage,
      deviceInfo,
    );

    return {
      success: true,
      data: result,
    };
  }
}
