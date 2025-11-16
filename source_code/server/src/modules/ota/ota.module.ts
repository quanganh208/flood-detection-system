import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller';
import { OtaService } from './ota.service';
import { FirmwareModule } from '../firmware/firmware.module';

@Module({
  imports: [FirmwareModule],
  controllers: [OtaController],
  providers: [OtaService],
})
export class OtaModule {}
