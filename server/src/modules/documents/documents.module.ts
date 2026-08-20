import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiModule } from '../ai/ai.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { SANDBOX, type SandboxRunner } from '../sandbox/sandbox.interface.js';
import { SkillsModule } from '../skills/skills.module.js';
import { DocumentComposer } from './document-composer.service.js';
import { DocumentRenderer } from './document-renderer.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsProcessor } from './documents.processor.js';
import { DocumentsService } from './documents.service.js';
import { HttpLatexCompiler } from './compilers/http-latex.compiler.js';
import { LATEX_COMPILER, type LatexCompiler } from './latex-compile.js';
import { SandboxLatexCompiler } from './compilers/sandbox-latex.compiler.js';

/** Chọn cách compile LaTeX theo môi trường. */
const latexCompilerProvider = {
  provide: LATEX_COMPILER,
  inject: [ConfigService, SANDBOX],
  useFactory: (
    config: ConfigService,
    sandbox: SandboxRunner,
  ): LatexCompiler => {
    const logger = new Logger('LatexCompiler');
    const serviceUrl = config.get<string | null>('latex.serviceUrl');

    if (serviceUrl) {
      logger.log(`Tạo PDF qua dịch vụ HTTP: ${serviceUrl}`);
      return new HttpLatexCompiler(serviceUrl);
    }

    logger.log('Tạo PDF bằng docker run (không có LATEX_SERVICE_URL)');
    return new SandboxLatexCompiler(sandbox);
  },
};

@Module({
  imports: [AiModule, SandboxModule, SkillsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentComposer,
    DocumentRenderer,
    DocumentsProcessor,
    latexCompilerProvider,
  ],
  exports: [DocumentsService, LATEX_COMPILER],
})
export class DocumentsModule {}
