// netlify/functions/send-quote-link.js
// ─────────────────────────────────────────────────────────────
//  Netlify Function — Envío automático del enlace de la cotización al cliente
//  Se dispara desde generator.html justo después de crear la cotización,
//  para que el cliente reciba el enlace por correo (y el comercial lo
//  comparta además por WhatsApp de forma manual).
//
//  Variable de entorno necesaria en Netlify:
//    RESEND_API_KEY  →  tu API key de resend.com
// ─────────────────────────────────────────────────────────────

const REMITENTE = 'AVO Cotizaciones <cotizaciones@asistentevirtualok.com>';

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
    segundo_email,       // correo adicional opcional (también recibe el correo)
    nota_adicional,       // (legacy) texto libre opcional que se anexa al correo generado automáticamente
    cuerpo_editado,       // texto del cuerpo del correo, editado por el comercial en el paso 7 del generador —
                           // cuando viene presente, REEMPLAZA por completo el cuerpo auto-generado de abajo
    servicios_nombres,   // array de nombres de los servicios cotizados
    link,                // enlace de la cotización (viewer.html?id=...)
    vencimiento_dias,    // número de días de vigencia, o null/'' si no tiene vencimiento
    idioma               // 'es' | 'en'
  } = body;

  if (!cliente_email) {
    return { statusCode: 400, body: 'Falta el correo del cliente' };
  }
  if (!link) {
    return { statusCode: 400, body: 'Falta el enlace de la cotización' };
  }

  // Destinatarios: el cliente siempre, más un segundo correo opcional (evitando duplicados)
  const destinatarios = [cliente_email, segundo_email].filter(Boolean);
  const destinatariosUnicos = [...new Set(destinatarios.map(e => e.trim()).filter(Boolean))];

  console.log('=== SEND-QUOTE-LINK ===', JSON.stringify({ quote_id, destinatariosUnicos, vencimiento_dias }));

  const en = idioma === 'en';

  // ── Lista de servicios cotizados, en texto natural ──
  const servicios = Array.isArray(servicios_nombres) ? servicios_nombres.filter(Boolean) : [];
  let serviciosTexto;
  if (servicios.length === 0) {
    serviciosTexto = en ? 'our services' : 'nuestros servicios';
  } else if (servicios.length === 1) {
    serviciosTexto = servicios[0];
  } else {
    const ultimo = servicios[servicios.length - 1];
    const resto = servicios.slice(0, -1).join(', ');
    serviciosTexto = en ? `${resto} and ${ultimo}` : `${resto} y ${ultimo}`;
  }

  // ── Frase de vigencia, según los días de vencimiento configurados ──
  let vigenciaTexto = '';
  const dias = vencimiento_dias ? parseInt(vencimiento_dias, 10) : null;
  if (dias) {
    if (en) {
      vigenciaTexto = `This quote is valid for ${dias} day${dias === 1 ? '' : 's'}. If the service is not contracted within this period, a new quote will need to be requested, as rates and terms may be subject to change.`;
    } else {
      vigenciaTexto = `La cotización tiene una vigencia de ${dias} día${dias === 1 ? '' : 's'}. Si el servicio no se contrata dentro de este período, será necesario solicitar una nueva cotización, ya que las tarifas y condiciones pueden estar sujetas a actualización.`;
    }
  }

  const asunto = en
    ? `Service quote - AsistenteVirtualOK.com -- ${cliente_empresa || cliente_nombre}`
    : `Cotización de servicio - AsistenteVirtualOK.com -- ${cliente_empresa || cliente_nombre}`;

  const saludo = en ? `Hi ${cliente_nombre || ''},` : `Hola ${cliente_nombre || ''},`;

  const parrafo1 = en
    ? `It's a pleasure to greet you.`
    : `Un placer saludarle.`;

  const parrafo2 = en
    ? `Following your request, we are sharing the quote for our ${serviciosTexto} service${servicios.length === 1 ? '' : 's'}. We have prepared a detailed proposal that reflects our commitment to excellence, and we hope it meets your needs and expectations.`
    : `De acuerdo a su solicitud, le compartimos la cotización de nuestros servicios de ${serviciosTexto}. Hemos preparado una propuesta detallada, que refleja nuestro compromiso con la excelencia, y esperamos que satisfaga sus necesidades y expectativas.`;

  const verLabel = en ? 'View quote:' : 'Ver cotización:';
  const introEnlace = en ? 'You can review the full proposal at the following link:' : 'Puede consultar la propuesta completa en el siguiente enlace:';

  const parrafo3 = en
    ? `If you have any questions about the proposal or would like more details about our services, we'd be happy to help. We can also schedule a call or meeting to discuss your needs and clarify any questions.`
    : `Si tiene alguna pregunta sobre la propuesta o desea conocer más detalles sobre nuestros servicios, estaremos encantados de ayudarle. También podemos coordinar una llamada o reunión para conversar sobre sus necesidades y aclarar cualquier inquietud.`;

  const parrafo4 = en
    ? `Thank you very much for considering Asistente Virtual OK. We look forward to the opportunity to work with you.`
    : `Muchas gracias por considerar a Asistente Virtual OK. Esperamos tener la oportunidad de trabajar con usted.`;

  const despedida = en ? 'Best regards,' : 'Saludos cordiales,';
  const firma = en ? 'The AsistenteVirtualOk.com Team' : 'Equipo de Asistente Virtual Ok.com';

  // Escapa HTML básico y preserva saltos de línea
  const escHtml = (str) => String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const notaAdicionalHtml = nota_adicional
    ? `<div style="margin:20px 0;padding:14px 16px;background:#FFF8E6;border-left:3px solid #F39C12;border-radius:6px;font-size:14px;color:#4A4A46;line-height:1.6;white-space:pre-wrap;">${escHtml(nota_adicional)}</div>`
    : '';

  // ── Botón + enlace (mismo estilo se use el cuerpo automático o el editado a mano) ──
  const botonEnlaceHtml = `
    <div style="text-align:center;margin:4px 0 22px;">
      <a href="${link}" style="display:inline-block;background:#0F1F3D;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 26px;border-radius:8px;">${verLabel} ${en ? 'View proposal' : 'Ver propuesta'} →</a>
    </div>
    <p style="font-size:12px;color:#8C8B85;word-break:break-all;margin:0 0 20px;">${link}</p>`;

  // ── Cuerpo editado a mano por el comercial (paso 7 del generador) ──
  // Reemplaza por completo el cuerpo auto-generado. El texto llega con párrafos separados
  // por líneas en blanco; el párrafo que contiene el marcador de enlace (p.ej.
  // "[ENLACE DE LA COTIZACIÓN]" / "[QUOTE LINK]") se sustituye por el botón real. Si el
  // comercial borró el marcador sin querer, el botón se agrega igual al final, para que el
  // cliente siempre reciba un enlace funcional.
  function buildCuerpoEditadoHtml(texto) {
    const marcadores = ['[ENLACE DE LA COTIZACIÓN]', '[QUOTE LINK]'];
    const parrafos = texto.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    let marcadorEncontrado = false;
    let html = parrafos.map(p => {
      const tieneMarcador = marcadores.some(m => p.toUpperCase().includes(m));
      if (tieneMarcador) {
        marcadorEncontrado = true;
        return botonEnlaceHtml;
      }
      return `<p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 16px;">${escHtml(p).replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    if (!marcadorEncontrado) html += botonEnlaceHtml;
    return html;
  }

  const cuerpoHtml = (cuerpo_editado && cuerpo_editado.trim())
    ? buildCuerpoEditadoHtml(cuerpo_editado.trim())
    : `
        <p style="font-size:15px;color:#0F1F3D;margin:0 0 4px;">${saludo}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:8px 0 16px;">${parrafo1}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 20px;">${parrafo2}</p>

        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 10px;">${introEnlace}</p>
        ${botonEnlaceHtml}

        ${vigenciaTexto ? `<p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 20px;">${vigenciaTexto}</p>` : ''}

        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 16px;">${parrafo3}</p>
        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:0 0 4px;">${parrafo4}</p>
        ${notaAdicionalHtml}

        <p style="font-size:14px;color:#4A4A46;line-height:1.6;margin:20px 0 2px;">${despedida}</p>
        <p style="font-size:14px;color:#0F1F3D;font-weight:700;margin:0;">${firma}</p>`;

  const contenidoHtml = `
    <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:#0F1F3D;padding:20px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;">
        <img src="https://res.cloudinary.com/ny7ucpsj/image/upload/v1786393386/SVO_vcculy.jpg" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:12px;" alt="AVO" />
        <span style="color:#ffffff;font-size:15px;font-weight:700;">AsistenteVirtualOk.com</span>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #EDEDEA;border-top:none;">
        ${cuerpoHtml}
      </div>
      <div style="background:#F7F5F0;padding:14px 28px;border-radius:0 0 10px 10px;font-size:11px;color:#8C8B85;border:1px solid #EDEDEA;border-top:none;">
        AsistenteVirtualOk.com · ${en ? 'Quote System' : 'Sistema de Cotizaciones'} · ID: ${quote_id || ''}
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
        to: destinatariosUnicos,
        reply_to: 'cotizaciones@asistentevirtualok.com',
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
    console.error('Error al enviar correo de enlace de cotización:', e);
    return { statusCode: 500, body: 'Error interno' };
  }
};
