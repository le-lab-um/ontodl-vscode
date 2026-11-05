export interface SourceSpan {
	start: number;
	end: number;
	imported?: boolean;
}

export type AttributeType =
	| { kind: 'string' }
	| { kind: 'int' }
	| { kind: 'enum'; values: string[] };

export interface ConceptSymbol extends SourceSpan {
	name: string;
	kind: 'concept';
}

export interface IndividualSymbol extends SourceSpan {
	name: string;
	kind: 'individual';
}

export interface RelationSymbol extends SourceSpan {
	name: string;
	kind: 'relation';
	domain?: string;
	counterdomain?: string;
	inverse?: string;
}

export interface AttributeSymbol extends SourceSpan {
	name: string;
	kind: 'attribute';
	type: AttributeType;
}

export type DeclaredSymbol =
	| ConceptSymbol
	| IndividualSymbol
	| RelationSymbol
	| AttributeSymbol;

export type SymbolKind = DeclaredSymbol['kind'];

export type SectionKind =
	| 'attributes'
	| 'concepts'
	| 'individuals'
	| 'relations'
	| 'triples'
	| 'restrictions';

export interface SectionSymbol extends SourceSpan {
	kind: SectionKind;
	name: string;
}

export interface OntologySymbol extends SourceSpan {
	name: string;
	nameStart: number;
	nameEnd: number;
}

export interface NameUse extends SourceSpan {
	name: string;
	kind: SymbolKind | 'entity';
}

export interface SymbolTable {
	ontology?: OntologySymbol;
	concepts: Map<string, ConceptSymbol>;
	individuals: Map<string, IndividualSymbol>;
	relations: Map<string, RelationSymbol>;
	attributes: Map<string, AttributeSymbol>;
	sections: SectionSymbol[];
	uses: NameUse[];
}

export type OutlineKind = SymbolKind | 'section' | 'ontology';

export interface OutlineNode extends SourceSpan {
	name: string;
	kind: OutlineKind;
	selectionStart: number;
	selectionEnd: number;
	detail?: string;
	children: OutlineNode[];
}

export interface SymbolHit {
	symbol: DeclaredSymbol;
	start: number;
	end: number;
}

export interface CompletionEntry {
	label: string;
	kind: 'keyword' | SymbolKind;
	detail?: string;
}

const KEYWORDS = [
	'Ontologia',
	'Ontology',
	'atributos',
	'attributes',
	'dataProperties',
	'propriedadesDados',
	'conceitos',
	'concepts',
	'classes',
	'individuos',
	'individuals',
	'relacoes',
	'relationships',
	'objectProperties',
	'propriedadesObjetos',
	'triplos',
	'triples',
	'restricoes',
	'restrictions',
	'dominio',
	'domain',
	'contradominio',
	'codiminio',
	'counterdomain',
	'codomain',
	'props',
	'iof',
	'instancia',
	'instanceof',
	'type',
	'is-a',
	'subclasse',
	'subClassOf',
	'pof',
	'parte',
	'partOf',
	'synonym',
	'sinonimo',
	'inversaDe',
	'inverseOf',
	'bijecao',
	'bijection',
	'injecao',
	'injection',
	'sobrejecao',
	'surjection',
	'abstracao',
	'abstraction',
	'funcao',
	'function',
	'representacao',
	'representation',
	'sobrejetiva',
	'surjective',
	'simples',
	'simple',
	'inteira',
	'entire',
	'injetiva',
	'injective',
	'not',
	'nao'
];

export function emptySymbolTable(): SymbolTable {
	return {
		concepts: new Map(),
		individuals: new Map(),
		relations: new Map(),
		attributes: new Map(),
		sections: [],
		uses: []
	};
}

export function formatType(type: AttributeType): string {
	if (type.kind === 'enum') {
		return `enum(${type.values.join(', ')})`;
	}
	return type.kind;
}

export function describe(symbol: DeclaredSymbol): string {
	if (symbol.kind === 'attribute') {
		return `attribute ${symbol.name}: ${formatType(symbol.type)}`;
	}
	if (symbol.kind === 'relation') {
		const lines = [`relation ${symbol.name}`];
		if (symbol.domain) {
			lines.push(`domain: ${symbol.domain}`);
		}
		if (symbol.counterdomain) {
			lines.push(`counterdomain: ${symbol.counterdomain}`);
		}
		if (symbol.inverse) {
			lines.push(`inverse: ${symbol.inverse}`);
		}
		return lines.join('\n');
	}
	return `${symbol.kind} ${symbol.name}`;
}

export function outline(table: SymbolTable): OutlineNode[] {
	const sections = table.sections.map(section => ({
		name: section.name,
		kind: 'section' as const,
		start: section.start,
		end: section.end,
		selectionStart: section.start,
		selectionEnd: section.start + section.name.length,
		children: childrenOf(section, table).map(leaf)
	}));
	if (!table.ontology) {
		return sections;
	}
	return [{
		name: table.ontology.name,
		kind: 'ontology',
		start: table.ontology.start,
		end: table.ontology.end,
		selectionStart: table.ontology.nameStart,
		selectionEnd: table.ontology.nameEnd,
		children: sections
	}];
}

export function symbolAt(
	table: SymbolTable,
	offset: number
): SymbolHit | undefined {
	const declared = declarations(table).find(symbol =>
		!symbol.imported && covers(symbol, offset)
	);
	if (declared) {
		return {
			symbol: declared,
			start: declared.start,
			end: declared.end
		};
	}
	const use = table.uses.find(item => covers(item, offset));
	if (!use) {
		return undefined;
	}
	const symbol = resolve(table, use.name, use.kind);
	if (!symbol) {
		return undefined;
	}
	return { symbol, start: use.start, end: use.end };
}

export function references(
	table: SymbolTable,
	offset: number,
	includeDeclaration = true
): SourceSpan[] | undefined {
	const hit = symbolAt(table, offset);
	if (!hit) {
		return undefined;
	}
	const spans: SourceSpan[] = [];
	if (includeDeclaration) {
		spans.push({ start: hit.symbol.start, end: hit.symbol.end });
	}
	for (const use of table.uses) {
		if (resolve(table, use.name, use.kind) === hit.symbol) {
			spans.push({ start: use.start, end: use.end });
		}
	}
	return spans.toSorted(byStart);
}

export function renameRejection(
	table: SymbolTable,
	offset: number,
	newName: string
): string | undefined {
	const hit = symbolAt(table, offset);
	if (!hit || hit.symbol.imported) {
		return 'Name cannot be renamed';
	}
	if (!IDENTIFIER.test(newName)) {
		return 'Name must be an identifier';
	}
	if (KEYWORDS.includes(newName)) {
		return `${newName} is a keyword`;
	}
	const taken = newName !== hit.symbol.name
		&& declarations(table).some(item => item.name === newName);
	if (taken) {
		return `${newName} is already declared`;
	}
	return undefined;
}

const IDENTIFIER
	= /^[A-Za-z\u00C0-\u024F][A-Za-z0-9_/\u00C0-\u024F-]*$/u;

export function completions(table: SymbolTable): CompletionEntry[] {
	const entries: CompletionEntry[] = KEYWORDS.map(label => ({
		label,
		kind: 'keyword'
	}));
	for (const symbol of declarations(table)) {
		const detail = completionDetail(symbol);
		entries.push({
			label: symbol.name,
			kind: symbol.kind,
			detail
		});
	}
	return entries;
}

function childrenOf(
	section: SectionSymbol,
	table: SymbolTable
): DeclaredSymbol[] {
	if (section.kind === 'attributes') {
		return [...table.attributes.values()].toSorted(byStart);
	}
	if (section.kind === 'concepts') {
		return [...table.concepts.values()].toSorted(byStart);
	}
	if (section.kind === 'individuals') {
		return [...table.individuals.values()].toSorted(byStart);
	}
	if (section.kind === 'relations') {
		return [...table.relations.values()].toSorted(byStart);
	}
	return [];
}

function leaf(symbol: DeclaredSymbol): OutlineNode {
	const detail = completionDetail(symbol);
	return {
		name: symbol.name,
		kind: symbol.kind,
		start: symbol.start,
		end: symbol.end,
		selectionStart: symbol.start,
		selectionEnd: symbol.end,
		detail,
		children: []
	};
}

function completionDetail(symbol: DeclaredSymbol): string | undefined {
	if (symbol.kind === 'attribute') {
		return formatType(symbol.type);
	}
	if (symbol.kind !== 'relation') {
		return undefined;
	}
	if (symbol.domain && symbol.counterdomain) {
		return `${symbol.domain} -> ${symbol.counterdomain}`;
	}
	return symbol.domain ?? symbol.counterdomain;
}

function declarations(table: SymbolTable): DeclaredSymbol[] {
	return [
		...table.attributes.values(),
		...table.concepts.values(),
		...table.individuals.values(),
		...table.relations.values()
	].toSorted(byStart);
}

function resolve(
	table: SymbolTable,
	name: string,
	kind: NameUse['kind']
): DeclaredSymbol | undefined {
	if (kind === 'entity') {
		// A triple endpoint may be an individual or a concept.
		return table.individuals.get(name) ?? table.concepts.get(name);
	}
	if (kind === 'concept') {
		return table.concepts.get(name);
	}
	if (kind === 'individual') {
		return table.individuals.get(name);
	}
	if (kind === 'relation') {
		return table.relations.get(name);
	}
	return table.attributes.get(name);
}

function covers(span: SourceSpan, offset: number): boolean {
	return offset >= span.start && offset < span.end;
}

function byStart(left: SourceSpan, right: SourceSpan): number {
	return left.start - right.start;
}
