import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { BuildStreamService } from './build-stream.service';
import { BuildStateService, BuildState } from './build-state.service';
import { BuildStatus } from '../dto/build-response.dto';

@Injectable()
export class PlatformIOClientService {
  private readonly logger = new Logger(PlatformIOClientService.name);
  private readonly builderUrl: string;
  private readonly firmwareStorageDir: string;

  private activeConnections = new Map<string, boolean>();

  constructor(
    private readonly configService: ConfigService,
    private readonly buildStreamService: BuildStreamService,
    private readonly buildStateService: BuildStateService,
  ) {
    this.builderUrl =
      this.configService.get<string>('PLATFORMIO_BUILDER_URL') || 'http://platformio-builder:5000';
    this.logger.log(`PlatformIO Builder URL: ${this.builderUrl}`);

    this.firmwareStorageDir = path.join(process.cwd(), '..', 'storage', 'firmware');
    if (!fs.existsSync(this.firmwareStorageDir)) {
      fs.mkdirSync(this.firmwareStorageDir, { recursive: true });
    }
    this.logger.log(`Firmware storage directory: ${this.firmwareStorageDir}`);
  }

  async startBuild(buildId: string, files: Express.Multer.File[]): Promise<void> {
    try {
      this.logger.log(`Starting build ${buildId} with ${files.length} files`);

      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
      }

      interface InitResponse {
        build_id: string;
        status: string;
        file_count: number;
      }

      const initResponse = await axios.post<InitResponse>(
        `${this.builderUrl}/build/init`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 30000,
        },
      );

      const builderBuildId = initResponse.data.build_id;
      this.logger.log(`Files uploaded, builder build_id: ${builderBuildId}`);

      this.buildStateService.setState(buildId, {
        builderBuildId: builderBuildId,
        status: BuildStatus.BUILDING,
        startedAt: new Date(),
      });

      const streamUrl = `${this.builderUrl}/build/${builderBuildId}/stream`;

      const streamResponse = await axios.get(streamUrl, {
        responseType: 'stream',
        timeout: 600000,
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      this.logger.log(`SSE stream connected, status: ${streamResponse.status}`);

      this.consumeSSEStream(buildId, streamResponse.data);
    } catch (error) {
      this.handleBuildError(buildId, error);
    }
  }

  async cancelBuild(buildId: string): Promise<void> {
    try {
      this.logger.log(`Cancelling build: ${buildId}`);

      const state = this.buildStateService.getState(buildId);
      if (!state?.builderBuildId) {
        throw new Error('Builder build ID not found');
      }

      this.activeConnections.delete(buildId);

      await axios.delete(`${this.builderUrl}/cancel/${state.builderBuildId}`, {
        timeout: 5000,
      });

      this.buildStateService.setState(buildId, {
        status: BuildStatus.CANCELLED,
        completedAt: new Date(),
      });

      this.buildStreamService.emitBuildEvent(buildId, {
        event: 'build_cancelled',
        data: {
          buildId,
          timestamp: new Date().toISOString(),
          reason: 'user_requested',
          message: 'Build cancelled by user',
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to cancel build ${buildId}: ${errorMessage}`);
      throw new InternalServerErrorException('Failed to cancel build');
    }
  }

  private async downloadFirmware(buildId: string, builderBuildId: string): Promise<void> {
    try {
      this.logger.log(`Downloading firmware for build: ${buildId} (builder: ${builderBuildId})`);

      const downloadUrl = `${this.builderUrl}/download/${builderBuildId}`;
      const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);

      const response = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      fs.writeFileSync(firmwarePath, Buffer.from(response.data));

      const fileStats = fs.statSync(firmwarePath);
      this.logger.log(
        `Firmware saved successfully: ${buildId}.bin (${fileStats.size} bytes) at ${firmwarePath}`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download firmware for build ${buildId}: ${errorMessage}`);
      throw error;
    }
  }

  private consumeSSEStream(buildId: string, stream: NodeJS.ReadableStream): void {
    let buffer = '';

    stream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      buffer += text;

      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        if (!message.trim()) continue;

        if (message.trim().startsWith(':')) {
          continue;
        }

        this.parseAndRelaySSEMessage(buildId, message);
      }
    });

    stream.on('end', () => {
      this.logger.log(`SSE stream ended for build: ${buildId}`);
      this.activeConnections.delete(buildId);
    });

    stream.on('error', (error: Error) => {
      this.logger.error(`SSE stream error for build ${buildId}: ${error.message}`);
      this.handleBuildError(buildId, error);
      this.activeConnections.delete(buildId);
    });
  }

  private parseAndRelaySSEMessage(buildId: string, message: string): void {
    try {
      const lines = message.split('\n');
      let eventType = 'message';
      let data: string | undefined;

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          data = line.substring(5).trim();
        }
      }

      if (!data) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsedData = JSON.parse(data);

      this.updateStateFromEvent(buildId, eventType, parsedData);

      const transformedData = this.transformEventData(eventType, parsedData);

      this.buildStreamService.emitBuildEvent(buildId, {
        event: eventType,
        data: transformedData,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to parse SSE message for build ${buildId}: ${errorMessage}`);
    }
  }

  private transformEventData(
    eventType: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (eventType) {
      case 'log':
        return {
          message: data.line || '',
          level: this.inferLogLevel(data.line as string),
          timestamp: data.timestamp,
          buildId: data.build_id,
        };

      case 'progress':
        return {
          stage: data.phase || data.stage,
          percent: data.progress || data.percent || 0,
          message: data.message,
          timestamp: data.timestamp,
          buildId: data.build_id,
        };

      case 'build_complete': {
        const successValue = !data.code || data.code === 'SUCCESS';
        return {
          success: successValue,
          buildId: data.build_id,
          size: data.size,
          md5: data.md5,
          duration: data.duration,
          timestamp: data.timestamp,
        };
      }

      case 'build_started':
        return {
          buildId: data.build_id,
          timestamp: data.timestamp,
        };

      case 'error':
        return {
          buildId: data.build_id,
          code: data.code,
          message: data.message,
          timestamp: data.timestamp,
        };

      default:
        return data;
    }
  }

  private inferLogLevel(message: string): string {
    if (!message) return 'info';

    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('error') || lowerMessage.includes('failed')) {
      return 'error';
    }
    if (lowerMessage.includes('warning') || lowerMessage.includes('warn')) {
      return 'warning';
    }
    if (lowerMessage.includes('success') || lowerMessage.includes('complete')) {
      return 'success';
    }
    return 'info';
  }

  private updateStateFromEvent(buildId: string, eventType: string, data: unknown): void {
    const updates: Partial<BuildState> = {};
    const eventData = data as Record<string, unknown>;

    switch (eventType) {
      case 'build_started':
        updates.status = BuildStatus.BUILDING;
        updates.startedAt = new Date();
        break;

      case 'progress':
        updates.stage = eventData.stage as string;
        updates.percent = eventData.percent as number;
        break;

      case 'build_complete': {
        const isSuccess = !eventData.code || eventData.code === 'SUCCESS';

        updates.status = isSuccess ? BuildStatus.COMPLETED : BuildStatus.FAILED;
        updates.completedAt = new Date();
        updates.duration = eventData.duration as number;
        updates.size = eventData.size as number;
        updates.md5 = eventData.md5 as string;
        updates.percent = 100;

        if (isSuccess) {
          const state = this.buildStateService.getState(buildId);
          this.logger.log(
            `Build complete - success: true, builderBuildId: ${state?.builderBuildId}`,
          );

          if (state?.builderBuildId) {
            void this.downloadFirmware(buildId, state.builderBuildId).catch((error: Error) => {
              this.logger.error(`Failed to download firmware for ${buildId}: ${error.message}`);
            });
          } else {
            this.logger.warn(
              `Cannot download firmware - builderBuildId not found for build: ${buildId}`,
            );
          }
        } else {
          this.logger.log('Build complete - success: false (build failed)');
        }
        break;
      }

      case 'error':
        updates.status = BuildStatus.FAILED;
        updates.completedAt = new Date();
        updates.error = eventData.message as string;
        break;

      case 'build_cancelled':
        updates.status = BuildStatus.CANCELLED;
        updates.completedAt = new Date();
        break;
    }

    if (Object.keys(updates).length > 0) {
      this.buildStateService.setState(buildId, updates);
    }
  }

  private handleBuildError(buildId: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Build error for ${buildId}: ${errorMessage}`);

    this.buildStateService.setState(buildId, {
      status: BuildStatus.FAILED,
      completedAt: new Date(),
      error: errorMessage,
    });

    this.buildStreamService.emitBuildEvent(buildId, {
      event: 'error',
      data: {
        buildId,
        timestamp: new Date().toISOString(),
        errorType: 'system_error',
        message: errorMessage,
        recoverable: false,
      },
    });
  }
}
