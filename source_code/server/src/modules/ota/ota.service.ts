import { Injectable, Logger } from '@nestjs/common';
import { FirmwareService } from '../firmware/firmware.service';
import { PrismaService } from '../prisma/prisma.service';
import { OTAStatus, BuildStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as semver from 'semver';

@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);

  constructor(
    private firmwareService: FirmwareService,
    private prisma: PrismaService,
  ) {}

  async checkForUpdate(deviceId: string, currentVersion: string) {
    const latestFirmware = await this.prisma.firmware.findFirst({
      where: {
        isLatest: true,
        buildStatus: BuildStatus.COMPLETED,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestFirmware) {
      return {
        available: false,
        message: 'No firmware available',
      };
    }

    let device = await this.prisma.device.findFirst({
      where: { deviceId },
    });

    if (!device) {
      device = await this.prisma.device.create({
        data: {
          deviceId,
          name: deviceId,
          macAddress: `unknown-${deviceId}`,
          firmwareVersion: currentVersion,
          isOnline: true,
          lastHeartbeat: new Date(),
        },
      });
    }

    const shouldUpdate = this.shouldUpdateFirmware(currentVersion, latestFirmware.version);

    if (shouldUpdate) {
      const otaUpdate = await this.prisma.oTAUpdate.create({
        data: {
          deviceId: device.id,
          firmwareId: latestFirmware.id,
          fromVersion: currentVersion,
          toVersion: latestFirmware.version,
          status: OTAStatus.PENDING,
        },
      });

      return {
        available: true,
        version: latestFirmware.version,
        buildId: latestFirmware.buildId,
        size: latestFirmware.fileSize,
        url: `/api/ota/download/${latestFirmware.buildId}`,
        md5: latestFirmware.md5Checksum,
        otaUpdateId: otaUpdate.id,
      };
    }

    return {
      available: false,
      message: 'Already up to date',
      currentVersion,
    };
  }

  private shouldUpdateFirmware(currentVersion: string, latestVersion: string): boolean {
    if (semver.valid(currentVersion) && semver.valid(latestVersion)) {
      return semver.gt(latestVersion, currentVersion);
    }

    return currentVersion !== latestVersion;
  }

  async getFirmwareDownloadInfo(buildId: string) {
    const firmware = await this.prisma.firmware.findUnique({
      where: { buildId },
    });

    if (!firmware) {
      const info = await this.firmwareService.getFirmwareInfo(buildId);
      return {
        buildId,
        version: info.version || 'unknown',
        size: info.size,
        md5: info.md5 || this.calculateMD5(info.path),
        path: info.path,
      };
    }

    return {
      buildId: firmware.buildId,
      version: firmware.version,
      size: firmware.fileSize,
      md5: firmware.md5Checksum,
      path: firmware.filePath,
      description: firmware.description,
    };
  }

  private calculateMD5(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  async verifyUpdate(deviceId: string, buildId: string, status: string, errorMessage?: string) {
    try {
      const device = await this.prisma.device.findFirst({
        where: { deviceId },
      });

      if (!device) {
        return {
          success: false,
          message: 'Device not found',
        };
      }

      const firmware = await this.prisma.firmware.findUnique({
        where: { buildId },
      });

      if (!firmware) {
        return {
          success: false,
          message: 'Firmware not found',
        };
      }

      const otaUpdate = await this.prisma.oTAUpdate.findFirst({
        where: {
          deviceId: device.id,
          firmwareId: firmware.id,
          status: {
            notIn: [OTAStatus.COMPLETED, OTAStatus.FAILED],
          },
        },
        orderBy: { initiatedAt: 'desc' },
      });

      if (!otaUpdate) {
        await this.prisma.oTAUpdate.create({
          data: {
            deviceId: device.id,
            firmwareId: firmware.id,
            fromVersion: device.firmwareVersion,
            toVersion: firmware.version,
            status: status === 'success' ? OTAStatus.COMPLETED : OTAStatus.FAILED,
            success: status === 'success',
            completedAt: new Date(),
            errorMessage: status !== 'success' ? errorMessage : undefined,
          },
        });

        return {
          success: true,
          message: `Update ${status} recorded (new record created)`,
        };
      }

      const updateData: Prisma.OTAUpdateUpdateInput = {
        completedAt: new Date(),
      };

      if (status === 'success') {
        updateData.status = OTAStatus.COMPLETED;
        updateData.success = true;
        updateData.verifiedAt = new Date();

        await this.prisma.device.update({
          where: { id: device.id },
          data: {
            firmwareVersion: firmware.version,
            lastHeartbeat: new Date(),
          },
        });
      } else {
        updateData.status = OTAStatus.FAILED;
        updateData.success = false;
        updateData.errorMessage = errorMessage || 'Update failed';
      }

      await this.prisma.oTAUpdate.update({
        where: { id: otaUpdate.id },
        data: updateData,
      });

      return {
        success: true,
        message: `Update ${status} recorded`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to verify update: ${errorMessage}`);
      return {
        success: false,
        message: `Failed to record update: ${errorMessage}`,
      };
    }
  }
}
