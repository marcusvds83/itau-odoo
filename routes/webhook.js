// ============================================
// ROTAS: WEBHOOKS RECEBIDOS DO ITAU
// ============================================
// Endpoints que RECEBEM callbacks do Itau
// e repassam a informacao para o Odoo

const express = require('express');
const router = express.Router();
const { validateItauWebhook } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getOdooClient } = require('../services/odoo-api');

// =============================================
// WEBHOOK DE PAGAMENTO DE BOLETO
// =============================================
// O Itau notifica quando um boleto e pago

router.post('/boleto', validateItauWebhook, async (req, res) => {
  try {
    const payload = req.body;
    logger.info('Webhook BOLETO recebido', { id_boleto: payload.id_boleto, status: payload.status });

    // Acknowledge o webhook imediatamente
    res.status(200).json({ received: true });

    // Processa de forma assincrona
    setImmediate(async () => {
      try {
        const odoo = getOdooClient();
        // Atualiza o Odoo com o status de pagamento do boleto
        await odoo.updateInvoicePayment(payload.odoo_invoice_id || payload.nosso_numero, {
          id_boleto: payload.id_boleto,
          situacao: payload.status,
          linha_digitavel: payload.linha_digitavel,
          valor_pago: payload.valor_pago,
          data_pagamento: payload.data_pagamento,
        });
        logger.info('Odoo atualizado via webhook boleto');
      } catch (error) {
        logger.error('Falha ao atualizar Odoo apos webhook boleto: ' + error.message);
      }
    });

  } catch (error) {
    logger.error('Erro ao processar webhook boleto: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// WEBHOOK PIX
// =============================================
// O Itau notifica quando um PIX e recebido

router.post('/pix', validateItauWebhook, async (req, res) => {
  try {
    const payload = req.body;
    logger.info('Webhook PIX recebido', { pix: payload.pix || payload.txid });

    // Acknowledge imediatamente
    res.status(200).json({ received: true });

    // Processa de forma assincrona
    setImmediate(async () => {
      try {
        const odoo = getOdooClient();

        // Busca a cobranca PIX associada no Odoo
        const txid = payload.pix?.[0]?.txid || payload.txid;
        const valor = payload.pix?.[0]?.valor || payload.valor;

        // Cria registro de pagamento no Odoo
        await odoo.createPayment({
          tipo: 'pix',
          tx_id: txid,
          amount: valor,
          ref: `PIX recebido - ${txid}`,
          date: payload.pix?.[0]?.horario?.substring(0, 10) || new Date().toISOString().split('T')[0],
        });

        logger.info(`Pagamento PIX registrado no Odoo: ${txid}`);
      } catch (error) {
        logger.error('Falha ao registrar PIX no Odoo: ' + error.message);
      }
    });

  } catch (error) {
    logger.error('Erro ao processar webhook PIX: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// WEBHOOK CARTAO
// =============================================
// A Rede notifica sobre confirmacao/estorno

router.post('/cartao', validateItauWebhook, async (req, res) => {
  try {
    const payload = req.body;
    logger.info('Webhook CARTAO recebido', { tid: payload.tid, status: payload.status });

    res.status(200).json({ received: true });

    setImmediate(async () => {
      try {
        const odoo = getOdooClient();
        await odoo.createPayment({
          tipo: 'cartao',
          tid: payload.tid,
          nsu: payload.nsu,
          amount: payload.amount ? payload.amount / 100 : payload.valor,
          ref: `Cartao - TID ${payload.tid}`,
          date: new Date().toISOString().split('T')[0],
        });
        logger.info(`Pagamento cartao registrado no Odoo: ${payload.tid}`);
      } catch (error) {
        logger.error('Falha ao registrar cartao no Odoo: ' + error.message);
      }
    });

  } catch (error) {
    logger.error('Erro ao processar webhook cartao: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// WEBHOOK LINK DE PAGAMENTO
// =============================================
// O Itau notifica quando um link de pagamento e pago

router.post('/link', validateItauWebhook, async (req, res) => {
  try {
    const payload = req.body;
    logger.info('Webhook LINK DE PAGAMENTO recebido', { id_link: payload.id_link, status: payload.status });

    // Acknowledge imediatamente
    res.status(200).json({ received: true });

    // Processa de forma assincrona
    setImmediate(async () => {
      try {
        const odoo = getOdooClient();
        await odoo.updateInvoicePayment(payload.odoo_invoice_id || payload.seu_numero, {
          id_link: payload.id_link,
          situacao: payload.status,
          valor_pago: payload.valor_pago,
          data_pagamento: payload.data_pagamento,
          tipo_pagamento: 'link_pagamento',
        });
        logger.info(`Pagamento via link registrado no Odoo: ${payload.id_link}`);
      } catch (error) {
        logger.error('Falha ao registrar link pagamento no Odoo: ' + error.message);
      }
    });

  } catch (error) {
    logger.error('Erro ao processar webhook link: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
