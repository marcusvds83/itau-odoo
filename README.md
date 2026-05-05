# MIDDLEWARE ITAU-ODOO v1.0.0
## Guia Completo de Instalacao e Configuracao

---

## 1. VISAO GERAL

Este middleware conecta o **Odoo 19 SaaS** com as APIs do **Itaú** (Boleto, PIX e Cartão via Rede Itaú).

### Fluxo de Comunicacao:

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│                 │  HTTP   │                      │  API    │                 │
│   Odoo 19 SaaS  │◄───────►│   MIDDLEWARE (Node)  │────────►│  Itau APIs      │
│   (nuvem Itau)  │  JSON   │   (Render.com)       │  REST   │  (Sandbox/Prod) │
│                 │         │                      │◄────────│                 │
│                 │ webhook │  - Boleto            │  mTLS   │                 │
│                 │◄────────│  - PIX               │         │                 │
└─────────────────┘         │  - Cartao            │         └─────────────────┘
                            └──────────────────────┘
```

---

## 2. DEPLOY NO RENDER.COM (GRATIS)

### Passo 2.1: Preparar repositorio

1. Crie uma conta em https://render.com
2. Crie um repositório no GitHub com todo o código do middleware
3. Faça push do código para o GitHub

### Passo 2.2: Criar Web Service no Render

1. No painel do Render, clique em **"New +"** → **"Web Service"**
2. Conecte seu repositório GitHub
3. Configure:

| Configuracao | Valor |
|---|---|
| **Name** | `middleware-itau-odoo` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | `Free` |

### Passo 2.3: Configurar Variaveis de Ambiente

No Render, va em **Environment** e adicione as variaveis:

```env
AMBIENTE=sandbox
PORT=3000
API_SECRET_KEY=gerar_uma_chave_super_segura_aqui

# Itau Sandbox
ITAU_CLIENT_ID=8a4d4b08-736b-3ca3-9d24-cb2049e42198
ITAU_CLIENT_SECRET=815a925d-389c-404b-a31a-b7fc89869568
ITAU_SANDBOX_URL=https://sandbox.devportal.itau.com.br/itau-ep9-gtw-cash-management-ext-v2/v2
ITAU_PRODUCAO_URL=https://api.itau.com.br/cash_management/v2
ITAU_TOKEN_SANDBOX_URL=https://sandbox.devportal.itau.com.br/itau-ep9-gtw-autenticacao-ext/oauth/v2/token
ITAU_TOKEN_PRODUCAO_URL=https://sts.itau.com.br/api/oauth/token
ITAU_PIX_CHAVE=email@suaempresa.com.br

# Rede Itau (Cartao) - preencher apos cadastro
REDE_CLIENT_ID=seu_client_id
REDE_CLIENT_SECRET=seu_client_secret
REDE_SANDBOX_URL=https://sandbox-ecommerce.userede.com.br/sandbox/v1
REDE_PRODUCAO_URL=https://ecommerce.userede.com.br/decrypt/v1
REDE_MERCHANT_ID=seu_merchant_id

# Odoo SaaS
ODOO_URL=https://seu-empresa.odoo.com
ODOO_DB=seu-empresa
ODOO_USERNAME=seu-email@empresa.com
ODOO_API_KEY=sua_api_key_gerada_no_odoo

WEBHOOK_SECRET=outra_chave_para_webhooks
```

### Passo 2.4: Obter a URL do Middleware

Apos o deploy, o Render fornecera uma URL como:

```
https://middleware-itau-odoo-xxxx.onrender.com
```

**Esta URL sera usada:**
- No Odoo para chamar o middleware
- No Itau para enviar webhooks de pagamento

---

## 3. CONFIGURAR O ODOO 19 SAAS

### Passo 3.1: Gerar API Key no Odoo

1. Acesse o Odoo SaaS
2. Vá em **Configuracoes** → **Geral** → **Chaves de API**
3. Clique em **"Novo"** para gerar uma chave
4. Copie a chave (usar no campo ODOO_API_KEY)

### Passo 3.2: Criar os campos customizados no Odoo

Via **Odoo Studio** (disponível no SaaS), crie os campos a seguir:

#### Campos no modelo `account.move` (Faturas):

| Campo | Tipo | Label |
|---|---|---|
| `x_itau_boleto_id` | Char | "ID Boleto Itaú" |
| `x_itau_linha_digitavel` | Char | "Linha Digitável" |
| `x_itau_codigo_barras` | Char | "Código de Barras" |
| `x_itau_pix_copia_cola` | Char | "PIX Copia e Cola" |
| `x_itau_situacao` | Selection | "Situação Itaú" (em_aberto/pago/baixado/vencido) |
| `x_itau_txid` | Char | "TXID PIX" |
| `x_itau_tid` | Char | "TID Cartão" |
| `x_itau_nsu` | Char | "NSU Cartão" |
| `x_itau_tipo_pagamento` | Selection | "Tipo Pagamento" (boleto/pix/cartao) |

#### Campos no modelo `res.company` (Empresa):

| Campo | Tipo | Label |
|---|---|---|
| `x_itau_agencia` | Char | "Agência Itaú" |
| `x_itau_conta` | Char | "Conta Itaú" |
| `x_itau_conta_dv` | Char | "DV Conta" |
| `x_itau_cnpj` | Char | "CNPJ Itaú" |
| `x_itau_chave_pix` | Char | "Chave PIX" |
| `x_itau_especie_titulo` | Char | "Espécie Título" (default: DSI) |

#### Campo na `res.partner`:

| Campo | Tipo | Label |
|---|---|---|
| `x_cnpj_cpf` | Char | "CNPJ/CPF" |

### Passo 3.3: Criar Acao de Servidor no Odoo

Vá em **Configuracoes** → **Tecnico** → **Acoes de Servidor** → **Novo**:

#### Acao: "Emitir Boleto Itaú"

```
Tipo: Python
Modelo: account.move

Codigo:
import requests
import json

# Configuracoes
MIDDLEWARE_URL = "https://middleware-itau-odoo-xxxx.onrender.com"
API_KEY = "sua_api_secret_key_aqui"

invoice = record
company = invoice.company_id
partner = invoice.partner_id

# Monta payload
payload = {
    "fatura": {
        "nosso_numero": invoice.name,
        "seu_numero": invoice.name,
        "data_vencimento": invoice.invoice_date_due.strftime('%Y-%m-%d') if invoice.invoice_date_due else None,
        "valor_nominal": invoice.amount_total,
        "especie": company.x_itau_especie_titulo or 'DSI',
        "aceite": 'N',
        "juros_tipo": 'isento',
        "multa_tipo": 'isento',
    },
    "empresa": {
        "agencia": company.x_itau_agencia,
        "conta": company.x_itau_conta,
        "conta_dv": company.x_itau_conta_dv,
        "cpf_cnpj": company.x_itau_cnpj,
        "nome": company.name,
        "logradouro": company.street or '',
        "numero": company.street_number or '',
        "complemento": company.street2 or '',
        "bairro": company.l10n_br_district or '',
        "cidade": company.city or '',
        "estado": company.state_id.code or '',
        "cep": (company.zip or '').replace('.', '').replace('-', ''),
    },
    "pagador": {
        "cpf_cnpj": partner.x_cnpj_cpf or partner.vat or '',
        "nome": partner.name,
        "street": partner.street or '',
        "street_number": partner.street_number or '',
        "street2": partner.street2 or '',
        "district": partner.l10n_br_district or '',
        "city": partner.city or '',
        "state": partner.state_id.code or '',
        "zip": (partner.zip or '').replace('.', '').replace('-', ''),
    }
}

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

response = requests.post(
    f"{MIDDLEWARE_URL}/api/boleto/emitir",
    json=payload,
    headers=headers,
    timeout=30
)

if response.status_code == 200:
    result = response.json()
    if result.get('success'):
        data = result['data']
        invoice.write({
            'x_itau_boleto_id': data.get('codigo_barras', ''),
            'x_itau_linha_digitavel': data.get('linha_digitavel', ''),
            'x_itau_codigo_barras': data.get('codigo_barras', ''),
            'x_itau_situacao': 'em_aberto',
        })
else:
    raise Exception(f"Erro Itau: {response.status_code} - {response.text}")
```

#### Acao: "Emitir PIX Itaú"

```
Tipo: Python
Modelo: account.move

Codigo:
import requests
import json
import uuid

MIDDLEWARE_URL = "https://middleware-itau-odoo-xxxx.onrender.com"
API_KEY = "sua_api_secret_key_aqui"

invoice = record
company = invoice.company_id
partner = invoice.partner_id

payload = {
    "valor": invoice.amount_total,
    "chave": company.x_itau_chave_pix,
    "expiracao": 86400,
    "devedor": {
        "nome": partner.name,
        "cpf": partner.x_cnpj_cpf or partner.vat or None,
    }
}

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

response = requests.post(
    f"{MIDDLEWARE_URL}/api/pix/criar",
    json=payload,
    headers=headers,
    timeout=30
)

if response.status_code == 200:
    result = response.json()
    if result.get('success'):
        data = result['data']
        invoice.write({
            'x_itau_txid': data.get('txid', ''),
            'x_itau_pix_copia_cola': data.get('pixCopiaECola', ''),
            'x_itau_situacao': 'pendente',
        })
```

#### Acao: "Pagar com Cartao Itaú"

```
Tipo: Python
Modelo: account.payment

Codigo:
import requests
import json

MIDDLEWARE_URL = "https://middleware-itau-odoo-xxxx.onrender.com"
API_KEY = "sua_api_secret_key_aqui"

payment = record
partner = payment.partner_id

payload = {
    "valor": payment.amount,
    "tipo": "credito",
    "parcelas": 1,
    "order_id": payment.name,
    "numero": payment.x_cartao_numero,
    "titular": payment.x_cartao_titular,
    "validade_mes": payment.x_cartao_mes,
    "validade_ano": payment.x_cartao_ano,
    "cvv": payment.x_cartao_cvv,
}

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

response = requests.post(
    f"{MIDDLEWARE_URL}/api/cartao/autorizar",
    json=payload,
    headers=headers,
    timeout=30
)

if response.status_code == 200:
    result = response.json()
    if result.get('success'):
        data = result['data']
        payment.write({
            'x_itau_tid': data.get('tid', ''),
            'x_itau_nsu': data.get('nsu', ''),
        })
```

### Passo 3.4: Adicionar botoes na interface do Odoo

No Odoo Studio, edite a view de Faturas e adicione botoes que executam as Acoes de Servidor criadas acima.

---

## 4. CONFIGURAR WEBHOOKS NO ITAU

### Boleto (producao):
- Via gerente do Itau, configure a URL de callback:
- `https://middleware-itau-odoo-xxxx.onrender.com/webhook/boleto`

### PIX (producao):
- Configure via API ou gerente:
- `https://middleware-itau-odoo-xxxx.onrender.com/webhook/pix`

### Cartao (Rede):
- No painel da Rede, configure o URL de notificacao:
- `https://middleware-itau-odoo-xxxx.onrender.com/webhook/cartao`

---

## 5. LISTA COMPLETA DE ENDPOINTS

### Endpoints do Middleware (Odoo chama):

| Metodo | Endpoint | Descricao |
|---|---|---|
| GET | / | Info da API |
| GET | /health | Status dos servicos |
| POST | /api/boleto/emitir | Emitir boleto |
| POST | /api/boleto/validar | Validar boleto (sandbox) |
| GET | /api/boleto/consultar | Consultar boletos |
| POST | /api/boleto/:id/baixa | Baixar boleto |
| POST | /api/boleto/:id/vencimento | Alterar vencimento |
| POST | /api/boleto/:id/valor | Alterar valor |
| POST | /api/pix/criar | Criar cobranca PIX |
| GET | /api/pix/consultar/:txid | Consultar PIX |
| GET | /api/pix/recebido/:e2eId | Consultar PIX recebido |
| POST | /api/pix/devolver | Devolver PIX |
| POST | /api/pix/configurar-webhook | Configurar webhook PIX |
| POST | /api/cartao/autorizar | Pagar com cartao |
| POST | /api/cartao/cancelar | Cancelar cartao |
| GET | /api/cartao/consultar/:tid | Consultar transacao |
| POST | /api/cartao/tokenizar | Tokenizar cartao |

### Webhooks recebidos do Itau:

| Metodo | Endpoint | Descricao |
|---|---|---|
| POST | /webhook/boleto | Boleto pago |
| POST | /webhook/pix | PIX recebido |
| POST | /webhook/cartao | Cartao confirmado |

---

## 6. ESTRUTURA DO PROJETO

```
middleware-itau-odoo/
├── server.js                    # Aplicacao principal Express
├── package.json                 # Dependencias Node.js
├── Dockerfile                   # Docker para deploy
├── Procfile                     # Config Render.com
├── render.yaml                  # Config Render.com
├── .env.example                 # Template de variaveis de ambiente
├── .gitignore
├── README.md                    # Este arquivo
│
├── config/
│   └── index.js                 # Configuracoes centralizadas
│
├── middleware/
│   └── auth.js                  # Autenticacao e validacao
│
├── routes/
│   ├── odoo.js                  # Endpoints que o Odoo chama
│   ├── webhook.js               # Webhooks do Itau
│   └── health.js                # Health check
│
├── services/
│   ├── itau-auth.js             # Autenticacao OAuth2 Itau
│   ├── itau-api.js              # Cliente HTTP Itau (mTLS)
│   ├── itau-boleto.js           # Integracao API Boletos
│   ├── itau-pix.js              # Integracao API PIX
│   ├── itau-cartao.js           # Integracao API Cartao (Rede)
│   └── odoo-api.js              # Cliente JSON-RPC Odoo
│
└── utils/
    └── logger.js                # Utilitario de logs
```

---

## 7. OBSERVACOES IMPORTANTES

### Render Free Tier:
- O servico pode entrar em "sleep" apos 15 minutos de inatividade
- O primeiro request apos sleep pode levar ~30 segundos para responder
- Para manter ativo, use um servico de Uptime Robot (gratuito) fazendo ping em /health
- Nao e adequado para producao de alto volume

### Para Producao:
- Migrar para plano pago do Render ou Oracle Cloud
- Instalar certificados mTLS no servidor
- Configurar HTTPS com certificado valido
- Configurar lista branca de IPs no firewall
- Implementar monitoramento e alertas

### Seguranca:
- NUNCA commite o arquivo .env no Git
- Use chaves fortes para API_SECRET_KEY e WEBHOOK_SECRET
- Em producao, habilite validacao HMAC nos webhooks
- NUNCA armazene numeros de cartao plenos - use tokenizacao
- Rotacione credenciais periodicamente
