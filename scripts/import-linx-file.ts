import "dotenv/config";
import fs from "node:fs";
import { importarProdutosLinx } from "../server/routes/configuracoesImportacaoLinxApi";

const [, , filePath, guidEntidade, limitArg, skipArg] = process.argv;

if (!filePath || !guidEntidade) {
  console.error("Uso: pnpm.cmd exec tsx scripts/import-linx-file.ts <arquivo.xml> <GUIDENTIDADE> [limite] [pular]");
  process.exit(1);
}

function limitarXml(xml: string, limite: number, pular: number) {
  const groups = xml.match(/<Group\b[^>]*>[\s\S]*?<\/Group>/gi) ?? [];
  const inicio = Number.isFinite(pular) && pular > 0 ? pular : 0;
  const fim = Number.isFinite(limite) && limite > 0 ? inicio + limite : undefined;
  return `<?xml version="1.0" encoding="UTF-8"?><CrystalReport>${groups.slice(inicio, fim).join("")}</CrystalReport>`;
}

const xmlCompleto = fs.readFileSync(filePath, "utf8");
const limite = Number(limitArg ?? 0);
const pular = Number(skipArg ?? 0);
const xml = limitarXml(xmlCompleto, limite, pular);
const result = await importarProdutosLinx(xml, guidEntidade, (progress) => {
  if (
    progress.tipo === "progresso" &&
    (progress.processado === 1 || progress.processado % 100 === 0 || progress.processado === progress.totalEncontrados)
  ) {
    console.log(
      `${progress.processado}/${progress.totalEncontrados} ${progress.percentual}% ` +
      `ins=${progress.inseridos} atu=${progress.atualizados} aj=${progress.ajustados} err=${progress.erros}`
    );
  }
});

console.log(JSON.stringify({
  sucesso: result.sucesso,
  mensagem: result.mensagem,
  totalEncontrados: result.totalEncontrados,
  inseridos: result.inseridos,
  atualizados: result.atualizados,
  ignorados: result.ignorados,
  erros: result.erros,
  ajustados: result.ajustados,
  primeirosErros: result.logs.filter((log) => log.acao === "ERRO").slice(0, 10),
}, null, 2));
