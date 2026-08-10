import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Os testes de integração compartilham um único arquivo SQLite e limpam as
    // tabelas entre casos; rodar arquivos de teste em paralelo causaria
    // violações de FK por uma suíte apagar dados que a outra está usando.
    fileParallelism: false,
  },
});
