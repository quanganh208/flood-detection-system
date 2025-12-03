import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FirmwareModule } from './modules/firmware/firmware.module';
import { OtaModule } from './modules/ota/ota.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { MqttModule } from './modules/mqtt/mqtt.module';
import { DevicesModule } from './modules/devices/devices.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/',
      exclude: ['/api*'],
    }),

    PrismaModule,
    FirmwareModule,
    OtaModule,
    SensorsModule,
    MqttModule,
    DevicesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
