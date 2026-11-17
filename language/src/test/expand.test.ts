import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';

function tempDir(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'odlp-'));
}

void describe('expand', () => {
	void test(
		'loads section fragments and keeps offsets in the open file',
		() => {
			const dir = tempDir();
			fs.writeFileSync(path.join(dir, 'c.odlp'), 'C[n]');
			fs.writeFileSync(path.join(dir, 'a.odlp'), 'n: int');
			const source = `Ontology demo
% expand missing.odlp;
atributos { expand a.odlp; }
conceitos { expand c.odlp; }
relacoes { r }
triplos { C = missing => C[n=1] }
.`;
			const file = path.join(dir, 'demo.odlp');
			const result = analyze(source, file);
			const expandAt = source.indexOf('expand c.odlp;');

			assert.deepEqual(result.diagnostics, []);
			assert.equal(result.symbols.concepts.get('C')?.imported, true);
			assert.equal(result.symbols.concepts.get('C')?.start, expandAt);
			assert.equal(
				result.symbols.attributes.get('n')?.type.kind,
				'int'
			);
			const use = source.indexOf('missing =>');
			assert.deepEqual(result.semanticDiagnostics, [{
				severity: 'warning',
				start: use,
				end: use + 'missing'.length,
				message: 'missing not declared'
			}]);
		}
	);

	void test('warns when the expanded file cannot be read', () => {
		const dir = tempDir();
		const source = `Ontology demo
conceitos { expand missing.odlp; C }
relacoes { r }
triplos { C = r => C }
.`;
		const result = analyze(source, path.join(dir, 'demo.odlp'));
		const start = source.indexOf('expand missing.odlp;');

		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(result.semanticDiagnostics, [{
			severity: 'warning',
			start,
			end: start + 'expand missing.odlp;'.length,
			message: 'cannot read missing.odlp'
		}]);
	});

	void test('reports a cycle instead of reading the file again', () => {
		const dir = tempDir();
		const file = path.join(dir, 'demo.odlp');
		const source = `Ontology demo
conceitos { expand demo.odlp; C }
relacoes { r }
triplos { C = r => C }
.`;
		fs.writeFileSync(file, source);
		const result = analyze(source, file);
		const start = source.indexOf('expand demo.odlp;');

		assert.equal(result.semanticDiagnostics[0]?.message,
			'expand cycle at demo.odlp');
		assert.equal(result.semanticDiagnostics[0]?.start, start);
	});
});
