#!/usr/bin/env node
/*
 * tools/audit_external.js
 * - 入力: workflows/wbs.json（任意） と logs/local/*.ndjson
 * - 検証:
 *   * 60秒超過タスク（chunks.ndjson で status=timeout）
 *   * Z_LAYER混在（guard-layer.ndjson で status=error）
 *   * WBS順序違反（events.ndjson の step 進行が wbs.json の順序に反しないか）
 *   * UNKNOWN応答多発（logs 内で文字列 "UNKNOWN" が多数）
 * - 問題あれば非0終了、結果は logs/local/audit.ndjson に保存
 */

const fs = require('fs');
const path = require('path');

const rootDir = process.cwd();
const logsDirectory = path.join(rootDir, 'logs', 'local');
if (!fs.existsSync(logsDirectory)) fs.mkdirSync(logsDirectory, { recursive: true });
const auditLogPath = path.join(logsDirectory, 'audit.ndjson');

function appendAudit(obj) {
	fs.appendFileSync(
		auditLogPath,
		JSON.stringify({ "@timestamp": new Date().toISOString(), ...obj }) + '\n'
	);
}

function readLines(filePath) {
	if (!fs.existsSync(filePath)) return [];
	return fs.readFileSync(filePath, 'utf8').split(/\n/).filter(Boolean);
}

const chunks = readLines(path.join(logsDirectory, 'chunks.ndjson')).map((l) => {
	try { return JSON.parse(l); } catch { return { raw: l }; }
});
const guards = readLines(path.join(logsDirectory, 'guard-layer.ndjson')).map((l) => {
	try { return JSON.parse(l); } catch { return { raw: l }; }
});
const events = readLines(path.join(logsDirectory, 'events.ndjson')).map((l) => {
	try { return JSON.parse(l); } catch { return { raw: l }; }
});

let wbsSteps = [];
try {
	const wbsRaw = fs.readFileSync(path.join(rootDir, 'workflows', 'wbs.json'), 'utf8');
	const obj = JSON.parse(wbsRaw);
	wbsSteps = Array.isArray(obj?.steps) ? obj.steps : [];
} catch {}

let problems = [];
// 60秒超過
if (chunks.some((c) => c?.status === 'timeout' || c?.timeout === true)) problems.push('timeout_tasks');
// Layer 混在
if (guards.some((g) => g?.status === 'error')) problems.push('layer_mixed');
// WBS順序（events の {step:n} が昇順であること）
const stepSeq = events.filter((e) => typeof e?.step === 'number').map((e) => e.step);
if (wbsSteps.length && stepSeq.length) {
	for (let i = 1; i < stepSeq.length; i++) {
		if (stepSeq[i] < stepSeq[i - 1]) { problems.push('wbs_order_violation'); break; }
	}
}
// UNKNOWN 多発（1件でも検知で問題とみなす）
const unknownCount = ['chunks.ndjson', 'events.ndjson', 'proof.ndjson', 'router.ndjson']
	.flatMap((f) => readLines(path.join(logsDirectory, f)))
	.filter((l) => /UNKNOWN/i.test(l)).length;
if (unknownCount > 0) problems.push('unknown_responses');

const result = { status: problems.length ? 'fail' : 'ok', problems, unknownCount };
appendAudit(result);

if (problems.length) { console.error('Audit failed:', problems.join(',')); process.exit(1); }
console.log('Audit ok');


