/* 测试编译产物标记为 CommonJS（项目 package.json 是 ESM，编译输出需要独立声明） */
const fs = require('fs');
const path = require('path');
fs.mkdirSync(path.join(__dirname, '..', '.tmp-test'), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, '..', '.tmp-test', 'package.json'),
  JSON.stringify({ type: 'commonjs' }),
);
