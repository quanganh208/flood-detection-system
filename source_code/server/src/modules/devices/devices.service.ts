import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { Device, Prisma } from '@prisma/client';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all devices with optional filtering
   */
  async findAll(options?: {
    isOnline?: boolean;
    isActive?: boolean;
    search?: string;
  }): Promise<Device[]> {
    const where: Prisma.DeviceWhereInput = {};

    if (options?.isOnline !== undefined) {
      where.isOnline = options.isOnline;
    }

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { deviceId: { contains: options.search, mode: 'insensitive' } },
        { location: { contains: options.search, mode: 'insensitive' } },
        { macAddress: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.device.findMany({
      where,
      orderBy: [{ isOnline: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * Get a single device by ID (UUID or deviceId) with details
   */
  async findOne(id: string): Promise<
    Prisma.DeviceGetPayload<{
      include: {
        sensorReadings: true;
        otaUpdates: { include: { firmware: { select: { version: true; description: true } } } };
        alerts: true;
      };
    }>
  > {
    const device = await this.prisma.device.findFirst({
      where: {
        OR: [{ id }, { deviceId: id }],
      },
      include: {
        sensorReadings: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
        otaUpdates: {
          orderBy: { initiatedAt: 'desc' },
          take: 5,
          include: {
            firmware: {
              select: {
                version: true,
                description: true,
              },
            },
          },
        },
        alerts: {
          where: { isResolved: false },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID "${id}" not found`);
    }

    return device;
  }

  /**
   * Update device information
   */
  async update(id: string, updateDeviceDto: UpdateDeviceDto): Promise<Device> {
    // First check if device exists
    const device = await this.findOne(id);

    this.logger.log(`Updating device ${device.deviceId} with: ${JSON.stringify(updateDeviceDto)}`);

    return this.prisma.device.update({
      where: { id: device.id },
      data: updateDeviceDto,
    });
  }

  /**
   * Delete a device
   */
  async remove(id: string): Promise<void> {
    const device = await this.findOne(id);

    this.logger.warn(`Deleting device ${device.deviceId}`);

    await this.prisma.device.delete({
      where: { id: device.id },
    });
  }

  /**
   * Get device statistics
   */
  async getStats(): Promise<{
    total: number;
    online: number;
    offline: number;
    active: number;
    inactive: number;
  }> {
    const [total, online, active] = await Promise.all([
      this.prisma.device.count(),
      this.prisma.device.count({ where: { isOnline: true } }),
      this.prisma.device.count({ where: { isActive: true } }),
    ]);

    return {
      total,
      online,
      offline: total - online,
      active,
      inactive: total - active,
    };
  }
}
