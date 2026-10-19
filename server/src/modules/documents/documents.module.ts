import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { SandboxModule } from '../sandbox/sandbox.module';
import { SANDBOX, type SandboxRunner } from '../sandbox/sandbox.interface';
import { SkillsModule } from '../skills/skills.module';
import { DocumentComposer } from './services/document-composer.service';
import { DocumentRenderer } from './services/document-renderer.service';
import { DocumentsController } from './documents.controller';
import { DocumentsProcessor } from './documents.processor';
import { DocumentGenerator } from './services/document-generator.service';
import { DocumentsService } from './services/documents.service';
import { JobFromUrlService } from './services/job-from-url.service';
import { HttpPdfRenderer } from './pdf/http';
import { SandboxPdfRenderer } from './pdf/sandbox';
import { PDF_RENDERER, type PdfRenderer } from './pdf/seam';

const pdfRendererProvider = {
  provide: PDF_RENDERER,
  inject: [ConfigService, SANDBOX],
  useFactory: (config: ConfigService, sandbox: SandboxRunner): PdfRenderer => {
    const logger = new Logger('PdfRenderer');
    const serviceUrl = config.get<string | null>('pdf.serviceUrl');

    if (serviceUrl) {
      logger.log(`In PDF qua dịch vụ HTTP: ${serviceUrl}`);
      return new HttpPdfRenderer(serviceUrl);
    }

    logger.log('In PDF bằng docker run (không có PDF_SERVICE_URL)');
    return new SandboxPdfRenderer(sandbox);
  },
};

@Module({
  imports: [AiModule, SandboxModule, SkillsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentGenerator,
    DocumentComposer,
    DocumentRenderer,
    DocumentsProcessor,
    JobFromUrlService,
    pdfRendererProvider,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
