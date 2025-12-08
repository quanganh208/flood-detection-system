import { Module } from '@nestjs/common';
import { FirmwareController } from './firmware.controller';
import { FirmwareService } from './firmware.service';
import { BuildStreamService } from './services/build-stream.service';
import { BuildStateService } from './services/build-state.service';
import { PlatformIOClientService } from './services/platformio-client.service';

@Module({
  controllers: [FirmwareController],
  providers: [FirmwareService, BuildStreamService, BuildStateService, PlatformIOClientService],
  exports: [FirmwareService, BuildStreamService, BuildStateService],
})
export class FirmwareModule {}
