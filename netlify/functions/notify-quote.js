// netlify/functions/notify-quote.js
// ─────────────────────────────────────────────────────────────
//  Netlify Function — Notificaciones internas de cotizaciones
//  v3 FIX: Jornada + Precio en correo plan_selected
//
//  Variable de entorno necesaria en Netlify:
//    RESEND_API_KEY  →  tu API key de resend.com
// ─────────────────────────────────────────────────────────────

const DESTINATARIOS = [
  'cotizaciones@asistentevirtualok.com'
];

const REMITENTE = 'AVO Cotizaciones <cotizaciones@asistentevirtualok.com>';

exports.handler = async function (event) {
  // Solo POST
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
    tipo,
    quote_id,
    cliente_nombre,
    cliente_empresa,
    comercial,
    plan_nombre,
    jornada_nombre,
    precio,
    moneda,
    idioma,
    voip_selecciones,
    timestamp
  } = body;

  // LOG para diagnóstico (visible en Netlify Functions → Logs)
  console.log('=== NOTIFY-QUOTE ===', JSON.stringify({ tipo, plan_nombre, jornada_nombre, precio, moneda }));

  // Formatear precio
  const simbolos = { USD: '$', EUR: '€', COP: '$', MXN: '$' };
  const precioFormateado = precio
    ? `${simbolos[moneda] || '$'}${Number(precio).toLocaleString('es-VE')} ${moneda || 'USD'}`
    : null;

  // ── Construir asunto y contenido según el tipo de evento ──
  let asunto, contenidoHtml;

  if (tipo === 'opened') {
    asunto = `👁 Cotización abierta — ${cliente_empresa || cliente_nombre}`;
    contenidoHtml = `
      <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#0F1F3D;padding:20px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;">
          <img src="https://res.cloudinary.com/ny7ucpsj/image/upload/v1786393386/SVO_vcculy.jpg" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:12px;" alt="AVO" />
          <span style="color:#ffffff;font-size:15px;font-weight:700;">AsistenteVirtualOk.com</span>
          <span style="color:#C89B3C;font-size:12px;margin-left:10px;opacity:.9;">· Sistema de Cotizaciones</span>
        </div>
        <div style="background:#ffffff;padding:28px;border:1px solid #EDEDEA;border-top:none;">
          <p style="font-size:13px;color:#8C8B85;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Notificación de apertura</p>
          <h2 style="font-size:20px;color:#0F1F3D;margin:0 0 20px;">Un cliente abrió su cotización</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;width:140px;">Cliente</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${cliente_nombre || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Empresa</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${cliente_empresa || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Comercial</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;">${comercial || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Jornada</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${jornada_nombre || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Precio</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#C89B3C;font-weight:700;font-size:16px;">${precioFormateado || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#8C8B85;">Fecha / hora</td>
              <td style="padding:10px 0;color:#0F1F3D;">${timestamp || '—'}</td>
            </tr>
          </table>
          <div style="margin-top:24px;padding:14px 16px;background:#D6E8FF;border-radius:8px;font-size:13px;color:#1A5296;">
            💡 El cliente ya revisó su cotización. Es un buen momento para hacer seguimiento si no selecciona un plan en las próximas horas.
          </div>
        </div>
        <div style="background:#F7F5F0;padding:14px 28px;border-radius:0 0 10px 10px;font-size:11px;color:#8C8B85;border:1px solid #EDEDEA;border-top:none;">
          AsistenteVirtualOk.com · Sistema de Cotizaciones · ID: ${quote_id || ''}
        </div>
      </div>
    `;

  } else if (tipo === 'plan_selected') {
    asunto = `✅ Plan seleccionado — ${cliente_empresa || cliente_nombre} eligió: ${plan_nombre || 'N/A'}`;
    contenidoHtml = `
      <div style="font-family:Segoe UI,system-ui,sans-serif;max-width:560px;margin:0 auto;">
        <div style="background:#0F1F3D;padding:20px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;">
          <img src="https://res.cloudinary.com/ny7ucpsj/image/upload/v1786393386/SVO_vcculy.jpg" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:12px;" alt="AVO" />
          <span style="color:#ffffff;font-size:15px;font-weight:700;">AsistenteVirtualOk.com</span>
          <span style="color:#C89B3C;font-size:12px;margin-left:10px;opacity:.9;">· Sistema de Cotizaciones</span>
        </div>
        <div style="background:#ffffff;padding:28px;border:1px solid #EDEDEA;border-top:none;">
          <p style="font-size:13px;color:#1E7A4A;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">✅ Plan seleccionado</p>
          <h2 style="font-size:20px;color:#0F1F3D;margin:0 0 20px;">Un cliente seleccionó su plan</h2>
          <div style="background:#D4EDDA;border-radius:8px;padding:16px 20px;margin-bottom:20px;text-align:center;">
            <p style="font-size:12px;color:#1E7A4A;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Plan elegido</p>
            <p style="font-size:22px;font-weight:800;color:#0F1F3D;margin:0;">${plan_nombre || 'N/A'}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;width:140px;">Cliente</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${cliente_nombre || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Empresa</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${cliente_empresa || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Comercial</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;">${comercial || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Jornada</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#0F1F3D;font-weight:600;">${jornada_nombre || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#8C8B85;">Precio</td>
              <td style="padding:10px 0;border-bottom:1px solid #EDEDEA;color:#C89B3C;font-weight:700;font-size:16px;">${precioFormateado || '—'}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#8C8B85;">Fecha / hora</td>
              <td style="padding:10px 0;color:#0F1F3D;">${timestamp || '—'}</td>
            </tr>
          </table>
          ${voip_selecciones && Object.keys(voip_selecciones).length > 0 ? `
          <div style="margin-top:20px;padding:16px 20px;background:#EFF9FF;border:1.5px solid #2E86C1;border-radius:8px;">
            <p style="font-size:12px;color:#2E86C1;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px;">📞 Telefonía VoIP seleccionada</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="background:#D6E8FF;">
                  <th style="text-align:left;padding:7px 10px;color:#1A5296;font-size:11px;text-transform:uppercase;">País</th>
                  <th style="text-align:left;padding:7px 10px;color:#1A5296;font-size:11px;text-transform:uppercase;">Paquete</th>
                  <th style="text-align:left;padding:7px 10px;color:#1A5296;font-size:11px;text-transform:uppercase;">Pago inicial (3 meses)</th>
                  <th style="text-align:left;padding:7px 10px;color:#1A5296;font-size:11px;text-transform:uppercase;">Mensual (4to mes+)</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(voip_selecciones).map(([key, plan]) => `
                <tr>
                  <td style="padding:8px 10px;border-bottom:1px solid #BEE3F8;color:#0F1F3D;font-weight:600;">${plan.nombre || key}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #BEE3F8;color:#0F1F3D;font-weight:700;">${plan.minutos} min</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #BEE3F8;color:#C89B3C;font-weight:700;">${simbolos[moneda] || '$'}${plan.precio_inicial}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #BEE3F8;color:#0F1F3D;">${simbolos[moneda] || '$'}${plan.precio_mensual}/mes</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
          <div style="margin-top:20px;padding:14px 16px;background:#FFF0CC;border-radius:8px;font-size:13px;color:#9A6000;">
            🚀 <strong>Acción requerida:</strong> Inicia la búsqueda del perfil de <strong>${plan_nombre || ''}</strong> para <strong>${cliente_empresa || cliente_nombre || ''}</strong>. El cliente ya está esperando respuesta.
          </div>
        </div>
        <div style="background:#F7F5F0;padding:14px 28px;border-radius:0 0 10px 10px;font-size:11px;color:#8C8B85;border:1px solid #EDEDEA;border-top:none;">
          AsistenteVirtualOk.com · Sistema de Cotizaciones · ID: ${quote_id || ''}
        </div>
      </div>
    `;
  } else {
    return { statusCode: 400, body: 'Tipo de evento desconocido' };
  }

  // ── Enviar con Resend ──────────────────────────────────
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: REMITENTE,
        to: DESTINATARIOS,
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
    console.error('Error al enviar correo:', e);
    return { statusCode: 500, body: 'Error interno' };
  }
};
