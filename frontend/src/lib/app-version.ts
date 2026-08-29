/** 统一发版产品版本；构建时由 vite 从 backend/package.json 注入 */
export const PRODUCT_VERSION: string = import.meta.env.VITE_PRODUCT_VERSION;

/** @deprecated 使用 PRODUCT_VERSION */
export const APP_VERSION = PRODUCT_VERSION;
