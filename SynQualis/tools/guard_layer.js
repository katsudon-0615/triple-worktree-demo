#!/usr/bin/env node
/*
 * tools/guard_layer.js
 * - env.Z_LAYER を確認
 * - logs/local/active-layer.json との不一致（異なる layer が最近アクティブ）なら非0終了
 * - ログを logs/local/guard-layer.ndjson に追記
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const lockPath = path.join(logsDir, 'active-layer.json');
const logPath = path.join(logsDir, 'guard-layer.ndjson');

function log(obj){ fs.appendFileSync(logPath, JSON.stringify({"@timestamp": new Date().toISOString(), ...obj})+'\n'); }

const layer = process.env.Z_LAYER || 'unknown';
let active = null; let updatedAt = null;
if (fs.existsSync(lockPath)) {
	try { const j = JSON.parse(fs.readFileSync(lockPath,'utf8')); active = j.layer; updatedAt = j.updatedAt; } catch {}
}

if (active && active !== layer) {
	log({ status: 'error', current: layer, active, updatedAt });
	console.error(`Layer mismatch: current=${layer} active=${active}`);
	process.exit(1);
}

log({ status: 'ok', current: layer, active, updatedAt });
process.stdout.write('OK\n');
