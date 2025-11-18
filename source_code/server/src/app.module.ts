import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { FirmwareModule } from './modules/firmware/firmware.module';
import { OtaModule } from './modules/ota/ota.module';
import { PrismaModule } from './modules/prisma/prisma.module';

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
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
