/**
 * printThermalReceipt
 * Ouvre une fenêtre formatée pour imprimante thermique 58mm ou 80mm.
 * Compatible Star, Epson, Bixolon, Bluetooth POS, etc.
 *
 * Paramètres :
 *   • width : '58mm' (défaut) | '80mm' — lu dans localStorage 'ticket_width'
 *   • TVA dynamique depuis localStorage 'tax_rate'
 *   • Support assurance (insurance_org, insurance_rate, insurance_amount)
 */

export interface ReceiptData {
  sale_date: string;
  total_amount: number;       // HT ou sous-total
  tax_amount: number;
  grand_total: number;
  payment_method: string;
  client_name?: string | null;
  is_credit?: boolean;
  is_insurance?: boolean;
  insurance_org?: string | null;
  insurance_card?: string | null;
  insurance_rate?: number | null;
  insurance_amount?: number | null;
  patient_amount?: number | null;
  items: {
    medication_name: string;
    quantity: number;
    unit_price?: number;
    subtotal: number;
  }[];
  pharmacy_name?: string;
  pharmacy_address?: string;
  pharmacy_phone?: string;
  receipt_number?: string;
}

export function printThermalReceipt(data: ReceiptData): void {
  // ── Paramètres dynamiques ─────────────────────────────────────────────────
  const paperWidth   = (localStorage.getItem('ticket_width') || '58mm') as '58mm' | '80mm';
  const taxRate      = parseFloat(localStorage.getItem('tax_rate') || '0');
  const taxLabel     = taxRate > 0 ? `TVA (${(taxRate * 100).toFixed(1).replace('.0', '')} %)` : 'TVA (0 %)';
  const pharmacyName = data.pharmacy_name  ?? localStorage.getItem('pharma_pharmacy_name') ?? 'JunglePharm';
  const pharmacyAddr = data.pharmacy_address ?? '';
  const pharmacyPhone = data.pharmacy_phone ?? '';

  // ── Largeur de colonne adaptée ─────────────────────────────────────────────
  const isWide  = paperWidth === '80mm';
  const colW    = isWide ? '52%' : '50%';

  const dateStr = new Date(data.sale_date).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const receiptNo = data.receipt_number ?? `T-${String(Date.now()).slice(-6)}`;

  // ── Lignes articles ────────────────────────────────────────────────────────
  const itemsHtml = data.items.map(item => {
    const unitStr = item.unit_price ? `${Math.round(item.unit_price).toLocaleString('fr-FR')} F × ${item.quantity}` : `Qté: ${item.quantity}`;
    return `
      <tr>
        <td colspan="2" class="prod-name">${item.medication_name}</td>
      </tr>
      <tr>
        <td class="dim" style="padding-left:6px;font-size:9.5px">${unitStr}</td>
        <td class="right">${Math.round(item.subtotal).toLocaleString('fr-FR')} F</td>
      </tr>`;
  }).join('');

  // ── Section assurance ──────────────────────────────────────────────────────
  const insuranceHtml = data.is_insurance ? `
    <div style="border:1px solid #000;padding:3px 5px;margin:4px 0;text-align:center">
      <div class="bold" style="font-size:10px;letter-spacing:.5px">PRISE EN CHARGE ASSURANCE</div>
      <div>${data.insurance_org || 'Mutuelle'} ${data.insurance_rate ? `• ${data.insurance_rate}%` : ''}</div>
      ${data.insurance_card ? `<div class="dim">Carte: ${data.insurance_card}</div>` : ''}
    </div>` : '';

  const insuranceTotals = data.is_insurance ? `
    <tr>
      <td colspan="2" class="dim">Part assurance</td>
      <td class="right" style="font-weight:bold;color:#333">${Math.round(data.insurance_amount || 0).toLocaleString('fr-FR')} F</td>
    </tr>
    <tr>
      <td colspan="2" class="dim">Part patient</td>
      <td class="right">${Math.round(data.patient_amount || 0).toLocaleString('fr-FR')} F</td>
    </tr>` : '';

  // ── HTML complet ───────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Reçu — ${pharmacyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${isWide ? '12px' : '11px'};
      line-height: 1.4;
      color: #000;
      background: #fff;
      width: ${paperWidth};
      margin: 0 auto;
      padding: 4mm 2mm;
    }

    .center  { text-align: center; }
    .right   { text-align: right; }
    .bold    { font-weight: bold; }
    .large   { font-size: ${isWide ? '15px' : '14px'}; }
    .xlarge  { font-size: ${isWide ? '19px' : '17px'}; letter-spacing: -.5px; }
    .dim     { color: #444; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .divider-solid { border-top: 2px solid #000; margin: 4px 0; }
    .prod-name { font-weight: bold; padding-top: 3px; }

    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    td:first-child { width: ${colW}; }
    td:last-child  { text-align: right; }

    .total-row td { font-weight: bold; font-size: ${isWide ? '14px' : '13px'}; padding-top: 4px; }
    .grand-total-row td { font-weight: bold; font-size: ${isWide ? '18px' : '15px'}; padding-top: 4px; border-top: 2px solid #000; }

    .badge {
      display: inline-block;
      border: 1px solid #000;
      padding: 1px 6px;
      font-weight: bold;
      font-size: 10px;
      letter-spacing: 1px;
      margin: 3px 0;
    }

    @media print {
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }
      body { width: ${paperWidth}; margin: 0; padding: 2mm; }
    }
  </style>
</head>
<body>

  <!-- En-tête pharmacie -->
  <div class="center">
    <div class="bold xlarge">${pharmacyName}</div>
    ${pharmacyAddr  ? `<div class="dim" style="font-size:9.5px">${pharmacyAddr}</div>`  : ''}
    ${pharmacyPhone ? `<div class="dim" style="font-size:9.5px">Tél: ${pharmacyPhone}</div>` : ''}
  </div>

  <div class="divider"></div>

  <!-- Date, heure, N° reçu -->
  <div style="display:flex;justify-content:space-between;font-size:9.5px">
    <span class="dim">${dateStr}</span>
    <span class="dim">N° ${receiptNo}</span>
  </div>

  <!-- Badge crédit -->
  ${data.is_credit ? `
  <div class="center" style="margin:4px 0">
    <span class="badge">CREDIT</span>
    ${data.client_name ? `<div class="bold" style="margin-top:2px">${data.client_name}</div>` : ''}
  </div>` : data.client_name ? `<div class="center dim" style="font-size:9.5px;margin:2px 0">Client: ${data.client_name}</div>` : ''}

  <!-- Badge assurance -->
  ${insuranceHtml}

  <div class="divider"></div>

  <!-- Articles -->
  <table>
    <thead>
      <tr>
        <td class="bold" style="font-size:9px;color:#666;text-transform:uppercase">Article</td>
        <td class="bold right" style="font-size:9px;color:#666;text-transform:uppercase">Montant</td>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="divider-solid" style="margin-top:5px"></div>

  <!-- Totaux -->
  <table>
    ${taxRate > 0 ? `
    <tr>
      <td colspan="2" class="dim">Sous-total HT</td>
      <td class="right">${Math.round(data.total_amount).toLocaleString('fr-FR')} F</td>
    </tr>
    <tr>
      <td colspan="2" class="dim">${taxLabel}</td>
      <td class="right dim">${Math.round(data.tax_amount).toLocaleString('fr-FR')} F</td>
    </tr>` : ''}
    ${insuranceTotals}
    <tr class="grand-total-row">
      <td colspan="2">TOTAL</td>
      <td>${Math.round(data.grand_total).toLocaleString('fr-FR')} F</td>
    </tr>
    <tr style="margin-top:3px">
      <td colspan="2" class="dim" style="font-size:9.5px">Règlement</td>
      <td class="right bold" style="font-size:9.5px">${data.payment_method}</td>
    </tr>
  </table>

  <div class="divider"></div>

  <!-- Pied de page -->
  <div class="center dim" style="font-size:9.5px; margin-top:4px; line-height:1.7">
    Merci de votre confiance<br>
    Conservez ce reçu<br>
    <strong>${pharmacyName}</strong>
  </div>

  <div class="divider"></div>

  <div class="center" style="font-size:8.5px; color:#999; margin-top:2px">
    🌿 <strong style="color:#10785a">JunglePharm</strong>
  </div>


</body>
</html>`;

  import('./printHelper').then(({ printHtml }) => printHtml(html));
}
