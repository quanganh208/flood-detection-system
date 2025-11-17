import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { BuildStreamService, SseMessage } from './services/build-stream.service';
import { BuildStateService } from './services/build-state.service';
import { PlatformIOClientService } from './services/platformio-client.service';
import { BuildStatus, BuildStatusResponse } from './dto/build-response.dto';

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);
  private readonly firmwareStorageDir: string;

  constructor(
    private configService: ConfigService,
    private buildStreamService: BuildStreamService,
    private buildStateService: BuildStateService,
    private platformIOClient: PlatformIOClientService,
  ) {
    this.firmwareStorageDir = path.join(process.cwd(), '..', 'storage', 'firmware');

    if (!fs.existsSync(this.firmwareStorageDir)) {
      fs.mkdirSync(this.firmwareStorageDir, { recursive: true });
    }
  }

  getFirmwarePath(buildId: string): string {
    const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);

    if (!fs.existsSync(firmwarePath)) {
      throw new BadRequestException('Firmware not found');
    }

    return firmwarePath;
  }

  getFirmwareInfo(buildId: string): { size: number; path: string } {
    const firmwarePath = this.getFirmwarePath(buildId);
    const stats = fs.statSync(firmwarePath);

    return {
      size: stats.size,
      path: firmwarePath,
    };
  }

  listFirmwares(): Array<{ buildId: string; size: number; created: Date }> {
    const files = fs.readdirSync(this.firmwareStorageDir);

    return files
      .filter((f) => f.endsWith('.bin'))
      .map((f) => {
        const filePath = path.join(this.firmwareStorageDir, f);
        const stats = fs.statSync(filePath);

        return {
          buildId: f.replace('.bin', ''),
          size: stats.size,
          created: stats.birthtime,
        };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime());
  }

  deleteFirmware(buildId: string): void {
    const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);

    if (fs.existsSync(firmwarePath)) {
      fs.unlinkSync(firmwarePath);
      this.logger.log(`Deleted firmware: ${buildId}`);
    }
  }

  initiateBuild(files: Express.Multer.File[]): string {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const hasPlatformioIni = files.some((f) => f.originalname === 'platformio.ini');
    const hasMainFile = files.some(
      (f) => f.originalname.endsWith('.ino') || f.originalname.endsWith('.cpp'),
    );

    if (!hasPlatformioIni) {
      throw new BadRequestException('platformio.ini is required');
    }

    if (!hasMainFile) {
      throw new BadRequestException('Main source file (.ino or .cpp) is required');
    }

    const buildId = uuidv4();

    this.logger.log(`Initiating build: ${buildId} with ${files.length} files`);

    this.buildStateService.setState(buildId, {
      buildId,
      status: BuildStatus.QUEUED,
      percent: 0,
      fileCount: files.length,
      queuePosition: 0,
    });

    void this.platformIOClient.startBuild(buildId, files).catch((error: Error) => {
      this.logger.error(`Failed to start build ${buildId}: ${error.message}`);
    });

    return buildId;
  }

  getBuildStream(buildId: string, lastEventId?: number): Observable<SseMessage> {
    return this.buildStreamService.getBuildStream(buildId, lastEventId);
  }

  getBuildStatus(buildId: string): BuildStatusResponse {
    const state = this.buildStateService.getState(buildId);

    if (!state) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    return {
      buildId: state.buildId,
      status: state.status,
      stage: state.stage,
      percent: state.percent,
      startedAt: state.startedAt?.toISOString(),
      completedAt: state.completedAt?.toISOString(),
      duration: state.duration,
      error: state.error,
    };
  }

  async cancelBuild(buildId: string): Promise<void> {
    const state = this.buildStateService.getState(buildId);

    if (!state) {
      throw new NotFoundException(`Build ${buildId} not found`);
    }

    if (state.status === BuildStatus.COMPLETED || state.status === BuildStatus.FAILED) {
      throw new BadRequestException('Cannot cancel completed or failed build');
    }

    await this.platformIOClient.cancelBuild(buildId);
  }
}
