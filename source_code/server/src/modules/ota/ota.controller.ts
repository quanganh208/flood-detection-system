import { Controller, Get, Post, Param, Query, Res, Body, Header, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { OtaService } from './ota.service';
import * as fs from 'fs';

@Controller('api/ota')
export class OtaController {
  private readonly logger = new Logger(OtaController.name);

  constructor(private readonly otaService: OtaService) {}

  @Get('check/:deviceId')
  checkForUpdate(
    @Param('deviceId') deviceId: string,
    @Query('version') currentVersion: string = '0.0.0',
  ) {
    this.logger.log(`Device ${deviceId} checking for update (current: ${currentVersion})`);

    const result = this.otaService.checkForUpdate(deviceId, currentVersion);

    return {
      success: true,
      data: result,
    };
  }

  @Get('download/:buildId')
  @Header('Content-Type', 'application/octet-stream')
  @Header('Content-Disposition', 'attachment; filename="firmware.bin"')
  downloadFirmware(@Param('buildId') buildId: string, @Res() res: Response) {
    this.logger.log(`Downloading firmware: ${buildId}`);

    const info = this.otaService.getFirmwareDownloadInfo(buildId);

    res.setHeader('Content-Length', info.size);
    res.setHeader('x-MD5', info.md5);

    const fileStream = fs.createReadStream(info.path);
    fileStream.pipe(res);
  }

  @Post('verify/:deviceId')
  verifyUpdate(
    @Param('deviceId') deviceId: string,
    @Body() body: { buildId: string; status: 'success' | 'failed' },
  ) {
    this.logger.log(`Device ${deviceId} reports: ${body.status} for build ${body.buildId}`);

    const result = this.otaService.verifyUpdate(deviceId, body.buildId, body.status);

    return {
      success: true,
      data: result,
    };
  }
}
