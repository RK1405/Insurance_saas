const env = process.env;

const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production');
}

export const config = {
  isProd,
  secureCookies: isProd && env.COOKIE_INSECURE !== 'true',
  port: Number(env.PORT || 8080),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/healthstack',
  databaseSsl: env.DATABASE_SSL === 'true',
  jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me-dev-only-secret',
  sessionHours: Number(env.SESSION_HOURS || 12),
  seedDemo: env.SEED_DEMO === 'true',
  allowRegistration: env.ALLOW_REGISTRATION !== 'false',
  webDist: env.WEB_DIST || new URL('../../web/dist', import.meta.url).pathname,
};
