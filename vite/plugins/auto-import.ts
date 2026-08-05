import autoImport from 'unplugin-auto-import/vite'

export default function createAutoImport() {
  return autoImport({
    imports: [
      'vue',
      'vue-router',
      'pinia',
      {
        '@/utils/dict': ['useDict'],
        '@/utils/yebot': ['selectDictLabel'],
        'vue-i18n': ['useI18n']
      }
    ],
    dts: true
  })
}
