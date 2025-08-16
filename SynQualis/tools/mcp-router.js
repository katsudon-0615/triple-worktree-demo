#!/usr/bin/env node
/*
 * MCP Router: task/len/need_speed/need_precision で送信先LLMを決定し、
 * OpenAI互換 /v1/chat/completions へHTTP転送。応答は NDJSON ログへ記録。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const configPath = path.join(process.cwd(), '.cursor', 'mcp.json');
const logDir = path.join(process.cwd(), 'logs', 'local');
const logPath = path.join(logDir, 'router.ndjson');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function logLine(obj) {
	fs.appendFileSync(logPath, JSON.stringify({
		"@timestamp": new Date().toISOString(),
		...obj
	}) + '\n');
}

function readConfig() {
	const raw = fs.readFileSync(configPath, 'utf8');
	return JSON.parse(raw);
}

function pickTarget(settings, meta) {
	const rules = settings.mcpSettings?.route?.rules || [];
	const targets = settings.mcpSettings?.route?.targets || {};
	for (const r of rules) {
		const w = r.when || {};
		const ok = (
			(w.otherwise === true) ||
			((w.task === undefined || w.task === meta.task) &&
			 (w.need_speed === undefined || !!w.need_speed === !!meta.need_speed) &&
			 (w.need_precision === undefined || !!w.need_precision === !!meta.need_precision) &&
			 (w.len_lte === undefined || (meta.len || 0) <= w.len_lte) &&
			 (w.len_gt === undefined || (meta.len || 0) > w.len_gt))
		);
		if (ok) return targets[r.to];
	}
	return null;
}

function hostFromUrl(u) {
	try { return new URL(u).hostname; } catch { return null; }
}

function inAllowlist(settings, baseUrl) {
	const host = hostFromUrl(baseUrl);
	const allow = settings.mcpSettings?.security?.allowlist || [];
	const denyCloud = !!settings.mcpSettings?.security?.deny_cloud;
	if (!host) return false;
	if (allow.length && !allow.includes(host)) return false;
	if (denyCloud && !(host === '127.0.0.1' || host.endsWith('.local') || host.startsWith('lan-'))) return false;
	return true;
}

function httpPostJson(urlStr, bodyObj) {
	return new Promise((resolve, reject) => {
		const u = new URL(urlStr);
		const payload = JSON.stringify(bodyObj);
		const lib = u.protocol === 'https:' ? https : http;
		const req = lib.request({
			hostname: u.hostname,
			port: u.port || (u.protocol === 'https:' ? 443 : 80),
			path: u.pathname + u.search,
			method: 'POST',
			headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
		}, (res) => {
			let data = '';
			res.on('data', (c) => data += c);
			res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
		});
		req.on('error', reject);
		req.write(payload);
		req.end();
	});
}

async function routeOnce(meta, oaiBody) {
	const settings = readConfig();
	const target = pickTarget(settings, meta);
	if (!target || !target.baseUrl) throw new Error('No target resolved');
	if (!inAllowlist(settings, target.baseUrl)) throw new Error('Target not in allowlist or denied');
	const url = new URL('/v1/chat/completions', target.baseUrl).toString();
	const res = await httpPostJson(url, oaiBody);
	return res;
}

async function main() {
	// stdin から1リクエストJSONを受け取る（MCP簡易想定）
	const input = await new Promise((resolve) => {
		let buf = '';
		process.stdin.on('data', (c) => buf += c);
		process.stdin.on('end', () => resolve(buf));
	});
	let req;
	try { req = JSON.parse(input); } catch { process.stderr.write('Invalid JSON'); process.exit(2); }

	// メタ + OpenAI互換 body
	const meta = req.meta || {};
	const body = req.body || {};
	try {
		const res = await routeOnce(meta, body);
		logLine({ meta, target: 'resolved', status: res.status, bytes: res.body?.length || 0 });
		process.stdout.write(JSON.stringify({ status: 'ok', http_status: res.status, body: res.body }) + '\n');
	} catch (e) {
		logLine({ meta, error: String(e) });
		process.stdout.write(JSON.stringify({ status: 'error', message: String(e) }) + '\n');
		process.exit(1);
	}
}

main();
