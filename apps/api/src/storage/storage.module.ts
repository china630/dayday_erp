import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { STORAGE_SERVICE, type StorageService } from "./storage.interface";
import { LocalStorageService } from "./local-storage.service";
import { S3StorageService } from "./s3-storage.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageService,
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService, LocalStorageService],
      useFactory: (config: ConfigService, local: LocalStorageService): StorageService => {
        const driver = (config.get<string>("STORAGE_DRIVER") ?? "s3").toLowerCase();
        if (driver === "local") {
          return local;
        }
        const s3 = new S3StorageService(config);
        s3.onModuleInit();
        return s3;
      },
    },
  ],
  exports: [STORAGE_SERVICE, LocalStorageService],
})
export class StorageModule {}
