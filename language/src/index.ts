export type DiagnosticSeverity = 'error' | 'warning';

export interface LanguageDiagnostic {
	message: string;
	start: number;
	end: number;
	severity: DiagnosticSeverity;
}

export interface AnalysisResult {
	diagnostics: LanguageDiagnostic[];
	semanticDiagnostics: LanguageDiagnostic[];
	symbols: SymbolTable;
}

export type {
	Assignment,
	AttributeSymbol,
	AttributeType,
	BuiltinLink,
	CompletionEntry,
	ConceptSymbol,
	DeclaredSymbol,
	Fact,
	IndividualSymbol,
	NameUse,
	OntologySymbol,
	OutlineKind,
	OutlineNode,
	RelationSymbol,
	SectionKind,
	SectionSymbol,
	SourceSpan,
	SymbolHit,
	SymbolKind,
	SymbolTable
} from './symbols.js';

export {
	completions,
	describe,
	emptySymbolTable,
	formatType,
	hoverMarkdown,
	outline,
	references,
	renameRejection,
	symbolAt
} from './symbols.js';

export { ontologyGraph } from './graph.js';

import {
	ANTLRErrorListener,
	ATNSimulator,
	BaseErrorListener,
	CharStream,
	CommonTokenStream,
	ParseTreeWalker,
	ParserRuleContext,
	RecognitionException,
	Recognizer,
	TerminalNode,
	Token
} from 'antlr4ng';

import { OntoDLPlusLexer } from './generated/OntoDLPlusLexer.js';
import {
	AttributeDeclarationContext,
	AttributeInstanceContext,
	AttributeInstancesContext,
	AttributeReferenceContext,
	AttributesSectionContext,
	AtomContext,
	ConceptContext,
	ConceptsSectionContext,
	GroupedObjectContext,
	HeaderContext,
	IndividualListContext,
	IndividualsSectionContext,
	OntoDLPlusParser,
	OntologyContext,
	PropertyContext,
	RelationContext,
	RelationInformationContext,
	RelationsSectionContext,
	RelationshipContext,
	RestrictionsSectionContext,
	TripleContext,
	TripleRelationContext,
	TriplesSectionContext,
	TypeContext
} from './generated/OntoDLPlusParser.js';
import { OntoDLPlusListener } from './generated/OntoDLPlusListener.js';
import { expandSource } from './expand.js';
import {
	type Assignment,
	type AttributeSymbol,
	type AttributeType,
	type BuiltinLink,
	type ConceptSymbol,
	type Fact,
	type IndividualSymbol,
	type NameUse,
	type OntologySymbol,
	type RelationSymbol,
	type SectionKind,
	type SectionSymbol,
	type SourceSpan,
	type SymbolTable
} from './symbols.js';

interface PendingInverse {
	owner?: RelationSymbol;
	id: TerminalNode;
}

class DiagnosticSem extends OntoDLPlusListener {
	public readonly diagnostics: LanguageDiagnostic[] = [];

	public readonly concepts = new Map<string, ConceptSymbol>();
	public readonly relations = new Map<string, RelationSymbol>();
	public readonly individuals = new Map<string, IndividualSymbol>();
	public readonly attributes = new Map<string, AttributeSymbol>();
	public readonly sections: SectionSymbol[] = [];
	public readonly uses: NameUse[] = [];
	public readonly facts: Fact[] = [];
	public readonly assignments: Assignment[] = [];

	private readonly factKeys = new Set<string>();
	private readonly assignmentKeys = new Set<string>();

	public ontology?: OntologySymbol;

	private ontologySpan?: SourceSpan;
	private currentRelation?: RelationSymbol;
	private readonly pendingInverses: PendingInverse[] = [];

	public override enterOntology = (ctx: OntologyContext): void => {
		this.ontologySpan = this.ruleSpan(ctx);
	};

	public override enterHeader = (ctx: HeaderContext): void => {
		const id = ctx.IDENTIFIER();
		const name = this.span(id);
		const body = this.ontologySpan ?? this.ruleSpan(ctx);
		this.ontology = {
			name: id.getText(),
			start: body.start,
			end: body.end,
			nameStart: name.start,
			nameEnd: name.end
		};
	};

	public override enterAttributesSection = (
		ctx: AttributesSectionContext
	): void => {
		this.addSection(ctx, 'attributes', ctx.attributesKeyword().getText());
	};

	public override enterConceptsSection = (
		ctx: ConceptsSectionContext
	): void => {
		this.addSection(ctx, 'concepts', ctx.conceptsKeyword().getText());
	};

	public override enterIndividualsSection = (
		ctx: IndividualsSectionContext
	): void => {
		this.addSection(
			ctx,
			'individuals',
			ctx.individualsKeyword().getText()
		);
	};

	public override enterRelationsSection = (
		ctx: RelationsSectionContext
	): void => {
		this.addSection(ctx, 'relations', ctx.relationsKeyword().getText());
	};

	public override enterTriplesSection = (
		ctx: TriplesSectionContext
	): void => {
		this.addSection(ctx, 'triples', ctx.triplesKeyword().getText());
	};

	public override enterRestrictionsSection = (
		ctx: RestrictionsSectionContext
	): void => {
		this.addSection(
			ctx,
			'restrictions',
			ctx.restrictionsKeyword().getText()
		);
	};

	public override enterConcept = (ctx: ConceptContext): void => {
		this.declare(this.concepts, ctx.IDENTIFIER(), (name, span) => ({
			name,
			kind: 'concept',
			...span
		}));
	};

	public override enterRelation = (ctx: RelationContext): void => {
		this.currentRelation = this.declare(
			this.relations,
			ctx.IDENTIFIER(),
			(name, span) => ({
				name,
				kind: 'relation',
				...span
			})
		);
	};

	public override exitRelation = (): void => {
		this.currentRelation = undefined;
	};

	public override enterIndividualList = (
		ctx: IndividualListContext
	): void => {
		for (const id of ctx.IDENTIFIER()) {
			this.declare(this.individuals, id, (name, span) => ({
				name,
				kind: 'individual',
				...span
			}));
		}
	};

	public override enterAttributeDeclaration = (
		ctx: AttributeDeclarationContext
	): void => {
		const type = this.readType(ctx.type());
		this.declare(this.attributes, ctx.IDENTIFIER(), (name, span) => ({
			name,
			kind: 'attribute',
			type,
			...span
		}));
	};

	public override enterAttributeReference = (
		ctx: AttributeReferenceContext
	): void => {
		const id = ctx.IDENTIFIER();
		const name = id.getText();
		const typeNode = ctx.type();
		if (!typeNode) {
			if (!this.attributes.has(name)) {
				this.report('warning', id, `${name} not declared`);
			}
			this.recordUse(id, 'attribute');
			return;
		}

		const type = this.readType(typeNode);
		const previous = this.attributes.get(name);
		if (!previous) {
			this.attributes.set(name, {
				name,
				kind: 'attribute',
				type,
				...this.span(id)
			});
			return;
		}
		this.recordUse(id, 'attribute');
		if (!this.sameType(previous.type, type)) {
			this.report(
				'warning',
				id,
				`${name} type does not match previous declaration`
			);
		}
	};

	public override enterRelationInformation = (
		ctx: RelationInformationContext
	): void => {
		const id = ctx.IDENTIFIER();
		const isEndpoint = ctx.domainKeyword() ?? ctx.counterdomainKeyword();
		if (!isEndpoint || !id) {
			return;
		}
		const name = id.getText();
		this.recordUse(id, 'concept');
		if (!this.concepts.has(name)) {
			this.report('warning', id, `${name} is not a concept`);
			return;
		}
		if (!this.currentRelation) {
			return;
		}
		if (ctx.domainKeyword()) {
			this.currentRelation.domain ??= name;
		} else {
			this.currentRelation.counterdomain ??= name;
		}
	};

	public override enterProperty = (ctx: PropertyContext): void => {
		const id = ctx.IDENTIFIER();
		if (!ctx.inverseKeyword() || !id) {
			return;
		}
		this.pendingInverses.push({ owner: this.currentRelation, id });
	};

	public override exitRelationsSection = (): void => {
		for (const pending of this.pendingInverses) {
			const name = pending.id.getText();
			this.recordUse(pending.id, 'relation');
			if (!this.relations.has(name)) {
				this.report(
					'warning',
					pending.id,
					`${name} is not a relation`
				);
				continue;
			}
			if (pending.owner && !pending.owner.inverse) {
				pending.owner.inverse = name;
			}
		}
	};

	public override enterTriple = (ctx: TripleContext): void => {
		for (const id of ctx.IDENTIFIER()) {
			this.checkEntity(id);
		}
	};

	public override exitTriple = (ctx: TripleContext): void => {
		if (ctx.relationship().length > 0) {
			return;
		}
		const subject = ctx.IDENTIFIER(0);
		const relation = ctx.tripleRelation();
		const object = ctx.IDENTIFIER(1);
		if (!subject || !relation || !object) {
			return;
		}
		this.recordFact(subject, relation, object);
		if (builtinLink(relation) === 'iof') {
			this.recordAssignments(subject, ctx.attributeInstances());
		}
	};

	public override exitRelationship = (
		ctx: RelationshipContext
	): void => {
		if (!(ctx.parent instanceof TripleContext)) {
			return;
		}
		const subject = ctx.parent.IDENTIFIER(0);
		const relation = ctx.tripleRelation();
		const object = ctx.IDENTIFIER();
		if (!subject || !relation || !object) {
			return;
		}
		this.recordFact(subject, relation, object);
		if (builtinLink(relation) === 'iof') {
			this.recordAssignments(subject, ctx.attributeInstances());
		}
		for (const extra of ctx.groupedObject()) {
			this.recordFact(subject, relation, extra.IDENTIFIER());
		}
	};

	public override enterTripleRelation = (
		ctx: TripleRelationContext
	): void => {
		const id = ctx.IDENTIFIER();
		if (!id) {
			return;
		}
		this.recordUse(id, 'relation');
		if (!this.relations.has(id.getText())) {
			this.report('warning', id, `${id.getText()} not declared`);
		}
	};

	public override enterRelationship = (ctx: RelationshipContext): void => {
		this.checkEntity(ctx.IDENTIFIER());
	};

	public override enterGroupedObject = (ctx: GroupedObjectContext): void => {
		this.checkEntity(ctx.IDENTIFIER());
	};

	public override enterAttributeInstance = (
		ctx: AttributeInstanceContext
	): void => {
		const id = ctx.IDENTIFIER();
		const name = id.getText();
		this.recordUse(id, 'attribute');
		const attribute = this.attributes.get(name);
		if (!attribute) {
			this.report('warning', id, `${name} not declared`);
			return;
		}

		const token = this.atomToken(ctx.atom());
		if (!token || this.valueMatches(attribute.type, ctx.atom())) {
			return;
		}
		this.report(
			'warning',
			token,
			`${name} value does not match its type`
		);
	};

	public symbols(): SymbolTable {
		return {
			ontology: this.ontology,
			concepts: this.concepts,
			individuals: this.individuals,
			relations: this.relations,
			attributes: this.attributes,
			sections: this.sections,
			uses: this.uses,
			facts: this.facts,
			assignments: this.assignments
		};
	}

	private recordAssignments(
		owner: TerminalNode,
		instances: AttributeInstancesContext | null
	): void {
		if (!instances) {
			return;
		}
		for (const item of instances.attributeInstance()) {
			const id = item.IDENTIFIER();
			const atom = item.atom();
			if (!atom) {
				continue;
			}
			const value = writtenValue(atom);
			const key = `${owner.getText()}\0${id.getText()}\0${value}`;
			if (this.assignmentKeys.has(key)) {
				continue;
			}
			this.assignmentKeys.add(key);
			const end = atom.stop?.stop ?? id.getSymbol().stop;
			this.assignments.push({
				owner: owner.getText(),
				attribute: id.getText(),
				value,
				start: id.getSymbol().start,
				end: end + 1
			});
		}
	}

	private recordFact(
		subject: TerminalNode,
		relation: TripleRelationContext,
		object: TerminalNode
	): void {
		const name = relationText(relation);
		if (!name) {
			return;
		}
		const key = `${subject.getText()}\0${name}\0${object.getText()}`;
		if (this.factKeys.has(key)) {
			return;
		}
		this.factKeys.add(key);
		this.facts.push({
			subject: subject.getText(),
			relation: name,
			object: object.getText(),
			builtin: builtinLink(relation),
			start: subject.getSymbol().start,
			end: object.getSymbol().stop + 1
		});
	}

	private checkEntity(id: TerminalNode): void {
		this.recordUse(id, 'entity');
		if (!this.isDeclaredEntity(id)) {
			this.report('warning', id, `${id.getText()} not declared`);
		}
	}

	private isDeclaredEntity(id: TerminalNode): boolean {
		const name = id.getText();
		return this.individuals.has(name) || this.concepts.has(name);
	}

	private declare<T extends { kind: NameUse['kind'] }>(
		symbols: Map<string, T>,
		id: TerminalNode,
		create: (name: string, span: SourceSpan) => T
	): T | undefined {
		const name = id.getText();
		const previous = symbols.get(name);
		if (previous) {
			this.report('warning', id, `${name} declared more than once`);
			this.recordUse(id, previous.kind);
			return undefined;
		}
		const symbol = create(name, this.span(id));
		symbols.set(name, symbol);
		return symbol;
	}

	private addSection(
		ctx: ParserRuleContext,
		kind: SectionKind,
		name: string
	): void {
		this.sections.push({ kind, name, ...this.ruleSpan(ctx) });
	}

	private recordUse(id: TerminalNode, kind: NameUse['kind']): void {
		this.uses.push({ name: id.getText(), kind, ...this.span(id) });
	}

	private span(id: TerminalNode): SourceSpan {
		return {
			start: id.getSymbol().start,
			end: id.getSymbol().stop + 1
		};
	}

	private ruleSpan(ctx: ParserRuleContext): SourceSpan {
		const start = Math.max(0, ctx.start?.start ?? 0);
		const stop = ctx.stop?.stop ?? start - 1;
		return { start, end: Math.max(start, stop + 1) };
	}

	private readType(ctx: TypeContext): AttributeType {
		const values = ctx.enumValue();
		if (values.length > 0) {
			return {
				kind: 'enum',
				values: values.map(value => value.getText())
			};
		}
		if (ctx.getText() === 'int') {
			return { kind: 'int' };
		}
		return { kind: 'string' };
	}

	private sameType(left: AttributeType, right: AttributeType): boolean {
		if (left.kind === 'enum' && right.kind === 'enum') {
			return left.values.length === right.values.length
				&& left.values.every(
					(value, index) => value === right.values[index]
				);
		}
		return left.kind === right.kind;
	}

	private valueMatches(type: AttributeType, atom: AtomContext): boolean {
		if (type.kind === 'string') {
			return atom.STRING() !== null;
		}
		if (type.kind === 'int') {
			return atom.NUMBER() !== null;
		}
		const token = atom.IDENTIFIER() ?? atom.NUMBER();
		return token !== null && type.values.includes(token.getText());
	}

	private atomToken(atom: AtomContext): TerminalNode | null {
		return atom.STRING() ?? atom.NUMBER() ?? atom.IDENTIFIER();
	}

	private report(
		severity: DiagnosticSeverity,
		id: TerminalNode,
		message: string
	): void {
		this.diagnostics.push({
			severity,
			start: id.getSymbol().start,
			end: id.getSymbol().stop + 1,
			message
		});
	}
}

class DiagnosticListener
	extends BaseErrorListener
	implements ANTLRErrorListener {
	public readonly diagnostics: LanguageDiagnostic[] = [];

	public constructor(private readonly source: string) {
		super();
	}

	public override syntaxError<T extends ATNSimulator>(
		_recognizer: Recognizer<T>,
		offendingSymbol: Token | null,
		line: number,
		column: number,
		message: string,
		_error: RecognitionException | null
	): void {
		const tokenStart = offendingSymbol?.start ?? -1;
		const tokenStop = offendingSymbol?.stop ?? -1;
		const start = tokenStart >= 0
			? tokenStart
			: this.offsetAt(line, column);
		const end = tokenStop >= start
			? tokenStop + 1
			: Math.min(start + 1, this.source.length);

		this.diagnostics.push({
			severity: 'error',
			start,
			end,
			message
		});
	}

	private offsetAt(line: number, column: number): number {
		let offset = 0;
		let currentLine = 1;

		while (currentLine < line) {
			const lineEnd = this.source.indexOf('\n', offset);
			if (lineEnd < 0) {
				return this.source.length;
			}
			offset = lineEnd + 1;
			currentLine++;
		}

		return Math.min(offset + column, this.source.length);
	}
}

export function analyze(source: string, filePath?: string): AnalysisResult {
	const expanded = filePath ? expandSource(source, filePath) : undefined;
	const text = expanded?.text ?? source;
	const listener = new DiagnosticListener(text);
	const lexer = new OntoDLPlusLexer(CharStream.fromString(text));
	lexer.removeErrorListeners();
	lexer.addErrorListener(listener);

	const tokens = new CommonTokenStream(lexer);
	const parser = new OntoDLPlusParser(tokens);
	parser.removeErrorListeners();
	parser.addErrorListener(listener);
	const tree = parser.ontology();

	const pw = new ParseTreeWalker();
	const ontoListener = new DiagnosticSem();

	pw.walk(ontoListener, tree);
	const result: AnalysisResult = {
		diagnostics: listener.diagnostics,
		semanticDiagnostics: ontoListener.diagnostics,
		symbols: ontoListener.symbols()
	};
	if (!expanded) {
		result.semanticDiagnostics.sort(byStart);
		return result;
	}

	for (const diagnostic of result.diagnostics) {
		place(diagnostic, expanded.mapSpan);
	}
	for (const diagnostic of result.semanticDiagnostics) {
		place(diagnostic, expanded.mapSpan);
	}
	result.semanticDiagnostics.push(...expanded.problems);
	const table = result.symbols;
	if (table.ontology) {
		place(table.ontology, expanded.mapSpan);
		table.ontology.nameStart = expanded.mapPoint(
			table.ontology.nameStart
		);
		table.ontology.nameEnd = expanded.mapPoint(table.ontology.nameEnd);
	}
	for (const section of table.sections) {
		place(section, expanded.mapSpan);
	}
	for (const symbol of [
		...table.attributes.values(),
		...table.concepts.values(),
		...table.individuals.values(),
		...table.relations.values()
	]) {
		place(symbol, expanded.mapSpan);
	}
	for (const fact of table.facts) {
		place(fact, expanded.mapSpan);
	}
	for (const assignment of table.assignments) {
		place(assignment, expanded.mapSpan);
	}
	table.uses = table.uses.flatMap((use) => {
		const imported = place(use, expanded.mapSpan);
		return imported ? [] : [use];
	});
	result.diagnostics.sort(byStart);
	result.semanticDiagnostics.sort(byStart);
	return result;
}

function place(
	span: { start: number; end: number; imported?: boolean; message?: string },
	mapSpan: (start: number, end: number) => {
		start: number;
		end: number;
		imported?: boolean;
		file?: string;
	}
): boolean {
	const mapped = mapSpan(span.start, span.end);
	span.start = mapped.start;
	span.end = mapped.end;
	if (!mapped.imported) {
		return false;
	}
	if (span.message && mapped.file) {
		span.message = `${mapped.file}: ${span.message}`;
	} else {
		span.imported = true;
	}
	return true;
}

function byStart(
	left: { start: number },
	right: { start: number }
): number {
	return left.start - right.start;
}

function writtenValue(atom: AtomContext): string {
	const value = atom.getText();
	if (
		value.length >= 2
		&& value.startsWith('"')
		&& value.endsWith('"')
	) {
		return value.slice(1, -1);
	}
	return value;
}

function relationText(relation: TripleRelationContext): string | undefined {
	const keyword = relation.iofKeyword()
		?? relation.isaKeyword()
		?? relation.pofKeyword()
		?? relation.synonymKeyword();
	if (keyword) {
		return keyword.getText();
	}
	return relation.IDENTIFIER()?.getText();
}

function builtinLink(
	relation: TripleRelationContext
): BuiltinLink | undefined {
	if (relation.iofKeyword()) {
		return 'iof';
	}
	if (relation.isaKeyword()) {
		return 'isa';
	}
	if (relation.pofKeyword()) {
		return 'pof';
	}
	if (relation.synonymKeyword()) {
		return 'synonym';
	}
	return undefined;
}
