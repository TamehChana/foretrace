/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Render (or other) API origin, no trailing slash. Required for production static hosting. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
