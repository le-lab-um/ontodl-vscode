import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';
import { completions, outline, symbolAt } from '../symbols';

function fixture(name: string): string {
	const fixturePath = path.resolve(__dirname, '../../test/fixtures', name);
	return fs.readFileSync(fixturePath, 'utf8');
}

describe('OntoDL+ symbol table', () => {
	test('stores declarations with their positions', () => {
		const source = fixture('mapaWithProps.txt');
		const symbols = analyze(source).symbols;

		const city = symbols.concepts.get('Cidade');
		assert.equal(city?.kind, 'concept');
		assert.equal(city?.start, source.indexOf('Cidade'));

		const origin = symbols.individuals.get('brg');
		assert.equal(origin?.kind, 'individual');
		assert.equal(origin?.start, source.indexOf('brg'));

		const destination = symbols.relations.get('temDestino');
		assert.equal(destination?.domain, 'Ligação');
		assert.equal(destination?.counterdomain, 'Cidade');
		assert.equal(
			symbols.relations.get('éDestinoDe')?.inverse,
			'temDestino'
		);

		assert.deepEqual(symbols.attributes.get('distância')?.type, {
			kind: 'string'
		});
	});

	test('keeps the first declaration when a name is repeated', () => {
		const source = `Ontology demo
conceitos { City, City }
relacoes { links }
triplos { City = links => City }
.`;
		const symbols = analyze(source).symbols;

		assert.equal(
			symbols.concepts.get('City')?.start,
			source.indexOf('City')
		);
	});

	test('resolves a name used in a triple to its declaration', () => {
		const source = fixture('mapa.txt');
		const symbols = analyze(source).symbols;
		const use = source.indexOf('=> Cidade');
		const offset = use + '=> '.length;
		const hit = symbolAt(symbols, offset);

		assert.equal(hit?.start, offset);
		assert.equal(hit?.symbol.kind, 'concept');
		assert.equal(hit?.symbol.start, source.indexOf('Cidade'));
	});

	test('resolves an attribute reference to its declaration', () => {
		const source = `Ontology demo
atributos { n: int }
conceitos { C[n] }
relacoes { r }
triplos { C = r => C }
.`;
		const symbols = analyze(source).symbols;
		const declared = source.indexOf('n:');
		const hit = symbolAt(symbols, source.lastIndexOf('[n') + 1);

		assert.equal(hit?.symbol.kind, 'attribute');
		assert.equal(hit?.symbol.start, declared);
		assert.deepEqual(
			symbols.attributes.get('n')?.type,
			{ kind: 'int' }
		);
	});

	test('builds an outline of sections and declarations', () => {
		const source = fixture('mapa.txt');
		const root = outline(analyze(source).symbols)[0];

		assert.equal(root.name, 'mapa');
		assert.equal(root.kind, 'ontology');
		assert.equal(
			source.slice(root.selectionStart, root.selectionEnd),
			'mapa'
		);

		const concepts = root.children.find(node => node.name === 'conceitos');
		assert.ok(concepts);
		assert.equal(
			source.slice(concepts.start, concepts.selectionEnd),
			'conceitos'
		);
		assert.deepEqual(
			concepts.children.map(node => node.name),
			['Ligação', 'Cidade']
		);
		const city = concepts.children[1];
		assert.ok(city.start >= concepts.start && city.end <= concepts.end);
	});

	test('offers keywords and declared names', () => {
		const source = `Ontology demo
conceitos { City }
relacoes { links }
triplos { City = links => City }
.`;
		const labels = completions(analyze(source).symbols)
			.map(entry => entry.label);

		assert.ok(labels.includes('iof'));
		assert.ok(labels.includes('City'));
		assert.ok(labels.includes('links'));
		assert.equal(labels.includes('JavaScript'), false);
		assert.equal(labels.includes('TypeScript'), false);
	});
});
