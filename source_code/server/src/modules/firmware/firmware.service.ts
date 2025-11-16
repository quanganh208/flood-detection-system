import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';

export interface BuildResponse {
  success: boolean;
  build_id: string;
  firmware_url: string;
  size: number;
  md5: string;
  build_log?: string;
}

interface ErrorResponse {
  error?: string;
}

@Injectable()
export class FirmwareService {
  private readonly logger = new Logger(FirmwareService.name);
  private readonly builderUrl: string;
  private readonly firmwareStorageDir: string;

  constructor(private configService: ConfigService) {
    this.builderUrl =
      this.configService.get<string>('PLATFORMIO_BUILDER_URL') || 'http://platformio-builder:5000';
    this.firmwareStorageDir = path.join(process.cwd(), '..', 'storage', 'firmware');

    if (!fs.existsSync(this.firmwareStorageDir)) {
      fs.mkdirSync(this.firmwareStorageDir, { recursive: true });
    }
  }

  async buildFromSource(files: Express.Multer.File[]): Promise<BuildResponse> {
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

    try {
      const formData = new FormData();

      for (const file of files) {
        formData.append('files', file.buffer, {
          filename: file.originalname,
          contentType: file.mimetype,
        });
      }

      this.logger.log(`Sending build request to ${this.builderUrl}/build`);

      const response = await axios.post<BuildResponse>(`${this.builderUrl}/build`, formData, {
        headers: formData.getHeaders(),
        timeout: 300000,
      });

      if (response.data.success) {
        this.logger.log(`Build successful: ${response.data.build_id}`);

        await this.downloadFirmwareFromBuilder(response.data.build_id);

        return response.data;
      } else {
        throw new InternalServerErrorException('Build failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Build error: ${errorMessage}`);

      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<ErrorResponse>;
        if (axiosError.response?.data) {
          throw new InternalServerErrorException(
            axiosError.response.data.error || 'Build service error',
          );
        }
      }

      throw new InternalServerErrorException('Failed to build firmware');
    }
  }

  private async downloadFirmwareFromBuilder(buildId: string): Promise<void> {
    try {
      const response = await axios.get(`${this.builderUrl}/download/${buildId}`, {
        responseType: 'arraybuffer',
      });

      const firmwarePath = path.join(this.firmwareStorageDir, `${buildId}.bin`);
      const buffer = Buffer.from(response.data as ArrayBuffer);
      fs.writeFileSync(firmwarePath, buffer);

      this.logger.log(`Firmware saved to ${firmwarePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download firmware: ${errorMessage}`);
      throw new InternalServerErrorException('Failed to download firmware from builder');
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
}
