/**
 * 主进程为创作者 URL 补签名参数。
 * 在 jsdom 中加载钉死版本的官方脚本；指纹异步就绪后再签名。
 * 脚本失效时抛错并停用相关能力。
 */
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";

/** 官方 bdms 脚本地址；版本随平台更新。 */
export const DOUYIN_BDMS_SRC =
  "https://lf-c-flwb.bytetos.com/obj/rc-client-security/web/stable/1.0.1.16/bdms.js";

const CREATOR_ORIGIN = "https://creator.douyin.com";
const SHELL_PATH = "/creator-micro/content/post/image";
const INIT_READY_MS = 3000;
const SIGN_TIMEOUT_MS = 8000;

type SignFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

interface BdmsWindow {
  bdms?: { init: (options: Record<string, unknown>) => unknown };
  fetch: SignFetch;
  HTMLCanvasElement: { prototype: Record<string, unknown> };
  crypto: Crypto;
  eval: (code: string) => unknown;
  /** 底层 fetch 记录最终 URL（含 bdms 追加的 a_bogus） */
  __pugyingBdmsCapture?: { url: string | null };
}

let cachedScript: string | null = null;
let cachedScriptUrl: string | null = null;
let runtimePromise: Promise<BdmsWindow> | null = null;

export class DouyinBdmsSignError extends Error {
  constructor(
    readonly code: "BDMS_LOAD_FAILED" | "BDMS_SIGN_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "DouyinBdmsSignError";
  }
}

function stubCanvas(window: BdmsWindow): void {
  const proto = window.HTMLCanvasElement.prototype;
  proto.getContext = function getContext() {
    return {
      canvas: this as unknown,
      fillStyle: "",
      font: "",
      textBaseline: "",
      fillRect() {},
      fillText() {},
      beginPath() {},
      arc() {},
      fill() {},
      stroke() {},
      measureText: () => ({ width: 12 }),
      getImageData: () => ({ data: new Uint8ClampedArray(16) }),
      putImageData() {},
      drawImage() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      getExtension: () => null,
      getParameter: () => "Intel",
      getSupportedExtensions: () => [],
      createBuffer() {
        return {};
      },
      bindBuffer() {},
      bufferData() {},
      createProgram() {
        return {};
      },
      createShader() {
        return {};
      },
      shaderSource() {},
      compileShader() {},
      attachShader() {},
      linkProgram() {},
      useProgram() {},
      getAttribLocation: () => 0,
      getUniformLocation: () => ({}),
      enableVertexAttribArray() {},
      vertexAttribPointer() {},
      uniform2f() {},
      drawArrays() {},
      clearColor() {},
      clear() {},
      viewport() {},
      readPixels() {},
      getShaderPrecisionFormat: () => ({
        rangeMin: 0,
        rangeMax: 1,
        precision: 1,
      }),
      VERTEX_SHADER: 35633,
      FRAGMENT_SHADER: 35632,
      HIGH_FLOAT: 36338,
      ARRAY_BUFFER: 34962,
      STATIC_DRAW: 35044,
      FLOAT: 5126,
      COLOR_BUFFER_BIT: 16384,
      TRIANGLES: 4,
    };
  };
  proto.toDataURL = () =>
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
}

async function loadOfficialScript(src = DOUYIN_BDMS_SRC): Promise<string> {
  if (cachedScript && cachedScriptUrl === src) {
    return cachedScript;
  }
  const response = await fetch(src, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    throw new DouyinBdmsSignError(
      "BDMS_LOAD_FAILED",
      "暂时无法自动发布，请稍后重试",
    );
  }
  const text = await response.text();
  if (!text.includes("bdms") || text.length < 1000) {
    throw new DouyinBdmsSignError(
      "BDMS_LOAD_FAILED",
      "暂时无法自动发布，请稍后重试",
    );
  }
  cachedScript = text;
  cachedScriptUrl = src;
  return text;
}

async function createRuntime(
  script: string,
  readyMs = INIT_READY_MS,
): Promise<BdmsWindow> {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: `${CREATOR_ORIGIN}${SHELL_PATH}`,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const window = dom.window as unknown as BdmsWindow;
  Object.defineProperty(window, "crypto", {
    value: webcrypto,
    configurable: true,
  });
  // 官方脚本内部定时器偶发抛错，勿泄漏到宿主进程拖垮测试/发布流程
  dom.window.addEventListener("error", (event) => {
    event.preventDefault();
  });
  dom.window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
  });
  // 须在加载官方脚本前提供 fetch；bdms 会包装它，最终仍落到此处以捕获签名后 URL
  window.__pugyingBdmsCapture = { url: null };
  window.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    window.__pugyingBdmsCapture!.url = url.startsWith("http")
      ? url
      : `${CREATOR_ORIGIN}${url.startsWith("/") ? url : `/${url}`}`;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({}),
      text: async () => "{}",
    };
  };
  stubCanvas(window);
  window.eval(script);
  if (typeof window.bdms?.init !== "function") {
    throw new DouyinBdmsSignError(
      "BDMS_LOAD_FAILED",
      "暂时无法自动发布，请稍后重试",
    );
  }
  window.bdms.init({
    aid: 2906,
    pageId: 0,
    paths: ["^/aweme/", "^/web/api/"],
    boe: false,
    ddrt: 8.5,
    ic: 8.5,
  });
  if (readyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, readyMs));
  }
  return window;
}

async function getRuntime(): Promise<BdmsWindow> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const script = await loadOfficialScript();
      return createRuntime(script);
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

/** 测试用：清空脚本与运行时缓存。 */
export function resetDouyinBdmsSignCache(): void {
  cachedScript = null;
  cachedScriptUrl = null;
  runtimePromise = null;
}

/**
 * 为创作者相对或绝对 URL 补官方 a_bogus。
 * 已含 a_bogus 时原样返回。
 */
export async function signDouyinCreatorUrl(
  pathOrUrl: string,
  options?: { bdmsSrc?: string; script?: string },
): Promise<string> {
  const absolute = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${CREATOR_ORIGIN}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
  if (/[?&]a_bogus=/.test(absolute)) {
    return absolute;
  }

  let window: BdmsWindow;
  if (options?.script) {
    // 注入脚本仅用于单测，无需等待官方指纹异步就绪
    window = await createRuntime(options.script, 0);
  } else if (options?.bdmsSrc) {
    const script = await loadOfficialScript(options.bdmsSrc);
    window = await createRuntime(script);
  } else {
    window = await getRuntime();
  }

  if (!window.__pugyingBdmsCapture) {
    window.__pugyingBdmsCapture = { url: null };
  }
  window.__pugyingBdmsCapture.url = null;
  try {
    await Promise.race([
      window.fetch(absolute, { credentials: "include" }),
      new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(
              new DouyinBdmsSignError(
                "BDMS_SIGN_FAILED",
                "暂时无法自动发布，请稍后重试",
              ),
            ),
          SIGN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    if (error instanceof DouyinBdmsSignError) {
      throw error;
    }
    throw new DouyinBdmsSignError(
      "BDMS_SIGN_FAILED",
      "暂时无法自动发布，请稍后重试",
    );
  }

  const signed = window.__pugyingBdmsCapture.url;
  if (!signed || !/[?&]a_bogus=/.test(signed)) {
    throw new DouyinBdmsSignError(
      "BDMS_SIGN_FAILED",
      "暂时无法自动发布，请稍后重试",
    );
  }
  return signed;
}

/** 指纹调试：脚本内容摘要，不含脚本正文。 */
export function douyinBdmsScriptDigest(script: string): string {
  return createHash("sha256").update(script).digest("hex").slice(0, 16);
}
