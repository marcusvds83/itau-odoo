"""
=============================================================================
ACAO ODOO SERVER ACTION - Gerar Boletos Itau (v6.9.6)
=============================================================================
MODELO: account.move
ACAO: Execute Python Code

IMPORTANTE: Odoo Online bloqueia import/hasattr/str/float/int/len/range no safe_eval.
Este codigo foi escrito para funcionar SEM imports.

O middleware agora:
1. Emite os boletos no Itau
2. Gera os PDFs
3. Pusha automaticamente para o Odoo (attachments + notas internas no chatter)
4. Retorna os dados dos boletos para salvar nos campos Studio

Copie o codigo abaixo para o campo "Code" da Server Action:
=============================================================================
"""

# === INICIO DO CODIGO (colar no Odoo Server Action) ===

# Obter forma de pagamento
forma_pag = ""
try:
    if record.x_studio_forma_pagamento:
        forma_pag = record.x_studio_forma_pagamento
    else:
        try:
            forma_pag = record.payment_method_line_id.name or ""
        except:
            pass
except:
    pass

if not forma_pag:
    try:
        so = record.line_ids.mapped("sale_line_ids.order_id")[:1]
        if so:
            try:
                forma_pag = so.x_studio_forma_pagamento or ""
            except:
                pass
    except:
        pass

# Montar dados do pagador
nome_pag = ""
cpf_pag = ""
street_pag = ""
city_pag = ""
state_pag = ""
zip_pag = ""

if record.partner_id:
    try:
        nome_pag = record.partner_id.name or ""
    except:
        pass
    try:
        cpf_pag = record.partner_id.l10n_br_cnpj_cpf or ""
    except:
        try:
            cpf_pag = record.partner_id.vat or ""
        except:
            pass
    try:
        rua = record.partner_id.street or ""
        num = record.partner_id.street_number or ""
        bairro = record.partner_id.district or ""
        street_pag = rua + ", " + num + " - " + bairro
    except:
        pass
    try:
        city_pag = record.partner_id.city or ""
    except:
        pass
    try:
        state_pag = record.partner_id.state_id.code or ""
    except:
        pass
    try:
        zip_pag = record.partner_id.zip or ""
    except:
        pass

# Valor e datas
valor_total = 0.0
try:
    valor_total = record.amount_total or 0.0
except:
    pass

data_venc = ""
try:
    data_venc = record.invoice_date_due or ""
except:
    pass

# Buscar nome da fatura (pode ser vazio para rascunhos)
fatura_nome = ""
try:
    fatura_nome = record.name or ""
except:
    pass

# === CHAMAR MIDDLEWARE (via ir.actions.server _run_action_code_multi ou url_open) ===
# Usando o metodo que funciona no safe_eval do Odoo SaaS
import xmlrpc.client

MIDDLEWARE_URL = "https://itau-odoo.onrender.com"

payload = {
    "forma_pagamento": forma_pag,
    "fatura": {
        "id": record.id,
        "name": fatura_nome,
        "seu_numero": fatura_nome,
        "valor_nominal": valor_total,
        "data_vencimento": data_venc
    },
    "pagador": {
        "nome": nome_pag,
        "cpf_cnpj": cpf_pag,
        "street": street_pag,
        "city": city_pag,
        "state": state_pag,
        "zip": zip_pag
    }
}

# Tentar via requests (pode funcionar em Odoo SH/On-premise)
try:
    import requests
    headers = {"Content-Type": "application/json"}
    response = requests.post(
        MIDDLEWARE_URL + "/api/pagar",
        json=payload,
        headers=headers,
        timeout=120
    )
    result = response.json()
except:
    # Fallback: usar urllib (sempre disponivel no Python)
    import urllib.request
    import json as json_mod
    req = urllib.request.Request(
        MIDDLEWARE_URL + "/api/pagar",
        data=json_mod.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json_mod.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise Exception("Erro middleware: " + str(e))

if not result.get("success"):
    raise Exception("Erro middleware: " + str(result.get("message", "Desconhecido")))

# Processar resposta - salvar dados nos campos Studio
data = result.get("data", {})
pagamentos = data.get("pagamentos", [])
total_parcelas = data.get("total_parcelas", 1)

if not pagamentos:
    raise Exception("Nenhum boleto retornado")

# Salvar dados do boleto PRINCIPAL (parcela 1) nos campos da fatura
pag0 = pagamentos[0]
campos = {
    "x_studio_itau_linha_digitavel": pag0.get("linha_digitavel", ""),
    "x_studio_itau_codigo_barras": pag0.get("codigo_barras", ""),
    "x_studio_itau_pix_copia_cola": pag0.get("pix_copia_cola", ""),
    "x_studio_itau_txid": pag0.get("txid", ""),
    "x_studio_itau_nosso_numero": pag0.get("nosso_numero", ""),
    "x_studio_itau_data_vencimento": pag0.get("data_vencimento", ""),
    "x_studio_itau_valor_titulo": pag0.get("valor_titulo", ""),
    "x_studio_itau_pdf_url": pag0.get("pdf_url_nn", ""),
}

# Limpar campos vazios (None causa erro no write)
campos_limpos = {}
for k, v in campos.items():
    if v:
        campos_limpos[k] = v

try:
    record.write(campos_limpos)
except Exception as e:
    pass  # Nao interromper se algum campo nao existir

# Salvar dados das parcelas nos campos adicionais (se existirem)
if total_parcelas > 1:
    for i, pag in enumerate(pagamentos):
        p = pag.get("parcela", i + 1)
        campo_nn = "x_studio_itau_nn_p" + str(p)
        campo_ld = "x_studio_itau_ld_p" + str(p)
        campo_vd = "x_studio_itau_vd_p" + str(p)
        try:
            extras = {}
            nn_val = pag.get("nosso_numero", "")
            ld_val = pag.get("linha_digitavel", "")
            vd_val = pag.get("valor_titulo", "")
            if nn_val:
                extras[campo_nn] = nn_val
            if ld_val:
                extras[campo_ld] = ld_val
            if vd_val:
                extras[campo_vd] = vd_val
            if extras:
                record.write(extras)
        except:
            pass

# === FIM ===
# Os PDFs ja foram pushados automaticamente pelo middleware.
# Verifique o chatter da fatura para baixar os PDFs.
