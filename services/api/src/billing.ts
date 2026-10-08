export function invoiceStatus(totalCents: number, paidCents: number, refunded = false): 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' {
  if (refunded) return 'REFUNDED';
  if (paidCents <= 0) return 'UNPAID';
  return paidCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID';
}

export function invoiceNumber(orderNumber: string): string {
  return `INV-${orderNumber.replace(/[^A-Z0-9-]/gi, '').slice(-20)}`;
}

export function renderInvoicePdf(invoice: { invoiceNumber: string; currency: string; totalCents: number; paidCents: number; status: string }): Buffer {
  const lines = [
    'GuestQR DIGITAL INVOICE',
    `Invoice: ${invoice.invoiceNumber}`,
    `Total: ${invoice.currency} ${(invoice.totalCents / 100).toFixed(2)}`,
    `Paid: ${invoice.currency} ${(invoice.paidCents / 100).toFixed(2)}`,
    `Status: ${invoice.status}`
  ];
  const text = lines.join('\n').replace(/[()\\]/g, '\\$&');
  const stream = `BT /F1 12 Tf 50 760 Td (${text.replace(/\n/g, ') Tj 0 -20 Td (')}) Tj ET`;
  const objects = [`<< /Type /Catalog /Pages 2 0 R >>`, `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
