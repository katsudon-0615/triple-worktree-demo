#!/usr/bin/env node
// ルート → SynQualis 配下の proof-check を cwd 指定で委譲
const { spawnSync } = require('child_process');
const path = require('path');
const cwd = path.join(process.cwd(), 'SynQualis');
const result = spawnSync(process.execPath, ['tools/proof-check.js'], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);


