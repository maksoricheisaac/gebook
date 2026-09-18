import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { TransactionalMailService } from './transactional-mail.service';

@Module({
  providers: [MailService, TransactionalMailService],
  exports: [MailService, TransactionalMailService],
})
export class MailModule {}
