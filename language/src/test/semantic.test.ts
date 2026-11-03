import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';

describe('OntoDL+ semantic analysis', () => {
	test('reports no semantic diagnostics for the official examples', () => {
		const fixtureNames = [
			'template.odlp',
			'mapa.odlp',
			'mapaWithGroup.odlp',
			'mapaWithProps.odlp',
			'mapaWithAtribs.odlp'
		];

		for (const fixtureName of fixtureNames) {
			const fixturePath = path.resolve(__dirname,
				'../../test/fixtures',
				fixtureName);
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

	test('accepts declared names, attributes, domains and inverses', () => {
		const source = `Ontology demo
atributos { n: int, color: enum(red, blue) }
conceitos { C[n, color, note:string] }
individuos { x }
relacoes { r[dominio:C, contradominio:C, props:inversaDe=s], s }
triplos { x = iof => C[n=1, color=red, note="hello"] }
.`;

		assert.deepEqual(analyze(source).diagnostics, []);
		assert.deepEqual(analyze(source).semanticDiagnostics, []);
	});

	test('warns about undeclared names in a triple', () => {
		const source = `Ontology demo
conceitos { C }
individuos { x }
relacoes { r }
triplos {
	missingSubject = iof => C;
	x = iof => MissingConcept;
	x = missingRel => C
}
.`;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(source, 'missingSubject', 'missingSubject not declared'),
			warning(source, 'MissingConcept', 'MissingConcept not declared'),
			warning(source, 'missingRel', 'missingRel not declared')
		]);
	});

	test('warns when a relation is used as a triple object', () => {
		const source = `Ontology demo
conceitos { C }
individuos { x }
relacoes { likes }
triplos { x = iof => likes }
.`;
		const start = source.lastIndexOf('likes');

		assert.deepEqual(analyze(source).semanticDiagnostics, [{
			severity: 'warning',
			start,
			end: start + 'likes'.length,
			message: 'likes not declared'
		}]);
	});

	test('warns about undeclared names in a grouped triple', () => {
		const source = `Ontology demo
conceitos { C }
individuos { x }
relacoes { r }
triplos { x =[ iof => MissingConcept; missingRel => one, two ] }
.`;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(source, 'MissingConcept', 'MissingConcept not declared'),
			warning(source, 'missingRel', 'missingRel not declared'),
			warning(source, 'one', 'one not declared'),
			warning(source, 'two', 'two not declared')
		]);
	});

	test('warns about concepts and relations declared more than once', () => {
		const source = `Ontology demo
conceitos { City, City }
relacoes { links, links }
triplos { City = links => City }
.`;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(source, 'City', 'City declared more than once', 1),
			warning(source, 'links', 'links declared more than once', 1)
		]);
	});

	test('warns when domain or counterdomain is not a concept', () => {
		const source = `Ontology demo
conceitos { C }
individuos { x }
relacoes { r[dominio:MissingConcept, contradominio:x] }
triplos { x = iof => C }
.`;
		const counterdomain = source.indexOf('contradominio:')
			+ 'contradominio:'.length;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(
				source,
				'MissingConcept',
				'MissingConcept is not a concept'
			),
			{
				severity: 'warning',
				start: counterdomain,
				end: counterdomain + 1,
				message: 'x is not a concept'
			}
		]);
	});

	test('warns when an inverse is not a relation', () => {
		const source = `Ontology demo
conceitos { C }
relacoes { r[props:inversaDe=missingRel] }
triplos { C = r => C }
.`;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(source, 'missingRel', 'missingRel is not a relation')
		]);
	});

	test('warns about attribute names and values in triples', () => {
		const source = `Ontology demo
atributos { n: int, label: string }
conceitos { C[n, label, ghost] }
individuos { x }
relacoes { r }
triplos { x = iof => C[n="no", label=1, other="a"] }
.`;

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			warning(source, 'ghost', 'ghost not declared'),
			warning(source, '"no"', 'n value does not match its type'),
			warning(source, '1', 'label value does not match its type'),
			warning(source, 'other', 'other not declared')
		]);
	});

	test('warns when an attribute type conflicts with a previous one', () => {
		const source = `Ontology demo
atributos { count: int, count: string }
conceitos { C[count:string] }
relacoes { r }
triplos { C = r => C }
.`;
		const secondCount = source.indexOf('count: string');
		const conceptCount = source.indexOf('count:string');

		assert.deepEqual(analyze(source).semanticDiagnostics, [
			{
				severity: 'warning',
				start: secondCount,
				end: secondCount + 'count'.length,
				message: 'count declared more than once'
			},
			{
				severity: 'warning',
				start: conceptCount,
				end: conceptCount + 'count'.length,
				message: 'count type does not match previous declaration'
			}
		]);
	});
});

function warning(
	source: string,
	token: string,
	message: string,
	occurrence = 0
) {
	let start = 0;
	for (let index = 0; index <= occurrence; index++) {
		start = source.indexOf(token, start);
		if (index < occurrence) {
			start += token.length;
		}
	}

	return {
		severity: 'warning' as const,
		start,
		end: start + token.length,
		message
	};
}
