#!/usr/bin/env node
/*
 * gate-right.js (後段ゲート)
 * - 品質検証: Q>=0.85、pass>=0.95、UNKNOWN=0
 * - JSONスキーマ準拠（tools/proof-check.js を内部で呼び出し）
 * - 不合格→非0終了、logs/local/gate-fail.ndjson に記録
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p,{recursive:true}); }
function logNdjson(file, obj){ fs.appendFileSync(file, JSON.stringify({"@timestamp":new Date().toISOString(), ...obj})+'\n'); }

(function main(){
	const root = process.cwd();
	const logsDir = path.join(root,'logs','local');
	ensureDir(logsDir);
	const failLog = path.join(logsDir,'gate-fail.ndjson');

	// STDIN で LLM応答(JSON)を受け取る
	let buf='';
	process.stdin.setEncoding('utf8');
	process.stdin.on('data', c=>buf+=c);
	process.stdin.on('end', ()=>{
		let data;
		try { data = JSON.parse(buf); } catch(e) {
			logNdjson(failLog,{gate:'right',stage:'parse',status:'error',message:String(e)});
			console.error('Invalid JSON');
			process.exit(2);
		}

		// スキーマ検証（tools/proof-check.js へパイプ）
		const proof = spawnSync(process.execPath, ['tools/proof-check.js'], { input: JSON.stringify(data), encoding: 'utf8' });
		if (proof.status !== 0) {
			logNdjson(failLog,{gate:'right',stage:'schema',status:'error',code:proof.status,stderr:proof.stderr});
			process.stderr.write(proof.stderr||'');
			process.exit(1);
		}

		// 品質メトリクス
		const q = Number(data?.metrics?.Q ?? 0);
		const pass = Number(data?.metrics?.pass ?? 0);
		const unknown = Number(data?.metrics?.UNKNOWN ?? 0);
		if (!(q >= 0.85 && pass >= 0.95 && unknown === 0)) {
			logNdjson(failLog,{gate:'right',stage:'quality',status:'error',q,pass,unknown});
			console.error('Quality gate failed');
			process.exit(1);
		}

		process.stdout.write('OK\n');
		process.exit(0);
	});
})();
