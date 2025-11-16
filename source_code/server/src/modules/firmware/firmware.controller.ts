import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { FirmwareService } from './firmware.service';

@Controller('api/firmware')
export class FirmwareController {
  private readonly logger = new Logger(FirmwareController.name);

  constructor(private readonly firmwareService: FirmwareService) {}

  @Post('build')
  @UseInterceptors(FilesInterceptor('files'))
  async buildFirmware(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    this.logger.log(`Received ${files.length} files for build`);
    files.forEach((f) => this.logger.debug(`  - ${f.originalname} (${f.size} bytes)`));

    const result = await this.firmwareService.buildFromSource(files);

    return {
      success: true,
      message: 'Firmware built successfully',
      data: result,
    };
  }

  @Get()
  listFirmwares() {
    const firmwares = this.firmwareService.listFirmwares();

    return {
      success: true,
      count: firmwares.length,
      data: firmwares,
    };
  }

  @Get(':buildId')
  getFirmwareInfo(@Param('buildId') buildId: string) {
    const info = this.firmwareService.getFirmwareInfo(buildId);

    return {
      success: true,
      data: {
        buildId,
        ...info,
      },
    };
  }

  @Delete(':buildId')
  deleteFirmware(@Param('buildId') buildId: string) {
    this.firmwareService.deleteFirmware(buildId);

    return {
      success: true,
      message: 'Firmware deleted successfully',
    };
  }
}
