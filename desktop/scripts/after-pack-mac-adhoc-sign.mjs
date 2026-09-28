/**
 * 打包后对整包做 ad-hoc deep 签名。
 * 目的：下载带隔离属性时走「无法验证开发者 / 仍要打开」，而不是「已损坏」。
 * identity 设为 null，由本钩子统一签名，确保 extraResources（本机 Server / native）一并覆盖。
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const entitlements = path.join(__dirname, '../build/entitlements.mac.plist')

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  // --options runtime = Hardened Runtime；entitlements 含 disable-library-validation（ad-hoc 必需）
  const sign = spawnSync(
    'codesign',
    [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--timestamp=none',
      '--options',
      'runtime',
      '--entitlements',
      entitlements,
      appPath,
    ],
    { encoding: 'utf8' },
  )
  if (sign.status !== 0) {
    const detail = [sign.stderr, sign.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`macOS ad-hoc codesign failed for ${appPath}${detail ? `\n${detail}` : ''}`)
  }

  const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    encoding: 'utf8',
  })
  if (verify.status !== 0) {
    const detail = [verify.stderr, verify.stdout].filter(Boolean).join('\n').trim()
    throw new Error(`macOS ad-hoc signature verify failed for ${appPath}${detail ? `\n${detail}` : ''}`)
  }

  console.log(`[afterPack] ad-hoc signed: ${appPath}`)
}
