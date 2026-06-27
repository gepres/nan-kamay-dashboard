/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly DASH_USER?: string;
  readonly DASH_PASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
