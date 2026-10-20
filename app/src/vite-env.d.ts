/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_DEFAULT_SERVER?: string;
  readonly VITE_APP_VERSION?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
