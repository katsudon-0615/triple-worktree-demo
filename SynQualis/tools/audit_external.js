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

const root = process.cwd();
const logsDir = path.join(root, 'logs', 'local');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const auditPath = path.join(logsDir, 'audit.ndjson');

function writeAudit(obj){ fs.appendFileSync(auditPath, JSON.stringify({"@timestamp": new Date().toISOString(), ...obj})+'\n'); }

function readLines(p){ if(!fs.existsSync(p)) return []; return fs.readFileSync(p,'utf8').split(/\n/).filter(Boolean); }

const chunks = readLines(path.join(logsDir,'chunks.ndjson')).map(l=>{ try{return JSON.parse(l);}catch{return {raw:l}}});
const guards = readLines(path.join(logsDir,'guard-layer.ndjson')).map(l=>{ try{return JSON.parse(l);}catch{return {raw:l}}});
const events = readLines(path.join(logsDir,'events.ndjson')).map(l=>{ try{return JSON.parse(l);}catch{return {raw:l}}});

let wbs = [];
try {
	const wbsRaw = fs.readFileSync(path.join(root,'workflows','wbs.json'),'utf8');
	const obj = JSON.parse(wbsRaw);
	wbs = Array.isArray(obj?.steps) ? obj.steps : [];
} catch {}

let problems = [];
// 60秒超過
if (chunks.some(c=>c?.status==='timeout' || c?.timeout===true)) problems.push('timeout_tasks');
// Layer 混在
if (guards.some(g=>g?.status==='error')) problems.push('layer_mixed');
// WBS順序（events の {step:n} が昇順であること）
const stepSeq = events.filter(e=>typeof e?.step==='number').map(e=>e.step);
if (wbs.length && stepSeq.length){
	for (let i=1;i<stepSeq.length;i++){ if (stepSeq[i] < stepSeq[i-1]) { problems.push('wbs_order_violation'); break; } }
}
// UNKNOWN 多発
const unknownCount = ['chunks.ndjson','events.ndjson','proof.ndjson','router.ndjson']
	.flatMap(f=>readLines(path.join(logsDir,f)))
	.filter(l=>/UNKNOWN/i.test(l)).length;
if (unknownCount > 0) problems.push('unknown_responses');

const result = { status: problems.length? 'fail':'ok', problems, unknownCount };
writeAudit(result);

if (problems.length) { console.error('Audit failed:', problems.join(',')); process.exit(1); }
console.log('Audit ok');
