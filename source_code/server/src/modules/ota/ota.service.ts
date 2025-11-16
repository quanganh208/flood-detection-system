import { Injectable, Logger } from '@nestjs/common';
import { FirmwareService } from '../firmware/firmware.service';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);

  constructor(private firmwareService: FirmwareService) {}

  checkForUpdate(deviceId: string, currentVersion: string) {
    this.logger.log(`Device ${deviceId} checking for update (current: ${currentVersion})`);
    const firmwares = this.firmwareService.listFirmwares();

    if (firmwares.length === 0) {
      return {
        available: false,
        message: 'No firmware available',
      };
    }

    const latestFirmware = firmwares[0];

    const shouldUpdate = currentVersion !== latestFirmware.buildId;

    if (shouldUpdate) {
      const info = this.firmwareService.getFirmwareInfo(latestFirmware.buildId);

      return {
        available: true,
        version: latestFirmware.buildId,
        size: info.size,
        url: `/api/ota/download/${latestFirmware.buildId}`,
        md5: this.calculateMD5(info.path),
      };
    }

    return {
      available: false,
      message: 'Already up to date',
      currentVersion,
    };
  }

  getFirmwareDownloadInfo(buildId: string) {
    const info = this.firmwareService.getFirmwareInfo(buildId);

    return {
      buildId,
      size: info.size,
      md5: this.calculateMD5(info.path),
      path: info.path,
    };
  }

  private calculateMD5(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  verifyUpdate(deviceId: string, buildId: string, status: string) {
    this.logger.log(`Device ${deviceId} OTA update ${status} for build ${buildId}`);

    return {
      success: true,
      message: `Update ${status} recorded`,
    };
  }
}
