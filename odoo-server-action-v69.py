"""
=============================================================================
ACAO ODOO - Gerar Boletos Itau + Salvar PDFs como Attachment (v6.9)
=============================================================================
Esta acao deve ser configurada como Server Action no Odoo:
  Configuracoes > Tecnico > Server Actions > Criar Nova

CAMPOS NECESSARIOS na fatura (Odoo Studio):
  - x_studio_itau_linha_digitavel (Char - Linha Digitavel)
  - x_studio_itau_codigo_barras   (Char - Codigo de Barras)
  - x_studio_itau_pix_copia_cola (Char - PIX Copia e Cola)
  - x_studio_itau_txid            (Char - TXID do PIX)
  - x_studio_itau_nosso_numero    (Char - Nosso Numero)
  - x_studio_itau_data_vencimento (Char - Data Vencimento)
  - x_studio_itau_valor_titulo    (Char - Valor do Titulo)
  - x_studio_itau_pdf_url         (Char - URL do PDF Permanente)

CAMPO na forma de pagamento (ja existe no Odoo):
  - x_studio_forma_pagamento (Char)

AÇÃO SERVER (copiar o codigo abaixo para o Odoo):
"""

# === CODIGO DA ACAO ODOO (colar no Server Action) ===
# Modelo: account.move
# Acao: Execute Python Code
#
# Corpo do codigo:

import json
import requests
import base64
import logging

_logger = logging.getLogger(__name__)

# Configuracao do middleware
MIDDLEWARE_URL = "https://itau-odoo.onrender.com"
API_KEY = ""  # Deixar vazio se nao usar autenticacao (auth.js esta open)

# Obter dados da fatura
record = record
partner = record.partner_id
forma_pagamento = ""

# Tentar obter forma de pagamento de diferentes campos
try:
    if hasattr(record, 'x_studio_forma_pagamento') and record.x_studio_forma_pagamento:
        forma_pagamento = str(record.x_studio_forma_pagamento)
    elif hasattr(record, 'payment_method_line_id') and record.payment_method_line_id:
        forma_pagamento = str(record.payment_method_line_id.name or '')
    elif hasattr(record, 'x_studio_forma_de_pagamento') and record.x_studio_forma_de_pagamento:
        forma_pagamento = str(record.x_studio_forma_de_pagamento)
except:
    pass

if not forma_pagamento:
    _logger.warning("Forma de pagamento nao encontrada para fatura %s", record.name)
    # Tentar obter do sale order relacionado
    try:
        so = record.line_ids.mapped('sale_line_ids.order_id')[:1]
        if so and hasattr(so, 'x_studio_forma_pagamento'):
            forma_pagamento = str(so.x_studio_forma_pagamento)
    except:
        pass

# Montar payload
cpf_cnpj = ""
nome = ""
street = ""
city = ""
state = ""
zip_code = ""

if partner:
    if hasattr(partner, 'l10n_br_cnpj_cpf'):
        cpf_cnpj = partner.l10n_br_cnpj_cpf or ""
    if hasattr(partner, 'vat'):
        cpf_cnpj = partner.vat or ""
    nome = partner.name or ""
    if hasattr(partner, 'street'):
        street = (partner.street or "") + ", " + (partner.street_number or "") + " - " + (partner.district or "")
    city = (partner.city or "") if hasattr(partner, 'city') else ""
    state = (partner.state_id.code or "") if hasattr(partner, 'state_id') else ""
    if hasattr(partner, 'zip'):
        zip_code = partner.zip or ""

# Formatar valor (centavos para decimal)
valor_nominal = 0.0
if hasattr(record, 'amount_total'):
    valor_nominal = float(record.amount_total) or 0.0

# Data de vencimento da fatura
data_vencimento = ""
if hasattr(record, 'invoice_date_due') and record.invoice_date_due:
    data_vencimento = str(record.invoice_date_due)

payload = {
    "forma_pagamento": forma_pagamento,
    "fatura": {
        "name": record.name or "",
        "seu_numero": record.name or "",
        "valor_nominal": valor_nominal,
        "data_vencimento": data_vencimento
    },
    "pagador": {
        "nome": nome,
        "cpf_cnpj": cpf_cnpj,
        "street": street,
        "city": city,
        "state": state,
        "zip": zip_code
    }
}

# Chamar middleware
headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

try:
    response = requests.post(
        MIDDLEWARE_URL + "/api/pagar",
        json=payload,
        headers=headers,
        timeout=60
    )
    result = response.json()
except Exception as e:
    _logger.error("Erro ao chamar middleware: %s", str(e))
    raise Exception("Erro ao conectar middleware Itau: " + str(e))

if not result.get('success'):
    raise Exception("Erro middleware: " + str(result.get('message', 'Desconhecido')))

# Processar resposta - salvar dados do(s) boleto(s)
data = result.get('data', {})
pagamentos = data.get('pagamentos', [])
total_parcelas = data.get('total_parcelas', 1)

if not pagamentos:
    raise Exception("Nenhum boleto retornado pelo middleware")

# Para boleto unico: salva nos campos da fatura
# Para parcelado: salva dados da primeira parcela nos campos + anexa PDFs de todas

pagamento_principal = pagamentos[0]

# Salvar dados do boleto principal nos campos Studio
try:
    record.write({
        'x_studio_itau_linha_digitavel': pagamento_principal.get('linha_digitavel', ''),
        'x_studio_itau_codigo_barras': pagamento_principal.get('codigo_barras', ''),
        'x_studio_itau_pix_copia_cola': pagamento_principal.get('pix_copia_cola', ''),
        'x_studio_itau_txid': pagamento_principal.get('txid', ''),
        'x_studio_itau_nosso_numero': pagamento_principal.get('nosso_numero', ''),
        'x_studio_itau_data_vencimento': pagamento_principal.get('data_vencimento', ''),
        'x_studio_itau_valor_titulo': pagamento_principal.get('valor_titulo', ''),
        'x_studio_itau_pdf_url': pagamento_principal.get('pdf_url', ''),
    })
except Exception as e:
    _logger.warning("Nao foi possivel salvar campos Studio: %s", str(e))

# ==========================================================
# BAIXAR PDFs E ANEXAR COMO ATTACHMENT + POSTAR NO CHATTER
# ==========================================================
pdfs_baixados = 0

for pag in pagamentos:
    nosso_numero = pag.get('nosso_numero', '')
    txid = pag.get('txid', '')
    parcela = pag.get('parcela', 1)
    total_p = pag.get('total_parcelas', 1)
    valor = pag.get('valor_titulo', '')
    vencimento = pag.get('data_vencimento', '')

    # URL permanente (funciona mesmo apos restart do Render)
    pdf_url = pag.get('pdf_url', '')  # /boletos/pdf/nn/:nosso_numero

    if not pdf_url and nosso_numero:
        pdf_url = MIDDLEWARE_URL + "/boletos/pdf/nn/" + nosso_numero

    if not pdf_url:
        _logger.warning("Sem URL de PDF para parcela %s", parcela)
        continue

    # Baixar PDF
    try:
        pdf_response = requests.get(pdf_url, timeout=30)
        if pdf_response.status_code == 200 and len(pdf_response.content) > 1000:
            pdf_bytes = pdf_response.content

            # Nome do arquivo
            if total_p > 1:
                filename = "Boleto_%s_P%dde%d_R%s.pdf" % (
                    record.name.replace('/', '-'), parcela, total_p,
                    valor.replace('.', '').replace(',', '')
                )
            else:
                filename = "Boleto_%s_R%s.pdf" % (
                    record.name.replace('/', '-'),
                    valor.replace('.', '').replace(',', '')
                )

            # Criar attachment na fatura
            attachment = {
                'name': filename,
                'type': 'binary',
                'datas': base64.b64encode(pdf_bytes).decode('utf-8'),
                'res_model': 'account.move',
                'res_id': record.id,
                'mimetype': 'application/pdf',
            }
            env['ir.attachment'].sudo().create(attachment)
            pdfs_baixados += 1

            _logger.info("PDF anexado: %s (parcela %d/%d)", filename, parcela, total_p)

        else:
            _logger.warning("PDF vazio ou erro HTTP %s para %s", pdf_response.status_code, pdf_url)

    except Exception as e:
        _logger.error("Erro ao baixar PDF %s: %s", pdf_url, str(e))

# ==========================================================
# POSTAR MENSAGEM NO CHATTER COM RESUMO
# ==========================================================
msg_lines = []
if total_p > 1:
    msg_lines.append("Boletos emitidos com sucesso (%d parcelas):" % total_p)
else:
    msg_lines.append("Boleto emitido com sucesso:")

for pag in pagamentos:
    p = pag.get('parcela', 1)
    t = pag.get('total_parcelas', 1)
    v = pag.get('valor_titulo', '0,00')
    d = pag.get('data_vencimento', '')
    nn = pag.get('nosso_numero', '')
    pix = pag.get('pix_copia_cola', '')
    linha = pag.get('linha_digitavel', '')

    if t > 1:
        msg_lines.append("Parcela %d/%d: R$ %s | Venc: %s | NN: %s" % (p, t, v, d, nn))
    else:
        msg_lines.append("Valor: R$ %s | Venc: %s | NN: %s" % (v, d, nn))

    msg_lines.append("Linha Digitavel: %s" % linha)
    msg_lines.append("PIX: %s" % pix)
    msg_lines.append("")

msg_lines.append("PDF(s) anexado(s) nesta fatura.")
msg_lines.append("URL permanente: %s" % pagamento_principal.get('pdf_url', ''))

chatter_msg = "\n".join(msg_lines)

try:
    record.message_post(
        body=chatter_msg,
        subtype_xmlid='mail.mt_comment'
    )
    _logger.info("Mensagem postada no chatter da fatura %s", record.name)
except Exception as e:
    _logger.warning("Erro ao postar no chatter: %s", str(e))

_logger.info("=== BOLETOS GERADOS: %d parcelas, %d PDFs anexados ===", total_p, pdfs_baixados)
