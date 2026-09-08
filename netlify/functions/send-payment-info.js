// netlify/functions/send-payment-info.js
// ─────────────────────────────────────────────────────────────
//  Netlify Function — Envío de información de pago al cliente
//  Sigue el texto/tono de la plantilla real usada por el equipo
//  ("¡Primer paso completado!"), pudiendo incluir varias opciones
//  de pago (Zelle + Transferencia bancaria, etc.) en un mismo correo.
//
//  Variable de entorno necesaria en Netlify:
//    RESEND_API_KEY  →  tu API key de resend.com
// ─────────────────────────────────────────────────────────────

const REMITENTE = 'AVO Cotizaciones <cotizaciones@asistentevirtualok.com>';
const CORREO_CONTABILIDAD = 'contabilidad@asistentevirtualok.com';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada');
    return { statusCode: 500, body: 'Configuración incompleta' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'JSON inválido' };
  }

  const {
    quote_id,
    cliente_nombre,
    cliente_empresa,
    cliente_email,
    monto,
    moneda,
    cuentas,      // array de objetos payment_accounts a incluir (uno o varios)
    link_pago,    // string opcional — link de pago personalizado (no hay uno estándar)
    nota,         // nota adicional opcional escrita por quien envía
    idioma        // 'es' | 'en'
  } = body;

  if (!cliente_email) {
    return { statusCode: 400, body: 'Falta el correo del cliente' };
  }
  const listaCuentas = Array.isArray(cuentas) ? cuentas : [];
  if (listaCuentas.length === 0 && !link_pago) {
    return { statusCode: 400, body: 'Falta al menos una opción de pago (cuenta o link de pago)' };
  }

  console.log('=== SEND-PAYMENT-INFO ===', JSON.stringify({
    quote_id, cliente_email, monto, moneda,
    metodos: listaCuentas.map(c => c.metodo), tiene_link: !!link_pago
  }));

  const simbolos = { USD: '$', EUR: '€', COP: '$', MXN: '$' };
  const montoFormateado = monto != null
    ? `${simbolos[moneda] || '$'}${Number(monto).toLocaleString('es-VE')} ${moneda || ''}`
    : null;

  const en = idioma === 'en';

  // ── Etiquetas de campos de una cuenta bancaria, en el idioma del correo ──
  const LABELS = en
    ? {
        beneficiario: 'Beneficiary', banco: 'Bank name', numero_cuenta: 'Account number',
        tipo_cuenta: 'Account type', direccion_beneficiario: 'Beneficiary address',
        aba: 'ABA routing number', swift: 'SWIFT', swiftAlt: 'Alternate SWIFT',
        iban: 'IBAN', direccion_banco: 'Bank address', identificacion: 'Tax ID',
        email: 'Email', telefono: 'Phone'
      }
    : {
        beneficiario: 'Beneficiario', banco: 'Nombre del banco', numero_cuenta: 'Número de cuenta',
        tipo_cuenta: 'Tipo de cuenta', direccion_beneficiario: 'Dirección del beneficiario',
        aba: 'Número de ruta ABA', swift: 'SWIFT', swiftAlt: 'Alternativa SWIFT',
        iban: 'IBAN', direccion_banco: 'Dirección del banco', identificacion: 'Identificación',
        email: 'Email', telefono: 'Teléfono'
      };

  // ── Construye el bloque HTML de una cuenta/opción de pago ──
  function renderCuenta(cuenta, numero) {
    const esSoloEmail = /zelle|paypal/i.test(cuenta.metodo || '') && cuenta.email_pago && !cuenta.numero_cuenta && !cuenta.iban;

    if (esSoloEmail) {
      // Formato simple de una línea, igual que en la plantilla original: "Zelle: correo@..."
      return `
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#0F1F3D;" valign="top"><strong>${numero}.</strong></td>
          <td style="padding:6px 0;font-size:14px;color:#0F1F3D;"><strong>${cuenta.metodo}:</strong> ${cuenta.email_pago}</td>
        </tr>`;
    }

    const filas = [];
    const addFila = (label, valor) => { if (valor) filas.push({ label, valor }); };
    addFila(LABELS.beneficiario, cuenta.titular);
    addFila(LABELS.banco, cuenta.banco);
    addFila(LABELS.numero_cuenta, cuenta.numero_cuenta);
    addFila(LABELS.tipo_cuenta, cuenta.tipo_cuenta);
    addFila(LABELS.direccion_beneficiario, cuenta.direccion_beneficiario);
    addFila(LABELS.aba, cuenta.numero_aba);
    addFila(LABELS.iban, cuenta.iban);
    addFila(LABELS.swift, cuenta.swift);
    addFila(LABELS.swiftAlt, cuenta.swift_alt);
    addFila(LABELS.direccion_banco, cuenta.direccion_banco);
    addFila(LABELS.identificacion, cuenta.identificacion);
    addFila(LABELS.email, cuenta.email_pago);
    addFila(LABELS.telefono, cuenta.telefono_pago);

    const subFilasHtml = filas.map(f => `
      <tr>
        <td style="padding:4px 0;color:#8C8B85;width:190px;font-size:13px;">${f.label}</td>
        <td style="padding:4px 0;color:#0F1F3D;font-weight:600;font-size:13px;">${f.valor}</td>
      </tr>`).join('');

    return `
      <tr>
        <td colspan="2" style="padding:10px 0 4px;">
          <div style="font-size:14px;color:#0F1F3D;margin-bottom:4px;"><strong>${numero}. ${cuenta.metodo}</strong></div>
          <table style="width:100%;border-collapse:collapse;margin-left:6px;">${subFilasHtml}</table>
          ${cuenta.instrucciones ? `<div style="margin:6px 0 0 6px;font-size:12px;color:#1A5296;">ℹ️ ${cuenta.instrucciones}</div>` : ''}
        </td>
      </tr>`;
  }

  let numero = 1;
  const filasCuentas = listaCuentas.map(c => renderCuenta(c, numero++)).join('');
  const filaLink = link_pago ? `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:#0F1F3D;" valign="top"><strong>${numero}.</strong></td>
      <td style="padding:6px 0;font-size:14px;color:#0F1F3D;"><strong>${en ? 'Payment link' : 'Link de pago'}:</strong> <a href="${link_pago}" style="color:#1A5296;">${link_pago}</a></td>
    </tr>` : '';

  const asunto = en
    ? `First step completed, ${cliente_nombre}! 🚀`
    : `¡Primer paso completado, ${cliente_nombre}! 🚀`;

  const saludo = en ? `Hi ${cliente_nombre || ''}` : `Hola ${cliente_nombre || ''}`;

  const intro = en
    ? `Great! With your contract signed we've already taken the first step together 🎉.`
    : `¡Genial! Con la firma de tu contrato ya hemos dado el primer paso juntos 🎉.`;

  const pasoSiguiente = en
    ? `The next step is simple: complete your payment${montoFormateado ? ` of <strong>${montoFormateado}</strong>` : ''} and send us the receipt at <a href="mailto:${CORREO_CONTABILIDAD}" style="color:#1A5296;">${CORREO_CONTABILIDAD}</a>. With that, everything will be ready to move forward and bring your project to life.`
    : `El siguiente paso es muy sencillo: realizar el pago${montoFormateado ? ` de <strong>${montoFormateado}</strong>` : ''} y compartirnos el comprobante al correo de <a href="mailto:${CORREO_CONTABILIDAD}" style="color:#1A5296;">${CORREO_CONTABILIDAD}</a>. Con eso tendremos todo listo para continuar y dar vida a tu proyecto.`;

  const opcionesLabel = en ? 'You can do this easily through these options:' : 'Puedes hacerlo fácilmente por medio de estas opciones:';

  const cierre1 = en
    ? `Once we receive your payment, we'll share your invoice and our Operations team will reach out to move forward with next steps.`
    : `Una vez recibido el pago, te compartiremos la factura y el Dpto. de Operaciones se comunicará contigo para avanzar con las gestiones pertinentes.`;

  const cierre2 = en
    ? `👉 If you've already made your payment, please disregard this message.`
    : `👉 Si ya realizaste tu pago, por favor omite este mensaje.`;

  const cierre3 = en
    ? `Thank you for your trust — we're excited to be part of this new stage with you.`
    : `Gracias por tu confianza, estamos felices de acompañarte en esta nueva etapa.`;

  const firma = en ? 'The AsistenteVirtualOk.com Team' : 'Equipo de Asistente Virtual Ok.com';

  const contenidoHtml = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#0F1F3D;padding:20px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;">
        <img src="https://res.cloudinary.com/ny7ucpsj/image/upload/v1786393386/SVO_vcculy.jpg" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:12px;" alt="AVO" />
        <span style="color:#ffffff;font-size:15px;font-weight:700;">AsistenteVirtualOk.com</span>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #EDEDEA;border-top:none;">
        <p style="font-size:15px;color:#0F1F3D;margin:0 0 4px;">${saludo}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:8px 0 18px;">${intro}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 20px;">${pasoSiguiente}</p>

        <p style="font-size:13px;color:#0F1F3D;font-weight:700;margin:0 0 10px;">${opcionesLabel}</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px;">
          ${filasCuentas}
          ${filaLink}
        </table>

        ${nota ? `
        <div style="padding:14px 16px;background:#FFF8E6;border-radius:8px;font-size:13px;color:#8A6D1F;margin:16px 0;">
          📌 ${nota}
        </div>` : ''}

        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:20px 0 14px;">${cierre1}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 20px;">${cierre2}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 4px;">${cierre3}</p>
        <p style="font-size:14px;color:#0F1F3D;font-weight:700;margin:2px 0 0;">${firma}</p>
      </div>
      <div style="background:#F7F5F0;padding:14px 28px;border-radius:0 0 10px 10px;font-size:11px;color:#8C8B85;border:1px solid #EDEDEA;border-top:none;">
        AsistenteVirtualOk.com · Sistema de Cotizaciones · ID: ${quote_id || ''}
      </div>
    </div>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: [cliente_email],
        reply_to: CORREO_CONTABILIDAD,
        subject: asunto,
        html: contenidoHtml
      })
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Error Resend:', result);
      return { statusCode: 500, body: JSON.stringify({ error: result }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: result.id })
    };

  } catch (e) {
    console.error('Error al enviar correo de pago:', e);
    return { statusCode: 500, body: 'Error interno' };
  }
};
