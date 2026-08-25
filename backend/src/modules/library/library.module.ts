import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { SamplesController } from './samples.controller';
import { SampleThrottleService } from './sample-throttle.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [LibraryController, SamplesController],
  providers: [LibraryService, SampleThrottleService],
})
export class LibraryModule {}
