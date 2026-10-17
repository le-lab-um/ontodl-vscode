grammar OntoDLPlus;

ontology
    : header attributesSection? conceptsSection individualsSection? relationsSection triplesSection restrictionsSection? '.' EOF
    ;

header
    : ('Ontologia' | 'Ontology') IDENTIFIER
    ;

attributesSection
    : attributesKeyword '{' (expandStatement | attributeDeclarationList)* '}'
    ;

attributeDeclarationList
    : attributeDeclaration (',' attributeDeclaration)*
    ;

attributeDeclaration
    : IDENTIFIER ':' type
    ;

conceptsSection
    : conceptsKeyword '{' (expandStatement | conceptList)* '}'
    ;

conceptList
    : concept (',' concept)*
    ;

concept
    : IDENTIFIER attributeReferences?
    ;

attributeReferences
    : '[' attributeReference (',' attributeReference)* ']'
    ;

attributeReference
    : IDENTIFIER (':' type)?
    ;

type
    : 'string'
    | 'int'
    | 'enum' '(' enumValue (',' enumValue)* ')'
    ;

enumValue
    : IDENTIFIER
    | NUMBER
    ;

individualsSection
    : individualsKeyword '{' (expandStatement | individualList)* '}'
    ;

individualList
    : IDENTIFIER (',' IDENTIFIER)*
    ;

relationsSection
    : relationsKeyword '{' (expandStatement | relationList)* '}'
    ;

relationList
    : relation (',' relation)*
    ;

relation
    : IDENTIFIER ('[' relationInformation (',' relationInformation)* ']')?
    ;

relationInformation
    : domainKeyword ':' IDENTIFIER
    | counterdomainKeyword ':' IDENTIFIER
    | 'props' ':' properties
    ;

properties
    : '(' property (',' property)* ')'
    | property
    ;

property
    : 'bijecao'
    | 'bijection'
    | 'injecao'
    | 'injection'
    | 'sobrejecao'
    | 'surjection'
    | 'abstracao'
    | 'abstraction'
    | 'funcao'
    | 'function'
    | 'representacao'
    | 'representation'
    | 'sobrejetiva'
    | 'surjective'
    | 'simples'
    | 'simple'
    | 'inteira'
    | 'entire'
    | 'injetiva'
    | 'injective'
    | inverseKeyword '=' IDENTIFIER
    ;

triplesSection
    : triplesKeyword '{' (expandStatement | tripleList)* '}'
    ;

tripleList
    : triple (';' triple)*
    ;

triple
    : '('? IDENTIFIER '=' tripleRelation relationAttribute? '=>' IDENTIFIER attributeInstances? ')'?
    | IDENTIFIER '=[' relationship (';' relationship)* ']'
    ;

tripleRelation
    : iofKeyword
    | pofKeyword
    | isaKeyword
    | synonymKeyword
    | IDENTIFIER
    ;

relationship
    : tripleRelation relationAttribute? '=>' IDENTIFIER attributeInstances? (',' groupedObject)*
    ;

groupedObject
    : IDENTIFIER attributeInstances?
    ;

relationAttribute
    : attributeInstances
    ;

attributeInstances
    : '[' attributeInstance (',' attributeInstance)* ']'
    ;

attributeInstance
    : IDENTIFIER '=' atom
    ;

restrictionsSection
    : restrictionsKeyword '{' (expandStatement | restriction)+ '}'
    ;

restriction
    : constraintAtom ':-' constraintBody '.'
    ;

constraintBody
    : constraintConjunction (';' constraintConjunction)*
    ;

constraintConjunction
    : constraintPrimitive (',' constraintPrimitive)*
    ;

constraintPrimitive
    : '(' constraintBody ')'
    | negationKeyword '(' constraintBody ')'
    | constraintAtom
    ;

constraintAtom
    : IDENTIFIER '=' IDENTIFIER '=>' IDENTIFIER
    | IDENTIFIER '==' atom
    | IDENTIFIER '\\=' atom
    ;

expandStatement
    : 'expand' expandPath ';'
    ;

expandPath
    : (IDENTIFIER | NUMBER | '.' | '/')+
    ;

atom
    : IDENTIFIER
    | STRING
    | NUMBER
    ;

attributesKeyword
    : 'atributos'
    | 'attributes'
    | 'dataProperties'
    | 'propriedadesDados'
    ;

conceptsKeyword
    : 'conceitos'
    | 'concepts'
    | 'classes'
    ;

individualsKeyword
    : 'individuos'
    | 'individuals'
    ;

relationsKeyword
    : 'relacoes'
    | 'relationships'
    | 'objectProperties'
    | 'propriedadesObjetos'
    ;

triplesKeyword
    : 'triplos'
    | 'triples'
    ;

restrictionsKeyword
    : 'restricoes'
    | 'restrictions'
    ;

domainKeyword
    : 'domain'
    | 'dominio'
    ;

counterdomainKeyword
    : 'contradominio'
    | 'codiminio'
    | 'counterdomain'
    | 'codomain'
    ;

isaKeyword
    : 'is-a'
    | 'subclasse'
    | 'a'
    | 'subClassOf'
    ;

iofKeyword
    : 'iof'
    | 'instancia'
    | 'instanceof'
    | 'type'
    ;

synonymKeyword
    : 'synonym'
    | 'sinonimo'
    ;

pofKeyword
    : 'pof'
    | 'parte'
    | 'partOf'
    ;

inverseKeyword
    : 'inversaDe'
    | 'inverseOf'
    ;

negationKeyword
    : 'not'
    | '!'
    | 'nao'
    ;

NUMBER
    : '-'? [0-9]+
    ;

STRING
    : '"' (~["\r\n])* '"'
    | '\'' (~['\r\n])* '\''
    ;

IDENTIFIER
    : [a-zA-Z\u00C0-\u024F] [a-zA-Z0-9_\-/\u00C0-\u024F]*
    ;

LINE_COMMENT
    : '%' ~[\r\n]* -> skip
    ;

WS
    : [ \t\r\n]+ -> skip
    ;