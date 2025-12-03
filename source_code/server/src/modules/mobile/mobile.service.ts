import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceMapItemDto, MapDataResponseDto, MapStatsDto } from './dto/map-data.dto';
import { AlertItemDto, AlertsResponseDto, GetAlertsQueryDto } from './dto/alerts.dto';
import { AlertSeverity, AlertType } from '@prisma/client';

@Injectable()
export class MobileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMapData(): Promise<MapDataResponseDto> {
    const devices = await this.prisma.device.findMany({
      where: { isActive: true },
      select: {
        id: true,
        deviceId: true,
        name: true,
        location: true,
        latitude: true,
        longitude: true,
        isOnline: true,
        lastHeartbeat: true,
        sensorReadings: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: {
            waterStatus: true,
            rainStatus: true,
            waterLevel: true,
            rainAnalog: true,
            timestamp: true,
          },
        },
        _count: {
          select: {
            alerts: { where: { isResolved: false } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const deviceList: DeviceMapItemDto[] = devices.map((device) => {
      const lastReading = device.sensorReadings[0] || null;
      return {
        id: device.id,
        deviceId: device.deviceId,
        name: device.name,
        location: device.location,
        lat: device.latitude,
        lng: device.longitude,
        isOnline: device.isOnline,
        waterStatus: lastReading?.waterStatus || null,
        rainStatus: lastReading?.rainStatus || null,
        waterLevel: lastReading?.waterLevel || null,
        rainAnalog: lastReading?.rainAnalog || null,
        lastUpdate: lastReading?.timestamp || device.lastHeartbeat,
        alertCount: device._count.alerts,
      };
    });

    const stats: MapStatsDto = {
      total: devices.length,
      online: devices.filter((d) => d.isOnline).length,
      offline: devices.filter((d) => !d.isOnline).length,
      safe: deviceList.filter((d) => d.waterStatus === 'SAFE' || d.waterStatus === 'LOW').length,
      warning: deviceList.filter((d) => d.waterStatus === 'WARNING').length,
      danger: deviceList.filter((d) => d.waterStatus === 'DANGER' || d.waterStatus === 'CRITICAL')
        .length,
    };

    return { devices: deviceList, stats, serverTime: new Date() };
  }

  async getAlerts(query: GetAlertsQueryDto): Promise<AlertsResponseDto> {
    const { severity, type } = query;
    const limit = Number(query.limit) || 50;
    const offset = Number(query.offset) || 0;

    const where: {
      isResolved: boolean;
      severity?: AlertSeverity;
      type?: AlertType;
    } = { isResolved: false };

    if (severity) where.severity = severity as AlertSeverity;
    if (type) where.type = type as AlertType;

    const [total, alerts] = await Promise.all([
      this.prisma.alert.count({ where }),
      this.prisma.alert.findMany({
        where,
        select: {
          id: true,
          type: true,
          severity: true,
          message: true,
          waterLevel: true,
          rainAnalog: true,
          createdAt: true,
          device: {
            select: {
              id: true,
              name: true,
              location: true,
              latitude: true,
              longitude: true,
            },
          },
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
      }),
    ]);

    const alertList: AlertItemDto[] = alerts.map((alert) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      deviceId: alert.device.id,
      deviceName: alert.device.name,
      location: alert.device.location,
      lat: alert.device.latitude,
      lng: alert.device.longitude,
      waterLevel: alert.waterLevel,
      rainAnalog: alert.rainAnalog,
      createdAt: alert.createdAt,
    }));

    return {
      alerts: alertList,
      total,
      hasMore: offset + alerts.length < total,
      serverTime: new Date(),
    };
  }

  async resolveAlert(id: string, resolvedAt: Date): Promise<void> {
    await this.prisma.alert.update({
      where: { id },
      data: { isResolved: true, resolvedAt },
    });
  }

  generateETag(data: MapDataResponseDto | AlertsResponseDto): string {
    const content = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `"${Math.abs(hash).toString(16)}"`;
  }
}
