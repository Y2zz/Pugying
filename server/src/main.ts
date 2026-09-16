import { startLocalApiServer } from './bootstrap';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? 3928);
  const requestedHost = process.env.HOST?.trim();
  const host = requestedHost === 'localhost' ? 'localhost' : '127.0.0.1';
  await startLocalApiServer({
    host,
    port,
    databasePath: process.env.PUGYING_DATABASE_PATH?.trim(),
    credentialSecret: process.env.PLATFORM_CREDENTIAL_SECRET?.trim(),
    localApiToken: process.env.PUGYING_LOCAL_API_TOKEN?.trim(),
  });
}
void bootstrap();
