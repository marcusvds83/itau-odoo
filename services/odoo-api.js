// ============================================
// CLIENTE XML-RPC PARA ODOO 19 SAAS
// ============================================
// Conecta ao Odoo SaaS via XML-RPC/JSON-RPC
// Usando a API Key para autenticacao

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class OdooClient {
  constructor() {
    this.baseUrl = config.odoo.url.replace(/\/$/, '');
    this.db = config.odoo.db;
    this.username = config.odoo.username;
    this.apiKey = config.odoo.apiKey;
    this.uid = null;
  }

  /**
   * Autentica no Odoo e obtém o UID do usuario
   * No Odoo SaaS, usa-se a API Key via JSON-RPC
   */
  async authenticate() {
    try {
      // Odoo SaaS usa JSON-RPC com API Key
      const response = await axios.post(`${this.baseUrl}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'common',
          method: 'authenticate',
          args: [this.db, this.username, this.apiKey, {}],
        },
        id: Date.now(),
      });

      if (response.data.error) {
        throw new Error(response.data.error.data?.message || 'Autenticacao Odoo falhou');
      }

      this.uid = response.data.result;
      logger.info(`Autenticado no Odoo (UID: ${this.uid})`);
      return this.uid;

    } catch (error) {
      logger.error('Falha na autenticacao Odoo: ' + error.message);
      throw new Error('Nao foi possivel conectar ao Odoo: ' + error.message);
    }
  }

  /**
   * Executa um metodo do Odoo via JSON-RPC
   * @param {string} model - Nome do modelo (ex: 'account.move')
   * @param {string} method - Nome do metodo (ex: 'search_read')
   * @param {Array} args - Argumentos posicionais
   * @param {Object} kwargs - Argumentos nomeados
   * @returns {Promise<any>} Resultado do metodo
   */
  async execute(model, method, args = [], kwargs = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [this.db, this.uid || this.username, this.apiKey, model, method, args, kwargs],
        },
        id: Date.now(),
      });

      if (response.data.error) {
        const errMsg = response.data.error.data?.message || JSON.stringify(response.data.error);
        throw new Error(errMsg);
      }

      logger.debug(`Odoo ${model}.${method}() -> OK`);
      return response.data.result;

    } catch (error) {
      logger.error(`Odoo ${model}.${method}() falhou: ${error.message}`);
      throw error;
    }
  }

  /**
   * Busca registros do Odoo
   * @param {string} model - Nome do modelo
   * @param {Array} domain - Filtro de busca
   * @param {Array} fields - Campos a retornar
   * @param {number} limit - Limite de registros
   * @returns {Promise<Array>} Registros encontrados
   */
  async searchRead(model, domain = [], fields = [], limit = 100) {
    return this.execute(model, 'search_read', [domain], { fields, limit });
  }

  /**
   * Cria um registro no Odoo
   * @param {string} model - Nome do modelo
   * @param {Object} values - Valores dos campos
   * @returns {Promise<number>} ID do registro criado
   */
  async create(model, values) {
    return this.execute(model, 'create', [values]);
  }

  /**
   * Atualiza registros no Odoo
   * @param {string} model - Nome do modelo
   * @param {Array|number} ids - IDs dos registros
   * @param {Object} values - Valores a atualizar
   * @returns {Promise<boolean>} True se sucesso
   */
  async write(model, ids, values) {
    return this.execute(model, 'write', [Array.isArray(ids) ? ids : [ids], values]);
  }

  /**
   * Atualiza fatura no Odoo com dados de pagamento
   * @param {number} invoiceId - ID da fatura (account.move)
   * @param {Object} paymentData - Dados do pagamento
   */
  async updateInvoicePayment(invoiceId, paymentData) {
    const values = {
      // Marca a fatura como paga
      payment_state: 'paid',
      itau_boleto_id: paymentData.id_boleto || null,
      itau_linha_digitavel: paymentData.linha_digitavel || null,
      itau_codigo_barras: paymentData.codigo_barras || null,
      itau_pix_copia_cola: paymentData.pix_copia_cola || null,
      itau_situacao: paymentData.situacao || null,
    };

    // Remove campos null
    Object.keys(values).forEach(k => values[k] === null && delete values[k]);

    if (Object.keys(values).length > 0) {
      return this.write('account.move', invoiceId, values);
    }
    return true;
  }

  /**
   * Cria um pagamento no Odoo
   * @param {Object} paymentData - Dados do pagamento
   * @returns {Promise<number>} ID do pagamento criado
   */
  async createPayment(paymentData) {
    const paymentValues = {
      payment_type: 'inbound',
      partner_type: 'customer',
      partner_id: paymentData.partner_id,
      amount: paymentData.amount,
      currency_id: paymentData.currency_id || 1, // BRL por padrao
      journal_id: paymentData.journal_id,
      ref: paymentData.ref || `Pagamento Itau - ${paymentData.itau_id || ''}`,
      date: paymentData.date || new Date().toISOString().split('T')[0],
      itau_tipo: paymentData.tipo || 'boleto', // boleto, pix, cartao
      itau_tx_id: paymentData.tx_id || null,
      itau_nsu: paymentData.nsu || null,
      itau_tid: paymentData.tid || null,
    };

    return this.create('account.payment', paymentValues);
  }
}

// Singleton
let odooClient = null;

function getOdooClient() {
  if (!odooClient) {
    odooClient = new OdooClient();
  }
  return odooClient;
}

module.exports = { OdooClient, getOdooClient };
