/**
 * routes/api.js - v6.3
 * Rota compativel com Odoo (/api/pagar)
 * Resposta no formato EXATO que o Odoo espera
 * Inclui HTML para email com boleto + PIX QR code
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');

router.post('/pagar', authenticateApiKey, async (req, res) => {
  try {
    const d = req.body;
    console.log('[API] Body recebido:', JSON.stringify(d));

    const fat = d.fatura || {};
    const pag = d.pagador || {};
    const emp = d.empresa || {};

    const payload = {
      valor: fat.valor_nominal || d.valor || d.amount,
      cpfCnpjPagador: pag.cpf_cnpj || d.cpfCnpj || '',
      nomePagador: pag.nome || d.nome || '',
      numeroPedido: fat.seu_numero || fat.name || d.numero_pedido || '',
      dataVencimento: fat.data_vencimento || '',
      descricao: fat.name || fat.seu_numero || 'Pagamento AJL Ferro e Aco',
      logradouro: pag.street || d.logradouro || '',
      bairro: pag.bairro || d.bairro || '',
      cidade: pag.city || d.cidade || '',
      estado: pag.state || d.estado || '',
      cep: pag.zip || d.cep || '',
    };

    console.log('[API] Payload mapeado:', JSON.stringify(payload));
    const resultado = await emitirBoleto(payload);

    // Extrai campos da resposta Itau
    const dados = resultado.dados && resultado.dados.data ? resultado.dados.data : {};
    const individuais = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
    const qrcode = dados.dados_qrcode || {};

    // Formata valor titulo para exibicao (centavos para real)
    const valorCentavos = parseInt(individuais.valor_titulo || '0', 10);
    const valorReais = (valorCentavos / 100).toFixed(2);

    // Gera HTML para o campo email
    const htmlEmail = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
  <div style="background: #EC0000; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; text-align: center;">
    <h2 style="margin: 0;">AJL Ferro e Aco</h2>
    <p style="margin: 5px 0 0 0; font-size: 14px;">Boleto Bancario - Itau</p>
  </div>
  <div style="padding: 20px;">
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666; width: 40%;">Beneficiario</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">AJL Comercio Atacadista de Ferragens e Ferramentas LTDA</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Pagador</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${pag.nome || 'Nao Informado'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Documento</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${fat.name || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Vencimento</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${individuais.data_vencimento || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; color: #666;">Valor</td><td style="padding: 8px; font-weight: bold; font-size: 18px; color: #EC0000;">R$ ${valorReais}</td></tr>
    </table>
    <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: #333;">Linha Digitavel:</p>
      <p style="margin: 0; font-family: monospace; font-size: 16px; letter-spacing: 1px; word-break: break-all; color: #005500;">${individuais.numero_linha_digitavel || ''}</p>
    </div>
    <div style="text-align: center; margin: 20px 0;">
      <p style="font-weight: bold; margin: 0 0 10px 0; color: #333;">QR Code PIX:</p>
      ${qrcode.base64 ? '<img src="data:image/png;base64,' + qrcode.base64 + '" style="width: 200px; height: 200px; border: 1px solid #ddd; border-radius: 4px;" />' : '<p style="color: #999;">QR Code nao disponivel</p>'}
    </div>
    <div style="background: #f0f0f0; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: #333; font-size: 13px;">Pix Copia e Cola:</p>
      <p style="margin: 0; font-family: monospace; font-size: 11px; word-break: break-all; color: #333; background: white; padding: 8px; border-radius: 4px;">${qrcode.emv || ''}</p>
    </div>
    <div style="background: #f0f0f0; padding: 12px; border-radius: 6px;">
      <p style="margin: 0 0 5px 0; font-weight: bold; color: #333; font-size: 13px;">Codigo de Barras:</p>
      <p style="margin: 0; font-family: monospace; font-size: 13px; word-break: break-all; color: #333;">${individuais.codigo_barras || ''}</p>
    </div>
    <div style="text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee;">
      <p style="margin: 0; font-size: 12px; color: #999;">Nosso Numero: ${individuais.numero_nosso_numero || ''} | TXID: ${qrcode.txid || ''}</p>
    </div>
  </div>
</div>`;

    // Retorna no formato EXATO que o Odoo espera
    res.json({
      success: true,
      data: {
        pagamentos: [
          {
            tipo: "boleto",
            nosso_numero: individuais.numero_nosso_numero || '',
            linha_digitavel: individuais.numero_linha_digitavel || '',
            codigo_barras: individuais.codigo_barras || '',
            pix_copia_cola: qrcode.emv || '',
            txid: qrcode.txid || '',
            qrcode_base64: qrcode.base64 || '',
            data_vencimento: individuais.data_vencimento || '',
            valor_titulo: valorReais,
            html_email: htmlEmail
          }
        ]
      }
    });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;
