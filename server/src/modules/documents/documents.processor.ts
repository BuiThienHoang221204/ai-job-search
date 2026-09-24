import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QUEUE,
  QueueService,
  type GenerateDocumentPayload,
} from '../queue/queue.service.js';
import { DocumentGenerator } from './services/document-generator.service.js';

@Injectable()
export class DocumentsProcessor implements OnModuleInit {
  private readonly logger = new Logger(DocumentsProcessor.name);

  constructor(
    private readonly queue: QueueService,
    private readonly generator: DocumentGenerator,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work<GenerateDocumentPayload>(
      QUEUE.GENERATE_DOCUMENT,
      async (data) => {
        this.logger.log(`Sinh tài liệu ${data.documentId}`);
        await this.generator.generate(data.userId, data.documentId);
      },
    );
  }
}
