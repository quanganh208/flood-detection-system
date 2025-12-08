import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RainStatus, WaterStatus, SensorReading } from '@prisma/client';
import { SensorDataDto } from './dto/sensor-data.dto';
import { formatMacAddress } from '../../common/utils';

const RAIN_DRY_THRESHOLD = 3000;
const RAIN_WARNING_THRESHOLD = 2000;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class SensorsService {
  constructor(private prisma: PrismaService) {}

  async processSensorData(data: SensorDataDto) {
    const device = await this.findOrCreateDevice(data);
    const rainStatus = this.calculateRainStatus(data.rainAnalog);
    const waterStatus = this.calculateWaterStatus(data.waterLevel);

    const latestReading = await this.prisma.sensorReading.findFirst({
      where: { deviceId: device.id },
      orderBy: { timestamp: 'desc' },
    });

    let reading: SensorReading;
    const now = new Date();

    if (
      latestReading &&
      latestReading.rainAnalog === data.rainAnalog &&
      latestReading.rainDigital === data.rainDigital &&
      latestReading.waterLevel === data.waterLevel &&
      now.getTime() - latestReading.timestamp.getTime() < DEDUP_WINDOW_MS
    ) {
      reading = await this.prisma.sensorReading.update({
        where: { id: latestReading.id },
        data: { timestamp: now, rssi: data.rssi },
      });
    } else {
      reading = await this.prisma.sensorReading.create({
        data: {
          deviceId: device.id,
          rainAnalog: data.rainAnalog,
          rainDigital: data.rainDigital,
          waterLevel: data.waterLevel,
          rainStatus,
          waterStatus,
          rssi: data.rssi,
        },
      });
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        isOnline: true,
        lastHeartbeat: now,
        ipAddress: data.ip,
        rssi: data.rssi,
        firmwareVersion: data.firmwareVersion || device.firmwareVersion,
      },
    });

    await this.checkAndCreateAlerts(device.id, data, rainStatus, waterStatus);

    return {
      id: reading.id,
      deviceId: data.deviceId,
      rainStatus,
      waterStatus,
      timestamp: reading.timestamp,
    };
  }

  private async findOrCreateDevice(data: SensorDataDto) {
    const macAddress = formatMacAddress(data.deviceId);

    let device = await this.prisma.device.findFirst({
      where: { deviceId: data.deviceId },
    });

    if (device) return device;

    device = await this.prisma.device.findFirst({
      where: { macAddress },
    });

    if (device) {
      if (device.deviceId !== data.deviceId) {
        device = await this.prisma.device.update({
          where: { id: device.id },
          data: { deviceId: data.deviceId },
        });
      }
      return device;
    }

    const displayName = data.displayName || `Device-${data.deviceId.slice(-6)}`;

    device = await this.prisma.device.create({
      data: {
        deviceId: data.deviceId,
        macAddress,
        name: displayName,
        firmwareVersion: data.firmwareVersion || '1.0.0',
        ipAddress: data.ip,
        rssi: data.rssi,
        isOnline: true,
        lastHeartbeat: new Date(),
      },
    });

    return device;
  }

  private calculateRainStatus(rainAnalog: number): RainStatus {
    if (rainAnalog >= RAIN_DRY_THRESHOLD) return RainStatus.DRY;
    if (rainAnalog >= RAIN_WARNING_THRESHOLD) return RainStatus.LIGHT;
    return RainStatus.HEAVY;
  }

  private calculateWaterStatus(waterLevel: number): WaterStatus {
    // Ngưỡng dựa trên giá trị thực tế của cảm biến (max ~2000)
    if (waterLevel < 400) return WaterStatus.SAFE; // 0-20%
    if (waterLevel < 800) return WaterStatus.LOW; // 20-40%
    if (waterLevel < 1200) return WaterStatus.WARNING; // 40-60%
    if (waterLevel < 1600) return WaterStatus.DANGER; // 60-80%
    return WaterStatus.CRITICAL; // 80-100%
  }

  private async checkAndCreateAlerts(
    deviceDbId: string,
    data: SensorDataDto,
    rainStatus: RainStatus,
    waterStatus: WaterStatus,
  ) {
    const alerts: Array<{
      type: 'WATER_WARNING' | 'WATER_DANGER' | 'HEAVY_RAIN';
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      message: string;
    }> = [];

    if (waterStatus === WaterStatus.CRITICAL) {
      alerts.push({
        type: 'WATER_DANGER',
        severity: 'CRITICAL',
        message: `🚨 NGUY HIỂM! Mực nước rất cao, có nguy cơ ngập nặng. Hãy di chuyển đến nơi an toàn ngay!`,
      });
    } else if (waterStatus === WaterStatus.DANGER) {
      alerts.push({
        type: 'WATER_DANGER',
        severity: 'HIGH',
        message: `⚠️ Mực nước đang ở mức nguy hiểm. Tránh di chuyển qua khu vực này, đặc biệt với xe máy.`,
      });
    } else if (waterStatus === WaterStatus.WARNING) {
      alerts.push({
        type: 'WATER_WARNING',
        severity: 'MEDIUM',
        message: `⚡ Cảnh báo: Mực nước đang tăng. Hãy cẩn thận khi di chuyển và theo dõi tình hình.`,
      });
    }

    if (rainStatus === RainStatus.HEAVY) {
      alerts.push({
        type: 'HEAVY_RAIN',
        severity: 'MEDIUM',
        message: `🌧️ Đang có mưa to. Cẩn thận đường trơn trượt và có thể gây ngập cục bộ.`,
      });
    }

    for (const alert of alerts) {
      const existingAlert = await this.prisma.alert.findFirst({
        where: {
          deviceId: deviceDbId,
          type: alert.type,
          isResolved: false,
          createdAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
      });

      if (!existingAlert) {
        await this.prisma.alert.create({
          data: {
            deviceId: deviceDbId,
            type: alert.type,
            severity: alert.severity,
            message: alert.message,
            waterLevel: data.waterLevel,
            rainAnalog: data.rainAnalog,
          },
        });
      }
    }
  }

  async updateDeviceStatus(data: {
    deviceId: string;
    mac?: string;
    displayName?: string;
    ip?: string;
    wifiSSID?: string;
    rssi?: number;
    firmwareVersion?: string;
    uptime?: number;
    chipModel?: string;
    freeHeap?: number;
    flashSize?: number;
    isOnline?: boolean;
  }) {
    const macAddress = formatMacAddress(data.deviceId);

    let device = await this.prisma.device.findFirst({
      where: { deviceId: data.deviceId },
    });

    if (!device) {
      device = await this.prisma.device.findFirst({
        where: { macAddress },
      });
    }

    if (!device) {
      const displayName = data.displayName || `Device-${data.deviceId.slice(-6)}`;

      device = await this.prisma.device.create({
        data: {
          deviceId: data.deviceId,
          macAddress,
          name: displayName,
          firmwareVersion: data.firmwareVersion || '1.0.0',
          ipAddress: data.ip,
          wifiSSID: data.wifiSSID,
          rssi: data.rssi,
          uptime: data.uptime || 0,
          chipModel: data.chipModel,
          freeHeap: data.freeHeap,
          flashSize: data.flashSize,
          isOnline: data.isOnline ?? true,
          lastHeartbeat: new Date(),
        },
      });

      return device;
    }

    const updateData: Record<string, unknown> = {
      isOnline: data.isOnline ?? true,
      lastHeartbeat: new Date(),
    };

    if (data.ip) updateData.ipAddress = data.ip;
    if (data.wifiSSID) updateData.wifiSSID = data.wifiSSID;
    if (data.rssi !== undefined) updateData.rssi = data.rssi;
    if (data.firmwareVersion) updateData.firmwareVersion = data.firmwareVersion;
    if (data.uptime !== undefined) updateData.uptime = data.uptime;
    if (data.chipModel) updateData.chipModel = data.chipModel;
    if (data.freeHeap !== undefined) updateData.freeHeap = data.freeHeap;
    if (data.flashSize !== undefined) updateData.flashSize = data.flashSize;

    if (data.displayName && data.displayName !== 'Unnamed Device') {
      if (device.name.startsWith('Device-') || device.name === 'Unnamed Device') {
        updateData.name = data.displayName;
      }
    }

    return this.prisma.device.update({
      where: { id: device.id },
      data: updateData,
    });
  }
}
