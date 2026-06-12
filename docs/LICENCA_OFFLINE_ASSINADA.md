# Licenca offline assinada

## Variaveis do servidor

A API assina a licenca com a chave privada configurada somente no servidor:

```env
LICENCA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Tambem e aceito o formato base64:

```env
LICENCA_PRIVATE_KEY_BASE64="..."
```

Nunca copie a chave privada para o ERP instalado no cliente.

## Gerar par de chaves

```powershell
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out licenca-private.pem
openssl rsa -pubout -in licenca-private.pem -out licenca-public.pem
```

O servidor usa `licenca-private.pem`. O ERP instalado deve embutir ou carregar somente `licenca-public.pem`.

## Campos assinados

A assinatura e calculada sobre este JSON canonico, nesta ordem:

```json
{
  "empresaId": "123",
  "cnpj": "00000000000100",
  "hardwareId": "ABC123",
  "status": "ATIVA",
  "validade": "2026-12-31",
  "emitidaEm": "2026-06-08",
  "ultimaComunicacao": "2026-06-08",
  "toleranciaOfflineDias": 5,
  "modulos": ["financeiro"]
}
```

O campo `assinatura` fica fora do conteudo assinado.

## Validacao no ERP instalado

Exemplo em Node.js:

```ts
import crypto from "node:crypto";

type LicencaAssinada = {
  empresaId: string;
  cnpj: string;
  hardwareId: string;
  status: "ATIVA" | "INATIVA" | "BLOQUEADA";
  validade: string;
  emitidaEm: string;
  ultimaComunicacao: string;
  toleranciaOfflineDias: number;
  modulos: string[];
  assinatura: string;
};

function canonical(payload: Omit<LicencaAssinada, "assinatura">) {
  return JSON.stringify({
    empresaId: payload.empresaId,
    cnpj: payload.cnpj,
    hardwareId: payload.hardwareId,
    status: payload.status,
    validade: payload.validade,
    emitidaEm: payload.emitidaEm,
    ultimaComunicacao: payload.ultimaComunicacao,
    toleranciaOfflineDias: payload.toleranciaOfflineDias,
    modulos: [...payload.modulos].sort(),
  });
}

export function validarAssinaturaLicenca(licenca: LicencaAssinada, publicKey: string) {
  const { assinatura, ...payload } = licenca;
  return crypto
    .createVerify("RSA-SHA256")
    .update(canonical(payload))
    .end()
    .verify(publicKey, assinatura, "base64");
}
```

Apos validar a assinatura, o ERP instalado ainda deve conferir:

- `hardwareId` igual ao computador atual.
- `cnpj` e `empresaId` iguais a empresa instalada.
- `status` igual a `ATIVA`.
- `validade` maior ou igual a data atual.
- `ultimaComunicacao + toleranciaOfflineDias` dentro do limite offline.
- data atual maior ou igual a ultima execucao local salva.

Se qualquer item falhar, o sistema deve bloquear.
