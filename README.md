# personal-whats-front

Painel pessoal da fila de mensagens de WhatsApp do **personalWhats**. Mostra as mensagens
gravadas no MongoDB Atlas pela [interface-personal-whats](../interface-personal-whats) e permite
descriptografá-las **no navegador**.

- **Fila**: mensagens `received`, `validated` e `sending`.
- **Histórico**: mensagens `sent`, `failed` e `rejected` (somem 30 dias depois do status final,
  pelo índice TTL).
- Mais novas primeiro, 20 por página, filtro por origem (`source`) e status, datas no fuso
  `America/Sao_Paulo`, tentativas e erro. Atualiza sozinho a cada 15 segundos.
- **Prompts**: sessões da coleção `prompt_sessions`, gravadas pelo `prompt_automator` a cada
  `/liberar prompt` no WhatsApp. Mostra status da sessão, grupo, início e fim, duração, limite
  ("INFINITO" quando não tem), quantidade de prompts, branch, link do PR e motivo do fim, e cada
  prompt com status, origem (grupo ou frontend) e horários. Mais novas primeiro (`started_at`),
  20 por página, atualiza a cada 15 segundos (4 segundos com uma sessão em andamento). Quem
  enviou, o texto do prompt, as perguntas do Claude, as respostas e o resultado ficam
  criptografados e só aparecem depois de **Descriptografar** na sessão.
  - **Sessão em andamento**: a fila visual (prompt rodando e os que esperam, com a posição
    `1/3`, o limite de prompts e até quando a sessão aceita prompts), o **terminal ao vivo** do
    prompt rodando, o formulário para **mandar um prompt** e, quando o Claude pergunta, as
    perguntas com o formulário para **responder**.
  - **Terminal** (`>_ Terminal` em cada prompt): cópia visual do terminal do Claude Code, com o
    que ele escreveu, cada ferramenta chamada (clique para ver a entrada) e a saída dela. Só
    mostra: nada do que está ali é executado.
  - Cada sessão é um bloco com título (data de início), status, total de prompts, resumo dos
    resultados e **quantos dias faltam para apagar** o terminal e os envios pelo frontend dela
    (10 dias depois do início, `records_expire_at`). A sessão e os prompts não são apagados.
- **Escrita**: o painel nunca altera nem apaga mensagens nem sessões. A única escrita é a
  inserção de prompts e respostas em `prompt_inputs`, já criptografados no navegador.

Next.js (App Router, TypeScript, Tailwind) com o driver oficial do MongoDB, usado só no servidor.

## Variáveis de ambiente

| Variável             | Obrigatória | Descrição                                                        |
|----------------------|-------------|------------------------------------------------------------------|
| `AUTH_USERNAME`      | sim         | usuário do admin (vê tudo)                                       |
| `AUTH_PASSWORD_HASH` | sim         | hash scrypt da senha do admin, gerado por `npm run hash-password` |
| `AUTH_NAME`          | não         | nome do admin nos avisos, padrão `Gustavo`                       |
| `AUTH_PROMPT_USERS`  | não         | usuários que só veem a aba Prompts (JSON, ver abaixo)            |
| `AUTH_SECRET`        | sim         | segredo da assinatura da sessão, 32 caracteres ou mais           |
| `MONGODB_URI`        | sim         | URI do MongoDB Atlas (leitura, mais inserção em `prompt_inputs`) |
| `MONGODB_DATABASE`   | não         | banco, padrão `personal_whats`                                   |

Copie `.env.example` para `.env.local` (ignorado pelo git) e preencha.

### Hash da senha do login

```bash
npm run hash-password          # pede a senha sem mostrá-la
echo -n "minha senha" | npm run -s hash-password   # ou pela entrada padrão
```

O comando imprime algo como `scrypt:65536:8:1:<salt>:<hash>`: cole o valor inteiro em
`AUTH_PASSWORD_HASH`. A senha em si não fica em lugar nenhum.

### Usuários da aba Prompts

```
AUTH_PROMPT_USERS=[{"username":"4899999999","name":"Maria","password_hash":"scrypt:..."}]
```

- `username`: o login. Um telefone é comparado sem formatação, DDI nem o nono dígito: quem tem
  `4899999999` entra com `+55 48 9 9999-9999`, `48999999999` ou `4899999999`.
- `name`: aparece no front e no aviso do grupo ("Maria adicionou um prompt à fila pelo frontend").
- `password_hash`: saída do `npm run hash-password`.
- Os telefones ficam só na variável de ambiente (o repositório é público) e nunca saem do servidor:
  a API não devolve o login de ninguém.

### Segredo da sessão

```bash
openssl rand -base64 48
```

Trocar o `AUTH_SECRET` derruba todas as sessões abertas.

## Como funciona

### Login

- O admin (`AUTH_USERNAME`) vê tudo. Os usuários de `AUTH_PROMPT_USERS` só veem a aba Prompts:
  o `src/proxy.ts` manda as outras páginas para `/prompts` e responde 403 nas APIs das mensagens,
  e as páginas e rotas das mensagens conferem de novo no servidor.
- Senha conferida com scrypt (salt aleatório, comparação em tempo constante; usuário inexistente
  também calcula um hash). Login errado espera 1 segundo antes de responder.
- A sessão é um JWT HS256 (`jose`) assinado com `AUTH_SECRET` (login, nome e papel), válido por
  7 dias, num cookie `HttpOnly`, `Secure`, `SameSite=Lax`. "Sair" apaga o cookie.
- O `src/proxy.ts` barra quem não tem sessão (páginas redirecionam para `/login`, a API responde
  401), mas não é a única proteção: o layout das páginas e cada rota da API conferem a sessão de
  novo no servidor antes de ler qualquer dado.

### Descriptografia

As mensagens e os prompts ficam criptografados no MongoDB (AES-256-GCM, especificação no
README da interface), com **chaves diferentes**: as mensagens com a `ENCRYPTION_PASSWORD` do
personalWhats (só o admin) e os prompts, o terminal e os envios do front com a
`PROMPT_ENCRYPTION_PASSWORD` do prompt_automator (conferida pelo documento `prompt_key_check` da
coleção `settings`). O servidor só entrega `nonce` e `ciphertext` em base64 para
quem está logado, e o conteúdo de uma mensagem (ou dos prompts de uma sessão) só é buscado quando
você clica em **Descriptografar**. A listagem nunca devolve `nonce` nem `ciphertext`.

1. Você digita a senha no topo da página (a das mensagens na Fila e no Histórico, a dos prompts
   na aba Prompts).
2. O navegador deriva a chave com WebCrypto (PBKDF2-HMAC-SHA256, 600.000 iterações) e confere a
   senha descriptografando o documento `key_check` da coleção `settings`. Senha errada mostra
   "Senha de criptografia incorreta".
3. A chave fica só na memória da aba, como `CryptoKey` não exportável. A senha **nunca** é
   enviada ao servidor nem gravada (nada de localStorage, sessionStorage, cookie ou IndexedDB),
   e o campo é limpo logo depois.
4. Cada mensagem descriptografada mostra texto, destinatário ("contato padrão" quando não tem) e
   anexos com botão para baixar. Cada sessão de prompts descriptografada mostra, em cada prompt,
   quem enviou, o texto e o resultado (o que foi implementado, ou por que foi cancelado,
   rejeitado ou falhou).
5. **Bloquear** (ou recarregar a página) descarta a chave e tudo que foi descriptografado.

### Prompts e respostas pelo frontend

1. O navegador criptografa `{"text": "..."}` com a chave dos prompts (nonce aleatório) e manda
   para `POST /api/prompt-sessions/<id>/inputs` (`kind` `prompt` ou `answer`).
2. O servidor confere o formato, se a sessão ainda aceita prompts (ou se o prompt está esperando
   respostas) e se a pessoa não tem 3 envios pendentes, e grava em `prompt_inputs` com o login e o
   nome **da sessão do login**, nunca do corpo do pedido.
3. O prompt_automator lê os pendentes a cada 5 segundos, aplica as regras do `/prompt` (repetido,
   limite...) e marca `accepted` ou `refused` com o motivo, que aparece em "Seus envios". Aceito,
   o grupo recebe `Maria adicionou um prompt à fila pelo frontend. Fila: 2/3` (e o limite, quando
   a sessão tem); recusado, o grupo recebe o motivo.
4. Respostas valem como as do grupo: a primeira que chegar (grupo ou front) é usada.

O código fica em `src/lib/encryption/decryption.ts` (o JSON dos prompts em
`src/lib/encryption/prompt-content.ts`) e é testado contra os vetores da interface
(`tests/vectors/v1.json`, cópia de `interface-personal-whats/tests/vectors/v1.json`). Se a
criptografia mudar na interface, copie os vetores de novo e rode os testes.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # e preencha
npm run dev                  # http://localhost:3000
```

Para testar sem mexer nos dados reais, use `MONGODB_DATABASE=personal_whats_dev` e grave
mensagens de teste com a interface Python.

```bash
npm test            # vitest: vetores de criptografia, conteúdo dos prompts, hash de senha e sessão
npm run lint
npm run typecheck   # depois de um build ou do dev, que geram os tipos das rotas
npm run build
```

## Deploy na Vercel

1. Importe o repositório na Vercel (framework Next.js, sem configuração extra).
2. Cadastre as variáveis de ambiente da tabela acima em *Settings → Environment Variables*.
3. No MongoDB Atlas, em *Network Access*, libere `0.0.0.0/0`: a Vercel não tem IPs fixos. Por
   isso use uma senha forte no usuário do banco e, de preferência, um usuário com `read` no banco
   `personal_whats` (coleções `messages`, `settings`, `prompt_sessions` e `prompt_terminal`) e
   `insert` só na coleção `prompt_inputs`.
4. O cookie de sessão é `Secure`, então o painel só funciona em HTTPS (a Vercel já serve assim) ou
   em `localhost`.
