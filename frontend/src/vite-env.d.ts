/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建时从 backend/package.json 注入的统一产品版本 */
  readonly VITE_PRODUCT_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
