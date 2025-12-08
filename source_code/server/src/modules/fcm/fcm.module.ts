import { Module, Global } from '@nestjs/common';
import { FcmService } from './fcm.service';
import { FcmController } from './fcm.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [FcmController],
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}
