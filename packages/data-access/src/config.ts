/**
 * Configuration & credential resolution.
 * Local dev reads plain env vars; in AWS, DB creds come from Secrets Manager.
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export type DbCredentials = {
  host: string;
  port: number;
  user: string;
  password: string;
};

export type AppConfig = {
  region: string;
  /** RDS Proxy endpoint (or local MySQL host) — same cluster for all tenants. */
  dbHost: string;
  dbPort: number;
  /** Control-plane (shared) database name. */
  controlPlaneDb: string;
  /** Secrets Manager ARN for DB creds; if unset, fall back to env (local dev). */
  dbSecretArn?: string;
};

export function getConfig(): AppConfig {
  return {
    region: process.env.AWS_REGION ?? "us-east-1",
    dbHost: process.env.DB_HOST ?? process.env.RDS_PROXY_ENDPOINT ?? "127.0.0.1",
    dbPort: Number(process.env.DB_PORT ?? 3306),
    controlPlaneDb: process.env.CONTROL_PLANE_DB ?? "control_plane",
    dbSecretArn: process.env.DB_SECRET_ARN,
  };
}

let cachedCreds: DbCredentials | undefined;

/** Resolve DB credentials once (Secrets Manager in AWS, env vars locally). */
export async function getDbCredentials(): Promise<DbCredentials> {
  if (cachedCreds) return cachedCreds;
  const cfg = getConfig();

  if (cfg.dbSecretArn) {
    const sm = new SecretsManagerClient({ region: cfg.region });
    const res = await sm.send(new GetSecretValueCommand({ SecretId: cfg.dbSecretArn }));
    const secret = JSON.parse(res.SecretString ?? "{}");
    cachedCreds = {
      host: secret.host ?? cfg.dbHost,
      port: Number(secret.port ?? cfg.dbPort),
      user: secret.username,
      password: secret.password,
    };
  } else {
    cachedCreds = {
      host: cfg.dbHost,
      port: cfg.dbPort,
      user: process.env.DB_USER ?? "root",
      password: process.env.DB_PASSWORD ?? "",
    };
  }
  return cachedCreds;
}
