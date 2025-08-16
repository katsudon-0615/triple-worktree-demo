#!/usr/bin/env node
/*
 * proof-check.js
 * - 入力: STDIN から1つの JSON を受け取り、prompts/schema.json で検証
 * - 失敗時: 非0終了・エラーメッセージを出力
 * - ログ: logs/local/proof.ndjson に結果を追記
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

(async function main() {
	const root = process.cwd();
	const schemaPath = path.join(root, 'prompts', 'schema.json');
	const logsDir = path.join(root, 'logs', 'local');
	const logPath = path.join(logsDir, 'proof.ndjson');
	if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

	const input = await new Promise((resolve) => {
		let buf = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (c) => (buf += c));
		process.stdin.on('end', () => resolve(buf));
	});

	let data;
	try {
		data = JSON.parse(input);
	} catch (e) {
		const line = JSON.stringify({ "@timestamp": new Date().toISOString(), status: 'invalid_json', message: String(e) }) + '\n';
		fs.appendFileSync(logPath, line);
		console.error('Invalid JSON');
		process.exit(2);
	}

	const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
	const ajv = new Ajv({ allErrors: true, strict: false });
	const validate = ajv.compile(schema);
	const valid = validate(data);

	const result = {
		"@timestamp": new Date().toISOString(),
		status: valid ? 'ok' : 'error',
		errors: valid ? [] : (validate.errors || [])
	};
	fs.appendFileSync(logPath, JSON.stringify(result) + '\n');

	if (!valid) {
		console.error('Schema validation failed');
		console.error(JSON.stringify(validate.errors, null, 2));
		process.exit(1);
	}

	process.stdout.write('OK\n');
	process.exit(0);
})();
