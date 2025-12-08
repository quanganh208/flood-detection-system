import { Controller, Get, Query, Req, Res, HttpStatus, Patch, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { MobileService } from './mobile.service';
import { MapDataResponseDto } from './dto/map-data.dto';
import { AlertsResponseDto, GetAlertsQueryDto } from './dto/alerts.dto';

@ApiTags('Mobile')
@Controller('mobile')
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Get('map-data')
  @ApiOperation({
    summary: 'Get map data for mobile app',
    description:
      'Returns all active devices with their locations, current status, and latest sensor readings. Optimized for mobile polling with ETag support.',
  })
  @ApiResponse({
    status: 200,
    description: 'Map data retrieved successfully',
    type: MapDataResponseDto,
  })
  @ApiResponse({ status: 304, description: 'Not Modified - data unchanged since last request' })
  async getMapData(@Req() req: Request, @Res() res: Response): Promise<Response> {
    const data = await this.mobileService.getMapData();
    const etag = this.mobileService.generateETag(data);

    if (req.headers['if-none-match'] === etag) {
      return res.status(HttpStatus.NOT_MODIFIED).send();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=10');
    return res.status(HttpStatus.OK).json(data);
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Get active alerts for mobile app',
    description:
      'Returns unresolved alerts sorted by severity and time. Supports filtering by type and severity with pagination.',
  })
  @ApiQuery({ name: 'severity', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'WATER_WARNING',
      'WATER_DANGER',
      'HEAVY_RAIN',
      'DEVICE_OFFLINE',
      'SENSOR_ERROR',
      'OTA_FAILED',
    ],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Alerts retrieved successfully',
    type: AlertsResponseDto,
  })
  @ApiResponse({ status: 304, description: 'Not Modified - data unchanged since last request' })
  async getAlerts(
    @Query() query: GetAlertsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<Response> {
    const data = await this.mobileService.getAlerts(query);
    const etag = this.mobileService.generateETag(data);

    if (req.headers['if-none-match'] === etag) {
      return res.status(HttpStatus.NOT_MODIFIED).send();
    }

    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.status(HttpStatus.OK).json(data);
  }

  @Patch('alerts/:id/resolve')
  @ApiOperation({
    summary: 'Resolve an alert',
    description: 'Mark an alert as resolved. This removes it from active alerts list.',
  })
  @ApiParam({ name: 'id', description: 'Alert UUID' })
  @ApiResponse({ status: 200, description: 'Alert resolved successfully' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async resolveAlert(@Param('id') id: string): Promise<{ success: boolean; resolvedAt: Date }> {
    const resolvedAt = new Date();
    await this.mobileService.resolveAlert(id, resolvedAt);
    return { success: true, resolvedAt };
  }
}
