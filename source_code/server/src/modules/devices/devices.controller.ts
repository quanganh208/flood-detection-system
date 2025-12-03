import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { UpdateDeviceDto } from './dto/update-device.dto';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all devices' })
  @ApiQuery({
    name: 'isOnline',
    required: false,
    type: Boolean,
    description: 'Filter by online status',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name, deviceId, location, or MAC address',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all devices',
  })
  async findAll(
    @Query('isOnline') isOnline?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.devicesService.findAll({
      isOnline: isOnline !== undefined ? isOnline === 'true' : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get device statistics' })
  @ApiResponse({
    status: 200,
    description: 'Device statistics',
  })
  async getStats() {
    return this.devicesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device with sensor readings, OTA updates, and alerts' })
  @ApiParam({
    name: 'id',
    description: 'Device UUID or deviceId',
  })
  @ApiResponse({
    status: 200,
    description: 'Device with related data',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update device information' })
  @ApiParam({
    name: 'id',
    description: 'Device UUID or deviceId',
  })
  @ApiResponse({
    status: 200,
    description: 'Device updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  async update(@Param('id') id: string, @Body() updateDeviceDto: UpdateDeviceDto) {
    return this.devicesService.update(id, updateDeviceDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a device' })
  @ApiParam({
    name: 'id',
    description: 'Device UUID or deviceId',
  })
  @ApiResponse({
    status: 204,
    description: 'Device deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  async remove(@Param('id') id: string) {
    await this.devicesService.remove(id);
  }
}
