import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { ontologyGraph } from '../graph';
import { analyze } from '../index';

function fixture(name: string): string {
	const fixturePath = path.resolve(__dirname, '../../test/fixtures', name);
	return fs.readFileSync(fixturePath, 'utf8');
}

function diagramOf(source: string): string {
	return ontologyGraph(analyze(source).symbols);
}

function arrows(diagram: string): string[] {
	return [...diagram.matchAll(/-> \w+ \[label="([^"]*)"\]/g)]
		.map(match => match[1]);
}

void describe('OntoDL+ graph', () => {
	void test('records one fact for each object in a group', () => {
		const source = `Ontology demo
conceitos { C }
individuos { aa, bb, cc }
relacoes { r }
triplos { aa =[ iof => C; r => bb, cc ] }
.`;
		const facts = analyze(source).symbols.facts;

		assert.deepEqual(
			facts.map(fact => [
				fact.subject,
				fact.builtin ?? fact.relation,
				fact.object
			]),
			[
				['aa', 'iof', 'C'],
				['aa', 'r', 'bb'],
				['aa', 'r', 'cc']
			]
		);
	});

	void test(
		'draws each concept, individual, and value as its own node',
		() => {
			const diagram = diagramOf(fixture('mapaWithProps.odlp'));

			assert.equal(diagram.includes('subgraph'), false);
			assert.ok(diagram.includes('[label="Cidade", shape=ellipse]'));
			assert.ok(diagram.includes('[label="Ligação", shape=ellipse]'));
			assert.ok(diagram.includes('[label="brg", shape=box]'));
			assert.ok(diagram.includes('[label="lig-ptl-bcl", shape=box]'));
			assert.ok(diagram.includes('[label="nome=Braga", shape=box]'));
			assert.ok(
				diagram.includes('[label="população=140000", shape=box]')
			);
			assert.ok(diagram.includes('[label="distância=19", shape=box]'));
			assert.ok(arrows(diagram).includes('iof'));
			assert.ok(arrows(diagram).includes('temDestino'));
			assert.ok(arrows(diagram).includes('temOrigem'));
			assert.ok(arrows(diagram).includes('properties'));
		}
	);

	void test('keeps separate targets from a grouped triple', () => {
		const diagram = diagramOf(fixture('mapaWithGroup.odlp'));
		const braga = diagram.match(
			/(\w+) \[label="brg", shape=box\]/
		)?.[1];
		const origins = diagram.split('\n').filter(line =>
			line.startsWith(`  ${braga} ->`) && line.includes('éOrigemDe')
		);

		assert.equal(origins.length, 3);
	});

	void test('draws a triple and skips a relation that has none', () => {
		const diagram = diagramOf(`Ontology demo
conceitos { A, B, C }
relacoes {
    r[domain: A, codomain: B, props: inversaDe=s],
    s[domain: B, codomain: A],
    t
}
triplos { A = is-a => B }
.`);

		assert.match(diagram, /^digraph \{/);
		assert.match(diagram, /label="demo"/);
		assert.deepEqual(arrows(diagram), ['is-a']);
	});

	void test('draws both directions when both triples are written', () => {
		const diagram = diagramOf(`Ontology demo
conceitos { A, B }
individuos { aa, bb }
relacoes {
    r[domain: A, codomain: B, props: inversaDe=s],
    s[domain: B, codomain: A]
}
triplos {
    aa = iof => A;
    bb = iof => B;
    aa = r => bb;
    bb = s => aa
}
.`);

		assert.deepEqual(arrows(diagram), ['iof', 'iof', 'r', 's']);
	});
});
