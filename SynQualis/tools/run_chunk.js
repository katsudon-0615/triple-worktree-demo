#!/usr/bin/env node
/*
 * tools/run_chunk.js
 * - 使い方: node tools/run_chunk.js "<command string>"
 * - 60秒以内に終了しなければ kill（timeout=true）
 * - 結果を stdout と logs/local/chunks.ndjson に NDJSON で1行追記
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const cmdLine = process.argv.slice(2).join(' ').trim();
if (!cmdLine) {
	console.error('Usage: node tools/run_chunk.js "<command>"');
	process.exit(2);
}

const logsDir = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logPath = path.join(logsDir, 'chunks.ndjson');

function log(result) {
	const line = JSON.stringify({
		"@timestamp": new Date().toISOString(),
		...result
	});
	fs.appendFileSync(logPath, line + '\n');
	process.stdout.write(line + '\n');
}

const child = spawn(process.platform === 'win32' ? 'powershell' : 'bash', process.platform === 'win32' ? ['-NoProfile','-Command', cmdLine] : ['-lc', cmdLine], { stdio: ['ignore','inherit','inherit'] });

let killed = false;
const timer = setTimeout(() => {
	killed = true;
	try { process.platform === 'win32' ? child.kill('SIGTERM') : process.kill(-child.pid, 'SIGKILL'); } catch {}
	try { child.kill(); } catch {}
	log({ name: 'chunk', status: 'timeout', exitCode: null, timeout: true });
	process.exit(124);
}, 60000);

child.on('exit', (code) => {
	clearTimeout(timer);
	if (!killed) {
		log({ name: 'chunk', status: code === 0 ? 'ok' : 'error', exitCode: code, timeout: false });
		process.exit(code ?? 1);
	}
});
