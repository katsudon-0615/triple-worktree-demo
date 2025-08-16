#!/usr/bin/env node
/*
 * tools/guard_layer.js
 * - env.Z_LAYER を確認
 * - logs/local/active-layer.json との不一致（異なる layer が最近アクティブ）なら非0終了
 * - 成功時は active-layer.json を現在の layer で更新
 * - ログを logs/local/guard-layer.ndjson に追記
 */

const fs = require('fs');
const path = require('path');

const logsDirectory = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDirectory)) fs.mkdirSync(logsDirectory, { recursive: true });
const activePath = path.join(logsDirectory, 'active-layer.json');
const guardLogPath = path.join(logsDirectory, 'guard-layer.ndjson');

function log(obj) {
	fs.appendFileSync(
		guardLogPath,
		JSON.stringify({ "@timestamp": new Date().toISOString(), ...obj }) + '\n'
	);
}

const currentLayer = process.env.Z_LAYER || 'unknown';
let activeLayer = null;
let updatedAt = null;
if (fs.existsSync(activePath)) {
	try {
		const j = JSON.parse(fs.readFileSync(activePath, 'utf8'));
		activeLayer = j.layer;
		updatedAt = j.updatedAt;
	} catch {}
}

if (activeLayer && activeLayer !== currentLayer) {
	log({ status: 'error', current: currentLayer, active: activeLayer, updatedAt });
	console.error(`Layer mismatch: current=${currentLayer} active=${activeLayer}`);
	process.exit(1);
}

// 更新して固定化（混在検知を有効にする）
const nextState = { layer: currentLayer, updatedAt: new Date().toISOString() };
try { fs.writeFileSync(activePath, JSON.stringify(nextState, null, 2)); } catch {}

log({ status: 'ok', current: currentLayer, active: activeLayer, updatedAt });
process.stdout.write('OK\n');


