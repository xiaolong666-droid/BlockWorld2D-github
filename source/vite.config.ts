/**
 * vite.config.ts —— 构建配置
 * - base: './' 相对路径，便于任意目录部署
 * - viteSingleFile: 把 JS/CSS 全部内联进一个 index.html，
 *   构建产物 dist/index.html 支持双击直接打开（file:// 协议）
 */

import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
});
