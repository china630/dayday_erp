import "./instrument";
import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { HEALTH_CHECK_PAYLOAD } from "./common/health-payload";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.use(cookieParser());
  const devOriginOk = (origin: string | undefined): boolean => {
    if (!origin) return true;
    try {
      const u = new URL(origin);
      if (u.protocol !== "http:") return false;
      if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")
        return true;
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(u.hostname)) return true;
      return false;
    } catch {
      return false;
    }
  };

  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (process.env.NODE_ENV === "production") {
        const fromEnv = (process.env.CORS_ORIGINS ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const allow = [
          ...new Set([
            ...fromEnv,
            "http://localhost:3000",
            "http://127.0.0.1:3000",
          ]),
        ];
        if (!origin || allow.includes(origin)) cb(null, true);
        else cb(null, false);
        return;
      }
      cb(null, devOriginOk(origin));
    },
    credentials: true,
  });

  /** Legacy GET /health (без префикса /api): тот же JSON, что и GET /api/health — для старых балансировщиков и мониторингов. */
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = (req.url ?? "").split("?")[0];
    if (path === "/health" && req.method === "GET") {
      res.status(200).json(HEALTH_CHECK_PAYLOAD);
      return;
    }
    next();
  });

  /** v5.7–v5.8: whitelist + forbidNonWhitelisted (строгий режим TZ.md). */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix("api");

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DayDay ERP API")
    .setDescription(
      "Core MVP: JWT Bearer (access). Refresh token — HttpOnly cookie для POST /api/auth/refresh.",
    )
    .setVersion("0.1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token из POST /api/auth/login или /api/auth/register",
      },
      "bearer",
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.API_PORT ?? "4000";
  await app.listen(Number(port), "0.0.0.0");
  logger.log(
    `API http://0.0.0.0:${port}  health GET /api/health (legacy GET /health)  Swagger http://0.0.0.0:${port}/api/docs`,
  );
}

bootstrap();
