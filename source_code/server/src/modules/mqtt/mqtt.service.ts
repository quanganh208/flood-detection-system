import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { SensorsService } from '../sensors/sensors.service';

export interface MqttSensorData {
  deviceId: string;
  mac?: string;
  displayName?: string;
  rainAnalog: number;
  rainDigital: boolean;
  waterLevel: number;
  rssi?: number;
  ip?: string;
  firmwareVersion?: string;
  uptime?: number;
}

export interface MqttDeviceStatus {
  deviceId: string;
  status: 'online' | 'offline';
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
}

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;

  constructor(
    private configService: ConfigService,
    private sensorsService: SensorsService,
  ) {}

  async onModuleInit() {
    await this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private async connect(): Promise<void> {
    const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL', 'mqtt://localhost:1883');
    const username = this.configService.get<string>('MQTT_USERNAME', '');
    const password = this.configService.get<string>('MQTT_PASSWORD', '');
    const clientId = `flood-server-${Date.now()}`;

    this.logger.log(`Connecting to MQTT broker: ${brokerUrl}`);

    const options: mqtt.IClientOptions = {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 5000,
      keepalive: 60,
    };

    if (username) {
      options.username = username;
      options.password = password;
    }

    return new Promise((resolve) => {
      this.client = mqtt.connect(brokerUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log('Connected to MQTT broker');
        this.subscribeToTopics();
        resolve();
      });

      this.client.on('error', (error) => {
        this.logger.error(`MQTT connection error: ${error.message}`);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        this.logger.warn('MQTT connection closed');
      });

      this.client.on('reconnect', () => {
        this.logger.log('Reconnecting to MQTT broker...');
      });

      this.client.on('message', (topic, payload) => {
        void this.handleMessage(topic, payload);
      });

      setTimeout(() => {
        if (!this.isConnected) {
          this.logger.warn('MQTT connection timeout - will keep retrying in background');
          resolve();
        }
      }, 10000);
    });
  }

  private disconnect(): void {
    if (this.client) {
      this.client.end();
      this.logger.log('Disconnected from MQTT broker');
    }
  }

  private subscribeToTopics(): void {
    if (!this.client) return;

    this.client.subscribe('flood/+/sensor', { qos: 1 }, (err) => {
      if (err) {
        this.logger.error(`Failed to subscribe to sensor topic: ${err.message}`);
      } else {
        this.logger.log('Subscribed to flood/+/sensor');
      }
    });

    this.client.subscribe('flood/+/status', { qos: 1 }, (err) => {
      if (err) {
        this.logger.error(`Failed to subscribe to status topic: ${err.message}`);
      } else {
        this.logger.log('Subscribed to flood/+/status');
      }
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    try {
      const message = payload.toString();
      const parts = topic.split('/');

      if (parts.length !== 3 || parts[0] !== 'flood') {
        this.logger.warn(`Invalid topic format: ${topic}`);
        return;
      }

      const deviceId = parts[1];
      const messageType = parts[2];

      this.logger.debug(`MQTT message from ${deviceId} on ${messageType}: ${message}`);

      switch (messageType) {
        case 'sensor':
          await this.handleSensorData(deviceId, message);
          break;
        case 'status':
          await this.handleDeviceStatus(deviceId, message);
          break;
        default:
          this.logger.warn(`Unknown message type: ${messageType}`);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error handling MQTT message: ${errMsg}`);
    }
  }

  private async handleSensorData(deviceId: string, message: string): Promise<void> {
    try {
      const data = JSON.parse(message) as MqttSensorData;

      data.deviceId = deviceId;

      this.logger.log(
        `Sensor data from ${deviceId}: rain=${data.rainAnalog}, water=${data.waterLevel}`,
      );

      await this.sensorsService.processSensorData({
        deviceId: data.deviceId,
        mac: data.mac,
        displayName: data.displayName,
        rainAnalog: data.rainAnalog,
        rainDigital: data.rainDigital,
        waterLevel: data.waterLevel,
        rssi: data.rssi,
        ip: data.ip,
        firmwareVersion: data.firmwareVersion,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process sensor data: ${errMsg}`);
    }
  }

  private async handleDeviceStatus(deviceId: string, message: string): Promise<void> {
    try {
      const status = JSON.parse(message) as MqttDeviceStatus;
      this.logger.log(`Device ${deviceId} status: ${status.status}`);

      await this.sensorsService.updateDeviceStatus({
        deviceId,
        mac: status.mac,
        displayName: status.displayName,
        ip: status.ip,
        wifiSSID: status.wifiSSID,
        rssi: status.rssi,
        firmwareVersion: status.firmwareVersion,
        uptime: status.uptime,
        chipModel: status.chipModel,
        freeHeap: status.freeHeap,
        flashSize: status.flashSize,
        isOnline: status.status === 'online',
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to process device status: ${errMsg}`);
    }
  }
}
