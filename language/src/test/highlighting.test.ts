import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, test } from 'node:test';

import { highlightTokens, type HighlightToken } from '../highlighting';
import { analyze } from '../index';

function tokenAt(
	source: string,
	tokens: HighlightToken[],
	word: string,
	from = 0
): HighlightToken {
	const start = source.indexOf(word, from);
	assert.ok(start >= 0, `Missing source text: ${word}`);
	const token = tokens.find(item => item.start === start);
	assert.ok(token, `Missing token: ${word} at ${start}`);
	assert.equal(token.end, start + word.length, `Wrong span for ${word}`);
	return token;
}

function checkRanges(source: string, tokens: HighlightToken[]): void {
	let end = 0;
	for (const token of tokens) {
		assert.ok(token.start >= end, `Overlapping token at ${token.start}`);
		assert.ok(token.end > token.start);
		assert.ok(token.end <= source.length);
		assert.ok(!source.slice(token.start, token.end).includes('\n'));
		end = token.end;
	}
}

describe('OntoDL+ semantic highlighting', () => {
	test('classifies declarations and uses through the existing parser', () => {
		const source = `Ontology demo
atributos { nome: string, idade: int }
conceitos { Cidade[nome], Pessoa[idade] }
individuos { brg, ana }
relacoes { conhece[domain: Pessoa, codomain: Pessoa] }
triplos { ana = iof => Pessoa[idade=23]; ana = conhece => brg }
.`;
		const analyzed = analyze(source);
		assert.deepEqual(analyzed.diagnostics, []);
		const tokens = highlightTokens(source, analyzed.symbols);

		assert.equal(tokenAt(source, tokens, 'Ontology').type, 'keyword');
		assert.equal(tokenAt(source, tokens, 'demo').type, 'namespace');
		assert.equal(tokenAt(source, tokens, 'demo').declaration, true);
		assert.equal(tokenAt(source, tokens, 'atributos').type, 'keyword');
		assert.equal(tokenAt(source, tokens, 'nome').type, 'property');
		assert.equal(tokenAt(source, tokens, 'nome').declaration, true);
		assert.equal(
			tokenAt(source, tokens, 'nome', source.indexOf('Cidade')).type,
			'property'
		);
		assert.equal(tokenAt(source, tokens, 'string').type, 'type');
		assert.equal(tokenAt(source, tokens, 'Cidade').type, 'class');
		assert.equal(tokenAt(source, tokens, 'Pessoa').type, 'class');
		assert.equal(
			tokenAt(source, tokens, 'Pessoa', source.indexOf('domain:')).type,
			'class'
		);
		assert.equal(tokenAt(source, tokens, 'brg').type, 'enumMember');
		assert.equal(tokenAt(source, tokens, 'conhece').type, 'function');
		assert.equal(
			tokenAt(source, tokens, 'conhece', source.indexOf('triplos')).type,
			'function'
		);
		assert.equal(tokenAt(source, tokens, 'iof').type, 'operator');
		assert.equal(tokenAt(source, tokens, '=>').type, 'operator');
		assert.equal(tokenAt(source, tokens, '23').type, 'number');
		checkRanges(source, tokens);
	});

	test('distinguishes spelling from token role', () => {
		const source = `Ontologia demo
conceitos { Classe }
individuos { exemplo }
relacoes { iofExtra }
triplos { exemplo = iofExtra => Classe; exemplo = is-a => Classe }
.`;
		const tokens = highlightTokens(source, analyze(source).symbols);
		assert.equal(tokenAt(source, tokens, 'iofExtra').type, 'function');
		assert.equal(
			tokenAt(source, tokens, 'iofExtra', source.indexOf('triplos')).type,
			'function'
		);
		assert.equal(tokenAt(source, tokens, 'is-a').type, 'operator');
		assert.equal(
			tokenAt(source, tokens, 'Classe', source.indexOf('triplos')).type,
			'class'
		);
		assert.equal(
			tokenAt(source, tokens, 'exemplo', source.indexOf('triplos')).type,
			'enumMember'
		);
		checkRanges(source, tokens);
	});

	test('does not invent keywords for unsupported aliases', () => {
		const source = 'expands relations iofExtra';
		const tokens = highlightTokens(source);
		assert.equal(tokenAt(source, tokens, 'expands').type, 'variable');
		assert.equal(tokenAt(source, tokens, 'relations').type, 'variable');
		assert.equal(tokenAt(source, tokens, 'iofExtra').type, 'variable');
		checkRanges(source, tokens);
	});

	test('handles the grouped relationship operator', () => {
		const source = 'Ontology demo conceitos { C } individuos { x }'
			+ ' relacoes { r } triplos { x =[ r => C] } .';
		const tokens = highlightTokens(source, analyze(source).symbols);
		assert.equal(tokenAt(source, tokens, '=[').type, 'operator');
		checkRanges(source, tokens);
	});

	test('highlights comments, literals, and UTF-16 offsets', () => {
		const source = `Ontology demo
% emoji 😀 in a comment
atributos { nota: string }
conceitos { C[nota] }
relacoes { r }
triplos { C = r => C[nota="😀 ok"] }
.`;
		const tokens = highlightTokens(source, analyze(source).symbols);
		assert.equal(
			tokenAt(source, tokens, '% emoji 😀 in a comment').type,
			'comment'
		);
		assert.equal(tokenAt(source, tokens, 'atributos').type, 'keyword');
		assert.equal(
			tokenAt(source, tokens, 'nota', source.indexOf('triplos')).type,
			'property'
		);
		assert.equal(tokenAt(source, tokens, '"😀 ok"').type, 'string');
		checkRanges(source, tokens);
	});

	test('recovers unfinished strings without overlapping tokens', () => {
		const source = 'Ontology demo\nconceitos { C }\nrelacoes { r }'
			+ '\ntriplos { C = r => C[label="unfinished value\n} .';
		const tokens = highlightTokens(source);
		const start = source.indexOf('"unfinished');
		assert.deepEqual(tokens.find(item => item.start === start), {
			start,
			end: source.indexOf('\n', start),
			type: 'string'
		});
		checkRanges(source, tokens);
	});

	test('does not read imported files or color their virtual offsets', () => {
		const source = 'Ontology demo\n'
			+ 'conceitos { expand missing.odlp; Cidade }'
			+ '\nrelacoes { r }\ntriplos { Cidade = r => Cidade }\n.';
		const tokens = highlightTokens(source, analyze(source).symbols);
		assert.equal(tokenAt(source, tokens, 'expand').type, 'keyword');
		assert.equal(tokenAt(source, tokens, 'Cidade').type, 'class');
		checkRanges(source, tokens);
	});

	test('preserves non-overlapping spans on existing fixtures', () => {
		for (const name of [
			'template.odlp',
			'mapa.odlp',
			'mapaWithGroup.odlp',
			'mapaWithProps.odlp',
			'mapaWithAtribs.odlp'
		]) {
			const fixture = path.resolve(
				__dirname, '../../test/fixtures', name
			);
			const source = fs.readFileSync(fixture, 'utf8');
			const tokens = highlightTokens(source, analyze(source).symbols);
			checkRanges(source, tokens);
			assert.ok(tokens.length > 10, name);
		}
	});
});
