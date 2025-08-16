#!/usr/bin/env node
/*
 * tools/log_event.js
 * - stdin を1件の行として logs/local/events.ndjson に追記
 * - 入力が空の場合は何もしない
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logPath = path.join(logsDir, 'events.ndjson');

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (buf += c));
process.stdin.on('end', () => {
	const line = buf.trim();
	if (!line) process.exit(0);
	// そのまま1行として追記
	fs.appendFileSync(logPath, line.replace(/\n+$/,'') + '\n');
	process.stdout.write('OK\n');
});
