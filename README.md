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
  prompt com status e horários. Mais novas primeiro (`started_at`), 20 por página, atualiza a
  cada 15 segundos. Quem enviou, o texto do prompt e o resultado ficam criptografados e só
  aparecem depois de **Descriptografar** na sessão.
- **Só leitura**: o painel nunca insere, altera nem apaga mensagens nem sessões de prompts.

Next.js (App Router, TypeScript, Tailwind) com o driver oficial do MongoDB, usado só no servidor.

## Variáveis de ambiente

| Variável             | Obrigatória | Descrição                                                        |
|----------------------|-------------|------------------------------------------------------------------|
| `AUTH_USERNAME`      | sim         | usuário do login (só existe um)                                  |
| `AUTH_PASSWORD_HASH` | sim         | hash scrypt da senha do login, gerado por `npm run hash-password` |
| `AUTH_SECRET`        | sim         | segredo da assinatura da sessão, 32 caracteres ou mais           |
| `MONGODB_URI`        | sim         | URI do MongoDB Atlas (um usuário só com leitura basta)           |
| `MONGODB_DATABASE`   | não         | banco, padrão `personal_whats`                                   |

Copie `.env.example` para `.env.local` (ignorado pelo git) e preencha.

### Hash da senha do login

```bash
npm run hash-password          # pede a senha sem mostrá-la
echo -n "minha senha" | npm run -s hash-password   # ou pela entrada padrão
```

O comando imprime algo como `scrypt:65536:8:1:<salt>:<hash>`: cole o valor inteiro em
`AUTH_PASSWORD_HASH`. A senha em si não fica em lugar nenhum.

### Segredo da sessão

```bash
openssl rand -base64 48
```

Trocar o `AUTH_SECRET` derruba todas as sessões abertas.

## Como funciona

### Login

- Um único usuário, conferido com `AUTH_USERNAME` e `AUTH_PASSWORD_HASH` (scrypt com salt
  aleatório, comparação em tempo constante). Login errado espera 1 segundo antes de responder.
- A sessão é um JWT HS256 (`jose`) assinado com `AUTH_SECRET`, válido por 7 dias, num cookie
  `HttpOnly`, `Secure`, `SameSite=Lax`. "Sair" apaga o cookie.
- O `src/proxy.ts` barra quem não tem sessão (páginas redirecionam para `/login`, a API responde
  401), mas não é a única proteção: o layout das páginas e cada rota da API conferem a sessão de
  novo no servidor antes de ler qualquer dado.

### Descriptografia

As mensagens e os prompts ficam criptografados no MongoDB (AES-256-GCM, especificação no
README da interface, mesma chave). O servidor só entrega `nonce` e `ciphertext` em base64 para
quem está logado, e o conteúdo de uma mensagem (ou dos prompts de uma sessão) só é buscado quando
você clica em **Descriptografar**. A listagem nunca devolve `nonce` nem `ciphertext`.

1. Você digita a senha de criptografia no topo da página.
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
   isso use uma senha forte no usuário do banco e, de preferência, um usuário só com o papel
   `read` no banco `personal_whats` (cobre as coleções `messages`, `settings` e
   `prompt_sessions`).
4. O cookie de sessão é `Secure`, então o painel só funciona em HTTPS (a Vercel já serve assim) ou
   em `localhost`.
