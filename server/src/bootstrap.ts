import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

const LOCAL_TOKEN_HEADER = 'x-pugying-local-token';

export interface LocalServerRuntimeOptions {
  host: string;
  port: number;
  databasePath?: string;
  mediaStorageDir?: string;
  mediaPublicBaseUrl?: string;
  credentialSecret?: string;
  mediaSigningSecret?: string;
  localApiToken?: string;
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) {
    // Electron file:// / 同机无 Origin 的请求
    return true;
  }
  return (
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://localhost') ||
    origin === 'file://' ||
    origin.startsWith('app://')
  );
}

/**
 * 将桌面宿主提供的运行时配置映射为既有模块使用的环境变量。
 * 这些值只在当前 Electron 主进程中设置；独立 Server 入口仍可直接从环境变量启动。
 */
function applyRuntimeOptions(options: LocalServerRuntimeOptions): void {
  process.env.PORT = String(options.port);
  process.env.HOST = options.host;
  if (options.databasePath) {
    process.env.PUGYING_DATABASE_PATH = options.databasePath;
  }
  if (options.mediaStorageDir) {
    process.env.MEDIA_STORAGE_DIR = options.mediaStorageDir;
  }
  if (options.mediaPublicBaseUrl) {
    process.env.MEDIA_PUBLIC_BASE_URL = options.mediaPublicBaseUrl;
  }
  if (options.credentialSecret) {
    process.env.PLATFORM_CREDENTIAL_SECRET = options.credentialSecret;
  }
  if (options.mediaSigningSecret) {
    process.env.MEDIA_SIGNING_SECRET = options.mediaSigningSecret;
  }
  if (options.localApiToken) {
    process.env.PUGYING_LOCAL_API_TOKEN = options.localApiToken;
  }
}

/**
 * 启动蒲公英本机 Nest 服务。
 *
 * 本函数被 Electron 主进程和独立 Node 入口共同使用。桌面宿主在加载此模块前注入
 * 运行时配置，确保 TypeORM 动态模块读取数据库路径时得到正确的值。
 */
export async function startLocalApiServer(
  options: LocalServerRuntimeOptions,
): Promise<INestApplication> {
  applyRuntimeOptions(options);
  const app = await NestFactory.create(AppModule);
  const localApiToken = options.localApiToken?.trim();

  if (localApiToken) {
    // Nest 12 的 app.use(...args: any[]) 会把回调参数推成 any，需显式标注 Express 类型
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (
        request.path === '/api-json' ||
        /^\/media\/assets\/[^/]+\/download$/.test(request.path)
      ) {
        next();
        return;
      }
      if (request.header(LOCAL_TOKEN_HEADER) !== localApiToken) {
        response.status(403).json({ message: 'Invalid local application token' });
        return;
      }
      next();
    });
  }

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Pugying API')
    .setDescription('Pugying 本机 API 文档')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, config));

  const host = options.host === 'localhost' ? 'localhost' : '127.0.0.1';
  await app.listen(options.port, host);
  console.log(`[pugying-server] listening on http://${host}:${options.port}`);
  return app;
}
