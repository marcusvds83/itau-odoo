// ============================================
// ROTAS: INTEGRACAO ODOO <-> MIDDLEWARE
// ============================================
// Endpoints que o Odoo chama para emitir/gerenciar pagamentos

const express = require('express');
const router = express.Router();
const { authenticateOdoo } = require('../middleware/auth');
const logger = require('../utils/logger');

// Servicos
const boletoService = require('../services/itau-boleto');
const pixService = require('../services/itau-pix');
const cartaoService = require('../services/itau-cartao');
const { getOdooClient } = require('../services/odoo-api');

// =============================================
// TODAS AS ROTAS REQUEM AUTENTICACAO
// =============================================
router.use(authenticateOdoo);

// =============================================
// ENDPOINTS DE BOLETO
// =============================================

/**
 * POST /api/boleto/emitir
 * Odoo envia dados da fatura, middleware emite no Itau
 * Body: { fatura: {...}, empresa: {...}, pagador: {...} }
 */
router.post('/boleto/emitir', async (req, res) => {
  try {
    const resultado = await boletoService.emitirBoleto(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao emitir boleto: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/boleto/validar
 * Valida boleto antes do registro definitivo
 */
router.post('/boleto/validar', async (req, res) => {
  try {
    const resultado = await boletoService.validarBoleto(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao validar boleto: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/boleto/consultar?filtro1=valor1&filtro2=valor2
 * Consulta boletos no Itau
 */
router.get('/boleto/consultar', async (req, res) => {
  try {
    const resultado = await boletoService.consultarBoletos(req.query);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao consultar boletos: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/boleto/:id/baixa
 * Baixa (invalida) um boleto
 */
router.post('/boleto/:id/baixa', async (req, res) => {
  try {
    const resultado = await boletoService.baixarBoleto(req.params.id);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao baixar boleto: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/boleto/:id/vencimento
 * Altera data de vencimento
 */
router.post('/boleto/:id/vencimento', async (req, res) => {
  try {
    const { nova_data } = req.body;
    if (!nova_data) return res.status(400).json({ success: false, message: 'nova_data obrigatoria' });
    const resultado = await boletoService.alterarVencimento(req.params.id, nova_data);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao alterar vencimento: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/boleto/:id/valor
 * Altera valor nominal do boleto
 */
router.post('/boleto/:id/valor', async (req, res) => {
  try {
    const { novo_valor } = req.body;
    if (!novo_valor) return res.status(400).json({ success: false, message: 'novo_valor obrigatorio' });
    const resultado = await boletoService.alterarValorNominal(req.params.id, novo_valor);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao alterar valor: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// =============================================
// ENDPOINTS PIX
// =============================================

/**
 * POST /api/pix/criar
 * Cria cobranca PIX
 * Body: { valor, chave, devedor, expiracao, infoAdicionais }
 */
router.post('/pix/criar', async (req, res) => {
  try {
    const resultado = await pixService.criarCobrancaPix(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao criar PIX: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message, detail: error.detail });
  }
});

/**
 * GET /api/pix/consultar/:txid
 * Consulta cobranca PIX
 */
router.get('/pix/consultar/:txid', async (req, res) => {
  try {
    const resultado = await pixService.consultarCobrancaPix(req.params.txid);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao consultar PIX: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/pix/recebido/:e2eId
 * Consulta PIX recebido
 */
router.get('/pix/recebido/:e2eId', async (req, res) => {
  try {
    const resultado = await pixService.consultarPixRecebido(req.params.e2eId);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao consultar PIX recebido: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/pix/devolver
 * Solicita devolucao de PIX
 */
router.post('/pix/devolver', async (req, res) => {
  try {
    const { e2e_id, id_devolucao, valor } = req.body;
    if (!e2e_id || !id_devolucao || !valor) {
      return res.status(400).json({ success: false, message: 'e2e_id, id_devolucao e valor obrigatorios' });
    }
    const resultado = await pixService.devolverPix(e2e_id, { idDevolucao: id_devolucao, valor });
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao devolver PIX: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/pix/configurar-webhook
 * Configura webhook para receber notificacoes PIX
 */
router.post('/pix/configurar-webhook', async (req, res) => {
  try {
    const { chave, webhook_url } = req.body;
    if (!chave || !webhook_url) {
      return res.status(400).json({ success: false, message: 'chave e webhook_url obrigatorios' });
    }
    const resultado = await pixService.configurarWebhookPix(chave, webhook_url);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao configurar webhook PIX: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// =============================================
// ENDPOINTS CARTAO
// =============================================

/**
 * POST /api/cartao/autorizar
 * Autoriza pagamento com cartao
 * Body: { valor, tipo, parcelas, order_id, numero, titular, validade_mes, validade_ano, cvv }
 */
router.post('/cartao/autorizar', async (req, res) => {
  try {
    const resultado = await cartaoService.autorizarPagamento(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao autorizar cartao: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/cartao/cancelar
 * Cancela transacao de cartao
 */
router.post('/cartao/cancelar', async (req, res) => {
  try {
    const { tid } = req.body;
    if (!tid) return res.status(400).json({ success: false, message: 'tid obrigatorio' });
    const resultado = await cartaoService.cancelarTransacao(tid);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao cancelar cartao: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/cartao/consultar/:tid
 * Consulta transacao de cartao
 */
router.get('/cartao/consultar/:tid', async (req, res) => {
  try {
    const resultado = await cartaoService.consultarTransacao(req.params.tid);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao consultar cartao: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/cartao/tokenizar
 * Tokeniza cartao para uso futuro
 */
router.post('/cartao/tokenizar', async (req, res) => {
  try {
    const resultado = await cartaoService.tokenizarCartao(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao tokenizar cartao: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

module.exports = router;
