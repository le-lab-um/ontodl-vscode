import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';

describe('OntoDL+ semantic analysis', () => {
	test('reports no semantic diagnostics for the official examples', () => {
		const fixtureNames = [
			'template.odlp',
			'mapa.txt',
			'mapaWithGroup.txt',
			'mapaWithProps.txt',
			'mapaWithAtribs.txt'
		];

		for (const fixtureName of fixtureNames) {
			const fixturePath = path.resolve(__dirname, '../../test/fixtures', fixtureName);
			const result = analyze(fs.readFileSync(fixturePath, 'utf8'));
			assert.deepEqual(result.semanticDiagnostics, [], fixtureName);
		}
	});

	test('warns about an individual declared more than once', () => {
		const source = `Ontology demo
conceitos { C }
individuos { x, x }
relacoes { r }
triplos { x = iof => C }
.`;
		const duplicate = source.indexOf('x', source.indexOf('x,') + 1);

		const result = analyze(source);

		assert.deepEqual(result.diagnostics, []);
		assert.deepEqual(result.semanticDiagnostics, [{
			severity: 'warning',
			start: duplicate,
			end: duplicate + 1,
			message: 'x declared more than once'
		}]);
	});
});
