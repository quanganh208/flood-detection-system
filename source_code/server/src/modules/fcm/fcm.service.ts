import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

const NOTIFY_RADIUS_KM = 10;

export interface AlertNotificationData {
  alertId: string;
  deviceId: string;
  deviceName: string;
  type: string;
  severity: string;
  waterLevel?: number;
  rainAnalog?: number;
  latitude?: number;
  longitude?: number;
  location?: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

      if (!serviceAccountPath) {
        return;
      }

      const absolutePath = path.isAbsolute(serviceAccountPath)
        ? serviceAccountPath
        : path.join(process.cwd(), serviceAccountPath);

      if (!fs.existsSync(absolutePath)) {
        return;
      }

      if (admin.apps.length === 0) {
        const serviceAccount = JSON.parse(
          fs.readFileSync(absolutePath, 'utf8'),
        ) as admin.ServiceAccount;
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }

      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch {
      return;
    }
  }

  async registerToken(dto: RegisterTokenDto) {
    const existingToken = await this.prisma.fcmToken.findUnique({
      where: { token: dto.token },
    });

    if (existingToken) {
      return this.prisma.fcmToken.update({
        where: { token: dto.token },
        data: {
          latitude: dto.latitude ?? existingToken.latitude,
          longitude: dto.longitude ?? existingToken.longitude,
          isActive: true,
        },
      });
    }

    return this.prisma.fcmToken.create({
      data: {
        token: dto.token,
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async unregisterToken(token: string) {
    const existingToken = await this.prisma.fcmToken.findUnique({
      where: { token },
    });

    if (!existingToken) {
      return { success: false, message: 'Token not found' };
    }

    await this.prisma.fcmToken.update({
      where: { token },
      data: { isActive: false },
    });

    return { success: true, message: 'Token unregistered successfully' };
  }

  async updatePreferences(token: string, dto: UpdatePreferencesDto) {
    return this.prisma.fcmToken.update({
      where: { token },
      data: {
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async sendToTopic(topic: string, payload: NotificationPayload) {
    if (!this.isInitialized) {
      return { success: false, message: 'Firebase not initialized' };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'flood_alerts',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      return { success: true, messageId: response };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async sendToTokens(tokens: string[], payload: NotificationPayload) {
    if (!this.isInitialized) {
      return { success: false, message: 'Firebase not initialized' };
    }

    if (tokens.length === 0) {
      return { success: true, message: 'No tokens to send to' };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'flood_alerts',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (
              errorCode === 'messaging/invalid-registration-token' ||
              errorCode === 'messaging/registration-token-not-registered'
            ) {
              failedTokens.push(tokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0) {
          await this.prisma.fcmToken.updateMany({
            where: { token: { in: failedTokens } },
            data: { isActive: false },
          });
        }
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  async sendAlertNotification(alertData: AlertNotificationData) {
    const tokens = await this.getSubscribedTokens(alertData);

    if (tokens.length === 0) {
      return { success: true, message: 'No subscribers' };
    }

    const payload: NotificationPayload = {
      title: this.getAlertTitle(alertData.type, alertData.severity),
      body: this.getAlertBody(alertData),
      data: {
        alertId: alertData.alertId,
        deviceId: alertData.deviceId,
        type: alertData.type,
        severity: alertData.severity,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
    };

    return this.sendToTokens(tokens, payload);
  }

  private async getSubscribedTokens(alertData: AlertNotificationData): Promise<string[]> {
    if (alertData.latitude && alertData.longitude) {
      const tokensWithLocation = await this.prisma.fcmToken.findMany({
        where: {
          isActive: true,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: { token: true, latitude: true, longitude: true },
      });

      const nearbyTokens = tokensWithLocation.filter((t) => {
        const distance = this.calculateDistance(
          t.latitude!,
          t.longitude!,
          alertData.latitude!,
          alertData.longitude!,
        );
        return distance <= NOTIFY_RADIUS_KM;
      });

      const tokensWithoutLocation = await this.prisma.fcmToken.findMany({
        where: { isActive: true, latitude: null },
        select: { token: true },
      });

      return [...nearbyTokens.map((t) => t.token), ...tokensWithoutLocation.map((t) => t.token)];
    }

    const allTokens = await this.prisma.fcmToken.findMany({
      where: { isActive: true },
      select: { token: true },
    });

    return allTokens.map((t) => t.token);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private getAlertTitle(type: string, severity: string): string {
    const severityEmoji: Record<string, string> = {
      CRITICAL: '🚨',
      HIGH: '⚠️',
      MEDIUM: '⚡',
      LOW: 'ℹ️',
    };

    const emoji = severityEmoji[severity] || '⚠️';

    const typeText: Record<string, string> = {
      WATER_DANGER: 'Nguy hiểm ngập nước',
      WATER_WARNING: 'Cảnh báo ngập nước',
      HEAVY_RAIN: 'Mưa to',
      DEVICE_OFFLINE: 'Thiết bị mất kết nối',
      SENSOR_ERROR: 'Lỗi cảm biến',
    };

    return `${emoji} ${typeText[type] || 'Cảnh báo'}`;
  }

  private getAlertBody(data: AlertNotificationData): string {
    const location = data.location || data.deviceName;

    if (data.type === 'WATER_DANGER' || data.type === 'WATER_WARNING') {
      return `Mực nước tại ${location} đang ${data.severity === 'CRITICAL' ? 'rất cao' : 'tăng'}. Hãy cẩn thận khi di chuyển!`;
    }

    if (data.type === 'HEAVY_RAIN') {
      return `Đang có mưa to tại ${location}. Cẩn thận đường trơn trượt.`;
    }

    return `Có cảnh báo mới tại ${location}. Nhấn để xem chi tiết.`;
  }

  async getStats() {
    const [total, active] = await Promise.all([
      this.prisma.fcmToken.count(),
      this.prisma.fcmToken.count({ where: { isActive: true } }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
    };
  }
}
