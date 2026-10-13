// Tailwind v4 PostCSS 管线（与 @tailwindcss/vite 等价，但原生产出 sourcemap）
// 背景：vite.config build.sourcemap='hidden'（R102-SMAP-001）要求所有产物带 .map；
// @tailwindcss/vite 插件不产出 → CSS 零 .map + SOURCEMAP_BROKEN 告警。
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
