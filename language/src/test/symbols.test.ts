import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { analyze } from '../index';
import {
	completions,
	outline,
	references,
	renameRejection,
	symbolAt
} from '../symbols';

function fixture(name: string): string {
	const fixturePath = path.resolve(__dirname, '../../test/fixtures', name);
	return fs.readFileSync(fixturePath, 'utf8');
}

describe('OntoDL+ symbol table', () => {
	test('stores declarations with their positions', () => {
		const source = fixture('mapaWithProps.odlp');
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
		const source = fixture('mapa.odlp');
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
		const source = fixture('mapa.odlp');
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

	test('lists the declaration and every use of a name', () => {
		const source = `Ontology demo
atributos { distance: int }
conceitos { City[distance] }
individuos { braga }
relacoes { links[dominio:City, contradominio:City] }
triplos { braga = links => City[distance=1] }
.`;
		const symbols = analyze(source).symbols;
		const city = source.indexOf('City');

		assert.deepEqual(
			references(symbols, city)?.map(span => span.start),
			occurrences(source, 'City')
		);
		assert.deepEqual(
			references(symbols, source.indexOf('braga'))
				?.map(span => span.start),
			occurrences(source, 'braga')
		);
		assert.deepEqual(
			references(symbols, source.indexOf('links'))
				?.map(span => span.start),
			occurrences(source, 'links')
		);
		assert.deepEqual(
			references(symbols, source.indexOf('distance'))
				?.map(span => span.start),
			occurrences(source, 'distance')
		);
		assert.deepEqual(
			references(symbols, city, false)?.map(span => span.start),
			occurrences(source, 'City').slice(1)
		);
		assert.equal(references(symbols, source.indexOf('triplos')), undefined);
	});

	test('rejects a rename that is not an identifier', () => {
		const source = `Ontology demo
conceitos { City }
relacoes { links }
triplos { City = links => City }
.`;
		const symbols = analyze(source).symbols;
		const city = source.indexOf('City');

		assert.equal(renameRejection(symbols, city, 'Town'), undefined);
		assert.equal(
			renameRejection(symbols, city, 'iof'),
			'iof is a keyword'
		);
		assert.equal(
			renameRejection(symbols, city, '1city'),
			'Name must be an identifier'
		);
		assert.equal(
			renameRejection(symbols, city, 'links'),
			'links is already declared'
		);
		assert.equal(
			renameRejection(symbols, source.indexOf('triplos'), 'Town'),
			'Name cannot be renamed'
		);
	});
});

function occurrences(source: string, name: string): number[] {
	const starts: number[] = [];
	let from = 0;
	while (from < source.length) {
		const start = source.indexOf(name, from);
		if (start < 0) {
			break;
		}
		starts.push(start);
		from = start + name.length;
	}
	return starts;
}
