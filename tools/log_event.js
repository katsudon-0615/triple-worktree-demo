#!/usr/bin/env node
/*
 * tools/log_event.js
 * - stdin を1件の行として logs/local/events.ndjson に追記
 * - 入力が空の場合は何もしない
 */

const fs = require('fs');
const path = require('path');

const logsDirectory = path.join(process.cwd(), 'logs', 'local');
if (!fs.existsSync(logsDirectory)) fs.mkdirSync(logsDirectory, { recursive: true });
const eventsLogPath = path.join(logsDirectory, 'events.ndjson');

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (buffer += chunk));
process.stdin.on('end', () => {
	const line = buffer.trim();
	if (!line) process.exit(0);
	fs.appendFileSync(eventsLogPath, line.replace(/\n+$/, '') + '\n');
	process.stdout.write('OK\n');
});


