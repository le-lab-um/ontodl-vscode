import { CharStream, Token } from 'antlr4ng';

import { OntoDLPlusLexer } from './generated/OntoDLPlusLexer.js';
import { type SymbolTable } from './symbols.js';

// The order of these types is also the order advertised in the LSP legend.
export const semanticTokenTypes = [
	'namespace',
	'keyword',
	'type',
	'class',
	'enumMember',
	'function',
	'property',
	'variable',
	'string',
	'number',
	'operator',
	'comment'
] as const;

export const semanticTokenModifiers = ['declaration'] as const;

export type HighlightType = (typeof semanticTokenTypes)[number];

export interface HighlightToken {
	start: number;
	end: number;
	type: HighlightType;
	declaration?: boolean;
}

// These literals come from OntoDLPlus.g4; identifiers are classified below
// using the existing analyzer's symbol table instead of their spelling.
const SECTION_AND_OTHER_KEYWORDS = new Set([
	'Ontologia', 'Ontology',
	'atributos', 'attributes', 'dataProperties', 'propriedadesDados',
	'conceitos', 'concepts', 'classes',
	'individuos', 'individuals',
	'relacoes', 'relationships', 'objectProperties', 'propriedadesObjetos',
	'triplos', 'triples', 'restricoes', 'restrictions',
	'domain', 'dominio', 'contradominio', 'codiminio',
	'counterdomain', 'codomain', 'props',
	'bijecao', 'bijection', 'injecao', 'injection',
	'sobrejecao', 'surjection', 'abstracao', 'abstraction',
	'funcao', 'function', 'representacao', 'representation',
	'sobrejetiva', 'surjective', 'simples', 'simple',
	'inteira', 'entire', 'injetiva', 'injective',
	'inversaDe', 'inverseOf', 'not', 'nao', 'expand'
]);

const BUILTIN_RELATIONS = new Set([
	'iof', 'instancia', 'instanceof', 'type',
	'pof', 'parte', 'partOf',
	'is-a', 'subclasse', 'a', 'subClassOf',
	'synonym', 'sinonimo'
]);

const TYPES = new Set(['string', 'int', 'enum']);
const OPERATORS = new Set(['=', '=[', '=>', ':-', '==', '\\=', '!']);

/**
 * Highlight the original editor text, never the text expanded from imports.
 * ANTLR indexes Unicode code points; returned offsets use VS Code's UTF-16.
 * The symbol table is optional so malformed documents still get lexical color.
 */
export function highlightTokens(
	source: string,
	symbols?: SymbolTable
): HighlightToken[] {
	const utf16Offsets = [0];
	for (const char of source) {
		utf16Offsets.push(utf16Offsets[utf16Offsets.length - 1] + char.length);
	}
	const offsetAt = (codePoint: number): number =>
		utf16Offsets[Math.max(0, Math.min(codePoint, utf16Offsets.length - 1))];

	const declarations = new Map<number, HighlightType>();
	const uses = new Map<number, HighlightType>();
	if (symbols) {
		if (symbols.ontology) {
			declarations.set(symbols.ontology.nameStart, 'namespace');
		}
		for (const symbol of symbols.concepts.values()) {
			declarations.set(symbol.start, 'class');
		}
		for (const symbol of symbols.individuals.values()) {
			declarations.set(symbol.start, 'enumMember');
		}
		for (const symbol of symbols.relations.values()) {
			declarations.set(symbol.start, 'function');
		}
		for (const symbol of symbols.attributes.values()) {
			declarations.set(symbol.start, 'property');
		}
		for (const use of symbols.uses) {
			let type: HighlightType;
			switch (use.kind) {
				case 'concept':
					type = 'class';
					break;
				case 'individual':
					type = 'enumMember';
					break;
				case 'relation':
					type = 'function';
					break;
				case 'attribute':
					type = 'property';
					break;
				case 'entity': {
					const concept = symbols.concepts.has(use.name);
					const individual = symbols.individuals.has(use.name);
					type = concept === individual
						? 'variable'
						: concept ? 'class' : 'enumMember';
					break;
				}
			}
			uses.set(use.start, type);
		}
	}

	const lexer = new OntoDLPlusLexer(CharStream.fromString(source));
	lexer.removeErrorListeners();
	const lexical = lexer.getAllTokens()
		.filter(token => token.type !== Token.EOF && token.start >= 0)
		.map(token => ({
			token,
			start: offsetAt(token.start),
			end: offsetAt(token.stop + 1)
		}));

	const result: HighlightToken[] = [];
	for (const { token, start, end } of lexical) {
		if (end <= start) {
			continue;
		}
		let type: HighlightType | undefined;
		let declaration = false;
		if (token.type === OntoDLPlusLexer.IDENTIFIER) {
			const declaredType = declarations.get(token.start);
			const usedType = uses.get(token.start);
			type = declaredType ?? usedType ?? 'variable';
			declaration = declarations.has(token.start);
		} else if (token.type === OntoDLPlusLexer.STRING) {
			type = 'string';
		} else if (token.type === OntoDLPlusLexer.NUMBER) {
			type = 'number';
		} else {
			const literal = source.slice(start, end);
			if (TYPES.has(literal)) {
				type = 'type';
			} else if (
				BUILTIN_RELATIONS.has(literal) || OPERATORS.has(literal)
			) {
				type = 'operator';
			} else if (SECTION_AND_OTHER_KEYWORDS.has(literal)) {
				type = 'keyword';
			}
		}
		if (type) {
			result.push({
				start, end, type,
				...(declaration && { declaration })
			});
		}
	}

	// LINE_COMMENT uses -> skip in the grammar, so lexer tokens omit it.
	// Recover comments (and unfinished quotes) only from gaps in lexer output.
	const special: HighlightToken[] = [];
	const addSpecial = (
		start: number, end: number, type: HighlightType
	): void => {
		if (end <= start || (special.length > 0
			&& start < special[special.length - 1].end)) {
			return;
		}
		special.push({ start, end, type });
	};
	const examineGap = (start: number, end: number): void => {
		for (let i = start; i < end; i++) {
			const char = source[i];
			if (char !== '%' && char !== '"' && char !== '\'') {
				continue;
			}
			let lineEnd = i;
			while (lineEnd < source.length
				&& source[lineEnd] !== '\n' && source[lineEnd] !== '\r') {
				lineEnd++;
			}
			addSpecial(i, lineEnd, char === '%' ? 'comment' : 'string');
			i = lineEnd - 1;
		}
	};
	let previousEnd = 0;
	for (const entry of lexical) {
		examineGap(previousEnd, entry.start);
		previousEnd = Math.max(previousEnd, entry.end);
	}
	examineGap(previousEnd, source.length);

	// Unfinished strings may overlap identifiers produced by error recovery.
	let specialIndex = 0;
	const visible = result.filter((token) => {
		while (specialIndex < special.length
			&& special[specialIndex].end <= token.start) {
			specialIndex++;
		}
		return specialIndex >= special.length
			|| token.end <= special[specialIndex].start;
	});
	return [...visible, ...special].toSorted((a, b) =>
		a.start - b.start || a.end - b.end
	);
}
