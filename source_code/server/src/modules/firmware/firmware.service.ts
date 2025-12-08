import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { BuildStreamService, SseMessage } from './services/build-stream.service';
import { BuildStateService, BuildState } from './services/build-state.service';
import { PlatformIOClientService } from './services/platformio-client.service';
import { BuildStatus } from './dto/build-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { calculateMD5 } from '../../common/utils';

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
          const md5Checksum = calculateMD5(firmwarePath);

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

    void this.startBuildWithAutoVersion(buildId, files);

    return buildId;
  }

  private async startBuildWithAutoVersion(
    buildId: string,
    files: Express.Multer.File[],
  ): Promise<void> {
    try {
      const fileNames = files.map((f) => f.originalname);

      const newVersion = await this.getNextVersion();

      this.logger.log(`Auto-generated version: ${newVersion}`);

      const modifiedFiles = files.map((file) => {
        if (file.originalname === 'platformio.ini') {
          const modifiedContent = this.injectVersionIntoPlatformIO(
            file.buffer.toString('utf-8'),
            newVersion,
          );
          return {
            ...file,
            buffer: Buffer.from(modifiedContent, 'utf-8'),
          } as Express.Multer.File;
        }
        return file;
      });

      const modifiedPlatformioIni = modifiedFiles
        .find((f) => f.originalname === 'platformio.ini')
        ?.buffer.toString('utf-8');

      const sourceFileContents = modifiedFiles.map((file) => ({
        name: file.originalname,
        content: file.buffer.toString('utf-8'),
        path:
          file.originalname === 'platformio.ini' ? 'platformio.ini' : `src/${file.originalname}`,
      }));

      await this.prisma.firmware.create({
        data: {
          buildId,
          version: newVersion,
          sourceFiles: fileNames,
          sourceFileContents: sourceFileContents,
          configFile: modifiedPlatformioIni,
          buildStatus: BuildStatus.PENDING,
          filePath: path.join(this.firmwareStorageDir, `${buildId}.bin`),
          fileSize: 0,
          md5Checksum: '',
        },
      });

      this.buildStateService.setState(buildId, {
        buildId,
        status: BuildStatus.QUEUED,
        percent: 0,
        fileCount: files.length,
        queuePosition: 0,
      });

      await this.platformIOClient.startBuild(buildId, modifiedFiles);
    } catch (error) {
      this.logger.error(
        `Failed to start build ${buildId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.buildStateService.setState(buildId, {
        buildId,
        status: BuildStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private injectVersionIntoPlatformIO(content: string, version: string): string {
    let result = content;

    if (result.match(/custom_firmware_version\s*=/i)) {
      result = result.replace(
        /custom_firmware_version\s*=\s*[^\s\n]+/i,
        `custom_firmware_version = ${version}`,
      );
    } else {
      const envMatch = result.match(/(\[env:[^\]]+\])/);
      if (envMatch) {
        result = result.replace(
          envMatch[1],
          `${envMatch[1]}\ncustom_firmware_version = ${version}`,
        );
      }
    }

    const versionFlag = `-DFIRMWARE_VERSION=\\"${version}\\"`;

    if (result.match(/-DFIRMWARE_VERSION/i)) {
      result = result.replace(/-DFIRMWARE_VERSION[^\s\n]*/i, versionFlag);
    } else if (result.match(/build_flags\s*=/i)) {
      result = result.replace(/(build_flags\s*=)/i, `$1\n    ${versionFlag}`);
    } else {
      const envMatch = result.match(/(\[env:[^\]]+\])/);
      if (envMatch) {
        result = result.replace(envMatch[1], `${envMatch[1]}\nbuild_flags =\n    ${versionFlag}`);
      }
    }

    return result;
  }

  private async getNextVersion(): Promise<string> {
    const latestFirmware = await this.prisma.firmware.findFirst({
      where: { buildStatus: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { version: true },
    });

    if (!latestFirmware?.version) {
      return '1.0.0';
    }

    const parts = latestFirmware.version.split('.').map(Number);
    if (parts.length === 3 && parts.every((p) => !isNaN(p))) {
      parts[2] += 1;
      return parts.join('.');
    }

    return '1.0.0';
  }

  getBuildStream(buildId: string, lastEventId?: number): Observable<SseMessage> {
    return this.buildStreamService.getBuildStream(buildId, lastEventId);
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
