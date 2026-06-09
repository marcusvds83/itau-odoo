const express = require("express");
const router = express.Router();
const { storeBoleto, getBoleto, generatePdfFromData } = require("../services/pdf-boleto");

router.post("/pdf", async (req, res) => {
  try {
    console.log("[BOLETOS] PDF sob demanda via POST");
    var pdfBuffer = await generatePdfFromData(req.body);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=boleto.pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[BOLETOS] Erro PDF POST:", error.message);
    res.status(500).json({ erro: error.message });
  }
});

router.get("/pdf/:txid", async (req, res) => {
  try {
    var txid = req.params.txid;
    console.log("[BOLETOS] PDF via GET TXID:", txid);
    var pdfBuffer = await generatePdf(txid);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=boleto-" + txid + ".pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[BOLETOS] Erro PDF GET:", error.message);
    res.status(404).json({ erro: "Boleto nao encontrado" });
  }
});

module.exports = router;