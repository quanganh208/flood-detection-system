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
  Sse,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { FirmwareService } from './firmware.service';
import { SseMessage } from './services/build-stream.service';

@Controller('api/firmware')
export class FirmwareController {
  private readonly logger = new Logger(FirmwareController.name);

  constructor(private readonly firmwareService: FirmwareService) {}

  @Post('build/init')
  @UseInterceptors(FilesInterceptor('files'))
  initBuild(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    this.logger.log(`Initializing build with ${files.length} files`);

    const buildId = this.firmwareService.initiateBuild(files);

    this.logger.log(`Build initiated with ID: ${buildId}`);

    return {
      success: true,
      message: 'Build initiated',
      data: { build_id: buildId },
    };
  }

  @Get('build/:buildId/status')
  getBuildStatus(@Param('buildId') buildId: string) {
    const status = this.firmwareService.getBuildStatus(buildId);

    return {
      success: true,
      data: status,
    };
  }

  @Sse('build/:buildId/stream')
  streamBuildProgress(
    @Param('buildId') buildId: string,
    @Req() request: Request,
  ): Observable<SseMessage> {
    const lastEventId = request.headers['last-event-id'];
    const parsedLastEventId = lastEventId ? parseInt(lastEventId as string, 10) : undefined;

    this.logger.log(
      `Client subscribing to build ${buildId}, lastEventId: ${parsedLastEventId || 'none'}`,
    );

    return this.firmwareService.getBuildStream(buildId, parsedLastEventId);
  }

  @Delete('build/:buildId/cancel')
  async cancelBuild(@Param('buildId') buildId: string) {
    await this.firmwareService.cancelBuild(buildId);

    return {
      success: true,
      message: 'Build cancelled',
      data: {
        buildId,
        status: 'cancelled',
      },
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
