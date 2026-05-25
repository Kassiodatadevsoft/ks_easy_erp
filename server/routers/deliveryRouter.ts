/**
 * deliveryRouter — Endpoints públicos e admin do sistema de delivery
 * Usa SQL Server:
 *   KS0000.KS00008 = categorias
 *   KS0000.KS00009 = produtos
 *   KS0001.KS00001 = pedidos
 *   KS0001.KS00002 = itens do pedido
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { verifyKsSession } from "./ksAuthRouter";

async function getKsSession(req: { headers: { cookie?: string } }) {
  const cookies = req.headers.cookie ?? "";
  const match = cookies.match(/ks_session=([^;]+)/);
  const token = match?.[1];
  return await verifyKsSession(token);
}

// ── helpers ──────────────────────────────────────────────────────────────────
function sqlStr(v: string | null | undefined) {
  if (v === null || v === undefined || v === "") return "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}
function sqlNum(v: number | null | undefined) {
  if (v === null || v === undefined || isNaN(Number(v))) return "NULL";
  return String(Number(v));
}
function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let t = "";
  for (let i = 0; i < 10; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

const STATUS_LABELS: Record<string, string> = {
  RECEBIDO: "Pedido Recebido",
  PREPARANDO: "Em Preparo",
  SAIU_ENTREGA: "Saiu para Entrega",
  PRONTO_RETIRADA: "Pronto para Retirada",
  ENTREGUE: "Entregue",
  CANCELADO: "Cancelado",
};

const PAYMENT_LABELS: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  CARTAO_CREDITO: "Cartão de Crédito",
  CARTAO_DEBITO: "Cartão de Débito",
  PIX: "Pix",
};

const itemSchema = z.object({
  guidProduto: z.string(),
  nomeProduto: z.string(),
  tamanho: z.string().optional(),
  quantidade: z.number().min(0.001),
  precoUnitario: z.number().min(0),
  observacao: z.string().optional(),
  metade1Guid: z.string().optional(),
  metade1Nome: z.string().optional(),
  metade2Guid: z.string().optional(),
  metade2Nome: z.string().optional(),
});

export const deliveryRouter = router({

  // ── Cardápio público ────────────────────────────────────────────────────────
  categorias: publicProcedure
    .input(z.object({ guidentidade: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const gent = input.guidentidade || session?.guidEntidade;
      if (!gent) return [];
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const result = await pool.request().query(`
        SELECT CODCATEGORIA, CATEGORIA, DESCRICAO, SLUG, ORDEMEXIBICAO, GUIDCATEGORIA
        FROM KS0000.KS00008
        WHERE GUIDENTIDADE = '${gent}' AND SITUACAO = 'A'
        ORDER BY ORDEMEXIBICAO, CATEGORIA
      `);
      return result.recordset;
    }),

  produtos: publicProcedure
    .input(z.object({
      guidentidade: z.string(),
      codCategoria: z.number().optional(),
      destaque: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const gent = input.guidentidade || session?.guidEntidade;
      if (!gent) return [];
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      let where = `p.GUIDENTIDADE = '${gent}' AND p.SITUACAO = 'A'`;
      if (input.codCategoria) where += ` AND p.CODCATEGORIA = ${input.codCategoria}`;
      if (input.destaque) where += ` AND p.DESTAQUE = 1`;
      const result = await pool.request().query(`
        SELECT
          p.CODPRODUTO, p.GUIDPRODUTO, p.PRODUTO, p.DESCRICAO,
          p.CODCATEGORIA, c.CATEGORIA,
          p.PRECOS, p.TAMANHOSDISP, p.PRECO, p.PRECOVENDA,
          p.IMAGEURL, p.DESTAQUE, p.ORDEMEXIBICAO,
          p.PERCDESCONTO, p.PRECOPROMO, p.DTINICIOPROMO, p.DTFIMPROMO,
          p.BALANCA, p.SERVICO, p.FRACIONADO,
          ISNULL(p.ESTOQUE,0) AS ESTOQUE
        FROM KS0000.KS00009 p
        LEFT JOIN KS0000.KS00008 c ON c.CODCATEGORIA = p.CODCATEGORIA AND c.GUIDENTIDADE = p.GUIDENTIDADE
        WHERE ${where}
        ORDER BY p.ORDEMEXIBICAO, p.PRODUTO
      `);
      return result.recordset;
    }),

  produtoDestaque: publicProcedure
    .input(z.object({ guidentidade: z.string() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      const gent = input.guidentidade || session?.guidEntidade;
      if (!gent) return [];
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const result = await pool.request().query(`
        SELECT TOP 8
          p.CODPRODUTO, p.GUIDPRODUTO, p.PRODUTO, p.DESCRICAO,
          p.PRECOS, p.TAMANHOSDISP, p.PRECO, p.PRECOVENDA,
          p.IMAGEURL, p.DESTAQUE, p.CODCATEGORIA,
          p.PERCDESCONTO, p.PRECOPROMO, p.DTINICIOPROMO, p.DTFIMPROMO
        FROM KS0000.KS00009 p
        WHERE p.GUIDENTIDADE = '${gent}' AND p.SITUACAO = 'A' AND p.DESTAQUE = 1
        ORDER BY p.ORDEMEXIBICAO, p.PRODUTO
      `);
      return result.recordset;
    }),

  // ── Criar pedido ─────────────────────────────────────────────────────────────
  criarPedido: publicProcedure
    .input(z.object({
      guidentidade: z.string(),
      nomeCliente: z.string().min(2).max(150),
      telefone: z.string().optional(),
      email: z.string().email().optional(),
      tipoEntrega: z.enum(["ENTREGA", "RETIRADA"]).default("ENTREGA"),
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      cidade: z.string().optional(),
      uf: z.string().max(2).optional(),
      cep: z.string().optional(),
      subtotal: z.number().min(0),
      taxaEntrega: z.number().min(0).default(0),
      total: z.number().min(0),
      formaPagamento: z.enum(["DINHEIRO", "CARTAO_CREDITO", "CARTAO_DEBITO", "PIX"]),
      trocoPara: z.number().optional(),
      observacao: z.string().max(500).optional(),
      itens: z.array(itemSchema).min(1),
    }))
    .mutation(async ({ input }) => {
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const token = generateToken();
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);

      // Inserir pedido
      const pedidoResult = await pool.request().query(`
        INSERT INTO KS0001.KS00001 (
          TOKEN, GUIDENTIDADE,
          NOMECLIENTE, TELEFONE, EMAIL,
          TIPOENTREGA,
          LOGRADOURO, NUMERO, COMPLEMENTO, BAIRRO, CIDADE, UF, CEP,
          SUBTOTAL, TAXAENTREGA, TOTAL,
          FORMAPAGAMENTO, TROCOPARA,
          STATUS, OBSERVACAO,
          DATACADASTRO, ULTIMAALTERACAO
        ) VALUES (
          '${token}', '${input.guidentidade}',
          '${input.nomeCliente.replace(/'/g, "''")}',
          ${sqlStr(input.telefone)}, ${sqlStr(input.email)},
          '${input.tipoEntrega}',
          ${sqlStr(input.logradouro)}, ${sqlStr(input.numero)},
          ${sqlStr(input.complemento)}, ${sqlStr(input.bairro)},
          ${sqlStr(input.cidade)}, ${sqlStr(input.uf)}, ${sqlStr(input.cep)},
          ${sqlNum(input.subtotal)}, ${sqlNum(input.taxaEntrega)}, ${sqlNum(input.total)},
          '${input.formaPagamento}', ${sqlNum(input.trocoPara)},
          'RECEBIDO', ${sqlStr(input.observacao)},
          '${now}', '${now}'
        )
        SELECT SCOPE_IDENTITY() AS IDPEDIDO
      `);
      const idPedido = pedidoResult.recordset[0]?.IDPEDIDO;
      if (!idPedido) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao criar pedido" });

      // Inserir itens
      for (const item of input.itens) {
        const prodResult = await pool.request().query(`
          SELECT CODPRODUTO FROM KS0000.KS00009
          WHERE GUIDPRODUTO = '${item.guidProduto}' AND GUIDENTIDADE = '${input.guidentidade}'
        `);
        const codProduto = prodResult.recordset[0]?.CODPRODUTO ?? 0;
        const totalItem = item.quantidade * item.precoUnitario;
        await pool.request().query(`
          INSERT INTO KS0001.KS00002 (
            IDPEDIDO, CODPRODUTO, GUIDPRODUTO, NOMEPRODUTO,
            TAMANHO, QUANTIDADE, PRECOUNITARIO, TOTALITEM, OBSERVACAO,
            METADE1GUID, METADE1NOME, METADE2GUID, METADE2NOME
          ) VALUES (
            ${idPedido}, ${codProduto}, '${item.guidProduto}',
            '${item.nomeProduto.replace(/'/g, "''")}',
            ${sqlStr(item.tamanho)},
            ${sqlNum(item.quantidade)}, ${sqlNum(item.precoUnitario)}, ${sqlNum(totalItem)},
            ${sqlStr(item.observacao)},
            ${sqlStr(item.metade1Guid)}, ${sqlStr(item.metade1Nome)},
            ${sqlStr(item.metade2Guid)}, ${sqlStr(item.metade2Nome)}
          )
        `);
      }

      // Notificar dono
      const itemsSummary = input.itens.map(i =>
        `• ${i.nomeProduto}${i.tamanho ? ` (${i.tamanho})` : ""} x${i.quantidade} = R$ ${(i.quantidade * i.precoUnitario).toFixed(2)}`
      ).join("\n");
      try {
        await notifyOwner({
          title: `🛵 Novo pedido #${token} — ${input.nomeCliente}`,
          content: `**Cliente:** ${input.nomeCliente}\n**Telefone:** ${input.telefone ?? "não informado"}\n\n**Itens:**\n${itemsSummary}\n\n**Total:** R$ ${input.total.toFixed(2)}\n**Pagamento:** ${PAYMENT_LABELS[input.formaPagamento] ?? input.formaPagamento}`,
        });
      } catch { /* notificação não crítica */ }

      return { token, idPedido, total: input.total };
    }),

  // ── Rastreamento público ─────────────────────────────────────────────────────
  pedidoPorToken: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const pedResult = await pool.request().query(`
        SELECT * FROM KS0001.KS00001 WHERE TOKEN = '${input.token.toUpperCase()}'
      `);
      const pedido = pedResult.recordset[0];
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado." });
      const itensResult = await pool.request().query(`
        SELECT * FROM KS0001.KS00002 WHERE IDPEDIDO = ${pedido.IDPEDIDO} ORDER BY CODITEM
      `);
      return {
        ...pedido,
        statusLabel: STATUS_LABELS[pedido.STATUS] ?? pedido.STATUS,
        itens: itensResult.recordset,
      };
    }),

  // ── Admin ────────────────────────────────────────────────────────────────────
  pedidosAdmin: publicProcedure
    .input(z.object({
      guidentidade: z.string(),
      status: z.string().optional(),
      pagina: z.number().default(1),
    }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const pageSize = 50;
      const offset = (input.pagina - 1) * pageSize;
      let where = `GUIDENTIDADE = '${session.guidEntidade}'`;
      if (input.status) where += ` AND STATUS = '${input.status}'`;
      const result = await pool.request().query(`
        SELECT * FROM KS0001.KS00001
        WHERE ${where}
        ORDER BY DATACADASTRO DESC
        OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
      `);
      return result.recordset.map(p => ({ ...p, statusLabel: STATUS_LABELS[p.STATUS] ?? p.STATUS }));
    }),

  pedidoComItens: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const pedResult = await pool.request().query(`
        SELECT * FROM KS0001.KS00001
        WHERE IDPEDIDO = ${input.id} AND GUIDENTIDADE = '${session.guidEntidade}'
      `);
      const pedido = pedResult.recordset[0];
      if (!pedido) throw new TRPCError({ code: "NOT_FOUND" });
      const itensResult = await pool.request().query(`
        SELECT * FROM KS0001.KS00002 WHERE IDPEDIDO = ${input.id} ORDER BY CODITEM
      `);
      return {
        ...pedido,
        statusLabel: STATUS_LABELS[pedido.STATUS] ?? pedido.STATUS,
        itens: itensResult.recordset,
      };
    }),

  atualizarStatusPedido: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["RECEBIDO", "PREPARANDO", "SAIU_ENTREGA", "PRONTO_RETIRADA", "ENTREGUE", "CANCELADO"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const session = await getKsSession(ctx.req);
      if (!session) throw new TRPCError({ code: "UNAUTHORIZED" });
      const { getSqlPool } = await import("../sqlserver");
      const pool = await getSqlPool();
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      await pool.request().query(`
        UPDATE KS0001.KS00001
        SET STATUS = '${input.status}', ULTIMAALTERACAO = '${now}'
        WHERE IDPEDIDO = ${input.id} AND GUIDENTIDADE = '${session.guidEntidade}'
      `);
      return { success: true, statusLabel: STATUS_LABELS[input.status] };
    }),
});
