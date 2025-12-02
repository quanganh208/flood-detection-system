import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttService } from './mqtt.service';
import { SensorsModule } from '../sensors/sensors.module';

@Module({
  imports: [ConfigModule, SensorsModule],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
