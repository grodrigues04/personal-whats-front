/**
 * Prints the AUTH_PASSWORD_HASH value for a password typed in the terminal (not echoed), or read
 * from stdin when it is not a terminal: `echo -n "senha" | npm run hash-password`.
 */
import { stdin, stdout } from "node:process";

import { hashPassword } from "../src/lib/auth/password";

async function readPasswordFromPipe(): Promise<string> {
  let input = "";
  for await (const chunk of stdin) {
    input += chunk;
  }
  return input.replace(/\r?\n$/, "");
}

function readPasswordFromTerminal(): Promise<string> {
  return new Promise((resolve) => {
    stdout.write("Senha: ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let password = "";
    stdin.on("data", (character: string) => {
      if (character === "\r" || character === "\n" || character === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write("\n");
        resolve(password);
      } else if (character === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      } else if (character === "\u007f") {
        password = password.slice(0, -1);
      } else {
        password += character;
      }
    });
  });
}

async function main(): Promise<void> {
  const password = stdin.isTTY ? await readPasswordFromTerminal() : await readPasswordFromPipe();
  if (!password) {
    console.error("A senha não pode ser vazia");
    process.exit(1);
  }
  console.log(await hashPassword(password));
}

main();
