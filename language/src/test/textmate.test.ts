import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

interface Pattern {
	match?: string;
	begin?: string;
	end?: string;
	name?: string;
	captures?: Record<string, { name: string }>;
	patterns?: Pattern[];
}

interface TextMateGrammar {
	scopeName: string;
	patterns: { include: string }[];
	repository: Record<string, { patterns: Pattern[] }>;
}

interface Manifest {
	contributes: {
		grammars: { language: string; scopeName: string; path: string }[];
		languages: { configuration?: string }[];
		configurationDefaults: Record<string, Record<string, unknown>>;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPatternArray(value: unknown): value is Pattern[] {
	return Array.isArray(value) && value.every(isPattern);
}

function isPattern(value: unknown): value is Pattern {
	return isRecord(value)
		&& (value.match === undefined || typeof value.match === 'string')
		&& (value.begin === undefined || typeof value.begin === 'string')
		&& (value.end === undefined || typeof value.end === 'string')
		&& (value.name === undefined || typeof value.name === 'string')
		&& (value.captures === undefined || (isRecord(value.captures)
			&& Object.values(value.captures).every(capture =>
				isRecord(capture) && typeof capture.name === 'string')))
				&& (value.patterns === undefined
					|| isPatternArray(value.patterns));
}

function isTextMateGrammar(value: unknown): value is TextMateGrammar {
	return isRecord(value)
		&& typeof value.scopeName === 'string'
		&& Array.isArray(value.patterns)
		&& value.patterns.every((entry: unknown) =>
			isRecord(entry) && typeof entry.include === 'string')
			&& isRecord(value.repository)
			&& Object.values(value.repository).every(entry =>
				isRecord(entry) && Array.isArray(entry.patterns)
				&& entry.patterns.every(isPattern));
}

function isManifest(value: unknown): value is Manifest {
	if (!isRecord(value) || !isRecord(value.contributes)) {
		return false;
	}
	const { grammars, languages, configurationDefaults } = value.contributes;
	return Array.isArray(grammars)
		&& grammars.every((entry: unknown) => isRecord(entry)
			&& typeof entry.language === 'string'
			&& typeof entry.scopeName === 'string'
			&& typeof entry.path === 'string')
			&& Array.isArray(languages)
			&& languages.every((entry: unknown) => isRecord(entry)
				&& (entry.configuration === undefined
					|| typeof entry.configuration === 'string'))
					&& isRecord(configurationDefaults)
					&& Object.values(configurationDefaults).every(isRecord);
}

const root = path.resolve(__dirname, '../../..');
const read = (filename: string): string =>
	fs.readFileSync(path.join(root, filename), 'utf8');
const manifestData: unknown = JSON.parse(read('package.json'));
const grammarData: unknown = JSON.parse(read(
	'client/syntaxes/ontodlp.tmLanguage.json'
));
assert.ok(isManifest(manifestData), 'Invalid extension manifest');
assert.ok(isTextMateGrammar(grammarData), 'Invalid TextMate grammar');
const manifest = manifestData;
const grammar = grammarData;
const parserGrammar = read('language/grammar/OntoDLPlus.g4');

function matches(category: string, source: string): string[] {
	return grammar.repository[category].patterns.flatMap((pattern) => {
		if (!pattern.match) {
			return [];
		}
		return [...source.matchAll(new RegExp(pattern.match, 'g'))]
			.map(match => match[0]);
	});
}

function contains(
	category: string,
	source: string,
	expected: string[]
): void {
	assert.deepEqual(
		matches(category, source), expected,
		`Unexpected ${category} matches in ${JSON.stringify(source)}`
	);
}

void test(
	'TextMate fallback is registered for the semantic tokens language',
	() => {
		assert.deepEqual(manifest.contributes.grammars, [{
			language: 'ontodlp',
			scopeName: grammar.scopeName,
			path: './client/syntaxes/ontodlp.tmLanguage.json'
		}]);
		assert.equal(grammar.scopeName, 'source.ontodlp');
		assert.equal(manifest.contributes.languages[0].configuration,
			'./language-configuration.json');
		const defaults
			= manifest.contributes.configurationDefaults['[ontodlp]'];
		assert.equal(defaults?.['editor.semanticHighlighting.enabled'], true);
		assert.ok(read('server/src/server.ts').includes(
			'semanticTokensProvider:'
		));
		assert.ok(read('server/src/server.ts').includes('semanticTokens.on('));
	}
);

void test('TextMate rules use existing, nonempty, conventional scopes', () => {
	for (const { include } of grammar.patterns) {
		assert.ok(include.startsWith('#'));
		assert.ok(grammar.repository[include.slice(1)], include);
	}
	for (const [category, { patterns }] of Object.entries(grammar.repository)) {
		assert.ok(patterns.length > 0, category);
		for (const pattern of patterns) {
			assert.ok(
				pattern.match || (pattern.begin && pattern.end), category
			);
			assert.ok(pattern.name || pattern.captures, category);
			const match = pattern.match;
			if (match) {
				assert.doesNotThrow(() => new RegExp(match), category);
			}
		}
	}
});

void test(
	'all reserved word literals in the parser grammar are highlighted',
	() => {
		// The ANTLR grammar defines the vocabulary; no guessed aliases.
		const parserRules = parserGrammar.split(/^NUMBER\s*$/m)[0];
		const words = [...parserRules.matchAll(/'([^']+)'/g)]
			.map(match => match[1])
			.filter(value => /^[A-Za-z]+(?:-[A-Za-z]+)?$/.test(value));
		const categories = [
			'header', 'sections', 'imports', 'types',
			'relation-metadata', 'built-in-relations',
			'relation-properties', 'operators'
		];
		for (const word of new Set(words)) {
			const matched = categories.some(category =>
				matches(category, word).includes(word)
			);
			assert.ok(matched, `No fallback highlighting for: ${word}`);
		}
	}
);

void test('keywords highlight without requiring the rest of a section', () => {
	contains('sections', 'conceitos', ['conceitos']);
	contains('imports', 'expand', ['expand']);
	contains('types', 'enum', ['enum']);
	contains('built-in-relations', 'is-a', ['is-a']);
	contains('built-in-relations', 'a', ['a']);
	contains('relation-metadata', 'codomain', ['codomain']);
	contains('operators', 'nao', ['nao']);
});

void test(
	'unsupported aliases and identifier fragments are not keywords',
	() => {
		for (const word of ['expands', 'relations', 'iofExtra', 'is-a-algo',
			'meu-iof', 'foo/type', 'a-b', 'parte/inteira', 'my-string',
			'int32']) {
			for (const category of ['header', 'sections', 'imports', 'types',
				'relation-metadata', 'built-in-relations',
				'relation-properties', 'operators']) {
				assert.deepEqual(
					matches(category, word), [], `${category}: ${word}`
				);
			}
			contains('identifiers', word, [word]);
		}
	}
);

void test('header recognizes the ontology name and Unicode identifiers', () => {
	const header = grammar.repository.header.patterns[0];
	assert.ok(header.match);
	const groups = new RegExp(header.match).exec('Ontologia Árvore/Europa');
	assert.ok(groups);
	assert.equal(groups[1], 'Ontologia');
	assert.equal(groups[3], 'Árvore/Europa');
	assert.equal(header.captures?.['3'].name, 'entity.name.namespace.ontodlp');
	contains('identifiers', 'edição/meu-projeto', ['edição/meu-projeto']);
});

void test('punctuation and composite operators remain separated', () => {
	contains('operators', '=[ :- => \\= == = !', [
		'=[', ':-', '=>', '\\=', '==', '=', '!'
	]);
	contains('punctuation', '{ } [ ] ( ) , ; : .', [
		'{', '}', '[', ']', '(', ')', ',', ';', ':', '.'
	]);
	contains('numbers', '15 -23', ['15', '-23']);
});

void test(
	'strings are line bounded and do not claim unsupported escapes',
	() => {
		const [double, single] = grammar.repository.strings.patterns;
		assert.deepEqual([double.begin, double.end], ['"', '"|(?=$)']);
		assert.deepEqual([single.begin, single.end], ['\'', '\'|(?=$)']);
		assert.equal(double.patterns, undefined);
		assert.equal(single.patterns, undefined);
		contains('comments', '% test with symbols = " //', [
			'% test with symbols = " //'
		]);
	}
);
