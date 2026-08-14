import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type GenerateDocumentPayload,
} from '../queue/queue.service.js';
import { DocumentsService } from './documents.service.js';

@Injectable()
export class DocumentsProcessor implements OnModuleInit {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly documents: DocumentsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<GenerateDocumentPayload>(
      QUEUE.GENERATE_DOCUMENT,
      async (data) => {
        this.logger.log(`Sinh tài liệu ${data.documentId}`);
        await this.documents.generate(data.userId, data.documentId);
      },
    );
  }
}
