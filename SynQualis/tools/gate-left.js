#!/usr/bin/env node
/*
 * gate-left.js (前段ゲート)
 * - deny_cloud: .cursor/mcp.json を読み取りクラウド接続を禁止
 * - layer混在検知: logs/local/active-layer.json をロックとして参照（別レイヤーが稼働中なら拒否）
 * - トークン長チェック: >8K 警告, >16K 拒否（概算: chars/4）
 * - 代表APIキーは __DISABLED__ であることを確認
 * 入力: STDIN に任意JSON（meta/body/messages等）
 */

const fs = require('fs');
const path = require('path');

function readStdin() {
	return new Promise((resolve) => {
		let buf = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (c) => (buf += c));
		process.stdin.on('end', () => resolve(buf));
	});
}

function safeJson(str) { try { return JSON.parse(str); } catch { return null; } }

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function logNdjson(file, obj) {
	const line = JSON.stringify({ "@timestamp": new Date().toISOString(), ...obj }) + '\n';
	fs.appendFileSync(file, line);
}

function approxTokensFromMessages(messages) {
	if (!Array.isArray(messages)) return 0;
	let chars = 0;
	for (const m of messages) {
		if (!m) continue;
		const c = typeof m.content === 'string' ? m.content : (Array.isArray(m.content) ? m.content.map(x => x?.text || '').join(' ') : '');
		chars += (c || '').length;
	}
	return Math.floor(chars / 4);
}

function checkApiKeysEnv() {
	const keys = [
		'OPENAI_API_KEY','ANTHROPIC_API_KEY','AZURE_OPENAI_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY',
		'HUGGINGFACEHUB_API_TOKEN','HF_TOKEN','MISTRAL_API_KEY','COHERE_API_KEY','DEEPSEEK_API_KEY',
		'TOGETHER_API_KEY','XAI_API_KEY','GROQ_API_KEY','NVIDIA_API_KEY'
	];
	const bad = [];
	for (const k of keys) {
		const v = process.env[k];
		if (v && v !== '__DISABLED__') bad.push(k);
	}
	return bad;
}

(function main(){
	const root = process.cwd();
	const logsDir = path.join(root, 'logs', 'local');
	const leftLog = path.join(logsDir, 'gate-left.ndjson');
	const layerLock = path.join(logsDir, 'active-layer.json');
	ensureDir(logsDir);

	const configPath = path.join(root, '.cursor', 'mcp.json');
	let denyCloudOk = false;
	try {
		const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
		denyCloudOk = !!cfg?.mcpSettings?.security?.deny_cloud;
	} catch {}

	if (!denyCloudOk) {
		logNdjson(leftLog, { gate: 'deny_cloud', status: 'error', message: 'deny_cloud is not enabled' });
		console.error('deny_cloud must be enabled');
		process.exit(1);
	}

	const layer = process.env.Z_LAYER || 'unknown';
	try {
		if (fs.existsSync(layerLock)) {
			const j = JSON.parse(fs.readFileSync(layerLock,'utf8'));
			const last = new Date(j?.updatedAt || 0).getTime();
			const ageMs = Date.now() - last;
			if (j?.layer && j.layer !== layer && ageMs < 2*60*60*1000) {
				logNdjson(leftLog, { gate: 'layer_mixing', status: 'error', current: layer, active: j.layer });
				console.error(`Layer mixing detected: active=${j.layer} current=${layer}`);
				process.exit(1);
			}
		}
		fs.writeFileSync(layerLock, JSON.stringify({ layer, pid: process.pid, updatedAt: new Date().toISOString() }, null, 2));
	} catch (e) {
		logNdjson(leftLog, { gate: 'layer_lock', status: 'warn', message: String(e) });
	}

	readStdin().then((raw)=>{
		const req = safeJson(raw) || {};
		const messages = req?.body?.messages || req?.messages || [];
		let len = req?.meta?.len;
		if (!len) len = approxTokensFromMessages(messages);

		const badKeys = checkApiKeysEnv();
		if (badKeys.length) {
			logNdjson(leftLog, { gate: 'api_keys', status: 'error', keys: badKeys });
			console.error('External API keys must be "__DISABLED__"');
			process.exit(1);
		}

		if (len > 16000) {
			logNdjson(leftLog, { gate: 'tokens', status: 'error', len });
			console.error('Token length exceeds 16k; rejected');
			process.exit(1);
		}
		if (len > 8000) {
			logNdjson(leftLog, { gate: 'tokens', status: 'warn', len });
			console.warn('Token length > 8k; proceed with caution');
		}

		logNdjson(leftLog, { gate: 'left', status: 'ok', layer, len });
		process.stdout.write('OK\n');
		process.exit(0);
	});
})();
