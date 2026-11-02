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
}

import {
	ANTLRErrorListener,
	ATNSimulator,
	BaseErrorListener,
	CharStream,
	CommonTokenStream,
	ParseTreeWalker,
	RecognitionException,
	Recognizer,
	TerminalNode,
	Token
} from 'antlr4ng';

import { OntoDLPlusLexer } from './generated/OntoDLPlusLexer.js';
import {
	AttributeDeclarationContext,
	AttributeInstanceContext,
	AttributeReferenceContext,
	AtomContext,
	GroupedObjectContext,
	IndividualListContext,
	OntoDLPlusParser,
	PropertyContext,
	RelationContext,
	RelationInformationContext,
	RelationshipContext,
	TripleContext,
	TripleRelationContext,
	TypeContext,
	ConceptContext
} from './generated/OntoDLPlusParser.js';
import { OntoDLPlusListener } from './generated/OntoDLPlusListener.js';

type AttributeType =
	| { kind: 'string' }
	| { kind: 'int' }
	| { kind: 'enum'; values: string[] };

class DiagnosticSem extends OntoDLPlusListener {
	public readonly diagnostics: LanguageDiagnostic[] = [];

	public readonly concepts = new Set<string>();
	public readonly relations = new Set<string>();
	public readonly individualLists = new Set<string>();
	public readonly attributes = new Set<string>();

	private readonly attributeTypes = new Map<string, AttributeType>();
	private readonly pendingInverses: TerminalNode[] = [];

	public override enterConcept = (ctx: ConceptContext): void => {
		this.declare(this.concepts, ctx.IDENTIFIER());
	};

	public override enterRelation = (ctx: RelationContext): void => {
		this.declare(this.relations, ctx.IDENTIFIER());
	};

	public override enterIndividualList = (
		ctx: IndividualListContext
	): void => {
		for (const id of ctx.IDENTIFIER()) {
			this.declare(this.individualLists, id);
		}
	};

	public override enterAttributeDeclaration = (
		ctx: AttributeDeclarationContext
	): void => {
		const id = ctx.IDENTIFIER();
		if (!this.declare(this.attributes, id)) {
			return;
		}
		this.attributeTypes.set(id.getText(), this.readType(ctx.type()));
	};

	public override enterAttributeReference = (
		ctx: AttributeReferenceContext
	): void => {
		const id = ctx.IDENTIFIER();
		const typeNode = ctx.type();
		if (!typeNode) {
			if (!this.attributes.has(id.getText())) {
				this.report('warning', id, `${id.getText()} not declared`);
			}
			return;
		}

		const type = this.readType(typeNode);
		const previous = this.attributeTypes.get(id.getText());
		if (!previous) {
			this.attributes.add(id.getText());
			this.attributeTypes.set(id.getText(), type);
			return;
		}
		if (!this.sameType(previous, type)) {
			this.report(
				'warning',
				id,
				`${id.getText()} type does not match previous declaration`
			);
		}
	};

	public override enterRelationInformation = (
		ctx: RelationInformationContext
	): void => {
		const id = ctx.IDENTIFIER();
		const isEndpoint = ctx.domainKeyword() ?? ctx.counterdomainKeyword();
		if (isEndpoint && id && !this.concepts.has(id.getText())) {
			this.report('warning', id, `${id.getText()} is not a concept`);
		}
	};

	public override enterProperty = (ctx: PropertyContext): void => {
		const id = ctx.IDENTIFIER();
		if (ctx.inverseKeyword() && id) {
			this.pendingInverses.push(id);
		}
	};

	public override exitRelationsSection = (): void => {
		for (const id of this.pendingInverses) {
			if (!this.relations.has(id.getText())) {
				this.report(
					'warning',
					id,
					`${id.getText()} is not a relation`
				);
			}
		}
	};

	public override enterTriple = (ctx: TripleContext): void => {
		for (const id of ctx.IDENTIFIER()) {
			this.checkEntity(id);
		}
	};

	public override enterTripleRelation = (
		ctx: TripleRelationContext
	): void => {
		const id = ctx.IDENTIFIER();
		if (id && !this.relations.has(id.getText())) {
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
		if (!this.attributes.has(name)) {
			this.report('warning', id, `${name} not declared`);
			return;
		}

		const type = this.attributeTypes.get(name);
		const token = this.atomToken(ctx.atom());
		if (!type || !token || this.valueMatches(type, ctx.atom())) {
			return;
		}
		this.report(
			'warning',
			token,
			`${name} value does not match its type`
		);
	};

	private checkEntity(id: TerminalNode): void {
		if (!this.isDeclaredEntity(id)) {
			this.report('warning', id, `${id.getText()} not declared`);
		}
	}

	private isDeclaredEntity(id: TerminalNode): boolean {
		return this.individualLists.has(id.getText())
			|| this.concepts.has(id.getText());
	}

	private declare(names: Set<string>, id: TerminalNode): boolean {
		const name = id.getText();
		if (names.has(name)) {
			this.report('warning', id, `${name} declared more than once`);
			return false;
		}
		names.add(name);
		return true;
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

export function analyze(source: string): AnalysisResult {
	const listener = new DiagnosticListener(source);
	const lexer = new OntoDLPlusLexer(CharStream.fromString(source));
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
	ontoListener.diagnostics.sort((left, right) => left.start - right.start);

	return {
		diagnostics: listener.diagnostics,
		semanticDiagnostics: ontoListener.diagnostics
	};
}
