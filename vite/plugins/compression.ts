import { PluginOption } from 'vite'
import compression from 'vite-plugin-compression'

export default function createCompression(env: Record<string, string>) {
  const { VITE_BUILD_COMPRESS } = env
  const plugin: PluginOption[] = []
  if (VITE_BUILD_COMPRESS) {
    const compressList = VITE_BUILD_COMPRESS.split(',')
    if (compressList.includes('gzip')) {
      // https://stepby.tzkj.net/docs/faq#gzip
      plugin.push(
        compression({
          ext: '.gz',
          deleteOriginFile: false
        })
      )
    }
    if (compressList.includes('brotli')) {
      plugin.push(
        compression({
          ext: '.br',
          algorithm: 'brotliCompress',
          deleteOriginFile: false
        })
      )
    }
  }
  return plugin
}
