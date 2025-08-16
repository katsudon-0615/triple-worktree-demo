#!/usr/bin/env node
/*
 * ローカルLLM起動ヘルパー
 * 引数: <model> <port> [options...]
 * - ランタイム検出: LM Studio / Ollama / llama.cpp (適合する順で選択)
 * - ログ: logs/local/llm-<model>-<port>.ndjson に追記
 * - 失敗時は非0終了
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function logLine(stream, level, msg, extra = {}) {
	const line = JSON.stringify({
		"@timestamp": new Date().toISOString(),
		level,
		message: msg,
		...extra,
	});
	stream.write(line + '\n');
}

function ensureDir(p) {
	if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function which(cmd) {
	const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
	const paths = process.env.PATH.split(path.delimiter);
	for (const p of paths) {
		for (const e of exts) {
			const full = path.join(p, cmd + e);
			if (fs.existsSync(full)) return full;
		}
	}
	return null;
}

function detectRuntimes() {
	return {
		ollama: which('ollama'),
		lmstudio: which('lmstudio'),
		llamacpp: which('main'), // llama.cpp build artifact (e.g., ./main)
	};
}

function buildCommand(runtime, model, port, extra) {
	switch (runtime) {
		case 'ollama':
			// ollama run（推論サーバ兼用）。ポート切替を引数で渡す。
			return { cmd: 'ollama', args: ['run', model, '--port', String(port), ...extra] };
		case 'lmstudio':
			// 仮: CLI がモデル/ポート起動に対応している場合
			return { cmd: 'lmstudio', args: ['start', '--model', model, '--port', String(port), ...extra] };
		case 'llamacpp':
			// 代表例: main -m ./models/<model>.gguf --port <port>
			return { cmd: 'main', args: ['-m', `./models/${model}.gguf`, '--port', String(port), ...extra] };
		default:
			return null;
	}
}

function main() {
	const [, , model, portStr, ...options] = process.argv;
	if (!model || !portStr) {
		console.error('Usage: start_local.js <model> <port> [options...]');
		process.exit(2);
	}
	const port = Number(portStr);
	if (!Number.isInteger(port) || port <= 0) {
		console.error('Invalid port');
		process.exit(2);
	}

	const logsDir = path.join('logs', 'local');
	ensureDir(logsDir);
	const logPath = path.join(logsDir, `llm-${model}-${port}.ndjson`);
	const log = fs.createWriteStream(logPath, { flags: 'a' });

	const runtimes = detectRuntimes();
	const order = [];
	if (runtimes.lmstudio) order.push('lmstudio');
	if (runtimes.ollama) order.push('ollama');
	if (runtimes.llamacpp) order.push('llamacpp');

	if (order.length === 0) {
		logLine(log, 'error', 'No local runtime found (LM Studio / Ollama / llama.cpp)');
		console.error('No local runtime found');
		process.exit(1);
	}

	let started = false;
	for (const rt of order) {
		const plan = buildCommand(rt, model, port, options);
		if (!plan) continue;
		logLine(log, 'info', 'starting', { runtime: rt, model, port, options });
		try {
			const child = spawn(plan.cmd, plan.args, { stdio: ['ignore', 'pipe', 'pipe'] });
			child.stdout.on('data', (d) => logLine(log, 'info', d.toString().trim()));
			child.stderr.on('data', (d) => logLine(log, 'warn', d.toString().trim()));
			child.on('exit', (code) => logLine(log, 'info', 'process exit', { code }));
			started = true;
			break;
		} catch (e) {
			logLine(log, 'error', 'spawn failed', { runtime: rt, error: String(e) });
		}
	}

	if (!started) {
		console.error('All runtimes failed');
		process.exit(1);
	}
}

main();
