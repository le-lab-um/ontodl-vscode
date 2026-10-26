# Política de Utilização do Git

O presente repositório armazena o trabalho desenvolvido
no âmbito do Projeto Informática.
Embora seja público, durante esta edição
da UC referida, apenas serão aceites contribuições dos membros
da equipa designados ao desevolvimento desta ferramenta.

Desta forma, serve este ficheiro para definir a política de
utilização do git, com as regras inerentes às branches, commits
e boas práticas em Pull Requests.

## Branches

- Não são permitida escritas diretas para a `main`;
- Para cada tarefa a desenvolver, é necessário criar uma branch com
	o seguinte formato: `iniciais/nome-funcionalidade`;
- Ao terminar cada tarefa é necessário abrir um Pull Request;
- Após a integração do Pull Request na main, a branch será apagada.

## Commits

- As mensagens têm de seguir o seguinte formato: `prefixo: mensagem`;
	- O prefixo apenas pode ser um dos seguintes: feature, fix, test, chore;
	- A mensagem tem de ser curta e sem ponto final;
- Os commits têm de conter uma diff com um número de linhas aceitável
	para a leitura de um ser humano (dentro dos limites do bom senso).
- Sempre que se utilizar uma LLM, ou derivados (e.g agentic workflow/mcp servers), utilizar uma trailing message
	com o seguinte formato: `AI-assisted: <yes/no> (modelo)`, de forma
	a estar em conformidade com o uso responsável de Inteligência Artifical
	segundo a Universidade do Minho.

## Git hooks

- O `npm ci` instala hooks ([lefthook](https://lefthook.dev), ver `lefthook.yml`) que validam
	localmente o que a CI e esta política exigem:
	- `pre-commit`: oxlint e ESLint com `--fix` nos ficheiros staged, actionlint nos workflows
		e bloqueio de commits na `main`;
	- `commit-msg`: formato `prefixo: mensagem` e trailer `AI-assisted`;
	- `pre-push`: nome da branch, bloqueio de push para a `main`, compile, ESLint, oxlint, knip,
		actionlint e testes da linguagem;
	- `post-merge`/`post-checkout`: `npm ci` quando um `package-lock.json` muda.
- Os testes e2e da extensão correm com `npx lefthook run e2e`.
- Em caso de necessidade, `LEFTHOOK=0` ou `--no-verify` ignoram os hooks.

## Pull Requests

- Atualizar a branch com a main e resolver conflitos antes de pedir review
- Confirmar que a extensão compila, os testes passam e, mais importante,
	nenhuma das funcionalidades anteriormente implementadas seja comprometida.