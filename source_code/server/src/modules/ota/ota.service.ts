import { Injectable, Logger } from '@nestjs/common';
import { FirmwareService } from '../firmware/firmware.service';
import { PrismaService } from '../prisma/prisma.service';
import { OTAStatus, BuildStatus, Prisma } from '@prisma/client';
import * as semver from 'semver';
import { calculateMD5, formatMacAddress } from '../../common/utils';

export interface DeviceInfo {
  mac?: string;
  name?: string;
  ip?: string;
  rssi?: number;
}

export interface VerifyDeviceInfo {
  mac?: string;
  displayName?: string;
  ip?: string;
  rssi?: number;
}

@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);

  constructor(
    private firmwareService: FirmwareService,
    private prisma: PrismaService,
  ) {}

  async checkForUpdate(deviceId: string, currentVersion: string, deviceInfo?: DeviceInfo) {
    this.logger.log(
      `OTA check - Device: ${deviceId}, Version: ${currentVersion}, Info: ${JSON.stringify(deviceInfo)}`,
    );

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

    let device = await this.findOrCreateDevice(deviceId, currentVersion, deviceInfo);

    device = await this.updateDeviceHeartbeat(device.id, currentVersion, deviceInfo);

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

      this.logger.log(
        `OTA update available for ${deviceId}: ${currentVersion} -> ${latestFirmware.version}`,
      );

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

  private async findOrCreateDevice(
    deviceId: string,
    currentVersion: string,
    deviceInfo?: DeviceInfo,
  ) {
    const macAddress = formatMacAddress(deviceId);

    let device = await this.prisma.device.findFirst({
      where: { deviceId },
    });

    if (device) {
      return device;
    }

    device = await this.prisma.device.findFirst({
      where: { macAddress },
    });

    if (device) {
      if (device.deviceId !== deviceId) {
        device = await this.prisma.device.update({
          where: { id: device.id },
          data: { deviceId },
        });
      }
      return device;
    }

    const displayName = deviceInfo?.name || `Device-${deviceId.slice(-6)}`;

    this.logger.log(`Creating new device: ${deviceId} (${macAddress}) - "${displayName}"`);

    device = await this.prisma.device.create({
      data: {
        deviceId,
        macAddress,
        name: displayName,
        firmwareVersion: currentVersion,
        ipAddress: deviceInfo?.ip,
        rssi: deviceInfo?.rssi,
        isOnline: true,
        lastHeartbeat: new Date(),
      },
    });

    return device;
  }

  private async updateDeviceHeartbeat(
    deviceDbId: string,
    currentVersion: string,
    deviceInfo?: DeviceInfo,
  ) {
    const updateData: Prisma.DeviceUpdateInput = {
      firmwareVersion: currentVersion,
      isOnline: true,
      lastHeartbeat: new Date(),
    };

    if (deviceInfo?.ip) {
      updateData.ipAddress = deviceInfo.ip;
    }

    if (deviceInfo?.rssi !== undefined) {
      updateData.rssi = deviceInfo.rssi;
    }

    if (deviceInfo?.name) {
      const device = await this.prisma.device.findUnique({
        where: { id: deviceDbId },
      });

      if (device && (device.name.startsWith('Device-') || device.name === 'Unnamed Device')) {
        updateData.name = deviceInfo.name;
      }
    }

    return this.prisma.device.update({
      where: { id: deviceDbId },
      data: updateData,
    });
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
        md5: info.md5 || calculateMD5(info.path),
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

  async verifyUpdate(
    deviceId: string,
    versionOrBuildId: string,
    status: string,
    errorMessage?: string,
    deviceInfo?: VerifyDeviceInfo,
  ) {
    try {
      this.logger.log(
        `OTA verify - Device: ${deviceId}, Version/BuildId: ${versionOrBuildId}, Status: ${status}`,
      );

      let device = await this.prisma.device.findFirst({
        where: { deviceId },
      });

      if (!device) {
        const macAddress = formatMacAddress(deviceId);
        device = await this.prisma.device.findFirst({
          where: { macAddress },
        });
      }

      if (!device) {
        device = await this.prisma.device.create({
          data: {
            deviceId,
            macAddress: formatMacAddress(deviceId),
            name: deviceInfo?.displayName || `Device-${deviceId.slice(-6)}`,
            firmwareVersion: versionOrBuildId,
            ipAddress: deviceInfo?.ip,
            rssi: deviceInfo?.rssi,
            isOnline: true,
            lastHeartbeat: new Date(),
          },
        });

        this.logger.log(`Created device during verify: ${deviceId}`);
      }

      let firmware = await this.prisma.firmware.findUnique({
        where: { buildId: versionOrBuildId },
      });

      if (!firmware) {
        firmware = await this.prisma.firmware.findFirst({
          where: { version: versionOrBuildId },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!firmware) {
        this.logger.warn(`Firmware not found for: ${versionOrBuildId}`);
        if (status === 'success') {
          await this.prisma.device.update({
            where: { id: device.id },
            data: {
              firmwareVersion: versionOrBuildId,
              lastHeartbeat: new Date(),
              isOnline: true,
              ipAddress: deviceInfo?.ip,
              rssi: deviceInfo?.rssi,
            },
          });
        }
        return {
          success: true,
          message: `Update ${status} recorded (firmware record not found)`,
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

        if (status === 'success') {
          await this.prisma.device.update({
            where: { id: device.id },
            data: {
              firmwareVersion: firmware.version,
              lastHeartbeat: new Date(),
              isOnline: true,
              ipAddress: deviceInfo?.ip,
              rssi: deviceInfo?.rssi,
            },
          });
        }

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
            isOnline: true,
            ipAddress: deviceInfo?.ip,
            rssi: deviceInfo?.rssi,
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
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to verify update: ${errMsg}`);
      return {
        success: false,
        message: `Failed to record update: ${errMsg}`,
      };
    }
  }
}
