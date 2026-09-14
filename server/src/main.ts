import { startLocalApiServer } from './bootstrap';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3928);
  const requestedHost = process.env.HOST?.trim();
  const host = requestedHost === 'localhost' ? 'localhost' : '127.0.0.1';
  await startLocalApiServer({
    host,
    port,
    databasePath: process.env.PUGYING_DATABASE_PATH?.trim(),
    mediaStorageDir: process.env.MEDIA_STORAGE_DIR?.trim(),
    mediaPublicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL?.trim(),
    credentialSecret: process.env.PLATFORM_CREDENTIAL_SECRET?.trim(),
    mediaSigningSecret: process.env.MEDIA_SIGNING_SECRET?.trim(),
    localApiToken: process.env.PUGYING_LOCAL_API_TOKEN?.trim(),
  });
}
void bootstrap();
