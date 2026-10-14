/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 构建时从 server/package.json 注入的统一产品版本 */
  readonly VITE_PRODUCT_VERSION: string;
  /** `hash`：桌面端 loadFile；缺省为浏览器 History 路由 */
  readonly VITE_ROUTER_MODE?: string;
  /** 可选；桌面端运行时由 pugyingDesktop.getApiBaseUrl 覆盖 */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
