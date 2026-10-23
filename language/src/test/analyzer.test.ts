import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';

	describe('OntoDL+ analyzer', () => {
	test('accepts the official examples', () => {
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
			assert.deepEqual(result.diagnostics, [], fixtureName);
		}
	});

	test('accepts percent comments and the requested aliases', () => {
		const source = `Ontology demo
% this is a comment
atributos { value: int }
conceitos { C[value:int] }
individuos { x }
relacoes { r[dominio:C, contradominio:C, props:injetiva] }
triplos { x = iof => C }
.`;

		assert.deepEqual(analyze(source).diagnostics, []);
	});

	test('accepts unresolved expand statements mixed with declarations', () => {
		const source = `Ontology demo
atributos { expand extra/data.odlp; value: int }
conceitos { expand extra/classes.odlp; C[value:int] }
relacoes { expand extra/relations.odlp; r }
triplos { expand extra/triples.odlp; x = iof => C }
.`;

		assert.deepEqual(analyze(source).diagnostics, []);
	});

	test('requires separators between declarations and triples', () => {
		const sources = [
			`Ontology demo atributos { value: int other: string } conceitos { C } relacoes { r } triplos { x = iof => C } .`,
			`Ontology demo conceitos { Cidade Ligação } relacoes { r } triplos { x = iof => C } .`,
			`Ontology demo conceitos { C } individuos { x y } relacoes { r } triplos { x = iof => C } .`,
			`Ontology demo conceitos { C } relacoes { r s } triplos { x = iof => C } .`,
			`Ontology demo conceitos { C } relacoes { r } triplos { x = iof => C y = iof => C } .`
		];

		for (const source of sources) {
			assert.ok(analyze(source).diagnostics.length > 0, source);
		}
	});

	test('rejects empty section bodies', () => {
		const sources = [
			'Ontology demo atributos { } conceitos { C } relacoes { r } triplos { x = iof => C } .',
			'Ontology demo conceitos { } relacoes { r } triplos { x = iof => C } .',
			'Ontology demo conceitos { C } individuos { } relacoes { r } triplos { x = iof => C } .',
			'Ontology demo conceitos { C } relacoes { } triplos { x = iof => C } .',
			'Ontology demo conceitos { C } relacoes { r } triplos { } .',
			'Ontology demo conceitos { C } relacoes { r } triplos { x = iof => C } restricoes { } .'
		];

		for (const source of sources) {
			assert.ok(analyze(source).diagnostics.length > 0, source);
		}
	});

	test('accepts restriction relation aliases and unparenthesized negation', () => {
		const source = `Ontology demo
conceitos { B, C }
relacoes { r }
triplos { B = r => C }
restricoes {
	B = r => C :- not B == C, ! B = is-a => C, nao B = iof => C, B = pof => C, B = synonym => C.
} .`;

		assert.deepEqual(analyze(source).diagnostics, []);
	});

	test('reports offsets for slash comments', () => {
		const source = 'Ontology demo // not a comment\nconceitos { C } relacoes { r } triplos { x = iof => C } .';
		const diagnostics = analyze(source).diagnostics;

		assert.ok(diagnostics.length > 0);
		assert.equal(diagnostics[0].start, source.indexOf('//'));
	});

	test('rejects relations as a section keyword', () => {
		const source = 'Ontology demo conceitos { C } relations { r } triplos { x = iof => C } .';

		assert.ok(analyze(source).diagnostics.length > 0);
	});
});
