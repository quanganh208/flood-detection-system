import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger,
  Sse,
  Req,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import type { Request } from 'express';
import { FirmwareService } from './firmware.service';
import { SseMessage } from './services/build-stream.service';
import { UpdateMetadataDto } from './dto/update-metadata.dto';

@ApiTags('firmware')
@Controller('firmware')
export class FirmwareController {
  private readonly logger = new Logger(FirmwareController.name);

  constructor(private readonly firmwareService: FirmwareService) {}

  @Post('build/init')
  @ApiOperation({
    summary: 'Initialize firmware build',
    description: 'Upload source files and initiate a new firmware build process',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'ESP32 source files for firmware compilation',
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Build initiated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Build initiated' },
        data: {
          type: 'object',
          properties: {
            build_id: { type: 'string', example: 'abc123-def456-ghi789' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No files uploaded' })
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
  @ApiOperation({
    summary: 'Get build status',
    description: 'Retrieve current status of a firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Build status retrieved successfully',
  })
  getBuildStatus(@Param('buildId') buildId: string) {
    const status = this.firmwareService.getBuildStatus(buildId);

    return {
      success: true,
      data: status,
    };
  }

  @Sse('build/:buildId/stream')
  @ApiOperation({
    summary: 'Stream build progress',
    description: 'Server-Sent Events stream for real-time build progress updates',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
    content: {
      'text/event-stream': {
        schema: {
          type: 'string',
        },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Cancel build',
    description: 'Cancel an in-progress firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Build cancelled successfully',
  })
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
  @ApiOperation({
    summary: 'List all firmwares',
    description: 'Retrieve a list of all built firmwares',
  })
  @ApiResponse({
    status: 200,
    description: 'List of firmwares retrieved successfully',
  })
  async listFirmwares() {
    const firmwares = await this.firmwareService.listFirmwares();

    return {
      success: true,
      count: firmwares.length,
      data: firmwares,
    };
  }

  @Get(':buildId/build-log')
  @ApiOperation({
    summary: 'Get build log',
    description: 'Retrieve the complete build log for a firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Build log retrieved successfully',
  })
  async getBuildLog(@Param('buildId') buildId: string) {
    const firmware = await this.firmwareService.getFirmwareInfo(buildId);

    return {
      success: true,
      data: {
        buildId,
        buildLog: firmware.buildLog,
        buildStatus: firmware.buildStatus,
        buildDuration: firmware.buildDuration,
      },
    };
  }

  @Get(':buildId/source-files')
  @ApiOperation({
    summary: 'Get source files',
    description: 'Retrieve the source files used for a firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Source files retrieved successfully',
  })
  async getSourceFiles(@Param('buildId') buildId: string) {
    const result = await this.firmwareService.getSourceFiles(buildId);

    return {
      success: true,
      data: {
        buildId,
        fileList: result.fileList,
        files: result.files,
      },
    };
  }

  @Post(':buildId/promote')
  @ApiOperation({
    summary: 'Promote firmware to latest',
    description: 'Mark a firmware build as the latest stable version for OTA updates',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Firmware promoted successfully',
  })
  async promoteToLatest(@Param('buildId') buildId: string) {
    await this.firmwareService.promoteToLatest(buildId);

    return {
      success: true,
      message: 'Firmware promoted to latest version',
      data: { buildId },
    };
  }

  @Patch(':buildId')
  @ApiOperation({
    summary: 'Update firmware metadata',
    description: 'Update version, description, or release notes for a firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Firmware metadata updated successfully',
  })
  async updateMetadata(@Param('buildId') buildId: string, @Body() metadata: UpdateMetadataDto) {
    const updated = await this.firmwareService.updateFirmwareMetadata(buildId, metadata);

    return {
      success: true,
      message: 'Firmware metadata updated',
      data: updated,
    };
  }

  @Get(':buildId')
  @ApiOperation({
    summary: 'Get firmware info',
    description: 'Retrieve detailed information about a specific firmware build',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Firmware information retrieved successfully',
  })
  async getFirmwareInfo(@Param('buildId') buildId: string) {
    const info = await this.firmwareService.getFirmwareInfo(buildId);

    return {
      success: true,
      data: {
        buildId,
        ...info,
      },
    };
  }

  @Delete(':buildId')
  @ApiOperation({
    summary: 'Delete firmware',
    description: 'Delete a firmware build and all associated files',
  })
  @ApiParam({ name: 'buildId', description: 'Unique build identifier' })
  @ApiResponse({
    status: 200,
    description: 'Firmware deleted successfully',
  })
  async deleteFirmware(@Param('buildId') buildId: string) {
    await this.firmwareService.deleteFirmware(buildId);

    return {
      success: true,
      message: 'Firmware deleted successfully',
    };
  }
}
