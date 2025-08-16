#!/usr/bin/env node
/*
 * tools/run_chunk.js
 * - 使い方: node tools/run_chunk.js "<command string>"
 * - 60秒以内に終了しなければ強制終了（timeout=true, exit=124）
 * - 結果を stdout と logs/local/chunks.ndjson に NDJSON で1行追記
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const commandLine = process.argv.slice(2).join(' ').trim();
if (!commandLine) {
	console.error('Usage: node tools/run_chunk.js "<command>"');
	process.exit(2);
}

const logsDirectory = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDirectory)) fs.mkdirSync(logsDirectory, { recursive: true });
const chunksLogPath = path.join(logsDirectory, 'chunks.ndjson');

function appendNdjson(result) {
	const line = JSON.stringify({
		"@timestamp": new Date().toISOString(),
		name: 'chunk',
		...result
	});
	fs.appendFileSync(chunksLogPath, line + '\n');
	process.stdout.write(line + '\n');
}

const startedAt = Date.now();
const isWindows = process.platform === 'win32';
const child = spawn(
	isWindows ? 'powershell' : 'bash',
	isWindows ? ['-NoProfile', '-Command', commandLine] : ['-lc', commandLine],
	{ stdio: ['ignore', 'inherit', 'inherit'] }
);

let didTimeout = false;
const timeoutMs = 60_000;
const timer = setTimeout(() => {
	didTimeout = true;
	try { child.kill('SIGTERM'); } catch {}
	try { if (!isWindows) process.kill(-child.pid, 'SIGKILL'); } catch {}
	appendNdjson({
		status: 'timeout',
		exitCode: null,
		timeout: true,
		elapsedMs: Date.now() - startedAt,
		command: commandLine
	});
	process.exit(124);
}, timeoutMs);

child.on('exit', (code) => {
	clearTimeout(timer);
	if (!didTimeout) {
		appendNdjson({
			status: code === 0 ? 'ok' : 'error',
			exitCode: code,
			timeout: false,
			elapsedMs: Date.now() - startedAt,
			command: commandLine
		});
		process.exit(code ?? 1);
	}
});


