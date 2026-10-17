// OntoDL+ syntactic grammar
//
// Reconstructs the language described in:
// Alexandre Costa Dias, "ONTODL+: an ontology description language and its
// compiler", Master's thesis, University of Minho, 2021.
// https://hdl.handle.net/1822/81340
//
// Licensed under CC BY-NC 4.0. See NOTICE.md for attribution.
// This file has no semantic actions and is not the original compiler grammar.
// See grammar/NOTES.md for sources, keyword choices, and gaps.

grammar OntoDLPlus;

ontologia
    : 'Ontologia' TEXT atributosSecao? conceitos individuos? relacoes triplos restricoes? '.'
    ;

atributosSecao
    : atributosKw '{' (expandStmt | atributoDeclList) '}'
    ;

atributoDeclList
    : atributoDecl (',' atributoDecl)*
    ;

atributoDecl
    : TEXT ':' tipo
    ;

conceitos
    : conceitosKw '{' (expandStmt | conceitoList) '}'
    ;

conceitoList
    : conceito (',' conceito)*
    ;

conceito
    : TEXT atributos?
    ;

atributos
    : '[' atributoRef (',' atributoRef)* ']'
    ;

atributoRef
    : TEXT (':' tipo)?
    ;

tipo
    : TEXT
    | 'enum' '(' enumValue (',' enumValue)* ')'
    ;

enumValue
    : atom
    ;

individuos
    : 'individuos' '{' (expandStmt | individuoList) '}'
    ;

individuoList
    : TEXT TEXT? (',' TEXT TEXT?)*
    ;

relacoes
    : relacoesKw '{' (expandStmt | relacaoList) '}'
    ;

relacaoList
    : relacao (',' relacao)*
    ;

relacao
    : TEXT ('[' relInf (',' relInf)* ']')?
    ;

relInf
    : 'domain' ':' TEXT
    | 'codomain' ':' TEXT
    | 'props' ':' properties
    ;

properties
    : '(' property (',' property)* ')'
    | property
    ;

property
    : 'bijection'
    | 'injection'
    | 'surjection'
    | 'abstraction'
    | 'function'
    | 'representation'
    | 'surjective'
    | 'simple'
    | 'entire'
    | 'injective'
    | inverseKw '=' TEXT
    ;

triplos
    : 'triplos' '{' (expandStmt | triploList) '}'
    ;

triploList
    : triplo (';' triplo)*
    ;

triplo
    : '('? TEXT '=' iofKw '=>' TEXT atribInsts? ')'?
    | '('? TEXT '=' pofKw '=>' TEXT ')'?
    | '('? TEXT '=' isaKw '=>' TEXT ')'?
    | '('? TEXT '=' synKw '=>' TEXT ')'?
    | '('? TEXT '=' TEXT '=>' TEXT ')'?
    | TEXT '=[' relacionamentos (';' relacionamentos)* ']'
    ;

relacionamentos
    : TEXT '=>' TEXT (',' relMultiplo)*
    | synKw '=>' TEXT (',' relMultiplo)*
    | isaKw '=>' TEXT (',' relMultiplo)*
    | pofKw '=>' TEXT (',' relMultiplo)*
    | iofKw '=>' TEXT atribInsts? (',' relMultiplo)*
    ;

relMultiplo
    : ('=>')? TEXT
    ;

atribInsts
    : '[' atribInst (',' atribInst)* ']'
    ;

atribInst
    : TEXT '=' atom
    ;

restricoes
    : restricoesKw '{' constraint* '}'
    ;

constraint
    : constraintAtom ':-' constraintBody '.'
    ;

constraintBody
    : constraintDisj
    ;

constraintDisj
    : constraintConj (';' constraintConj)*
    ;

constraintConj
    : constraintPrim (',' constraintPrim)*
    ;

constraintPrim
    : '(' constraintBody ')'
    | 'not' '(' constraintBody ')'
    | constraintAtom
    ;

constraintAtom
    : TEXT '=' TEXT '=>' TEXT
    | TEXT '==' atom
    | TEXT NEQ atom
    ;

expandStmt
    : 'expand' fileName ';'
    ;

fileName
    : TEXT ('.' TEXT)+
    ;

atom
    : TEXT
    | STRING
    | NUMBER
    ;

atributosKw   : 'atributos' | 'attributes' ;
conceitosKw   : 'conceitos' | 'concepts' ;
relacoesKw    : 'relacoes' | 'relations' ;
restricoesKw  : 'restricoes' | 'restrictions' ;
inverseKw     : 'inverseOf' | 'inversaDe' ;
iofKw         : 'iof' | 'instancia' ;
pofKw         : 'pof' | 'parte' ;
isaKw         : 'is-a' | 'subclasse' ;
synKw         : 'synonym' | 'sinonimo' ;

NEQ : '\\=' ;

NUMBER
    : [0-9]+
    ;

STRING
    : '"' (~["\r\n])* '"'
    | '\'' (~['\r\n])* '\''
    ;

TEXT
    : [a-zA-Z_\u00C0-\u024F] [a-zA-Z0-9_\-\u00C0-\u024F]*
    ;

LINE_COMMENT
    : '//' ~[\r\n]* -> skip
    ;

BLOCK_COMMENT
    : '/*' .*? '*/' -> skip
    ;

WS
    : [ \t\r\n]+ -> skip
    ;