import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { BuildStreamService, SseMessage } from './services/build-stream.service';
import { BuildStateService, BuildState } from './services/build-state.service';
import { PlatformIOClientService } from './services/platformio-client.service';
import { BuildStatus, BuildStatusResponse } from './dto/build-response.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);
  private readonly firmwareStorageDir: string;

  constructor(
    private configService: ConfigService,
    private buildStreamService: BuildStreamService,
    private buildStateService: BuildStateService,
    private platformIOClient: PlatformIOClientService,
    private prisma: PrismaService,
  ) {
    this.firmwareStorageDir = path.join(process.cwd(), '..', 'storage', 'firmware');

    if (!fs.existsSync(this.firmwareStorageDir)) {
      fs.mkdirSync(this.firmwareStorageDir, { recursive: true });
    }

    this.setupBuildEventListeners();
  }

  private setupBuildEventListeners(): void {
    setInterval(() => {
      void this.syncBuildStates();
    }, 5000);
  }

  private async syncBuildStates(): Promise<void> {
    try {
      const allStates = this.buildStateService.getAllStates();

      for (const state of allStates) {
        if (
          state.status === BuildStatus.COMPLETED ||
          state.status === BuildStatus.FAILED ||
          state.status === BuildStatus.CANCELLED
        ) {
          await this.updateFirmwareFromBuildState(state);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to sync build states: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateFirmwareFromBuildState(state: BuildState): Promise<void> {
    try {
      const firmware = await this.prisma.firmware.findUnique({
        where: { buildId: state.buildId },
      });

      if (!firmware) {
        this.logger.warn(`Firmware not found for buildId: ${state.buildId}, skipping sync`);
        return;
      }

      if (
        firmware.buildStatus === BuildStatus.COMPLETED ||
        firmware.buildStatus === BuildStatus.FAILED ||
        firmware.buildStatus === BuildStatus.CANCELLED
      ) {
        return;
      }

      if (state.status === BuildStatus.COMPLETED) {
        const firmwarePath = path.join(this.firmwareStorageDir, `${state.buildId}.bin`);

        if (fs.existsSync(firmwarePath)) {
          const fileStats = fs.statSync(firmwarePath);
          const md5Checksum = this.calculateMD5(firmwarePath);

          await this.prisma.firmware.updateMany({
            where: { isLatest: true },
            data: { isLatest: false },
          });

          await this.prisma.firmware.update({
            where: { buildId: state.buildId },
            data: {
              buildStatus: BuildStatus.COMPLETED,
              buildDuration: state.duration,
              buildLog: state.buildLog || 'Build completed successfully',
              filePath: firmwarePath,
              fileSize: fileStats.size,
              md5Checksum: md5Checksum,
              isLatest: true,
              publishedAt: new Date(),
            },
          });
        }
      } else if (state.status === BuildStatus.FAILED) {
        await this.prisma.firmware.update({
          where: { buildId: state.buildId },
          data: {
            buildStatus: BuildStatus.FAILED,
            buildLog: state.buildLog || state.error || 'Build failed',
            buildDuration: state.duration,
          },
        });
      } else if (state.status === BuildStatus.CANCELLED) {
        await this.prisma.firmware.update({
          where: { buildId: state.buildId },
          data: {
            buildStatus: BuildStatus.CANCELLED,
            buildDuration: state.duration,
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update firmware ${state.buildId} from build state: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private calculateMD5(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('md5');
    hash.update(fileBuffer);
    return hash.digest('hex');
  }

  getFirmwarePath(buildId: string): string {
    const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);

    if (!fs.existsSync(firmwarePath)) {
      throw new BadRequestException('Firmware not found');
    }

    return firmwarePath;
  }

  async getFirmwareInfo(buildId: string): Promise<{
    size: number;
    path: string;
    version?: string;
    description?: string;
    buildStatus: string;
    isLatest: boolean;
    createdAt: Date;
    md5?: string;
    buildLog?: string;
    buildDuration?: number;
    releaseNotes?: string;
  }> {
    const firmware = await this.prisma.firmware.findUnique({
      where: { buildId },
    });

    const firmwarePath = this.getFirmwarePath(buildId);
    const stats = fs.statSync(firmwarePath);

    if (firmware) {
      return {
        size: firmware.fileSize,
        path: firmware.filePath,
        version: firmware.version,
        description: firmware.description || undefined,
        buildStatus: firmware.buildStatus,
        isLatest: firmware.isLatest,
        createdAt: firmware.createdAt,
        md5: firmware.md5Checksum,
        buildLog: firmware.buildLog || undefined,
        buildDuration: firmware.buildDuration || undefined,
        releaseNotes: firmware.releaseNotes || undefined,
      };
    }

    return {
      size: stats.size,
      path: firmwarePath,
      buildStatus: 'UNKNOWN',
      isLatest: false,
      createdAt: stats.birthtime,
    };
  }

  async listFirmwares(): Promise<
    Array<{
      buildId: string;
      version: string;
      size: number;
      created: Date;
      buildStatus: string;
      isLatest: boolean;
      description?: string;
      md5?: string;
      buildDuration?: number;
    }>
  > {
    const firmwares = await this.prisma.firmware.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        buildId: true,
        version: true,
        fileSize: true,
        createdAt: true,
        buildStatus: true,
        isLatest: true,
        description: true,
        md5Checksum: true,
        buildDuration: true,
      },
    });

    return firmwares.map((f) => ({
      buildId: f.buildId,
      version: f.version,
      size: f.fileSize,
      created: f.createdAt,
      buildStatus: f.buildStatus,
      isLatest: f.isLatest,
      description: f.description || undefined,
      md5: f.md5Checksum,
      buildDuration: f.buildDuration || undefined,
    }));
  }

  async deleteFirmware(buildId: string): Promise<void> {
    try {
      await this.prisma.firmware.delete({
        where: { buildId },
      });
    } catch {
      this.logger.warn(`Firmware not found in database: ${buildId}`);
    }

    const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);
    if (fs.existsSync(firmwarePath)) {
      fs.unlinkSync(firmwarePath);
    }

    try {
      const builderUrl = this.configService.get<string>('PLATFORMIO_BUILDER_URL');
      await fetch(`${builderUrl}/build/${buildId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      this.logger.warn(
        `Error deleting build directory: ${error instanceof Error ? error.message : String(error)}`,
      );
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

    const fileNames = files.map((f) => f.originalname);
    const platformioIniFile = files.find((f) => f.originalname === 'platformio.ini');
    const platformioIniContent = platformioIniFile?.buffer.toString('utf-8');

    const sourceFileContents = files.map((file) => ({
      name: file.originalname,
      content: file.buffer.toString('utf-8'),
      path: file.originalname === 'platformio.ini' ? 'platformio.ini' : `src/${file.originalname}`,
    }));

    void this.createFirmwareRecord(buildId, fileNames, platformioIniContent, sourceFileContents);

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

  private extractVersionFromPlatformIO(configContent?: string): string {
    if (!configContent) {
      return '0.0.0';
    }

    const customVersionMatch = configContent.match(/custom_firmware_version\s*=\s*([^\s\n]+)/i);
    if (customVersionMatch) {
      return customVersionMatch[1].trim();
    }

    const buildFlagMatch = configContent.match(/-DFIRMWARE_VERSION[=\\]"([^"]+)"/i);
    if (buildFlagMatch) {
      return buildFlagMatch[1].trim();
    }

    const versionFlagMatch = configContent.match(/-DVERSION[=\\]"([^"]+)"/i);
    if (versionFlagMatch) {
      return versionFlagMatch[1].trim();
    }

    return '0.0.0';
  }

  private async createFirmwareRecord(
    buildId: string,
    fileNames: string[],
    configFile?: string,
    sourceFileContents?: Array<{ name: string; content: string; path: string }>,
  ): Promise<void> {
    try {
      const version = this.extractVersionFromPlatformIO(configFile);

      await this.prisma.firmware.create({
        data: {
          buildId,
          version: version,
          sourceFiles: fileNames,
          sourceFileContents: sourceFileContents || [],
          configFile: configFile,
          buildStatus: BuildStatus.PENDING,
          filePath: path.join(this.firmwareStorageDir, `${buildId}.bin`),
          fileSize: 0,
          md5Checksum: '',
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create firmware record: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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

  async promoteToLatest(buildId: string): Promise<void> {
    const firmware = await this.prisma.firmware.findUnique({
      where: { buildId },
    });

    if (!firmware) {
      throw new NotFoundException(`Firmware ${buildId} not found`);
    }

    if (firmware.buildStatus !== BuildStatus.COMPLETED) {
      throw new BadRequestException('Can only promote completed builds to latest');
    }

    await this.prisma.firmware.updateMany({
      where: { isLatest: true },
      data: { isLatest: false },
    });

    await this.prisma.firmware.update({
      where: { buildId },
      data: {
        isLatest: true,
        publishedAt: new Date(),
      },
    });
  }

  async updateFirmwareMetadata(
    buildId: string,
    metadata: {
      version?: string;
      description?: string;
      releaseNotes?: string;
    },
  ): Promise<void> {
    const firmware = await this.prisma.firmware.findUnique({
      where: { buildId },
    });

    if (!firmware) {
      throw new NotFoundException(`Firmware ${buildId} not found`);
    }

    await this.prisma.firmware.update({
      where: { buildId },
      data: {
        version: metadata.version,
        description: metadata.description,
        releaseNotes: metadata.releaseNotes,
      },
    });
  }

  async getSourceFiles(buildId: string): Promise<{
    fileList: string[];
    files: Array<{ name: string; content: string; path: string }>;
  }> {
    const firmware = await this.prisma.firmware.findUnique({
      where: { buildId },
    });

    if (!firmware) {
      throw new NotFoundException(`Firmware ${buildId} not found`);
    }

    const fileList = firmware.sourceFiles as string[];
    const files =
      (firmware.sourceFileContents as Array<{ name: string; content: string; path: string }>) || [];

    return {
      fileList,
      files,
    };
  }
}
