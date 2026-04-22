/*
© 2026 Andrea Lorán
Todos los derechos reservados.
Prohibida la copia o distribución de este código sin autorización.
*/

const urlApi = 'https://script.google.com/macros/s/AKfycbzhw3QMxMyVBuSzbabj8wPc5hm5X75AODXqz7Kn737rn46G670fl844EWLhy0G13bc/exec';
const offsetFilas = 1;

// Variables para ordenación cíclica
let ordenOriginal = []; // Guarda el orden inicial de IDs
let ultimoIdInteractuado = sessionStorage.getItem('lastInteractionId') || null;
let renderTimeoutId = null; // Variable nueva para controlar el renderizado
let estadosOrden = {
  'documentacion': 0,  // 0=original, 1=con doc arriba
  'Llamado': 0,        // 0=original, 1=NO llamados arriba, 2=llamados arriba
  'Respondido': 0,     // 0=original, 1=NO respondidos arriba, 2=respondidos arriba
  'your-name': 0       // 0=original, 1=A-Z, 2=Z-A
};

let contactosData = [];
let originalContactosData = [];
let sortColumn = null;
let sortDirection = 1;

// Variables para paginado de notificaciones
let notificacionesPendientesIndex = 0;
let notificacionesProximasIndex = 0;
const ITEMS_POR_PAGINA = 3;
// Variables para paginado de notificaciones (añadir a las existentes)
let notificacionesPendientesTotalMostradas = 0;
let notificacionesProximasTotalMostradas = 0;
let filtroViabilidadActivo = false;
// Variables para paginación
let paginaActual = 1;
const CONTACTOS_POR_PAGINA = 20;
let searchQuery = '';
let searchDebounceId = null;
const CONFIG_ACTIONS = {
  GET: 'getConfig',
  SAVE: 'saveConfig',
  ADD: 'addCategoria',
  UPDATE: 'updateCategoria',
  DELETE: 'deleteCategoria',
  TOGGLE: 'toggleCategoria'
};
function getEmailPrefix(nombre) {
  return `${obtenerSaludo()} ${nombre},`;
}
const AVAILABLE_FORM_FIELDS = [
  'vivienda-interesada', 'terreno', 'ubicacion-terreno', 'number-419', 'date-33', 'presupuesto-deseado', 'informacion-adicional',
  'number-420', 'number-421', 'number-422', 'number-423',
  'fecha-llamada', 'como-conocido', 'como-conocido-otros', 'distribucion-dia', 'garaje', 'piscina', 'estancia-adicional',
  'superficie-parcela', 'edificabilidad', 'ocupacion', 'referencia-catastral', 'fecha-mail', 'info-enviada',
  'estudio-viabilidad', 'fecha-reunion', 'imprescindible'
];
const ALWAYS_INCLUDED_FIELDS = ['your-name', 'Fecha', 'interes', 'origen-contacto', 'your-email', 'tel-686', 'Notas'];
const FORM_FIELD_LABELS = {
  'your-name': 'Nombre/s',
  'Fecha': 'Fecha de contacto',
  'interes': 'Interés',
  'your-email': 'Correo electrónico',
  'tel-686': 'Teléfono',
  'origen-contacto': '¿De dónde procede el contacto?',
  'como-conocido': '¿Cómo nos has conocido?',
  'como-conocido-otros': '¿Cómo nos has conocido? (otros)',
  'terreno': 'Dispones de terreno',
  'ubicacion-terreno': 'Ubicación del terreno',
  'number-419': 'Inversión estimada',
  'date-33': 'Plazo o fecha deseada',
  'number-420': 'Número de plantas',
  'number-421': 'Superficie de la vivienda',
  'number-422': 'Número de dormitorios',
  'number-423': 'Número de baños',
  'descripcion-vivienda': 'Descripción de vivienda',
  'distribucion-dia': 'Distribución zona de día',
  'garaje': 'Garaje',
  'piscina': 'Piscina',
  'estancia-adicional': 'Estancia adicional',
  'superficie-parcela': 'Superficie de parcela',
  'edificabilidad': 'Edificabilidad',
  'ocupacion': 'Ocupación',
  'referencia-catastral': 'Referencia catastral',
  'presupuesto-deseado': 'Presupuesto deseado',
  'viabilidad': 'Viabilidad',
  'informacion-adicional': 'Información adicional',
  'fecha-llamada': 'Fecha de llamada',
  'fecha-mail': 'Fecha de mail',
  'info-enviada': 'Información enviada',
  'fecha-reunion': 'Fecha de reunión',
  'imprescindible': 'Imprescindible',
  'estudio-viabilidad': 'Estudio de viabilidad',
  'Notas': 'Notas',
  'vivienda-interesada': 'Vivienda interesada'
};
const getFieldLabel = (field) => FORM_FIELD_LABELS[field] || field;
const DETAIL_CORE_FIELDS = ['origen-contacto', 'Notas'];

function getDetalleConfiguradoFields(categoria, contacto) {
  const detalleConfig = categoria?.detalle || categoria?.formulario?.detalle || {};
  const camposConfig = (detalleConfig?.campos || []).map(v => String(v || '').trim()).filter(Boolean);
  const esConfigurable = detalleConfig?.tipo === 'custom';
  if (!esConfigurable) return [];

  const selected = new Set([...DETAIL_CORE_FIELDS, ...camposConfig]);
  if (contacto?.['procedencia-contacto']) selected.add('origen-contacto');
  return [...selected];
}

function formatDetalleFieldValue(contacto, field) {
  const DATE_DETAIL_FIELDS = new Set(['Fecha', 'date-33', 'fecha-llamada', 'fecha-mail', 'fecha-reunion']);
  if (DATE_DETAIL_FIELDS.has(field)) {
    const raw = contacto?.[field];
    if (!raw) return 'No especificado';
    const date = parseFechaFlexible(raw);
    if (isNaN(date)) return String(raw);
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (field === 'origen-contacto') {
    const value = contacto?.['procedencia-contacto'] || contacto?.['origen-contacto'] || '';
    return String(value || '').trim() || 'No especificado';
  }
  if (field === 'number-419') {
    const value = contacto?.['number-419'];
    return value
      ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
      : 'No indicada';
  }
  if (field === 'referencia-catastral') {
    const value = String(contacto?.['referencia-catastral'] || '').trim();
    return value || 'No tiene';
  }
  if (field === 'estudio-viabilidad') {
    return contacto?.['estudio-viabilidad'] || 'No';
  }
  const value = contacto?.[field];
  const normalized = String(value || '').trim();
  return normalized || 'No especificado';
}

function buildDetalleRowsHTML(contacto, fields = []) {
  return fields.map(field => {
    const label = field === 'origen-contacto' ? 'Procedencia del contacto' : getFieldLabel(field);
    const value = formatDetalleFieldValue(contacto, field);
    return `<div><b>${label}:</b> ${value}</div>`;
  }).join('');
}
let appConfig = null;
// Función auxiliar para normalización de strings (nueva para reutilización)

// --- Función universal con reintento automático ---
async function safeFetch(url, options = {}, retries = 2) {
  for (let intento = 0; intento <= retries; intento++) {
    try {
      const resp = await fetch(url, options);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      console.warn(`⚠️ Error en fetch: ${e.message}`);
      if (intento === retries) {
        console.error("❌ Falló tras reintentos:", url);
        throw e;
      }
      await new Promise(r => setTimeout(r, 800 * (intento + 1)));
      console.log(`🔄 Reintentando (${intento + 1}/${retries})...`);
    }
  }
}

function obtenerSaludo() {
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', { 
    timeZone: 'Europe/Madrid', 
    hour: '2-digit', 
    hour12: false 
  }).format(ahora);

  const hora = parseInt(horaEspaña, 10);
  return (hora >= 13) ? 'Buenas tardes' : 'Buenos días';
}

function getEmailPrefix(nombre) {
  return `${obtenerSaludo()} ${nombre},`;
}

const normalizeString = (value) => CategoriaSystem.normalizeString(value);
function prepararContacto(contacto) {
  contacto._searchNombre = normalizeString(contacto['your-name'] || '').replace(/[^a-z0-9]+/g, '');
  contacto._searchTelefono = String(contacto['tel-686'] || '').replace(/\D/g, '');
  const avisoKey = `${contacto['FechaNotificacion'] || ''}|${contacto['HoraNotificacion'] || ''}|${contacto['FechaSeguimiento'] || ''}`;
  contacto._avisoKey = avisoKey;
  contacto._avisoDate = null;
  return contacto;
}
function coincideBusquedaContacto(contacto, query) {
  if (!query) return true;
  const nombreNormalizado = contacto._searchNombre ?? (contacto._searchNombre = normalizeString(contacto['your-name'] || '').replace(/[^a-z0-9]+/g, ''));
  const telefonoNormalizado = contacto._searchTelefono ?? (contacto._searchTelefono = String(contacto['tel-686'] || '').replace(/\D/g, ''));
  return nombreNormalizado.includes(query) || telefonoNormalizado.includes(query);
}
// Nueva función para clasificar recordatorios por urgencia
function clasificarRecordatorio(contacto) {
  const d = obtenerFechaAvisoDate(contacto);
  if (isNaN(d)) return 'sin-recordatorio';
  const ahora = new Date();
  ahora.setSeconds(0, 0);
  const diffMs = d - ahora;
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMs <= 0) return 'urgente'; // Ahora o pasado
  if (diffDias <= 2) return 'proximo'; // Hoy, mañana o pasado
  return 'futuro'; // Más de 2 días
}
// Función mejorada para obtener el punto indicador
function obtenerPuntoRecordatorio(contacto) {
  const tipo = clasificarRecordatorio(contacto);
  
  switch (tipo) {
    case 'urgente':
      return '<span class="recordatorio-dot urgente" title="¡Llamar ahora! Recordatorio vencido" aria-label="Recordatorio urgente"></span>';
    case 'proximo':
      return '<span class="recordatorio-dot proximo" title="Llamar pronto (hoy/mañana/pasado)" aria-label="Recordatorio próximo"></span>';
    case 'futuro':
      return '<span class="recordatorio-dot futuro" title="Recordatorio programado" aria-label="Recordatorio futuro"></span>';
    default:
      return '';
  }
}
// Nueva función para posponer una semana
async function postponerRecordatorio(id) {
  try {
    const contacto = await obtenerFilaPorId(id);
    const fechaActual = obtenerFechaAvisoDate(contacto);
    
    let nuevaFecha;
    if (isNaN(fechaActual)) {
      nuevaFecha = new Date();
      nuevaFecha.setDate(nuevaFecha.getDate() + 7);
    } else {
      nuevaFecha = new Date(fechaActual);
      nuevaFecha.setDate(nuevaFecha.getDate() + 7);
    }
    
    const fechaStr = nuevaFecha.toISOString().split('T')[0];
   const horaStr = `${String(nuevaFecha.getHours()).padStart(2, '0')}:${String(nuevaFecha.getMinutes()).padStart(2, '0')}`;
 
    await marcarCampo('FechaNotificacion', id, fechaStr);
    await marcarCampo('HoraNotificacion', id, horaStr);
    await marcarFechaSeguimiento(idPersona, `${fechaStr}T${horaFinal}:00`);
    
    return nuevaFecha;
  } catch (e) {
    handleError('Error al posponer recordatorio', e);
    throw e;
  }
}
// NUEVO - Función para formatear fecha y hora en el formato DD/MM/AAAA a las HH:MM
function formatearFechaHoraParaNotas(fecha) {
  const f = new Date(fecha);
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const yyyy = f.getFullYear();
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} a las ${hh}:${mi}`;
}
function formatearFecha(fechaStr) {
  if (!fechaStr) return '';
  const f = new Date(fechaStr);
  return `${f.toLocaleDateString('es-ES')} ${f.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}
function isEliminado(contacto) {
  const eliminadoRaw = normalizeString(contacto['eliminado']);
  return eliminadoRaw === 'si' || eliminadoRaw === 'yes' || eliminadoRaw === 'true' || eliminadoRaw === '1';
}
function formatearSoloFecha(fechaVal) {
  if (!fechaVal) return '';
  // Si ya viene como Date desde GAS, mostrarla directamente en ES
  if (fechaVal instanceof Date) {
    return fechaVal.toLocaleDateString('es-ES');
  }
  if (typeof fechaVal === 'string') {
    const str = fechaVal.trim();
    const isoConZona = /^\d{4}-\d{2}-\d{2}T.*([zZ]|[+-]\d{2}:?\d{2})$/;
    if (isoConZona.test(str)) {
      const d = new Date(str);
      return isNaN(d) ? '' : d.toLocaleDateString('es-ES');
    }
    // Si viene como string ISO sin zona, usar solo la parte YYYY-MM-DD y fijar 00:00 local
    const mISO = str.match(/^(\d{4}-\d{2}-\d{2})T/);
    if (mISO) {
      const d = new Date(`${mISO[1]}T00:00:00`);
      return d.toLocaleDateString('es-ES');
    }
  }
  // Fallback robusto: numéricos (serial de Sheets), dd/mm/yyyy, yyyy-mm-dd, etc.
  const f = parseFechaFlexible(fechaVal);
  return isNaN(f) ? '' : f.toLocaleDateString('es-ES');
}
function getHoraInputValue(horaRaw) {
  if (typeof horaRaw === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(horaRaw)) {
    return horaRaw.slice(0, 5);
  }
  const d = parseFechaFlexible(horaRaw);
  if (!isNaN(d)) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return '';
}
function parseFechaFlexible(valor) {
  if (valor == null || valor === '' || valor === 'undefined' || valor === 'null') {
    return new Date(''); 
  }
  if (typeof valor === 'number') {
    if (valor > 100000000000) return new Date(valor);
   
    const epoch = new Date(1899, 11, 30); 
    const ms = valor * 24 * 60 * 60 * 1000;
    return new Date(epoch.getTime() + ms);
  }
  if (typeof valor !== 'string') return new Date(valor);
  const str = valor.trim();
  const isoNoSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (isoNoSeconds.test(str)) {
    return new Date(`${str}:00`); // Sin compensación de offset
  }
  // Caso solo fecha "YYYY-MM-DD"
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/;
  if (soloFecha.test(str)) {
    return new Date(`${str}T00:00:00`); // Sin compensación de offset
  }
  // Caso ES: dd/mm/yyyy
  const esSoloFecha = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const m1 = str.match(esSoloFecha);
  if (m1) {
    const [_, dd, mm, yyyy] = m1;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  // Caso ES con hora: dd/mm/yyyy hh:mm
  const esFechaHora = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/;
  const m2 = str.match(esFechaHora);
  if (m2) {
    const [_, dd, mm, yyyy, hh, mi] = m2;
    return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00`);
  }
  // Intento directo
  const d = new Date(str);
  if (!isNaN(d)) return d;
  // Reemplazar espacios por T si parece formato "YYYY-MM-DD HH:MM[:SS]"
  const espacioIso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;
  if (espacioIso.test(str)) {
    const s = str.replace(' ', 'T');
    const d2 = new Date(s);
    if (!isNaN(d2)) return d2;
  }
  return new Date('');
}
// CAMBIADO - Reemplazar toda la función obtenerFechaAvisoDate por esta versión:
function obtenerFechaAvisoDate(contacto) {
  if (contacto && typeof contacto === 'object') {
    const avisoKey = `${contacto['FechaNotificacion'] || ''}|${contacto['HoraNotificacion'] || ''}|${contacto['FechaSeguimiento'] || ''}`;
    if (contacto._avisoKey === avisoKey && contacto._avisoDate instanceof Date) {
      return contacto._avisoDate;
    }
    contacto._avisoKey = avisoKey;
  }
  const fechaCampo = contacto['FechaNotificacion'];
  const horaCampo = contacto['HoraNotificacion'];
  
  if (fechaCampo && fechaCampo.trim() !== '') {
    const fechaISO = String(fechaCampo).match(/^\d{4}-\d{2}-\d{2}$/) ? fechaCampo : null;
  const hora = getHoraInputValue(horaCampo) || '09:00';
    
    if (fechaISO) {
      // CAMBIADO - Crear fecha local directamente sin conversiones UTC
      const fechaHoraString = `${fechaISO}T${hora}:00`;
      const fechaLocal = new Date(fechaHoraString);
      
      if (!isNaN(fechaLocal) && fechaLocal.getFullYear() > 1970) {
        if (contacto && typeof contacto === 'object') {
          contacto._avisoDate = fechaLocal;
        }
        return fechaLocal;
      }
    }
  }
  // © 2026 Andrea Lorán - ID: 1734X
const _authorCode = "AL2026";
  // Fallback a FechaSeguimiento
  const fallback = contacto['FechaSeguimiento'];
  if (!fallback || fallback.trim() === '') {
    return new Date('');
  }
  
  const d2 = parseFechaFlexible(fallback);
  if (!isNaN(d2) && d2.getFullYear() > 1970) {
    if (contacto && typeof contacto === 'object') {
      contacto._avisoDate = d2;
    }
    return d2;
  }
  
  const invalida = new Date('');
  if (contacto && typeof contacto === 'object') {
    contacto._avisoDate = invalida;
  }
  return invalida;
}
function esRecordatorioPendiente(contacto) {
  const d = obtenerFechaAvisoDate(contacto);
  if (isNaN(d)) return false;
  const ahora = new Date();
  ahora.setSeconds(0,0);
  return d <= ahora;
}
// CAMBIADO - Añadir nota al campo Notas con formato específico
async function marcarRecordatorioHecho(id) {
  try {
    // 1. Obtener la fila actual (necesario para las notas)
    const contacto = await obtenerFilaPorId(id); // Esta llamada es rápida ahora gracias al CAMBIO #1
    const notasActuales = contacto['Notas'] || '';
    const motivo = contacto['MotivoSeguimiento'] || '';
    const ahora = new Date();

    const fechaFormateada = formatearFechaHoraParaNotas(ahora);
    const nuevaNota = notasActuales
      ? `${notasActuales}\nLlamado el ${fechaFormateada} — ${motivo || 'Sin asunto'}`
      : `Llamado el ${fechaFormateada} — ${motivo || 'Sin asunto'}`;

    // 2. Crear un objeto con todas las actualizaciones
    const updates = {
      Notas: nuevaNota,
      FechaNotificacion: '',
      HoraNotificacion: '',
      FechaSeguimiento: '',
      MotivoSeguimiento: '' // Limpiar también el motivo
    };

    // 3. Ejecutar UNA sola actualización
    const result = await actualizarFila(id, updates);
    if (result.status !== 'success' || !result.data) {
      throw new Error(result.message || 'Error al actualizar fila con actualizarFila');
    }

    // 4. Sincronizar datos locales y refrescar (Ver CAMBIO #4)
    const contactoLocal = contactosData.find(c => c.ID === id);
    if (contactoLocal) {
      Object.assign(contactoLocal, result.data);
      prepararContacto(contactoLocal);
    }
    const contactoOriginal = originalContactosData.find(c => c.ID === id);
    if (contactoOriginal) {
      Object.assign(contactoOriginal, result.data);
      prepararContacto(contactoOriginal);
    }

    aplicarFiltro({ resetPage: false }); // Refresca la tabla manteniendo el orden

  } catch (e) {
    handleError('Error al marcar recordatorio como hecho', e);
    throw e; // Relanzar error
  }
}
async function actualizarFila(id, datos) {
  try {
    const datosConId = { ...datos, ID: id };
    const intentoPrincipal = await enviarSaveFormDataConCompatibilidad_(datosConId);

    if (intentoPrincipal.status === 'success') {
      return intentoPrincipal;
    }

    const mensaje = String(intentoPrincipal.message || '');
    if (!esErrorAccionNoSoportada_(mensaje)) {
      throw new Error(mensaje || 'Error al actualizar fila');
    }

    // Fallback para deployments legacy/new que no aceptan action=saveFormData:
    // actualizamos cada campo por separado usando el endpoint GET `marcar`.
    const entradas = Object.entries(datosConId).filter(([key]) => key !== 'ID');
    if (!entradas.length) {
      throw new Error('No hay campos para actualizar');
    }

    for (const [campo, valor] of entradas) {
      await marcarCampoLegacyPorGet_(campo, id, valor ?? '');
    }

    const data = await obtenerFilaPorId(id);
    return {
      status: 'success',
      message: 'Fila actualizada (modo compatibilidad)',
      data
    };
  } catch (e) {
    handleError('Error al actualizar fila', e);
    throw new Error('Error al actualizar fila: ' + e.message);
  }
}
async function obtenerFilaPorId(id) {
  try {
    const response = await fetch(`${urlApi}?id=${encodeURIComponent(id)}`);
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message || 'Error al obtener fila');
    return result.data;
  } catch (e) {
    handleError('Error al obtener fila', e);
    throw e;
  }
}
async function marcarCampo(campo, id, valor) {
  try {
    let valorProcesado;
    // Normalización de valores
    if (['Prioridad', 'Llamado', 'Respondido', 'NoContestados'].includes(campo)) {
      valorProcesado = normalizeString(valor);
    } else {
      valorProcesado = String(valor);
    }
    
    const payload = {
      ID: id,
      [campo]: valorProcesado, // Clave dinámica (ej: "Notas": "Texto muy largo...")
      action: 'saveFormData'
    };
    const result = await enviarSaveFormDataConCompatibilidad_(payload);
    if (result.status === 'success') return result;

    if (esErrorAccionNoSoportada_(result.message)) {
      const legacyResult = await marcarCampoLegacyPorGet_(campo, id, valorProcesado);
      if (legacyResult.status === 'success') return legacyResult;
      throw new Error(legacyResult.message || `Error al marcar ${campo} (modo compatibilidad)`);
    }

    throw new Error(result.message || `Error al marcar ${campo}`);
  } catch (e) {
    handleError(`Error al marcar ${campo}`, e);
    throw e;
  }
}
function esErrorAccionNoSoportada_(message) {
  return normalizeString(String(message || '')).includes('accion no soportada');
}
async function enviarSaveFormDataConCompatibilidad_(payloadConAction) {
  const payloadSinAction = { ...payloadConAction };
  delete payloadSinAction.action;

  const intentos = [
    {
      body: new URLSearchParams(payloadConAction),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    },
    {
      body: JSON.stringify(payloadConAction),
      headers: { 'Content-Type': 'application/json' }
    },
    {
      body: new URLSearchParams(payloadSinAction),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }
  ];

  let ultimoError = null;
  for (const intento of intentos) {
    try {
      const response = await fetch(urlApi, {
        method: 'POST',
        headers: intento.headers,
        body: intento.body
      });
      if (!response.ok) {
        const errorText = await response.text();
        ultimoError = `Error HTTP: ${response.status} - ${errorText}`;
        continue;
      }
      const result = await response.json();
      if (result.status === 'success') return result;
      ultimoError = result.message || 'Error desconocido';
      if (!esErrorAccionNoSoportada_(ultimoError)) {
        return result;
      }
    } catch (error) {
      ultimoError = error.message;
    }
  }
  return { status: 'error', message: ultimoError || 'No se pudo guardar' };
}
async function marcarCampoLegacyPorGet_(campo, id, valor) {
  const marcador = `${campo}:${id}:${valor ?? ''}`;
  const response = await fetch(`${urlApi}?marcar=${encodeURIComponent(marcador)}`, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return response.json();
}
async function marcarLlamado(id, valor) {
  return marcarCampo("Llamado", id, valor);
}
async function marcarRespondido(id, valor) {
  return marcarCampo("Respondido", id, valor);
}
async function marcarNotas(id, notas) {
  return marcarCampo("Notas", id, notas);
}
async function marcarFechaSeguimiento(id, fecha) {
  return marcarCampo("FechaSeguimiento", id, fecha);
}
async function marcarMotivoSeguimiento(id, motivo) {
  return marcarCampo("MotivoSeguimiento", id, motivo);
}
async function enviarRecordatorioEmail(id, when) {
  try {
    const whenValue = String(when || '').trim();
    if (!whenValue) {
      return { status: 'skipped', message: 'Sin envío de email' };
    }

    const query = `sendReminder=${encodeURIComponent(id)}&when=${encodeURIComponent(whenValue)}`;
    return await safeFetch(`${urlApi}?${query}`);
  } catch (e) {
    handleError('Error al enviar/programar email recordatorio', e);
    throw e;
  }
}
// Función para ocultar fila (soft delete)
async function ocultarFila(id) {
  try {
    const response = await fetch(`${urlApi}?marcar=${encodeURIComponent(`eliminado:${id}:si`)}`, {
      method: 'GET', // Cambiar a GET para consistencia con otros endpoints
    });
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.message || 'Error al ocultar fila');
    
    // Actualizar datos locales inmediatamente
    const contacto = originalContactosData.find(c => c.ID === id);
    if (contacto) {
      contacto.eliminado = 'si';
      prepararContacto(contacto);
    }
    
    // Re-aplicar filtro para actualizar vista sin reiniciar página
    aplicarFiltro({ resetPage: false });
    
    return result;
  } catch (e) {
    handleError('Error al ocultar fila', e);
    throw new Error('Error al ocultar fila: ' + e.message);
  }
}
// Función para restaurar fila
async function restaurarFila(id) {
  try {
    const response = await fetch(`${urlApi}?marcar=${encodeURIComponent(`eliminado:${id}:no`)}`, {
      method: 'GET',
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Error al restaurar fila');
    }
    
    // Actualizar datos locales inmediatamente
    const contacto = originalContactosData.find(c => c.ID === id);
    if (contacto) {
      contacto.eliminado = 'no';
      prepararContacto(contacto);
    }
    
    // Re-aplicar filtro para actualizar vista sin reiniciar página
    aplicarFiltro({ resetPage: false });
    
    return result;
  } catch (e) {
    handleError('Error al restaurar fila', e);
    throw new Error('Error al restaurar fila: ' + e.message);
  }
}
async function eliminarDefinitivo(id) {
  try {
    const response = await fetch(`${urlApi}?deleteRow=${encodeURIComponent(id)}`);
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Error al eliminar fila definitivamente');
    }
    
    // Remover de datos locales
    const index = originalContactosData.findIndex(c => c.ID === id);
    if (index > -1) {
      originalContactosData.splice(index, 1);
    }
    
    // Re-aplicar filtro para actualizar vista sin reiniciar página
    aplicarFiltro({ resetPage: false });
    
    return result;
  } catch (e) {
    handleError('Error al eliminar fila definitivamente', e);
    throw new Error('Error al eliminar fila definitivamente: ' + e.message);
  }
}
function crearBoton({ fondo, borde, textoColor, texto, extra = {}, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button'; // CRÍTICO: Evita que el navegador intente enviar formulario
  btn.className = 'btn btn-sm';
  btn.innerHTML = texto;
  btn.style.backgroundColor = fondo;
  btn.style.border = `2px solid ${borde}`;
  btn.style.color = textoColor;
  btn.style.borderRadius = '6px';
  btn.style.padding = '4px 12px';
  btn.style.fontWeight = '500';
  btn.style.fontSize = '12px'; 
  btn.style.minWidth = '53px';
  btn.style.height = '29px';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  
  Object.assign(btn.style, extra);
  
  if (onClick) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();  // STOP al comportamiento por defecto
      e.stopPropagation(); // STOP a que el evento suba a la fila (y abra detalles)
      onClick.call(btn, e);
    });
  }
  return btn;
}
function crearBotonDocumentacion(id, estado) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm';
  btn.style.width = '32px';
  btn.style.height = '32px';
  btn.style.padding = '0';
  btn.title = 'Documentación';
  btn.style.borderRadius = '6px';
  btn.style.border = '2px solid #6c757d';
  
  
   btn.style.marginLeft = 'auto';
  btn.style.marginRight = 'auto'; 
  
  btn.style.backgroundColor = estado === true || estado === 'Sí' ? '#81c995' : '#f8f9fa';
  btn.style.color = estado === true || estado === 'Sí' ? '#fff' : '#6c757d';
  btn.innerHTML = estado === true || estado === 'Sí' 
    ? '<i class="bi bi-check-lg"></i>' 
    : '<i class="bi bi-square"></i>';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const nuevoEstado = (estado === true || estado === 'Sí') ? 'No' : 'Sí';
    btn.innerHTML = `<div class="spinner-border spinner-border-sm text-warning" role="status"></div>`;
    try {
      await marcarCampo('documentacion', id, nuevoEstado.toLowerCase());
      estado = nuevoEstado;
      btn.style.backgroundColor = estado === 'Sí' ? '#81c995' : '#f8f9fa';
      btn.style.color = estado === 'Sí' ? '#fff' : '#6c757d';
      btn.innerHTML = estado === 'Sí' ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-square"></i>';
    } catch (e) {
      alert('Error al actualizar Documentación: ' + e.message);
      btn.style.backgroundColor = estado === 'Sí' ? '#81c995' : '#f9f9fa';
      btn.style.color = estado === 'Sí' ? '#fff' : '#6c757d';
      btn.innerHTML = estado === 'Sí' ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-square"></i>';
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}
// ✨ ADDED - Función para crear botón de eliminar recordatorio
function crearBotonEliminarRecordatorio(id) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-outline-danger btn-sm';
  btn.style.padding = '4px 8px';
  btn.style.border = 'none';
  btn.style.background = 'transparent';
  btn.style.color = '#dc3545';
  btn.title = 'Eliminar recordatorio';
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3,6 5,6 21,6"></polyline>
      <path d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  `;
  
  btn.addEventListener('click', async () => {
  if (confirm('¿Eliminar este recordatorio?')) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
    try {
      await marcarRecordatorioHecho(id);
      let contacto = contactosData.find(c => c.ID === id);
      if (contacto) {
        contacto.FechaNotificacion = '';
        contacto.HoraNotificacion = '';
        contacto.FechaSeguimiento = '';
      }
	  
	      // NUEVO - Limpiar campos en el panel de detalles si está abierto
      const inputFecha = document.querySelector(`#fecha-${id}`);
      const inputHora = document.querySelector(`#hora-${id}`);
      const inputMotivo = document.querySelector(`#motivo-${id}`);
      const avisoDiv = document.querySelector(`#aviso-recordatorio-${id}`);
      
      if (inputFecha) inputFecha.value = '';
      if (inputHora) inputHora.value = '';
      if (inputMotivo) inputMotivo.value = '';
      
      // CAMBIADO - Actualizar aviso con string vacío
      if (avisoDiv) {
        actualizarAvisoRecordatorio(avisoDiv, '');
      }
	  
	  
mostrarContactos(contactosData);
actualizarBadgeRecordatorios(contactosData);
alert('Recordatorio eliminado correctamente.');
      } catch (e) {
        alert('Error al eliminar recordatorio: ' + e.message);
        btn.innerHTML = original;
        btn.disabled = false;
      }
    }
  });
  
  return btn;
}
// Listener para botón crear ficha - se agregará cuando el DOM esté listo
function inicializarBtnCrearFicha() {
  const btnCrearFicha = document.getElementById('btnCrearFicha');
  if (btnCrearFicha) {
    btnCrearFicha.addEventListener('click', () => {
      window.open('crearficha.html', '_blank');
    });
  }
}

// ⬇️ AÑADIR ESTO
function inicializarBtnDashboard() {
  const btnDashboard = document.getElementById('btnDashboard');
  if (btnDashboard) {
    btnDashboard.addEventListener('click', () => {
      window.open('dashboard.html', '_blank');
    });
  }
}

function crearBotonLlamado(id, estado) {
  const colorRojo = '#f28b82', bordeRojo = '#d9534f';
  const colorVerde = '#81c995', bordeVerde = '#4cae4c';
  
  const estadoNormalizado = normalizeString(estado);
  const esLlamado = estadoNormalizado === 'si' || estadoNormalizado === 'sí';
  
  const btn = crearBoton({
    fondo: esLlamado ? colorVerde : colorRojo,
    borde: esLlamado ? bordeVerde : bordeRojo,
    textoColor: '#fff',
    texto: esLlamado ? 'Sí' : 'No',
    // ... (dentro de crearBotonLlamado)
    onClick: function () {
      const botonPresionado = this;
      // Obtener estado REAL desde datos (no desde el DOM)
const contacto = contactosData.find(c => c.ID === id);
const estadoActual = normalizeString(contacto?.['Llamado'] || 'no');

// Toggle real
const nuevoEstado = estadoActual === 'si' ? 'No' : 'Sí';
const nuevoEstadoNormalized = normalizeString(nuevoEstado);
      
      // 1. Deshabilitar botón (actualización optimista visual simple)
      botonPresionado.disabled = true;
      botonPresionado.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;
      
      // 2. Backend
      (async () => {
        try {
          // 'marcarLlamado' (marcarCampo) AHORA DEVUELVE LA FILA (gracias a CAMBIO #1)
          const result = await marcarLlamado(id, nuevoEstadoNormalized);
          if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || 'El servidor no devolvió datos actualizados');
          }
          const filaData = result.data;

          // 3. Actualizar datos locales (AMBOS caches)
          const contactoLocal = contactosData.find(c => c.ID === id);
          if (contactoLocal) Object.assign(contactoLocal, filaData);
          const contactoOriginal = originalContactosData.find(c => c.ID === id);
          if (contactoOriginal) Object.assign(contactoOriginal, filaData);
          
          // 4. ¡LA SOLUCIÓN! Dejar que aplicarFiltro re-ordene y re-renderice
          aplicarFiltro({ resetPage: false });
          
        } catch (e) {
          // 5. Revertir si falla
          console.error('Error al marcar Llamado (revertido):', e.message);
          if (e.name !== 'TypeError') {
              alert('Error al marcar Llamado: ' + e.message);
          }
          // Restaurar botón (aplicarFiltro no se llamó, así que el DOM no se refrescó)
          botonPresionado.disabled = false;
          botonPresionado.innerHTML = textoActual;
        }
      })(); 
    }

  });
  
  return btn;
}

function crearBotonRespondido(id, estado) {
  const colorRojo = '#f28b82', bordeRojo = '#d9534f';
  const colorVerde = '#81c995', bordeVerde = '#4cae4c';
  const colorNaranja = '#f7b267', bordeNaranja = '#e08e0b';
  
  const estadoNormalizado = normalizeString(estado);
  
  let fondo, borde, textoBtn;
  if (estadoNormalizado === 'si' || estadoNormalizado === 'sí') {
    fondo = colorVerde;
    borde = bordeVerde;
    textoBtn = 'Sí';
  } else if (estadoNormalizado === 'no') {
    fondo = colorRojo;
    borde = bordeRojo;
    textoBtn = 'No';
  } else {
    fondo = colorNaranja;
    borde = bordeNaranja;
    textoBtn = 'Pendiente';
  }
  
  const btn = crearBoton({
    fondo: fondo,
    borde: borde,
    textoColor: '#fff',
    texto: textoBtn,
    onClick: function () {
      const td = this.closest('.td-respondido');
      if (!td) return;
      mostrarOpcionesRespondido(td, id);
    }
  });
  
  return btn;
}

function mostrarOpcionesRespondido(td, id) {
  td.innerHTML = '';
  const contenedor = document.createElement('div');
  contenedor.className = 'd-flex gap-1';
  
  const contactoLocalOriginal = contactosData.find(c => c.ID === id);
  const estadoOriginal = contactoLocalOriginal ? contactoLocalOriginal['Respondido'] : 'Pendiente';

  ['Sí', 'No'].forEach(valor => {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${valor === 'Sí' ? 'btn-success' : 'btn-danger'}`;
    btn.innerHTML = valor === 'Sí' ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-x-lg"></i>';
    btn.style.width = '32px';
    
    // ... (dentro de mostrarOpcionesRespondido, en el listener del botón Sí/No)
    btn.addEventListener('click', () => {
      const valorNorm = normalizeString(valor);

      // 1. Actualización Optimista (solo para cerrar el panel de opciones)
      td.innerHTML = '';
      const btnSpinner = crearBotonRespondido(id, valor);
      btnSpinner.disabled = true;
      btnSpinner.innerHTML = `<span class="spinner-border spinner-border-sm" role="status"></span>`;
      td.appendChild(btnSpinner);
      
      // 2. Backend
      (async () => {
        try {
          // 'marcarRespondido' AHORA DEVUELVE LA FILA
          const result = await marcarRespondido(id, valorNorm);
          if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || 'El servidor no devolvió datos actualizados');
          }
          const filaData = result.data;

          // 3. Actualizar datos locales (AMBOS caches)
          const contactoLocal = contactosData.find(c => c.ID === id);
          if (contactoLocal) Object.assign(contactoLocal, filaData);
          const contactoOriginal = originalContactosData.find(c => c.ID === id);
          if (contactoOriginal) Object.assign(contactoOriginal, filaData);
          
          // 4. ¡LA SOLUCIÓN!
          aplicarFiltro({ resetPage: false });

        } catch (e) {
          // 5. Revertir si falla
          console.error('Error al marcar Respondido (revertido):', e.message);
          if (e.name !== 'TypeError') {
             alert('Error al marcar Respondido: ' + e.message);
          }
          // Revertir el DOM (ya que aplicarFiltro no se ejecutó)
          td.innerHTML = '';
          td.appendChild(crearBotonRespondido(id, estadoOriginal));
        }
      })(); 
    });
// ...
    contenedor.appendChild(btn);
  });
  
  // Botón Cancelar
  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-sm btn-outline-secondary';
  btnCancel.innerHTML = '<i class="bi bi-arrow-return-left"></i>';
  btnCancel.style.width = '32px';
  btnCancel.title = 'Cancelar';
  btnCancel.addEventListener('click', () => {
    td.innerHTML = '';
    td.appendChild(crearBotonRespondido(id, estadoOriginal));
  });
  contenedor.appendChild(btnCancel);

  td.appendChild(contenedor);
}


function crearBotonPrioridad(id, prioridad) {
  const niveles = ['Baja', 'Media', 'Alta'];
  const prioridadNormal = normalizarPrioridad(prioridad);
  const selected = niveles.indexOf(prioridadNormal);
  
  const fragment = document.createDocumentFragment();
  const estrellas = [];
  
  function pintarHover(idx) {
    estrellas.forEach((estrella, i) => {
      if (i <= idx) {
        estrella.style.color = '#cc9a06';
        estrella.style.transform = 'scale(1.15)';
      } else {
        estrella.style.color = estrella.classList.contains('activa') ? '#ffc107' : '#ccc';
        estrella.style.transform = 'scale(1)';
      }
    });
  }
  
  function pintarNormal() {
    estrellas.forEach((estrella, i) => {
      estrella.style.color = estrella.classList.contains('activa') ? '#ffc107' : '#ccc';
      estrella.style.transform = 'scale(1)';
    });
  }
  
  for (let i = 0; i < 3; i++) {
    const estrella = document.createElement('span');
    estrella.innerHTML = selected >= 0 && i <= selected ? '★' : '☆';
    if (selected >= 0 && i <= selected) estrella.classList.add('activa');
    estrella.title = niveles[i];
    estrella.style.transition = 'all 0.3s ease';
    estrella.style.cursor = 'pointer';
    estrella.style.fontSize = '1.5em';
    estrella.style.color = (selected >= 0 && i <= selected) ? '#ffc107' : '#ccc';
    
    estrella.addEventListener('mouseenter', () => pintarHover(i));
    estrella.addEventListener('mouseleave', () => pintarNormal());
    // ... (dentro de crearBotonPrioridad)
    estrella.addEventListener('click', async () => {
      // ... (animación pulse)
      
      // Deshabilitar todas las estrellas
      estrellas.forEach(e => e.style.pointerEvents = 'none');
      estrella.innerHTML = '…'; // Indicador de carga
      
      try {
        // 'marcarCampo' AHORA DEVUELVE LA FILA
        const result = await marcarCampo("Prioridad", id, niveles[i]);
         if (result.status !== 'success' || !result.data) {
            throw new Error(result.message || 'El servidor no devolvió datos actualizados');
          }
        const filaData = result.data;

        // 3. Actualizar datos locales (AMBOS caches)
        const contactoLocal = contactosData.find(c => c.ID === id);
        if (contactoLocal) {
          Object.assign(contactoLocal, filaData);
          prepararContacto(contactoLocal);
        }
        const contactoOriginal = originalContactosData.find(c => c.ID === id);
        if (contactoOriginal) {
          Object.assign(contactoOriginal, filaData);
          prepararContacto(contactoOriginal);
        }
        
        // 4. ¡LA SOLUCIÓN!
        aplicarFiltro({ resetPage: false });
        
      } catch (e) {
        alert('Error al actualizar Prioridad: ' + e.message);
        // Re-habilitar estrellas si falla
        estrellas.forEach(e => e.style.pointerEvents = 'auto');
        pintarNormal(); // Restaurar estado visual original
      }
    });
// ...
    estrellas.push(estrella);
    fragment.appendChild(estrella);
  }
  
  return fragment;
}
function normalizarPrioridad(p) {
  if (!p || !p.trim()) return null;
  p = normalizeString(p);
  if (p === 'baja') return 'Baja';
  if (p === 'media') return 'Media';
  if (p === 'alta') return 'Alta';
  return null;
}


// Función auxiliar para obtener solo el primer nombre y capitalizarlo
function obtenerNombreCapitalizado(nombreCompleto) {
  if (!nombreCompleto) return '';
  const primerNombre = nombreCompleto.trim().split(/\s+/)[0];
  return capitalizarPrimerasLetras(primerNombre);
}
function generarMensajeHTML(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
  const saludo = obtenerSaludo();
  return `
    <p>${saludo} ${nombreCapitalizado},</p>
    <p>En primer lugar, agradecerles su interés en Proyectopia. A continuación, adjunto información detallada de las viviendas industrializadas, eco eficientes y de diseño exclusivo Proyectopia.</p>
    <p>Le resumo algunos aspectos relevantes de nuestro sistema constructivo:</p>
    <ul>
      <li>Diseño exclusivo (no hacemos dos viviendas iguales).</li>
      <li>Vivienda de consumo energético a cero (Pasivas).</li>
      <li>Condiciones de financiación mejoradas en distintas entidades.</li>
      <li>Plazo reducido (en 9 meses podría estar lista para entrar a vivir).</li>
      <li>Precio cerrado llave en mano. (A partir de 290.000€)</li>
    </ul>
    <p>Con respecto a la parcela, será de gran utilidad conocer más datos, como la referencia catastral, la ordenanza de aplicación y el informe urbanístico, especialmente los siguientes parámetros urbanísticos:</p>
    <ul>
      <li>Edificabilidad.</li>
      <li>Ocupación.</li>
      <li>Retranqueos.</li>
      <li>Altura máxima.</li>
      <li>Condiciones estéticas: tipo de cubiertas, materiales,...</li>
      <li>Si toda la superficie de la parcela computa para la edificabilidad.</li>
    </ul>
    <p>Ya por último, le facilito un enlace a nuestra <a href="https://www.proyectopia.com">nueva página web</a> y a nuestra <a href="https://www.instagram.com/proyectopia">cuenta de Instagram</a>, donde podrá encontrar mucha más información e imágenes.</p>
    <p>El siguiente paso es concretar una cita para comentar la propuesta económica, junto con el estudio de viabilidad de su futura vivienda adaptada a las características de su estilo de vida, gustos y necesidades; así como ver más ejemplos de casas proyectopia, tipos de acabados, etc. Le informo que podemos encajar una cita si ya disponemos de toda la información y encaja en el presupuesto.</p>
    <p>Nos enorgullece informarle que somos la primera empresa en Galicia en certificar tres viviendas Passivhaus en Pontevedra. Adjunto se encontrarán los recientes reportajes de <a href="https://www.lavozdegalicia.es/amp/noticia/vigo/2024/01/23/viviendas-turisticas-sostenibles-abren-paso-playa-nerga/0003_202401V23C5991.htm">La Voz de Galicia</a> y <a href="https://www.diariodepontevedra.es/articulo/pontevedra/casas-pasivas-sello-local/202401160145451287729.html">el Diario de Pontevedra</a> en los que destacan nuestro compromiso con la excelencia, eficiencia, calidad e innovación en construcción.</p>
    <p><strong>VIDEOS PROYECTOPIA:</strong> <a href="https://www.youtube.com/@proyectopia">Ver videos aquí</a>.</p>
    <p>Además, si ha tenido una experiencia positiva con nosotros y le ha gustado como le hemos informado, le invitamos a compartir su opinión otorgándonos cinco estrellas en <a href="https://search.google.com/local/writereview?placeid=ChIJD1XCddpxLw0R2OYPhl7XJ7M">Google</a>.</p>
    <p>Quedamos a la espera de su confirmación. Si necesita algo más no duden en ponerse en contacto conmigo.</p>
    <p>Un cordial saludo<br>Atentamente,</p>
  `;
}
// Función que genera el mensaje con solo el primer nombre capitalizado
function generarMensaje(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', { 
    timeZone: 'Europe/Madrid', 
    hour: '2-digit', 
    hour12: false 
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
  const saludo = obtenerSaludo();
  return `${saludo} ${nombreCapitalizado},
En primer lugar, agradecerles su interés en Proyectopia. A continuación, adjunto información detallada de las viviendas industrializadas, eco eficientes y de diseño exclusivo Proyectopia.

Le resumo algunos aspectos relevantes de nuestro sistema constructivo:

• Diseño exclusivo (no hacemos dos viviendas iguales).
• Vivienda de consumo energético a cero (Pasivas).
• Condiciones de financiación mejoradas en distintas entidades.
• Plazo reducido (en 9 meses podría estar lista para entrar a vivir).
• Precio cerrado llave en mano. (A partir de 290.000€)
Con respecto a la parcela, será de gran utilidad conocer más datos, como la referencia catastral, la ordenanza de aplicación y el informe urbanístico, especialmente los siguientes parámetros urbanísticos:
• Edificabilidad.
• Ocupación.
• Retranqueos.
• Altura máxima.
• Condiciones estéticas: tipo de cubiertas, materiales,...
• Si toda la superficie de la parcela computa para la edificabilidad.

Ya por último, le facilito un enlace a nuestra nueva página web y a nuestra cuenta de Instagram, donde podrá encontrar mucha más información e imágenes.   

El siguiente paso es concretar una cita para comentar la propuesta económica, junto con el estudio de viabilidad de su futura vivienda adaptada a las características de su estilo de vida, gustos y necesidades; así como ver más ejemplos de casas proyectopia, tipos de acabados, etc. Le informo que podemos encajar una cita si ya disponemos de toda la información y encaja en el presupuesto.

Nos enorgullece informarle que somos la primera empresa en Galicia en certificar tres viviendas Passivhaus en Pontevedra. Adjunto se encontrarán los recientes reportajes de La Voz de Galicia y el Diario de Pontevedra en los que destacan nuestro compromiso con la excelencia, eficiencia, calidad e innovación en construcción. 

VIDEOS PROYECTOPIA.

Además, si ha tenido una experiencia positiva con nosotros y le ha gustado como le hemos informado, le invitamos a compartir su opinión otorgándonos cinco estrellas en Google.

Quedamos a la espera de su confirmación. Si necesita algo más no duden en ponerse en contacto conmigo.        
               
Un cordial saludo
Atentamente,`;
}
// Nueva función que genera el mensaje HTML para Villas Isla de Cortegada
function generarMensajeHTMLVillas(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
  const saludo = obtenerSaludo();
  return `
    <p><strong>${saludo} ${nombreCapitalizado},</strong></p>
    <p>Le agradecemos su interés en la nueva promoción <strong><a href="https://www.proyectopia.com/villas-isla-cortegada/">Villas Isla de Cortegada</a></strong>, un exclusivo conjunto de viviendas de diseño en un enclave privilegiado, con inmejorables vistas al mar:</p>
    <p><strong><a href="https://www.google.es/maps/place/42%C2%B037'22.9%22N+8%C2%B046'06.5%22W/@42.6229319,-8.7697943,303m/data=!3m1!1e3!4m4!3m3!8m2!3d42.62303!4d-8.768458?entry=ttu&g_ep=EgoyMDI1MDgyNS4wIKXMDSoASAFQAw%3D%3D">Ver ubicación en Google Maps</a></strong></p>
    <p>Se trata de viviendas industrializadas de alto nivel, situadas en primera línea, con parcelas que garantizan privacidad y vistas despejadas, ya que no se puede edificar delante.</p>
    <p>Actualmente solo quedan disponibles:</p>
    <ul>
      <li><strong>1 vivienda adosada de esquina</strong> <em>(solo adosada por un lateral)</em></li>
      <li><strong>2 viviendas aisladas</strong></li>
    </ul>
    <p><strong>Características destacadas:</strong></p>
    <ul>
      <li><strong>Diseño arquitectónico exclusivo y personalizable</strong></li>
      <li><strong>Viviendas pasivas certificadas bajo el estándar Passivhaus</strong></li>
      <li><strong>Calidades premium:</strong>
        <ul>
          <li>Cocinas Santos</li>
          <li>Sanitarios Roca</li>
          <li>Acabados de alta gama cuidadosamente seleccionados</li>
        </ul>
      </li>
      <li><strong>Sistema de construcción industrializada con precisión y rapidez</strong></li>
      <li><strong>Precio cerrado llave en mano, incluyendo:</strong>
        <ul>
          <li>Parcela</li>
          <li>Licencia de obra</li>
        </ul>
      </li>
      <li><strong>Condiciones especiales de financiación</strong> a través de distintas entidades</li>
    </ul>
    <p><strong>Adjunto encontrará:</strong></p>
    <ul>
      <li>Memoria de calidades</li>
      <li>Dossier informativo de la vivienda de su interés</li>
      <li>Planos de arquitectura</li>
    </ul>
    <p>Esta promoción está desarrollada por <strong>Proyectopía</strong>, empresa gallega con más de 100 viviendas construidas en toda Galicia, pionera en soluciones sostenibles e industrializadas de alta calidad.</p>
    <p>Le invitamos a visitar <strong><a href="https://www.proyectopia.com">nuestra web</a></strong> y perfil de <strong><a href="https://www.instagram.com/proyectopia">Instagram</a></strong>, donde podrá descubrir más sobre nuestro trabajo y otros proyectos realizados.</p>
    <p>Si desea ampliar información o concertar una cita, estaremos encantados de atenderle personalmente.</p>
    <p><strong>Un cordial saludo,</strong></p>
  `;
}
// Función que genera el mensaje de texto plano para Villas Isla de Cortegada
function generarMensajeVillas(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', { 
    timeZone: 'Europe/Madrid', 
    hour: '2-digit', 
    hour12: false 
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
  const saludo = obtenerSaludo();
  return `${saludo} ${nombreCapitalizado},
Le agradecemos su interés en la nueva promoción Villas Isla de Cortegada, un exclusivo conjunto de viviendas de diseño en un enclave privilegiado, con inmejorables vistas al mar:

Ver ubicación en Google Maps

Se trata de viviendas industrializadas de alto nivel, situadas en primera línea, con parcelas que garantizan privacidad y vistas despejadas, ya que no se puede edificar delante.

Actualmente solo quedan disponibles:

• 1 vivienda adosada de esquina (solo adosada por un lateral)
• 2 viviendas aisladas

Características destacadas:

• Diseño arquitectónico exclusivo y personalizable
• Viviendas pasivas certificadas bajo el estándar Passivhaus
• Calidades premium: 
  — Cocinas Santos
  — Sanitarios Roca 
  — Acabados de alta gama cuidadosamente seleccionados
• Sistema de construcción industrializada con precisión y rapidez
• Precio cerrado llave en mano, incluyendo:
  — Parcela 
  — Licencia de obra
• Condiciones especiales de financiación a través de distintas entidades

Adjunto encontrará:
• Memoria de calidades
• Dossier informativo de la vivienda de su interés
• Planos de arquitectura

Esta promoción está desarrollada por Proyectopía, empresa gallega con más de 100 viviendas construidas en toda Galicia, pionera en soluciones sostenibles e industrializadas de alta calidad.

Le invitamos a visitar nuestra web y perfil de Instagram, donde podrá descubrir más sobre nuestro trabajo y otros proyectos realizados.

Si desea ampliar información o concertar una cita, estaremos encantados de atenderle personalmente.

Un cordial saludo,`;
}


// NUEVO: Mensaje HTML para Villas (Correo 2)
function generarMensajeHTMLVillasCorreo2(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    hour12: false
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
  const saludo = obtenerSaludo();

 return `
    <p>${saludo} ${nombreCapitalizado},</p>
    <p>Ha sido un placer hablar con usted y poder resolver algunas de sus dudas acerca de la promoción <strong>Villas Isla de Cortegada</strong>. Le agradecemos de nuevo tanto su interés como el tiempo que nos dedicó en la llamada.</p>
    <p>Tal y como comentamos, y como habrá podido ver en el dossier que le enviamos previamente, se trata de <strong>un proyecto singular en un enclave privilegiado</strong>, donde cada vivienda combina diseño exclusivo, sostenibilidad certificada y unas vistas al mar que permanecerán siempre despejadas.</p>
    <p>Por la singularidad del proyecto y la demanda que estamos recibiendo, <strong>le animamos a actuar pronto</strong> para no dejar pasar la oportunidad de disfrutar de su nueva vivienda junto al mar.</p>
    <p>Nos encantaría acompañarle en el siguiente paso, ya sea realizando una <strong>reserva formal</strong> —lo que le otorgaría prioridad para asegurar la vivienda que elija— o concertando una <strong>reunión presencial</strong> para conocer el proyecto más de cerca.</p>
    <p>Quedo a su disposición para coordinar lo que le resulte más cómodo.</p>
    <p>Un cordial saludo,</p>
  `;
}

// NUEVO: Mensaje texto plano para Villas (Correo 2)
function generarMensajeVillasCorreo2(nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto);
  const ahora = new Date();
  const horaEspaña = new Intl.DateTimeFormat('es-ES', { 
    timeZone: 'Europe/Madrid', 
    hour: '2-digit', 
    hour12: false 
  }).format(ahora);
  const hora = parseInt(horaEspaña, 10);
 const saludo = obtenerSaludo();

  return `${saludo} ${nombreCapitalizado},


Ha sido un placer hablar con usted y poder resolver algunas de sus dudas acerca de la promoción Villas Isla de Cortegada. Le agradecemos de nuevo tanto su interés como el tiempo que nos dedicó en la llamada.


Tal y como comentamos, y como habrá podido ver en el dossier que le enviamos previamente, se trata de un proyecto singular en un enclave privilegiado, donde cada vivienda combina diseño exclusivo, sostenibilidad certificada y unas vistas al mar que permanecerán siempre despejadas.


Por la singularidad del proyecto y la demanda que estamos recibiendo, le animamos a actuar pronto para no dejar pasar la oportunidad de disfrutar de su nueva vivienda junto al mar.


Nos encantaría acompañarle en el siguiente paso, ya sea realizando una reserva formal —lo que le otorgaría prioridad para asegurar la vivienda que elija— o concertando una reunión presencial para conocer el proyecto más de cerca.


Quedo a su disposición para coordinar lo que le resulte más cómodo.


Un cordial saludo,`;
}

function construirPayloadTemplateEmail(contacto, nombreCompleto) {
  const nombreCapitalizado = obtenerNombreCapitalizado(nombreCompleto || contacto?.['your-name'] || '');
  return {
    ...contacto,
    nombre: nombreCapitalizado,
    'your-name': nombreCapitalizado
  };
}

function obtenerTemplateEmailPorContacto(contacto, nombreCompleto) {
  const categoriaId = getContactoCategoriaId(contacto);
  const payload = construirPayloadTemplateEmail(contacto, nombreCompleto);
  const template = getEmailTemplateByCategoria(categoriaId, payload);
  const asunto = String(template?.asunto || '').trim();
  const cuerpo = String(template?.cuerpo || '').trim();
  return { asunto, cuerpo };
}

// CAMBIADO - Función para crear el enlace mailto con asunto/cuerpo dinámicos por categoría
function crearEnlaceEmail(email, contacto, nombreCompleto) {
  const template = obtenerTemplateEmailPorContacto(contacto, nombreCompleto);
  const asunto = template.asunto || 'Seguimiento de tu solicitud';
  const cuerpo = htmlToMailtoBody(template.cuerpo || '');

  // Correos que van en CCO (copia oculta)
  const correosCCO = 'tecnico@proyectopia.es;victorhermo@proyectopia.es';
  
  // Solo el contacto principal va en el campo "Para"
  const destinatarioPrincipal = email || '';
  
  return `mailto:${destinatarioPrincipal}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}&bcc=${encodeURIComponent(correosCCO)}`;
}

function crearEnlaceEmailSaludo(email, contacto, nombreCompleto) {
  const template = obtenerTemplateEmailPorContacto(contacto, nombreCompleto);
  const asunto = template.asunto || 'Seguimiento de tu solicitud';
  const saludo = getEmailPrefix((nombreCompleto || contacto?.['your-name'] || '').trim());
  const cuerpo = htmlToMailtoBody(saludo);
  const correosCCO = 'tecnico@proyectopia.es;victorhermo@proyectopia.es';
  const destinatarioPrincipal = email || '';
  return `mailto:${destinatarioPrincipal}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}&bcc=${encodeURIComponent(correosCCO)}`;
}

function htmlToMailtoBody(html = '') {
  const container = document.createElement('div');
  container.innerHTML = String(html || '');

  container.querySelectorAll('a[href]').forEach((anchor) => {
    const text = (anchor.textContent || '').trim();
    const href = (anchor.getAttribute('href') || '').trim();
    anchor.textContent = href ? `${text || href} (${href})` : text;
  });

  container.querySelectorAll('b,strong').forEach((el) => {
    el.textContent = `**${el.textContent || ''}**`;
  });
  container.querySelectorAll('i,em').forEach((el) => {
    el.textContent = `*${el.textContent || ''}*`;
  });
  container.querySelectorAll('u').forEach((el) => {
    el.textContent = `_${el.textContent || ''}_`;
  });

  const withBreaks = container.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n');

  const textContainer = document.createElement('div');
  textContainer.innerHTML = withBreaks;
  return (textContainer.textContent || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function capitalizarPrimerasLetras(texto) {
  if (!texto) return '';
  return texto.split(/(\s+)/).map(token => {
    if (token.trim() === '') return token;
    return token.charAt(0).toUpperCase() + token.slice(1);
  }).join('');
}
// Función modularizada para crear la fila principal de un contacto
function crearFilaPrincipal(c, idx, esEliminado, llamado, respondido, idPersona, nombre, telefono, htmlUbicacion, inversion, tipoVivienda) {
  const punto = obtenerPuntoRecordatorio(c);
  const fechaContacto = c['Fecha'] ? formatearSoloFecha(c['Fecha']) : '';
  
  const tr = document.createElement('tr');
  tr.dataset.id = idPersona;
  if (esEliminado) {
    tr.classList.add('eliminado');
    tr.style.opacity = '0.6';
    tr.style.textDecoration = 'line-through';
    tr.style.color = '#6c757d';
    tr.style.backgroundColor = '#f8f9fa';
  }  
  
  tr.innerHTML = `
  <td style="text-align:left;">${punto}${nombre}${esEliminado ? ' <span class="badge bg-danger">ELIMINADO</span>' : ''}</td>
  <td style="text-align:center;">${fechaContacto}</td>
  <td>${tipoVivienda}</td>
  <td>${telefono}</td>
  <td>${htmlUbicacion}</td>
  <td>${inversion}</td>
  <td class="td-llamado"></td>
  <td class="td-respondido"></td>
   <td class="td-notas">
    <div class="d-flex gap-1 align-items-stretch">
      <textarea class="form-control notas-textarea" rows="3" placeholder="Escribe notas aquí..." ${esEliminado ? 'disabled' : ''}>${c['Notas'] || ''}</textarea>
      <button class="btn btn-sm btn-primary btn-guardar-notas" ${esEliminado ? 'disabled' : ''}><i class="bi bi-save"></i></button>
    </div>
  </td>
  <td class="td-seguimiento"></td>
  <td class="td-prioridad"></td>
  <td>
    <button class="btn btn-detalles-custom" data-toggle="detalle" data-idx="${idx}" aria-expanded="false" aria-label="Toggle detalles">
      <span style="font-size:1.1em;">▼</span> Detalles
    </button>
  </td>
  <td>
     <div class="d-flex gap-1">
    <button class="btn btn-primary btn-ficha-custom" onclick="window.location.href='ficha.html?id=${idPersona}'" ${esEliminado ? 'disabled' : ''} aria-label="Ver ficha">
      Ficha
    </button>
    ${esEliminado ?
      `<button class="btn btn-success btn-sm btn-restaurar" data-id="${idPersona}" title="Restaurar contacto" aria-label="Restaurar contacto">
        <i class="bi bi-arrow-counterclockwise"></i>
      </button>
      <button class="btn btn-danger btn-sm btn-eliminar-definitivo" data-id="${idPersona}" title="Eliminar definitivamente" aria-label="Eliminar definitivamente">
        <i class="bi bi-trash-fill"></i>
      </button>` :
      `<button class="btn btn-danger btn-eliminar-custom btn-eliminar" data-id="${idPersona}" title="Eliminar contacto" aria-label="Eliminar contacto">
        <i class="bi bi-trash"></i>
      </button>`
    }
  </div>
  </td>
`;
  return tr;
}
// Función modularizada para crear la fila de detalle
function crearFilaDetalle(c, idPersona, tipoVivienda, nombre) {
  const templateEmail = obtenerTemplateEmailPorContacto(c, nombre);
  const mensajeHtml = templateEmail.cuerpo || '<p>Sin plantilla de email configurada para esta categoría.</p>';
  const trDetalle = document.createElement('tr');
  trDetalle.className = 'fila-detalle';
  trDetalle.style.display = 'none';
  trDetalle.innerHTML = `
  <td colspan="13" style="padding: 0; background:#f9f6ff;">
    <div class="detalle-contenedor" style="display: flex; gap: 1rem; flex-wrap: wrap; padding: 0.75rem 1rem;">
      <div class="detalle-info"
        style="min-width: 300px; flex: 1 1 300px; background: #e0dfff; border-radius: 8px; padding: 1rem;
                 box-shadow: 0 2px 6px rgba(108,92,231,0.2); font-size: 0.95rem; line-height: 1.4;
                 box-sizing: border-box; color: #000; text-align: left;">
      </div>
      <div class="detalle-mensaje" data-nombre-completo="${c['your-name']?.replace(/"/g, '&quot;') || ''}"
        style="min-width: 300px; flex: 1 1 300px; background:#f3f4f6; border-radius:8px; padding:1rem;
                 box-shadow: 0 2px 6px rgba(108,92,231,0.1); font-size:.98rem; line-height:1.3;
                 display: flex; flex-direction: column; color: #000; text-align: left; box-sizing: border-box;">
        <div style="font-weight:600; font-size:1.03rem; margin-bottom:0.3rem; border-bottom:1px solid #cbd5e1; padding-bottom:0.18rem;">
          Mensaje con formato
        </div>
       <div class="selector-correo-container" style="display: ${esCategoriaVillasPorLabel(tipoVivienda, c) ? 'flex' : 'none'}; align-items:center; gap:8px; margin-bottom: 0.3rem;">
          <label for="selector-correo-${idPersona}" style="font-weight:600; font-size:0.9rem;">Correo:</label>
          <select class="selector-correo" id="selector-correo-${idPersona}" style="border:1px solid #d1d5db; border-radius:6px; padding:4px 8px; font-size:0.9rem;">
            <option value="1">Correo 1</option>
            <option value="2">Correo 2</option>
          </select>
        </div>
        <div style="display: flex; justify-content: flex-end; margin-bottom: 0.3rem;">
          <button class="btn-copiar-mensaje"
            type="button"
            title="Copiar texto"
            style="background: none; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding:5px; min-width:28px; min-height:28px;" aria-label="Copiar mensaje">
          </button>
        </div>
        <div class="texto-mensaje-html"
          style="width: 100%; height: 170px; overflow: auto; border-radius: 8px; border: 1px solid #d1d5db; padding: 0.6rem; font-size: 0.95rem; background: #fff;">${mensajeHtml}</div>
        <div class="mensaje-copiado" aria-live="polite" role="alert"
          style="color: #16a34a; font-size: 0.97rem; font-weight: 600; margin-top: 0.4rem; opacity: 0; transition: opacity 0.3s ease; user-select: none; height: 1.2em;">
          ¡Texto copiado!
        </div>
      </div>
      <div class="detalle-recordatorio" style="min-width: 300px; flex: 1 1 300px; background:#f3f4f6; border-radius:8px; padding:1rem;
               box-shadow: 0 2px 6px rgba(108,92,231,0.1); font-size:.98rem; line-height:1.3; color: #000; text-align: left; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight:600; font-size:1.03rem; margin-bottom:0.7rem; border-bottom:1px solid #cbd5e1; padding-bottom:0.3rem;">
          <span>Programar Recordatorio</span>
          <div class="btn-eliminar-recordatorio-container"></div>
        </div>
        <div class="input-group input-group-sm" style="max-width:260px; margin-bottom: 0.5rem;">
          <span class="input-group-text" title="Fecha"><i class="bi bi-calendar-event"></i></span>
          <input type="date" id="fecha-${idPersona}" name="fecha-${idPersona}" class="form-control" aria-label="Fecha de recordatorio">
        </div>
        <div class="input-group input-group-sm" style="max-width:220px; margin-bottom: 0.5rem;">
          <span class="input-group-text" title="Hora"><i class="bi bi-alarm"></i></span>
         <input type="time" id="hora-${idPersona}" name="hora-${idPersona}" class="form-control" value="${getHoraInputValue(c['HoraNotificacion'])}" aria-label="Hora de recordatorio">
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem;">
          <label for="motivo-${idPersona}" style="font-weight:500;">Motivo/recordatorio:</label>
          <input type="text" id="motivo-${idPersona}" placeholder="Ej.: recordar enviar presupuesto" value="${c['MotivoSeguimiento'] || ''}" class="form-control form-control-sm" aria-label="Motivo del recordatorio" />
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem;">
          <label for="email-aviso-${idPersona}" style="font-weight:500;">Email de aviso:</label>
          <select id="email-aviso-${idPersona}" class="form-select form-select-sm" aria-label="Cuándo enviar email recordatorio">
            <option value="">No enviar</option>
            <option value="exact">A la hora exacta</option>
            <option value="1h">1 hora antes</option>
            <option value="1d">1 día antes</option>
          </select>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-primary btn-programar-recordatorio" data-id="${idPersona}" aria-label="Programar recordatorio">Programar</button>
          <button class="btn btn-sm btn-outline-success btn-marcar-hecho" data-id="${idPersona}" aria-label="Marcar como hecho">Marcar hecho</button>
        </div>
        <div id="aviso-recordatorio-${idPersona}" style="margin-top: 0.5rem; font-weight: 500;"></div>
      </div>
    </div>
  </td>
`;
  // 🛠 CHANGED - En la sección donde se crea el HTML del recordatorio, modificar para incluir el botón eliminar
  const fechaSeguimiento = c['FechaNotificacion'] || c['FechaSeguimiento'];
  if (fechaSeguimiento) {
    const containerEliminar = trDetalle.querySelector('.btn-eliminar-recordatorio-container');
    if (containerEliminar) {
      containerEliminar.appendChild(crearBotonEliminarRecordatorio(idPersona));
    }
  }
  return trDetalle;
}
// Función modularizada para agregar contenido a la fila de detalle
function agregarContenidoDetalle(trDetalle, c, tipoVivienda, nombre, idPersona) {
  const detalleInfoDiv = trDetalle.querySelector('.detalle-info');
  const categoriaDetalle = CategoriaSystem.resolveCategoria(appConfig || getDefaultAppConfig(), c);
  const camposDetalleConfigurados = getDetalleConfiguradoFields(categoriaDetalle, c);

  // Determinar tipo de correo inicial (para Villas, basado en localStorage)
  let correoTipoInicial = '1';
  try {
   if (esCategoriaVillasPorLabel(tipoVivienda, c) && localStorage.getItem(`correo1Enviado_${idPersona}`) === 'true') {
      correoTipoInicial = '2';
    }
  } catch (e) { /* ignore */ }
  const emailLink = crearEnlaceEmail(c['your-email'] || '', c, nombre);
  const emailLinkSaludo = crearEnlaceEmailSaludo(c['your-email'] || '', c, nombre);

if (esCategoriaVillasPorLabel(tipoVivienda, c)) {
    const defaultFieldsVillas = ['vivienda-interesada', 'origen-contacto', 'Notas'];
    const camposDetalle = camposDetalleConfigurados.length > 0 ? camposDetalleConfigurados : defaultFieldsVillas;
    detalleInfoDiv.innerHTML = `
      <div style="font-weight:600; font-size:1.05rem; margin-bottom:0.7rem; border-bottom:1px solid #cbd5e1; padding-bottom:0.3rem;">
        Detalles - Villas Isla de Cortegada
      </div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div class="detalle-email" style="word-break: break-all; max-width: calc(100% - 130px);">${c['your-email'] || ''}</div>
        <div style="display:flex; flex-direction:column; gap:0.45rem;">
          <a class="btn-enviar-email btn btn-sm btn-primary" href="${emailLink}" aria-label="Enviar email completo">
            Enviar email
          </a>
          <a class="btn-enviar-email-saludo btn btn-sm btn-outline-primary" href="${emailLinkSaludo}" aria-label="Abrir borrador solo saludo">
            <span style="display:block;">Abrir borrador</span>
            <small style="display:block; color:#6b7280; font-weight:500;">(Solo saludo)</small>
          </a>
        </div>
      </div>
      ${buildDetalleRowsHTML(c, camposDetalle)}
    `;
  } else {
    const defaultFieldsNormal = ['Notas', 'number-419', 'origen-contacto', 'referencia-catastral', 'estudio-viabilidad'];
    const camposDetalle = camposDetalleConfigurados.length > 0 ? camposDetalleConfigurados : defaultFieldsNormal;
    detalleInfoDiv.innerHTML = `
      <div style="font-weight:600; font-size:1.05rem; margin-bottom:0.7rem; border-bottom:1px solid #cbd5e1; padding-bottom:0.3rem;">
        Detalles del contacto
      </div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
        <div class="detalle-email" style="word-break: break-all;">${c['your-email'] || ''}</div>
        <div style="display:flex; flex-direction:column; gap:0.45rem;">
          <a class="btn-enviar-email" href="${crearEnlaceEmail(c['your-email'] || '', c, nombre)}" style="background-color: #2563eb; color: white; padding: 6px 14px; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 0.92rem; transition: background-color 0.3s ease;" aria-label="Enviar email completo">
            Enviar email
          </a>
          <a class="btn-enviar-email-saludo" href="${crearEnlaceEmailSaludo(c['your-email'] || '', c, nombre)}" style="border: 1px solid #2563eb; color: #1d4ed8; padding: 6px 14px; border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 0.92rem; background:#eff6ff;" aria-label="Abrir borrador solo saludo">
            <span style="display:block;">Abrir borrador</span>
            <small style="display:block; color:#6b7280; font-weight:500;">(Solo saludo)</small>
          </a>
        </div>
      </div>
      ${buildDetalleRowsHTML(c, camposDetalle)}
    `;
  }
}
// Función modularizada para agregar listeners a la fila de detalle (incluyendo copiar mensaje y recordatorios)
function agregarListenersDetalle(trDetalle, idPersona, c, tipoVivienda) {
 // CAMBIADO - Mostrar fecha/hora actual solo si existe y es válida
const inputFecha = trDetalle.querySelector(`#fecha-${idPersona}`);
const inputHora = trDetalle.querySelector(`#hora-${idPersona}`);
const inputMotivo = trDetalle.querySelector(`#motivo-${idPersona}`);
const selectEmailAviso = trDetalle.querySelector(`#email-aviso-${idPersona}`);
const avisoDiv = trDetalle.querySelector(`#aviso-recordatorio-${idPersona}`);

  const btnProgramar = trDetalle.querySelector('.btn-programar-recordatorio');
  const btnHecho = trDetalle.querySelector('.btn-marcar-hecho');
const selectorCorreo = trDetalle.querySelector(`#selector-correo-${idPersona}`);
  const mensajeHtmlBox = trDetalle.querySelector('.texto-mensaje-html');
  const btnEnviarEmail = trDetalle.querySelector('.btn-enviar-email');
  const btnEnviarEmailSaludo = trDetalle.querySelector('.btn-enviar-email-saludo');

// Obtener fecha de recordatorio del contacto usando la función existente
const fechaRecordatorio = obtenerFechaAvisoDate(c);
if (!isNaN(fechaRecordatorio) && fechaRecordatorio.getFullYear() > 1970) {
  // Hay recordatorio válido - llenar campos y mostrar aviso
  const yyyy = fechaRecordatorio.getFullYear();
  const mm = String(fechaRecordatorio.getMonth() + 1).padStart(2, '0');
  const dd = String(fechaRecordatorio.getDate()).padStart(2, '0');
  const hh = String(fechaRecordatorio.getHours()).padStart(2, '0');
  const mi = String(fechaRecordatorio.getMinutes()).padStart(2, '0');
  
  if (inputFecha) inputFecha.value = `${yyyy}-${mm}-${dd}`;
  if (inputHora) inputHora.value = `${hh}:${mi}`;
  
  // Pasar la fecha completa a actualizarAvisoRecordatorio
  actualizarAvisoRecordatorio(avisoDiv, `${yyyy}-${mm}-${dd} ${hh}:${mi}`);
} else {
  // No hay recordatorio - limpiar todo
  if (inputFecha) inputFecha.value = '';
  if (inputHora) inputHora.value = '';
  actualizarAvisoRecordatorio(avisoDiv, '');
}

  // NUEVO: Inicializar selector de correo (solo para Villas)
if (esCategoriaVillasPorLabel(tipoVivienda, c) && selectorCorreo) {
    try {
      const enviado = localStorage.getItem(`correo1Enviado_${idPersona}`) === 'true';
      selectorCorreo.value = enviado ? '2' : '1';
    } catch (e) { /* ignore */ }

    const nombreCompleto = trDetalle.querySelector('.detalle-mensaje')?.dataset?.nombreCompleto || '';
    const actualizarMensajeYAsunto = (tipo) => {
      const { cuerpo } = obtenerTemplateEmailPorContacto(c, nombreCompleto);
      const texto = cuerpo || '<p>Sin plantilla de email configurada para esta categoría.</p>';
      if (mensajeHtmlBox) mensajeHtmlBox.innerHTML = texto;
      if (btnEnviarEmail) btnEnviarEmail.href = crearEnlaceEmail(c['your-email'] || '', c, nombreCompleto);
      if (btnEnviarEmailSaludo) btnEnviarEmailSaludo.href = crearEnlaceEmailSaludo(c['your-email'] || '', c, nombreCompleto);
    };
    actualizarMensajeYAsunto(selectorCorreo.value);
    selectorCorreo.addEventListener('change', (e) => actualizarMensajeYAsunto(e.target.value));

    // NUEVO: Registrar envío del primer correo al pulsar el botón de email
    if (btnEnviarEmail) {
      btnEnviarEmail.addEventListener('click', () => {
        if (selectorCorreo.value === '1') {
          try { localStorage.setItem(`correo1Enviado_${idPersona}`, 'true'); } catch (e) {}
        }
      });
    }
  }


// 🛠 CHANGED - En el listener del botón programar, actualizar para mostrar botón eliminar
// ( ... código anterior de agregarListenersDetalle ... )

  // 🛠 CHANGED - En el listener del botón programar, actualizar para mostrar botón eliminar
  btnProgramar.addEventListener('click', async () => {
    const fechaStr = inputFecha?.value;
    if (!fechaStr) {
      alert('Selecciona una fecha válida.');
      return;
    }
    const motivo = inputMotivo?.value?.trim() || '';
    const horaStr = inputHora?.value;
    const horaFinal = horaStr && /^\d{2}:\d{2}$/.test(horaStr) ? horaStr : '09:00';

    const originalHTML = btnProgramar.innerHTML;
    btnProgramar.disabled = true;
    btnProgramar.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';

    if (avisoDiv) {
      avisoDiv.style.color = '#334155';
      avisoDiv.textContent = 'Guardando recordatorio…';
    }

    try {
      // 1. Crear un objeto con todas las actualizaciones
      const updates = {
        FechaNotificacion: fechaStr,
        HoraNotificacion: horaFinal,
        FechaSeguimiento: `${fechaStr}T${horaFinal}:00`, // Usar formato ISO para FechaSeguimiento
        MotivoSeguimiento: motivo
      };
      
      // 2. Ejecutar UNA sola actualización
      const result = await actualizarFila(idPersona, updates);
      if (result.status !== 'success' || !result.data) {
        throw new Error(result.message || 'Error al programar con actualizarFila');
      }

      // 3. Sincronizar datos locales
      const contactoLocal = contactosData.find(c => c.ID === idPersona);
      if (contactoLocal) Object.assign(contactoLocal, result.data);
      const contactoOriginal = originalContactosData.find(c => c.ID === idPersona);
      if (contactoOriginal) Object.assign(contactoOriginal, result.data);

      // 4. Refrescar la tabla y el badge
      aplicarFiltro(); // Refresca la tabla principal y mantiene el orden
      actualizarBadgeRecordatorios(contactosData); // Actualiza el contador

      // 5. Actualizar el panel de detalles (sigue siendo útil)
      actualizarAvisoRecordatorio(avisoDiv, `${fechaStr} ${horaFinal}`);

      // 6. Disparar envío/programación de email de aviso (si se seleccionó opción)
      const emailWhen = selectEmailAviso?.value || '';
      if (emailWhen) {
        const emailResult = await enviarRecordatorioEmail(idPersona, emailWhen);
        if (emailResult.status !== 'success') {
          throw new Error(emailResult.message || 'No se pudo enviar/programar el email recordatorio');
        }
      }

    } catch (e) {
      alert('Error al programar recordatorio: ' + e.message);
      // Revertir aviso si falla
      actualizarAvisoRecordatorio(avisoDiv, (contactosData.find(c => c.ID === idPersona)?.FechaNotificacion || ''));
    } finally {
      btnProgramar.disabled = false;
      btnProgramar.innerHTML = originalHTML;
    }
  });

  // 🛠 CHANGED - En el listener del botón marcar hecho, recargar datos completos
  // MODIFIED - Listener para btnHecho (añadido limpieza de inputs, actualización local, evitar fecha inválida)
 if (btnHecho) {
  btnHecho.addEventListener('click', async () => {
    const original = btnHecho.innerHTML;
    btnHecho.disabled = true;
    btnHecho.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
    try {
      await marcarRecordatorioHecho(idPersona);
        
        // CAMBIADO - Limpiar inputs completamente
      if (inputFecha) inputFecha.value = '';
      if (inputHora) inputHora.value = '';
      if (inputMotivo) inputMotivo.value = '';
      
      // CAMBIADO - Actualizar aviso pasando string vacío explícitamente
      if (avisoDiv) {
        actualizarAvisoRecordatorio(avisoDiv, ''); // Pasar string vacío
      }
	  
	  // NUEVO - Actualizar campo de notas en la UI
      const tr = document.querySelector(`tr[data-id="${idPersona}"]`);
      if (tr) {
        const inputNotas = tr.querySelector('.td-notas input');
        if (inputNotas) {
          const filaData = await obtenerFilaPorId(idPersona);
          inputNotas.value = filaData['Notas'] || '';
        }
      }
        
         // Actualizar datos locales
      const contact = contactosData.find(contacto => contacto.ID === idPersona);
      if (contact) {
        contact.FechaNotificacion = '';
        contact.HoraNotificacion = '';
        contact.FechaSeguimiento = '';
		// NUEVO - Actualizar notas en datos locales
        contact.Notas = (await obtenerFilaPorId(idPersona))['Notas'] || '';
      }
        
        // Quitar punto en tabla
      if (tr) {
        const nombreTd = tr.querySelector('td:first-child');
        if (nombreTd) {
          const puntoSpan = nombreTd.querySelector('.recordatorio-dot');
          if (puntoSpan) puntoSpan.remove();
        }
      }
		
		 // NUEVO - Ocultar botón eliminar recordatorio
      const containerEliminar = avisoDiv?.closest('.detalle-recordatorio')?.querySelector('.btn-eliminar-recordatorio-container');
      if (containerEliminar) {
        containerEliminar.innerHTML = '';
      }
        
         // Actualizar badge
      actualizarBadgeRecordatorios(contactosData);
    } catch (e) {
      alert('Error al marcar hecho: ' + e.message);
    } finally {
      btnHecho.disabled = false;
      btnHecho.innerHTML = original;
    }
  });
}
  // Iconos SVG para botón copiar y tick
  const copiarSVG = `
    <svg width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7" y="7" width="9" height="9" rx="2" fill="#ffffff" stroke="#64748b" stroke-width="1.5"/>
      <rect x="4" y="4" width="9" height="9" rx="2" fill="#ffffff" stroke="#a3a3a3" stroke-width="1.2"/>
    </svg>
  `;
  const tickSVG = `
    <svg width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 11.3L9.15 14.5L14.2 8.5" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  // Inicializar botón copiar e implementar evento
  const btnCopiar = trDetalle.querySelector('.btn-copiar-mensaje');

  const mensajeCopiado = trDetalle.querySelector('.mensaje-copiado');
  btnCopiar.innerHTML = copiarSVG;
 btnCopiar.addEventListener('click', () => {
  const html = mensajeHtmlBox?.innerHTML || '';
  const plain = htmlToMailtoBody(html);

    if (navigator.clipboard && navigator.clipboard.write) {
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      });
      navigator.clipboard.write([clipboardItem]).then(() => {
        btnCopiar.innerHTML = tickSVG;
        mensajeCopiado.style.opacity = '1';
        setTimeout(() => {
          btnCopiar.innerHTML = copiarSVG;
          mensajeCopiado.style.opacity = '0';
        }, 1600);
      }).catch((err) => {
        console.error('Error al copiar HTML:', err);
        fallbackCopy(html, plain, btnCopiar, mensajeCopiado, copiarSVG, tickSVG);
      });
    } else {
      fallbackCopy(html, plain, btnCopiar, mensajeCopiado, copiarSVG, tickSVG);
    }
  });
}
// NUEVA VERSIÓN de mostrarContactos con renderizado diferido
function mostrarContactos(contactos) {
  contactosData = contactos;
  
  // Cancelar renderizado anterior si existe
if (renderTimeoutId) {
  clearTimeout(renderTimeoutId);
  renderTimeoutId = null;
}

  // Guardar orden original si aún no existe
  if (ordenOriginal.length === 0) {
    ordenOriginal = contactos.map(c => c.ID || `contacto_${contactos.indexOf(c) + 1}`);
  }

  const tbody = document.querySelector('#tabla-contactos tbody');
  if (!tbody) {
    console.error('No se encontró tbody de la tabla');
    return;
  }

  // Limpiar tbody completamente
  tbody.innerHTML = '';

  const contactosNormales = contactos.filter(c => !isEliminado(c));
  const contactosEliminados = contactos.filter(c => isEliminado(c));

  // Unir las listas para renderizar
  // Unir las listas para renderizar
  const contactosARenderizar = [...contactosNormales, ...contactosEliminados];
  const totalPaginas = Math.max(1, Math.ceil(contactosARenderizar.length / CONTACTOS_POR_PAGINA));
  if (paginaActual > totalPaginas) {
    paginaActual = totalPaginas;
  }
  if (paginaActual < 1) {
    paginaActual = 1;
  }

  if (ultimoIdInteractuado) {
    const indexActualizado = contactosARenderizar.findIndex(c => String(c.ID) === String(ultimoIdInteractuado));
    if (indexActualizado !== -1) {
      paginaActual = Math.floor(indexActualizado / CONTACTOS_POR_PAGINA) + 1;
    }
  }

  // Calcular paginación
  const inicio = (paginaActual - 1) * CONTACTOS_POR_PAGINA;
  const fin = inicio + CONTACTOS_POR_PAGINA;
  const contactosPaginados = contactosARenderizar.slice(inicio, fin);

  if (contactosARenderizar.length === 0) {
    tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted py-4">No se encontraron contactos con los filtros actuales.</td></tr>';
    return;
  }

  // --- INICIO DE LA MAGIA: RENDERIZADO POR LOTES ---
  let indexGlobal = 0;
  const CHUNK_SIZE = 50; // Renderizar 50 contactos a la vez
  const fragment = document.createDocumentFragment();

  function renderChunk() {
    const fin = Math.min(indexGlobal + CHUNK_SIZE, contactosPaginados.length);

    for (let i = indexGlobal; i < fin; i++) {
      const c = contactosPaginados[i];
      const idx = i; // Usar el índice global para el data-idx

      // --- (Aquí va tu lógica de creación de fila EXACTAMENTE IGUAL) ---
      const esEliminado = isEliminado(c);
      const llamado = c['Llamado'] === 'Sí';
      const respondido = c['Respondido'] === 'Sí' ? 'Sí' : (c['Respondido'] === 'No' ? 'No' : null);
      const idPersona = c['ID'] || `contacto_${idx + 1}`;
      const nombre = c['your-name'] ? capitalizarPrimerasLetras(c['your-name']) : '';
      const telefonoRaw = String(c['tel-686'] || '');
      const telefono = telefonoRaw.match(/\d{9}/) ?
        telefonoRaw.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : telefonoRaw;

      const terrenoValor = normalizeString(c['radio-188']);
      const ubicacionValor = (typeof c['ubicacion-terreno'] === 'string') ? c['ubicacion-terreno'].trim() : '';
      let textoUbicacionFinal;

      if (terrenoValor === 'no') {
        textoUbicacionFinal = 'Sin terreno';
      } else if (terrenoValor === 'si' || terrenoValor === 'sí') {
        textoUbicacionFinal = ubicacionValor ? ubicacionValor : 'Sin especificar';
      } else {
        textoUbicacionFinal = ubicacionValor || '';
      }

      let htmlUbicacion;
if (textoUbicacionFinal && textoUbicacionFinal !== 'Sin terreno' && textoUbicacionFinal !== 'Sin especificar') {
  const queryMaps = encodeURIComponent(textoUbicacionFinal);
  htmlUbicacion = `<a href="https://www.google.com/maps/search/?api=1&query=${queryMaps}"
                      target="_blank" rel="noopener noreferrer"
                      style="color: inherit; text-decoration: none; cursor: pointer;" 
                      aria-label="Ver ubicación en Google Maps"
                      title="Clic para ver en Google Maps">
                    ${textoUbicacionFinal}
                  </a>`;
} else {
  htmlUbicacion = textoUbicacionFinal;
}
      const tipoVivienda = buildTipoViviendaLabel(c);
      const inversion = c['number-419'] ?
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c['number-419']) : '';

      // --- (Fin de la lógica de creación de fila) ---

      const tr = crearFilaPrincipal(c, idx, esEliminado, llamado, respondido, idPersona, nombre, telefono, htmlUbicacion, inversion, tipoVivienda);
      const trDetalle = crearFilaDetalle(c, idPersona, tipoVivienda, nombre);
      agregarContenidoDetalle(trDetalle, c, tipoVivienda, nombre, idPersona);
      agregarListenersDetalle(trDetalle, idPersona, c, tipoVivienda);
      agregarEventListenersAFila(tr, esEliminado, idPersona, nombre, c);

      // Añadir al fragmento en lugar de al DOM
      fragment.appendChild(tr);
      fragment.appendChild(trDetalle);
    }

    // Añadir el lote de filas al DOM de una sola vez
    tbody.appendChild(fragment);

    // Preparar el siguiente lote
    indexGlobal = fin;
    if (indexGlobal < contactosPaginados.length) {
      // Guardamos el ID del timeout para poder cancelarlo si hace falta
      renderTimeoutId = setTimeout(renderChunk, 0); 
    } else {
      renderTimeoutId = null;
	  // Actualizar controles de paginación
      actualizarControlesPaginacion(contactosARenderizar.length);
      // --- RESTAURAR SCROLL: Si hay un ID guardado, vamos a él ---
      if (ultimoIdInteractuado) {
        // Pequeño delay para asegurar que el DOM esté listo
        setTimeout(() => {
            const fila = document.querySelector(`tr[data-id="${ultimoIdInteractuado}"]`);
            if (fila) {
              fila.scrollIntoView({ behavior: 'auto', block: 'center' });
              // Efecto visual para destacar la fila
              fila.style.transition = 'background-color 0.5s';
              fila.style.backgroundColor = '#eef2ff'; 
              setTimeout(() => fila.style.backgroundColor = '', 2000);
            }
            ultimoIdInteractuado = null; // Limpiar tras usar
            sessionStorage.removeItem('lastInteractionId');
        }, 50);
      }
    }
  }

  // Iniciar el primer lote
  renderChunk();
  // --- FIN DEL RENDERIZADO POR LOTES ---
}

function actualizarControlesPaginacion(totalContactos) {
  const totalPaginas = Math.ceil(totalContactos / CONTACTOS_POR_PAGINA);
  
  // Buscar o crear el contenedor de paginación
  let paginacionDiv = document.getElementById('paginacion-controles');
  
  if (!paginacionDiv) {
    paginacionDiv = document.createElement('div');
    paginacionDiv.id = 'paginacion-controles';
    paginacionDiv.className = 'd-flex justify-content-center align-items-center gap-2 mt-3';
    
    // Insertar después de la tabla
    const cardBody = document.querySelector('.card');
    if (cardBody) {
      cardBody.appendChild(paginacionDiv);
    }
  }
  
  // Limpiar controles anteriores
  paginacionDiv.innerHTML = '';
  
  if (totalPaginas <= 1) {
    paginacionDiv.style.display = 'none';
    return;
  }
  
  paginacionDiv.style.display = 'flex';

  const crearSeparador = () => {
    const sep = document.createElement('span');
    sep.className = 'paginacion-separator';
    sep.textContent = '|';
    return sep;
  };

  const crearBotonPagina = (label, page, { active = false, disabled = false, ariaLabel } = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `paginacion-btn${active ? ' active' : ''}`;
    btn.textContent = label;
    btn.disabled = disabled;
    if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);
    if (!disabled && page) {
      btn.addEventListener('click', () => {
        paginaActual = page;
        mostrarContactos(contactosData);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    return btn;
  };

  // Botón Anterior
  paginacionDiv.appendChild(crearBotonPagina('Anterior', paginaActual - 1, {
    disabled: paginaActual === 1,
    ariaLabel: 'Página anterior'
  }));

  paginacionDiv.appendChild(crearSeparador());

  // Números de página
  const contenedorNumeros = document.createElement('div');
  contenedorNumeros.className = 'paginacion-numeros';

  const maxVisible = 7;
  let paginas = [];
  if (totalPaginas <= maxVisible) {
    paginas = Array.from({ length: totalPaginas }, (_, i) => i + 1);
  } else {
    const start = Math.max(2, paginaActual - 1);
    const end = Math.min(totalPaginas - 1, paginaActual + 1);
    paginas = [1];
    if (start > 2) paginas.push('...');
    for (let i = start; i <= end; i++) paginas.push(i);
    if (end < totalPaginas - 1) paginas.push('...');
    paginas.push(totalPaginas);
  }

  paginas.forEach((item) => {
    if (item === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'paginacion-ellipsis';
      ellipsis.textContent = '…';
      contenedorNumeros.appendChild(ellipsis);
      return;
    }
    contenedorNumeros.appendChild(crearBotonPagina(String(item), item, {
      active: item === paginaActual,
      ariaLabel: `Página ${item}`
    }));
  });

  paginacionDiv.appendChild(contenedorNumeros);
  paginacionDiv.appendChild(crearSeparador());

  // Botón Siguiente
  paginacionDiv.appendChild(crearBotonPagina('Siguiente', paginaActual + 1, {
    disabled: paginaActual === totalPaginas,
    ariaLabel: 'Página siguiente'
  }));
}

/**
 * Ordena cíclicamente una columna según su estado actual
 * @param {string} campo - 'documentacion', 'Llamado' o 'Respondido'
 */
function ordenarCiclico(campo) {
  estadosOrden[campo] = (estadosOrden[campo] + 1) % 3;
  const estado = estadosOrden[campo];
  sortColumn = null; // Resetear el otro sistema de orden
sortDirection = 1;
document.querySelectorAll('.sortable').forEach(t => t.innerHTML = t.innerHTML.replace(' ↑','').replace(' ↓',''));
  
  console.log('=== DEBUG ORDENAR CICLICO (CLIC) ===');
  console.log('Campo:', campo);
  console.log('Estado actual:', estado, '(0=original, 1=primer orden, 2=segundo orden)');

// Resetear todos los estados EXCEPTO el campo activo
Object.keys(estadosOrden).forEach(key => {
  if (key !== campo) {
    estadosOrden[key] = 0;
  }
});
estadosOrden[campo] = estado; // Mantener el estado del campo activo
  console.log('Estados orden tras reset:', estadosOrden);
  aplicarFiltro({ resetPage: true });
  actualizarIndicadoresOrden(campo, estado);
}

/**
 * Actualiza los indicadores visuales en los encabezados de columna
 */
function actualizarIndicadoresOrden(campoActivo, estado) {
 const headers = {
  'documentacion': document.querySelector('th[data-sort="documentacion"]') || document.querySelector('.filtrable-doc'),
  'Llamado': document.querySelector('th[data-sort="Llamado"]'),
  'Respondido': document.querySelector('th[data-sort="Respondido"]'),
  'your-name': document.querySelector('th[data-sort="your-name"]')
};

  Object.values(headers).forEach(th => {
    if (th) th.innerHTML = th.innerHTML.replace(/ ↑| ↓| ⟳/g, '');
  });

  const thActivo = headers[campoActivo];
  if (!thActivo || estado === 0) return;

 if (estado === 1) {
  // Estado 1: documentación=↓(sí arriba), nombre=↑(A-Z), otros=↑(no arriba)
  if (campoActivo === 'documentacion') {
    thActivo.innerHTML += ' ↓';
  } else {
    thActivo.innerHTML += ' ↑';
  }
} else if (estado === 2) {
  // Estado 2: documentación=↑(no arriba), nombre=↓(Z-A), otros=↓(sí arriba)
  thActivo.innerHTML += ' ↓';
}
}




function filtrarFilasPorBusqueda(query) {
	paginaActual = 1; // Resetear a página 1
  const tbody = document.querySelector('#tabla-contactos tbody');
  if (!tbody) return;
  
  const filasPrincipales = Array.from(tbody.querySelectorAll('tr:not(.fila-detalle)'));
  
  filasPrincipales.forEach(tr => {
    const nombreTd = tr.querySelector('td:first-child');
    const telefonoTd = tr.querySelector('td:nth-child(4)'); // Corregido: columna correcta
    
    if (!nombreTd || !telefonoTd) return;
    
    // Normalizar nombre: obtener texto sin punto de recordatorio ni badge
    const nombreCompleto = nombreTd.textContent
      .replace(/^[^\w]+/, '')
      .replace(/\s*ELIMINADO\s*$/, '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ');
    const partesNombre = nombreCompleto.split(/\s+/);
    
    // Normalizar teléfono: quitar espacios, guiones y paréntesis
    const telefono = telefonoTd.textContent
      .trim()
      .replace(/[\s\-()]/g, '') // Eliminar espacios, guiones y paréntesis
      .toLowerCase();
    
    // Verificar coincidencia
    const coincide = partesNombre.some(parte => parte.startsWith(query)) || telefono.includes(query);
    
    // Mostrar/ocultar fila principal
    tr.style.display = coincide ? '' : 'none';
    
    // Forzar ocultar fila de detalle y actualizar botón de detalle
    const filaDetalle = tr.nextElementSibling;
    if (filaDetalle && filaDetalle.classList.contains('fila-detalle')) {
      filaDetalle.style.display = 'none';
    }
    
    // Actualizar botón de detalle para reflejar estado colapsado
    const btnDetalle = tr.querySelector('button[data-toggle="detalle"]');
    if (btnDetalle) {
      btnDetalle.classList.remove('abierto');
      const span = btnDetalle.querySelector('span');
      if (span) span.textContent = '▼';
      btnDetalle.setAttribute('aria-expanded', 'false');
    }
  });
}
// Función modularizada para agregar listeners a la fila principal (delegación parcial)
// FUNCIÓN CORREGIDA - Reemplaza completamente tu función agregarEventListenersAFila
function agregarEventListenersAFila(tr, esEliminado, idPersona, nombre, c) {
  if (!esEliminado) {
    // === CONTACTOS NORMALES (NO ELIMINADOS) ===
    const tdLlamado = tr.querySelector('.td-llamado');
    const tdRespondido = tr.querySelector('.td-respondido');
    const tdSeguimiento = tr.querySelector('.td-seguimiento');
    const tdPrioridad = tr.querySelector('.td-prioridad');
    
    if (tdLlamado) tdLlamado.appendChild(crearBotonLlamado(idPersona, c['Llamado']));
    if (tdRespondido) tdRespondido.appendChild(crearBotonRespondido(idPersona, c['Respondido']));
    
    const estadoDocRaw = c['documentacion'] || 'no';
    const estadoDoc = normalizeString(estadoDocRaw) === 'si' ? 'Sí' : 'No';
    
    if (tdSeguimiento) {
      tdSeguimiento.innerHTML = '';
      tdSeguimiento.appendChild(crearBotonDocumentacion(idPersona, estadoDoc));
    }
    
    if (tdPrioridad) tdPrioridad.appendChild(crearBotonPrioridad(idPersona, c['Prioridad']));
    
    // Guardar notas
   const textareaNotas = tr.querySelector('.td-notas textarea');
const btnGuardarNotas = tr.querySelector('.btn-guardar-notas');
if (btnGuardarNotas && textareaNotas) {
  btnGuardarNotas.addEventListener('click', async () => {
    const notas = textareaNotas.value;
    const originalHTML = btnGuardarNotas.innerHTML;
    try {
      btnGuardarNotas.disabled = true;
      btnGuardarNotas.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      await marcarNotas(idPersona, notas);
      const filaData = await obtenerFilaPorId(idPersona);
      textareaNotas.value = filaData['Notas'] || '';
      btnGuardarNotas.innerHTML = '<i class="bi bi-check-lg"></i>';
      setTimeout(() => {
        btnGuardarNotas.innerHTML = originalHTML;
        btnGuardarNotas.disabled = false;
      }, 1500);
    } catch (e) {
      alert('Error al guardar Notas: ' + e.message);
      btnGuardarNotas.innerHTML = originalHTML;
      btnGuardarNotas.disabled = false;
    }
  });
}
    // Event listener para eliminar (soft delete)
    const btnEliminar = tr.querySelector('.btn-eliminar');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', async () => {
        if (confirm(`¿Desea ocultar el contacto de ${nombre}? Podrá restaurarlo más tarde.`)) {
          try {
            btnEliminar.disabled = true;
            btnEliminar.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
            await ocultarFila(idPersona);
          } catch (e) {
            alert('Error al ocultar contacto: ' + e.message);
            btnEliminar.disabled = false;
            btnEliminar.innerHTML = '<i class="bi bi-trash"></i>';
          }
        }
      });
    }
	const botonesAccion = tr.querySelectorAll('.btn-ficha-custom');
    botonesAccion.forEach(btn => {
      btn.addEventListener('click', () => {
        sessionStorage.setItem('lastInteractionId', idPersona);
        ultimoIdInteractuado = idPersona;
      });
    });
    
  } else {
    // === CONTACTOS ELIMINADOS ===
    
    // Para elementos eliminados, agregar celdas deshabilitadas
    const tdLlamado = tr.querySelector('.td-llamado');
    const tdRespondido = tr.querySelector('.td-respondido');
    const tdSeguimiento = tr.querySelector('.td-seguimiento');
    const tdPrioridad = tr.querySelector('.td-prioridad');
    
    if (tdLlamado) tdLlamado.innerHTML = '<span class="text-muted">-</span>';
    if (tdRespondido) tdRespondido.innerHTML = '<span class="text-muted">-</span>';
    if (tdSeguimiento) tdSeguimiento.innerHTML = '<span class="text-muted">-</span>';
    if (tdPrioridad) tdPrioridad.innerHTML = '<span class="text-muted">-</span>';
    
    // Event listener para restaurar
    const btnRestaurar = tr.querySelector('.btn-restaurar');
    if (btnRestaurar) {
      btnRestaurar.addEventListener('click', async () => {
        if (confirm(`¿Desea restaurar el contacto de ${nombre}?`)) {
          try {
            btnRestaurar.disabled = true;
            btnRestaurar.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
            await restaurarFila(idPersona);
          } catch (e) {
            alert('Error al restaurar contacto: ' + e.message);
            btnRestaurar.disabled = false;
            btnRestaurar.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i>';
          }
        }
      });
    }
    
    // Event listener para eliminar definitivo (hard delete)
    const btnEliminarDefinitivo = tr.querySelector('.btn-eliminar-definitivo');
    if (btnEliminarDefinitivo) {
      btnEliminarDefinitivo.addEventListener('click', async () => {
        if (confirm(`¿Desea eliminar DEFINITIVAMENTE el contacto de ${nombre}? Esta acción no se puede deshacer.`)) {
          try {
            btnEliminarDefinitivo.disabled = true;
            btnEliminarDefinitivo.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span>';
            await eliminarDefinitivo(idPersona);
          } catch (e) {
            alert('Error al eliminar definitivo: ' + e.message);
            btnEliminarDefinitivo.disabled = false;
            btnEliminarDefinitivo.innerHTML = '<i class="bi bi-trash-fill"></i>';
          }
        }
      });
    }
  }
}
    
function agregarControlEliminados() {
  const filtroVivienda = document.getElementById('filtroVivienda');
  // Si ya existe, devolver referencias
  if (document.getElementById('toggleEliminados')) {
    return {
      toggleEliminados: document.getElementById('toggleEliminados'),
      btnRestaurarTodos: document.getElementById('btnRestaurarTodos')
    };
  }

  // (sin cambios adicionales aquí)

  // Contenedor estilo flex para alinear
  const controlsContainer = document.createElement('div');
  controlsContainer.className = "d-flex justify-content-end align-items-center gap-3 mt-2";
  // Toggle tipo switch
  const toggleWrapper = document.createElement('div');
  toggleWrapper.className = "form-check form-switch";
  toggleWrapper.innerHTML = `
    <input class="form-check-input" type="checkbox" id="toggleEliminados" aria-label="Toggle ver eliminados">
    <label class="form-check-label" for="toggleEliminados">Ver eliminados</label>
  `;
  // Solo agrega el toggle "ver eliminados"
  controlsContainer.appendChild(toggleWrapper);
  // Insertar el bloque justo DESPUÉS del filtro
  filtroVivienda.parentNode.insertBefore(controlsContainer, filtroVivienda.nextSibling);
  return { 
    toggleEliminados: document.getElementById('toggleEliminados'), 
  };
}
function formatearHora(h, m) {
  const min = String(m).padStart(2, '0');
  
  if (h === 0) {
    return `12:${min} de la madrugada`;
  } else if (h >= 1 && h < 6) {
    return `${h}:${min} de la madrugada`;
  } else if (h >= 6 && h < 12) {
    return `${h}:${min} de la mañana`;
  } else if (h === 12) {
    return `12:${min} del mediodía`;
  } else if (h >= 13 && h < 20) {
    const hora12 = h - 12;
    return `${hora12}:${min} de la tarde`;
  } else if (h >= 20 && h <= 23) {
    const hora12 = h - 12;
    return `${hora12}:${min} de la noche`;
  }
  
  return `${h}:${min}`;
}
function actualizarAvisoRecordatorio(avisoDiv, fechaStr) {
  if (!avisoDiv) return;
  
  if (!fechaStr || fechaStr.trim() === '') {
    avisoDiv.className = 'aviso-recordatorio';
    avisoDiv.textContent = 'No hay recordatorios pendientes.';
    const detalleRecordatorio = avisoDiv.closest('.detalle-recordatorio');
    const containerEliminar = detalleRecordatorio?.querySelector('.btn-eliminar-recordatorio-container');
    if (containerEliminar) {
      containerEliminar.innerHTML = '';
    }
    return;
  }
  
  const fechaAviso = parseFechaFlexible(fechaStr);
  if (isNaN(fechaAviso)) {
    avisoDiv.className = 'aviso-recordatorio';
    avisoDiv.textContent = 'No hay recordatorios pendientes.';
    const detalleRecordatorio = avisoDiv.closest('.detalle-recordatorio');
    const containerEliminar = detalleRecordatorio?.querySelector('.btn-eliminar-recordatorio-container');
    if (containerEliminar) {
      containerEliminar.innerHTML = '';
    }
    return;
  }
  const ahora = new Date();
  const diffMs = fechaAviso - ahora;
  const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const sameDay = fechaAviso.getFullYear() === ahora.getFullYear() &&
    fechaAviso.getMonth() === ahora.getMonth() &&
    fechaAviso.getDate() === ahora.getDate();
  
  const detalleRecordatorio = avisoDiv.closest('.detalle-recordatorio');
  const containerEliminar = detalleRecordatorio?.querySelector('.btn-eliminar-recordatorio-container');
  if (containerEliminar && !containerEliminar.hasChildNodes()) {
    const idPersona = avisoDiv.id.replace('aviso-recordatorio-', '');
    containerEliminar.appendChild(crearBotonEliminarRecordatorio(idPersona));
  }
  // Formato de fecha personalizado: "Martes 9 septiembre, sobre las 2:24 de la tarde"
  const opcionesFecha = { weekday: 'long', day: 'numeric', month: 'long' };
const fechaFormateada = fechaAviso.toLocaleDateString('es-ES', opcionesFecha);
  const horaFormateada = formatearHora(fechaAviso.getHours(), fechaAviso.getMinutes());
  let mensaje = `📅${fechaFormateada}, sobre las ${horaFormateada} - `;
  
  // Determinar estado relativo
  if (sameDay) {
    if (diffMs > 0) {
      avisoDiv.className = 'aviso-recordatorio';
      mensaje += 'Llamar hoy';
    } else {
      avisoDiv.className = 'aviso-recordatorio atrasado';
      mensaje += '⚠️ LLamar hoy';
    }
  } else if (diffMs <= 0) {
    avisoDiv.className = 'aviso-recordatorio atrasado';
    const diasAtrasado = Math.round(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
    mensaje += `⚠️ Atrasado ${diasAtrasado} día${diasAtrasado !== 1 ? 's' : ''}`;
  } else {
    avisoDiv.className = 'aviso-recordatorio';
    const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    const diffMsFin = fechaAviso - finHoy;
    const diffDias = Math.ceil(diffMsFin / (1000 * 60 * 60 * 24));
    const diffHoras = Math.ceil(diffMs / (1000 * 60 * 60));
    if (diffDias === 1) {
      mensaje += 'Mañana';
    } else if (diffDias <= 7) {
      mensaje += `Quedan ${diffDias} día${diffDias !== 1 ? 's' : ''}`;
    } else {
      const diffMeses = Math.floor(diffDias / 30);
      mensaje += `Queda ${diffMeses} mes${diffMeses !== 1 ? 'es' : ''}`;
    }
  }
  
  avisoDiv.textContent = mensaje;
}
function actualizarBadgeRecordatorios(datos) {
  const badge = document.getElementById('badge-recordatorios');
  if (!badge) return;
  
  const hoy = new Date();
  hoy.setSeconds(0, 0);
  
  const pendientes = datos.filter(c => {
    const fechaAviso = obtenerFechaAvisoDate(c);
    if (isNaN(fechaAviso)) return false;
    return fechaAviso <= hoy;
  }).length;
  
  if (pendientes > 0) {
    badge.textContent = pendientes;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}
// 3. Reemplazar la función construirListaNotificaciones
function construirListaNotificaciones(datos, modo = 'due') {
  const contenedor = document.getElementById('notificaciones-lista');
  if (!contenedor) return;
  
  const ahora = new Date();
  ahora.setSeconds(0, 0);
  const finHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
  const inicioManana = new Date(finHoy.getTime() + 1);
  const horizon = new Date(inicioManana.getTime() + 7 * 1000 * 60 * 60 * 24);
  
  let todosLosItems;
  let currentIndex;
  
  if (modo === 'due') {
    todosLosItems = datos.filter(c => {
      const fechaAviso = obtenerFechaAvisoDate(c);
      if (isNaN(fechaAviso)) return false;
      return fechaAviso <= finHoy;
    });
    todosLosItems = todosLosItems.sort((a, b) => obtenerFechaAvisoDate(a) - obtenerFechaAvisoDate(b));
    currentIndex = notificacionesPendientesIndex;
  } else if (modo === 'upcoming') {
    
const proximosSiete = datos.filter(c => {
  const fechaAviso = obtenerFechaAvisoDate(c);
  if (isNaN(fechaAviso)) return false;
  return fechaAviso > finHoy && fechaAviso <= horizon; // Ya está correcto - excluye hoy
}).sort((a, b) => obtenerFechaAvisoDate(a) - obtenerFechaAvisoDate(b));
    
    const resto = datos.filter(c => {
      const fechaAviso = obtenerFechaAvisoDate(c);
      if (isNaN(fechaAviso)) return false;
      return fechaAviso > horizon;
    }).sort((a, b) => obtenerFechaAvisoDate(a) - obtenerFechaAvisoDate(b));
    
    todosLosItems = [...proximosSiete, ...resto];
    currentIndex = notificacionesProximasIndex;
  }
  // (el resto de la función permanece igual, no se modifica)
  if (currentIndex === 0) {
    contenedor.innerHTML = '';
  }
  const itemsAMostrar = todosLosItems.slice(currentIndex, currentIndex + ITEMS_POR_PAGINA);
  const hayMas = currentIndex + ITEMS_POR_PAGINA < todosLosItems.length;
  const totalRestantes = Math.max(0, todosLosItems.length - currentIndex - ITEMS_POR_PAGINA);
  if (todosLosItems.length === 0 && currentIndex === 0) {
    let texto = 'Sin recordatorios';
    if (modo === 'due') texto = 'Sin recordatorios pendientes';
    else if (modo === 'upcoming') texto = 'No hay próximos en 7 días';
    
    contenedor.innerHTML = `<div style="padding:15px 16px;color:#64748b;text-align:center;">${texto}</div>`;
    return;
  }
  itemsAMostrar.forEach(c => {
    const id = c['ID'];
    const nombre = c['your-name'] || 'Sin nombre';
    const motivo = c['MotivoSeguimiento'] || 'Llamar contacto';
    const fechaObj = obtenerFechaAvisoDate(c);
    const fecha = fechaObj ? fechaObj.toLocaleDateString('es-ES') : '';
    const hora = fechaObj ? fechaObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
    
    const tipo = clasificarRecordatorio(c);
    let puntoClass = 'futuro';
    if (tipo === 'urgente') puntoClass = 'urgente';
    else if (tipo === 'proximo') puntoClass = 'proximo';
    
    const item = document.createElement('div');
    item.className = 'notificacion-item';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
        <div style="min-width:0; display:flex; align-items:center; gap:8px; flex:1;">
          <span class="recordatorio-dot ${puntoClass}"></span>
          <div style="min-width:0; flex:1;">
            <div style="font-weight:600; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${capitalizarPrimerasLetras(nombre)}</div>
            <div style="color:#475569; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${motivo}</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
          <div style="color:#334155; font-size:12px; text-align:right; white-space:nowrap;">
            ${fecha}<br>${hora}
          </div>
          <div class="check-hecho" data-id="${id}" title="Marcar como hecho" aria-label="Marcar recordatorio como hecho" role="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </div>
        </div>
      </div>`;
    
    item.addEventListener('click', (e) => {
      if (e.target.closest('.check-hecho')) return;
      sessionStorage.setItem('lastInteractionId', id);
      ultimoIdInteractuado = id;
      enfocarContactoEnTabla(id);
      togglePanelNotificaciones(false);
    });
    
    const checkHecho = item.querySelector('.check-hecho');
    if (checkHecho) {
      checkHecho.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        const originalHTML = checkHecho.innerHTML;
        checkHecho.style.pointerEvents = 'none';
        checkHecho.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10"/>
            <path d="m9 12 2 2 4-4"/>
          </svg>
        `;
        
        try {
          await marcarRecordatorioHecho(id);
          const tr = document.querySelector(`tr[data-id="${id}"]`);
          if (tr) {
            const inputNotas = tr.querySelector('.td-notas input');
            if (inputNotas) {
              const filaData = await obtenerFilaPorId(id);
              inputNotas.value = filaData['Notas'] || '';
            }
          }
          const contact = contactosData.find(contacto => contacto.ID === id);
          if (contact) {
            contact.FechaNotificacion = '';
            contact.HoraNotificacion = '';
            contact.FechaSeguimiento = '';
            contact.Notas = (await obtenerFilaPorId(id))['Notas'] || '';
          }
          item.style.opacity = '0.6';
          item.style.cursor = 'default';
          const texts = item.querySelectorAll('div[style*="font-weight:600"], div[style*="font-size:12px"]');
          texts.forEach(el => {
            el.style.textDecoration = 'line-through';
            el.style.color = '#64748b';
          });
          const fechaDiv = item.querySelector('div[style*="font-size:12px; text-align:right"]');
          if (fechaDiv) fechaDiv.style.display = 'none';
          const punto = item.querySelector('.recordatorio-dot');
          if (punto) punto.style.display = 'none';
          checkHecho.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">
              <path d="M5 13l4 4L19 7"/>
            </svg>
          `;
          checkHecho.style.cursor = 'default';
          if (tr) {
            const nombreTd = tr.querySelector('td:first-child');
            if (nombreTd) {
              const puntoSpan = nombreTd.querySelector('.recordatorio-dot');
              if (puntoSpan) puntoSpan.remove();
            }
          }
          const avisoDetalle = document.querySelector(`#aviso-recordatorio-${id}`);
          if (avisoDetalle) {
            actualizarAvisoRecordatorio(avisoDetalle, '');
          }
          const inputsDetalle = document.querySelectorAll(`#fecha-${id}, #hora-${id}, #motivo-${id}`);
          inputsDetalle.forEach(input => input.value = '');
          actualizarBadgeRecordatorios(contactosData);
        } catch (error) {
          console.error('Error al marcar recordatorio como hecho:', error);
          alert('Error al marcar recordatorio como hecho: ' + error.message);
          checkHecho.innerHTML = originalHTML;
          checkHecho.style.pointerEvents = 'auto';
        }
      });
    }
    
    contenedor.appendChild(item);
  });
  
  
  
  if (modo === 'due') {
    notificacionesPendientesIndex = currentIndex + ITEMS_POR_PAGINA;
  } else if (modo === 'upcoming') {
    notificacionesProximasIndex = currentIndex + ITEMS_POR_PAGINA;
  }
  const botonAnterior = contenedor.querySelector('.ver-todos-btn');
  if (botonAnterior) botonAnterior.remove();
  if (modo === 'due') {
    notificacionesPendientesTotalMostradas = Math.min(notificacionesPendientesIndex, todosLosItems.length);
  } else if (modo === 'upcoming') {
    notificacionesProximasTotalMostradas = Math.min(notificacionesProximasIndex, todosLosItems.length);
  }
  const totalMostradas = modo === 'due' ? notificacionesPendientesTotalMostradas : notificacionesProximasTotalMostradas;
  const mostrarBoton = hayMas || totalMostradas > ITEMS_POR_PAGINA;
  if (mostrarBoton) {
    const verMasDiv = document.createElement('div');
    verMasDiv.className = 'ver-todos-btn';
    verMasDiv.style.cssText = `
      padding: 12px 16px; 
      text-align: center; 
      border-top: 1px solid #f1f5f9; 
      background: #fafbfc;
      cursor: pointer;
      transition: background 0.2s ease;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
    `;
    
    if (hayMas) {
      verMasDiv.innerHTML = `Ver más (${totalRestantes})`;
      verMasDiv.addEventListener('click', () => {
        construirListaNotificaciones(contactosData, modo);
      });
    } else {
      verMasDiv.innerHTML = `Ver menos`;
      verMasDiv.addEventListener('click', () => {
        if (modo === 'due') {
          notificacionesPendientesIndex = 0;
          notificacionesPendientesTotalMostradas = 0;
        } else if (modo === 'upcoming') {
          notificacionesProximasIndex = 0;
          notificacionesProximasTotalMostradas = 0;
        }
        contenedor.innerHTML = '';
        construirListaNotificaciones(contactosData, modo);
      });
    }
    
    verMasDiv.addEventListener('mouseenter', () => {
      verMasDiv.style.background = '#f1f5f9';
    });
    verMasDiv.addEventListener('mouseleave', () => {
      verMasDiv.style.background = '#fafbfc';
    });
    
    contenedor.appendChild(verMasDiv);
  }
}
// © 2026 Andrea Lorán - ID: 1734X
const _authorCode = "AL2026";


 // <-- Cierra correctamente construirListaNotificaciones
function togglePanelNotificaciones(forceState) {
  const panel = document.getElementById('panelNotificaciones');
  const overlay = document.getElementById('overlayNotificaciones');
  if (!panel) return;
  if (typeof forceState === 'boolean') {
    panel.style.display = forceState ? 'block' : 'none';
    if (overlay) overlay.style.display = forceState ? 'block' : 'none';
  } else {
    const show = (panel.style.display === 'none' || panel.style.display === '');
    panel.style.display = show ? 'block' : 'none';
    if (overlay) overlay.style.display = show ? 'block' : 'none';
  }
}
function enfocarContactoEnTabla(id) {
  // 1. Calcular el array de contactos paginados tal como lo hace mostrarContactos
  const contactosNormales = contactosData.filter(c => !isEliminado(c));
  const contactosEliminados = contactosData.filter(c => isEliminado(c));
  const contactosARenderizar = [...contactosNormales, ...contactosEliminados];

  // 2. Buscar la posición del contacto en ese array
  const index = contactosARenderizar.findIndex(c => String(c.ID) === String(id));

  if (index === -1) {
    // El contacto no está visible con los filtros actuales
    console.warn(`enfocarContactoEnTabla: contacto ${id} no encontrado en contactosData`);
    return;
  }

  // 3. Calcular la página donde está
  const paginaObjetivo = Math.floor(index / CONTACTOS_POR_PAGINA) + 1;

  // 4. Función que aplica el scroll y resaltado una vez que la fila está en el DOM
  function resaltarFila() {
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    if (!fila) return;

    fila.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const nombreTd = fila.querySelector('td:first-child');
    const prevColor = nombreTd?.style?.color || '';
    if (nombreTd) {
      nombreTd.style.color = '#2563eb';
      setTimeout(() => { nombreTd.style.color = prevColor; }, 2500);
    }

    const btnDetalle = fila.querySelector('button[data-toggle="detalle"]');
    if (btnDetalle && !btnDetalle.classList.contains('abierto')) {
      btnDetalle.click();
    }
  }

  // 5. Si ya estamos en la página correcta, la fila ya existe en el DOM
  if (paginaActual === paginaObjetivo) {
    resaltarFila();
    return;
  }

  // 6. Si hay que cambiar de página: usar MutationObserver para detectar
  //    cuando el tbody termina de renderizarse (más robusto que setTimeout)
  const tbody = document.querySelector('#tabla-contactos tbody');

  const observer = new MutationObserver(() => {
    const fila = document.querySelector(`tr[data-id="${id}"]`);
    if (fila) {
      observer.disconnect();
      // Pequeño rAF para asegurar que el layout ya aplicó las dimensiones
      requestAnimationFrame(() => resaltarFila());
    }
  });

  observer.observe(tbody, { childList: true, subtree: false });

  // Seguridad: desconectar el observer si en 3s no aparece la fila (no debería ocurrir)
  setTimeout(() => observer.disconnect(), 3000);

  // 7. Cambiar de página (esto dispara mostrarContactos → renderChunk → muta el tbody)
  paginaActual = paginaObjetivo;
  mostrarContactos(contactosData);
}
function fallbackCopy(html, plain, btnCopiar, mensajeCopiado, copiarSVG, tickSVG) {
  const temp = document.createElement('div');
  temp.style.position = 'absolute';
  temp.style.left = '-9999px';
  temp.innerHTML = html;
  document.body.appendChild(temp);
  const range = document.createRange();
  range.selectNodeContents(temp);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  try {
    if (document.execCommand('copy')) {
      // Éxito en copia rica
    } else {
      throw new Error('Copia fallida');
    }
  } catch (err) {
    // Si falla la copia rica, copia plain
    const tempText = document.createElement('textarea');
    tempText.value = plain;
    document.body.appendChild(tempText);
    tempText.select();
    document.execCommand('copy');
    document.body.removeChild(tempText);
  } finally {
    document.body.removeChild(temp);
  }
  // Muestra feedback de éxito (ajusta según tu UI)
  btnCopiar.innerHTML = tickSVG;
  mensajeCopiado.style.opacity = '1';
  setTimeout(() => {
    btnCopiar.innerHTML = copiarSVG;
    mensajeCopiado.style.opacity = '0';
  }, 1600);
}

function getDefaultAppConfig() {
  return CategoriaSystem.getDefaultAppConfig();
}

function normalizeConfig(config) {
  return CategoriaSystem.normalizeConfig(config);
}

async function apiConfigRequest(action, payload = {}, method = 'POST') {
  if (method === 'GET') {
    return safeFetch(`${urlApi}?action=${encodeURIComponent(action)}`);
  }
  return safeFetch(urlApi, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action, ...payload })
  });
}

function setConfigStatus(message, isError = false) {
  const status = document.getElementById('config-status-msg');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#dc2626' : '#64748b';
}

async function cargarConfiguracion() {
  const result = await apiConfigRequest(CONFIG_ACTIONS.GET, {}, 'GET');
  if (result.status !== 'success') throw new Error(result.message || 'No se pudo cargar configuración');
  appConfig = normalizeConfig(result.config || getDefaultAppConfig());
  rebuildFiltroCategorias();
}

function getCategoriaById(id) {
  return CategoriaSystem.getCategoriaById(appConfig, id);
}

function getContactoCategoriaId(contacto) {
  const raw = String(contacto?.['categoria-id'] || contacto?.categoriaId || contacto?.categoria_id || '').trim();
  if (raw) return raw;
  const resolved = CategoriaSystem.resolveCategoria(appConfig || getDefaultAppConfig(), contacto);
  return resolved?.id || CategoriaSystem.BASE_CATEGORY_IDS.NORMAL;
}

function resolveCategoriaContacto(contacto) {
  return getContactoCategoriaId(contacto);
}

function isCategoriaActiva(categoria) {
  if (!categoria) return true;
  if (typeof categoria.activa === 'boolean') return categoria.activa;
  const normalized = normalizeString(categoria.activa);
  return !['false', '0', 'no', 'oculta', 'inactiva', 'off'].includes(normalized);
}

function isContactoDeCategoriaActiva(contacto) {
  const categoria = CategoriaSystem.resolveCategoria(appConfig || getDefaultAppConfig(), contacto);
  return isCategoriaActiva(categoria);
}

function buildTipoViviendaLabel(contacto) {
  return CategoriaSystem.buildTipoViviendaLabel(appConfig || getDefaultAppConfig(), contacto);
}

function esCategoriaVillasPorLabel(tipoVivienda, contacto = null) {
  const categoria = CategoriaSystem.resolveCategoria(appConfig || getDefaultAppConfig(), contacto || { interes: tipoVivienda });
  return CategoriaSystem.isVillasCategory(categoria);
}

function rebuildFiltroCategorias() {
  const filtro = document.getElementById('filtroVivienda');
  if (!filtro) return;
  const activeCategorias = (appConfig?.categorias || []).filter(c => c.activa !== false);
  const previousValue = filtro.value || 'todos';
  filtro.innerHTML = '<option value="todos">Todos</option>';
  activeCategorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nombre;
    filtro.appendChild(opt);
  });
  const nextValue = normalizarValorFiltroCategoria(previousValue);
  filtro.value = [...filtro.options].some(o => o.value === nextValue) ? nextValue : 'todos';
}

function normalizarValorFiltroCategoria(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value || value === 'todos') return 'todos';

  const legacyMap = {
    'vivienda-normal': CategoriaSystem.BASE_CATEGORY_IDS.NORMAL,
    'villas-isla': CategoriaSystem.BASE_CATEGORY_IDS.VILLAS
  };
  if (legacyMap[value]) return legacyMap[value];

  const normalizado = normalizeString(value);

  const categorias = appConfig?.categorias || [];
  const byBaseId = categorias.find(c => normalizeString(c.id) === normalizado);
  if (byBaseId) return byBaseId.id;
  const byId = categorias.find(c => c.id === value);
  if (byId) return byId.id;
  const byNombre = categorias.find(c => normalizeString(c.nombre) === normalizado);
  if (byNombre) return byNombre.id;
  return 'todos';
}

function renderCategoriasList() {
  const list = document.getElementById('categorias-list');
  if (!list) return;
  list.innerHTML = '';
  (appConfig?.categorias || []).forEach(cat => {
    const row = document.createElement('div');
    row.className = `categoria-item ${cat.activa ? '' : 'oculta'}`;
    row.innerHTML = `
      <div>
        <div class="fw-semibold">${cat.nombre}</div>
        <div class="small text-muted">${cat.id} <span class="categoria-badge ${cat.activa ? '' : 'off'}">${cat.activa ? 'Activa' : 'Oculta'}</span></div>
      </div>
      <div class="categoria-actions">
        <button class="btn btn-outline-secondary btn-sm" data-action="edit" data-id="${cat.id}">✏️</button>
        <button class="btn btn-outline-warning btn-sm" data-action="toggle" data-id="${cat.id}">👁️</button>
        <button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${cat.id}">🗑️</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function renderConfigCategoriaSelector(selectedId) {
  const select = document.getElementById('config-categoria-select');
  if (!select) return;
  const categorias = appConfig?.categorias || [];
  const current = selectedId || select.value || categorias[0]?.id || '';
  select.innerHTML = '';
  categorias.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nombre;
    select.appendChild(opt);
  });
  select.value = current;
}

function renderConfigDetalleCategoria() {
  const select = document.getElementById('config-categoria-select');
  if (!select) return;
  const categoria = getCategoriaById(select.value);
  if (!categoria) return;

  const tipo = document.getElementById('config-form-tipo');
  const asunto = document.getElementById('config-email-asunto');
  const cuerpo = document.getElementById('config-email-cuerpo-editable');
  const wrap = document.getElementById('campos-custom-wrap');
  const campos = document.getElementById('campos-disponibles');
  const vars = document.getElementById('config-email-variable');
  const prefix = document.getElementById('config-email-prefix');
  if (!tipo || !asunto || !cuerpo || !wrap || !campos || !vars || !prefix) return;

  tipo.value = categoria.formulario?.tipo || 'standard';
  asunto.value = categoria.email?.asunto || '';
  cuerpo.value = categoria.email?.cuerpo || '';
  prefix.textContent = getEmailPrefix('Nombre');
  wrap.style.display = tipo.value === 'custom' ? 'block' : 'none';

  campos.innerHTML = '';
  const infoAlways = document.createElement('div');
  infoAlways.className = 'small text-muted mb-2';
  infoAlways.textContent = `Siempre incluidos (no configurables): ${ALWAYS_INCLUDED_FIELDS.map(getFieldLabel).join(', ')}`;
  campos.appendChild(infoAlways);
  AVAILABLE_FORM_FIELDS.forEach(field => {
    const checked = categoria.formulario?.campos?.includes(field) ? 'checked' : '';
    const item = document.createElement('label');
    item.className = 'form-check d-flex align-items-center gap-2';
    item.innerHTML = `<input class="form-check-input config-campo-check" type="checkbox" value="${field}" ${checked}><span class="small">${getFieldLabel(field)}</span>`;
    campos.appendChild(item);
  });

  vars.innerHTML = '<option value="">Insertar variable…</option>';
  AVAILABLE_FORM_FIELDS.forEach(v => {
    const opt = document.createElement('option');
    opt.value = `{{${v}}}`;
    opt.textContent = `${getFieldLabel(v)} ({{${v}}})`;
    vars.appendChild(opt);
  });
}

function renderConfigView(selectedId) {
  renderCategoriasList();
  renderConfigCategoriaSelector(selectedId);
  renderConfigDetalleCategoria();
}

async function guardarConfiguracionCompleta() {
  const result = await apiConfigRequest(CONFIG_ACTIONS.SAVE, { config: JSON.stringify(appConfig) });
  if (result.status !== 'success') throw new Error(result.message || 'No se pudo guardar');
  setConfigStatus('Configuración guardada correctamente.');
  rebuildFiltroCategorias();
}

async function ensureConfigViewLoaded() {
  if (document.getElementById('config-view')) return;
  const host = document.getElementById('config-view-host');
  if (!host) return;
  const fallbackMarkup = `
    <section id="config-view" class="config-view" style="display:none;">
      <div class="config-header">
        <div>
          <h2>⚙️ Configuración avanzada</h2>
          <p>Gestiona categorías, formularios y plantillas de email sin salir del dashboard.</p>
        </div>
        <button id="btnCloseConfig" class="btn btn-outline-secondary btn-sm" type="button">Volver al listado</button>
      </div>
      <div class="config-grid">
        <article class="config-card">
          <div class="config-card-title">
            <h3>A) Promociones / categorías</h3>
            <button id="btnAddCategoria" class="btn btn-primary btn-sm" type="button">➕ Añadir</button>
          </div>
          <div id="categorias-list" class="categorias-list"></div>
        </article>
        <article class="config-card">
          <h3>B) Configuración de formularios</h3>
          <div class="mb-3">
            <label for="config-categoria-select" class="form-label">Categoría</label>
            <select id="config-categoria-select" class="form-select form-select-sm"></select>
          </div>
          <div class="mb-3">
            <label for="config-form-tipo" class="form-label">Tipo de formulario</label>
            <select id="config-form-tipo" class="form-select form-select-sm">
              <option value="standard">Formulario estándar</option>
              <option value="custom">Formulario personalizado</option>
            </select>
          </div>
          <div id="campos-custom-wrap" style="display:none;">
            <p class="small text-muted mb-2">Selecciona campos ya existentes para esta categoría:</p>
            <div id="campos-disponibles" class="campos-disponibles"></div>
          </div>
        </article>
        <article class="config-card config-card-full">
          <h3>C) Configuración de emails</h3>
          <div class="row g-3">
            <div class="col-md-5">
              <label for="config-email-asunto" class="form-label">Asunto</label>
              <input id="config-email-asunto" type="text" class="form-control form-control-sm" placeholder="Asunto del email">
            </div>
            <div class="col-md-7">
              <label for="config-email-variable" class="form-label">Variables disponibles</label>
              <select id="config-email-variable" class="form-select form-select-sm">
                <option value="">Insertar variable…</option>
              </select>
            </div>
          </div>
          <div class="mt-3">
            <label for="config-email-cuerpo-editable" class="form-label">Cuerpo editable</label>
            <div class="email-prefix-readonly" id="config-email-prefix"></div>
            <textarea id="config-email-cuerpo-editable" class="form-control form-control-sm mt-2" rows="8" placeholder="Continúa el contenido del email…"></textarea>
          </div>
          <div class="config-actions">
            <button id="btnSaveConfig" class="btn btn-success btn-sm" type="button">💾 Guardar configuración</button>
            <span id="config-status-msg" class="text-muted small"></span>
          </div>
        </article>
      </div>
    </section>
  `;
  try {
    const response = await fetch('ajustes.html', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo cargar ajustes.html');
    host.innerHTML = await response.text();
  } catch (error) {
    console.warn('⚠️ ajustes.html no disponible, usando fallback inline:', error.message);
    host.innerHTML = fallbackMarkup;
  }
}

function inicializarBtnAjustes() {
  const btnOpenConfig = document.getElementById('btnOpenConfig');
  if (btnOpenConfig) {
    btnOpenConfig.addEventListener('click', () => {
      window.location.href = 'ajustes.html';
    });
  }
}

async function initConfigUI() {
  await ensureConfigViewLoaded();
  const btnOpen = document.getElementById('btnOpenConfig');
  const btnClose = document.getElementById('btnCloseConfig');
  const view = document.getElementById('config-view');
  const card = document.querySelector('.card.shadow-sm');
  const btnAdd = document.getElementById('btnAddCategoria');
  const list = document.getElementById('categorias-list');
  const categoriaSelect = document.getElementById('config-categoria-select');
  const tipo = document.getElementById('config-form-tipo');
  const asunto = document.getElementById('config-email-asunto');
  const cuerpo = document.getElementById('config-email-cuerpo-editable');
  const btnSave = document.getElementById('btnSaveConfig');
  const vars = document.getElementById('config-email-variable');

  if (!btnOpen || !btnClose || !view || !card) return;

  btnOpen.addEventListener('click', () => { view.style.display = 'block'; card.style.display = 'none'; });
  btnClose.addEventListener('click', () => { view.style.display = 'none'; card.style.display = ''; });

  try {
    await cargarConfiguracion();
  } catch (error) {
    console.warn('⚠️ No se pudo cargar configuración remota, se usa configuración local por defecto.', error.message);
    appConfig = normalizeConfig(getDefaultAppConfig());
    renderConfigView();
    setConfigStatus('Modo local: no se pudo conectar con GAS.', true);
  }

  btnAdd?.addEventListener('click', async () => {
    try {
      const nombre = prompt('Nombre de la nueva categoría/promoción:');
      if (!nombre) return;
      const result = await apiConfigRequest(CONFIG_ACTIONS.ADD, { nombre });
      if (result.status !== 'success') throw new Error(result.message || 'No se pudo crear');
      appConfig = normalizeConfig(result.config);
      renderConfigView(result.categoria?.id);
      rebuildFiltroCategorias();
      setConfigStatus(`Categoría "${nombre}" creada.`);
    } catch (error) {
      setConfigStatus(`Error creando categoría: ${error.message}`, true);
    }
  });

  list?.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-id]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    const categoria = getCategoriaById(id);
    if (!categoria) return;

    try {
      if (action === 'edit') {
        if (CategoriaSystem.isProtectedBaseCategoryId(id)) {
          const nombreNuevo = prompt('Nuevo nombre:', categoria.nombre);
          if (!nombreNuevo || nombreNuevo === categoria.nombre) return;
          setConfigStatus('Las categorías base protegidas no pueden renombrarse.', true);
          return;
        }
        const nombre = prompt('Nuevo nombre:', categoria.nombre);
        if (!nombre || nombre === categoria.nombre) return;
        const res = await apiConfigRequest(CONFIG_ACTIONS.UPDATE, { id, nombre });
        if (res.status !== 'success') throw new Error(res.message || 'No se pudo actualizar');
        appConfig = normalizeConfig(res.config);
        renderConfigView(id);
        rebuildFiltroCategorias();
      } else if (action === 'toggle') {
        const res = await apiConfigRequest(CONFIG_ACTIONS.TOGGLE, { id });
        if (res.status !== 'success') throw new Error(res.message || 'No se pudo cambiar estado');
        appConfig = normalizeConfig(res.config);
        renderConfigView(id);
        rebuildFiltroCategorias();
      } else if (action === 'delete') {
        if (CategoriaSystem.isProtectedBaseCategoryId(id)) {
          throw new Error('No puedes eliminar categorías base protegidas.');
        }
        if (!confirm(`¿Eliminar la categoría "${categoria.nombre}"?`)) return;
        const res = await apiConfigRequest(CONFIG_ACTIONS.DELETE, { id });
        if (res.status !== 'success') throw new Error(res.message || 'No se pudo eliminar');
        appConfig = normalizeConfig(res.config);
        renderConfigView();
        rebuildFiltroCategorias();
      }
    } catch (error) {
      setConfigStatus(`Error en categoría: ${error.message}`, true);
    }
  });

  categoriaSelect?.addEventListener('change', () => renderConfigDetalleCategoria());
  tipo?.addEventListener('change', () => {
    const categoria = getCategoriaById(categoriaSelect.value);
    if (!categoria) return;
    categoria.formulario.tipo = tipo.value;
    renderConfigDetalleCategoria();
  });
  asunto?.addEventListener('input', () => {
    const categoria = getCategoriaById(categoriaSelect.value);
    if (categoria) categoria.email.asunto = asunto.value;
  });
  cuerpo?.addEventListener('input', () => {
    const categoria = getCategoriaById(categoriaSelect.value);
    if (categoria) categoria.email.cuerpo = cuerpo.value;
  });
  document.addEventListener('change', (e) => {
    if (!e.target.classList.contains('config-campo-check')) return;
    const categoria = getCategoriaById(categoriaSelect.value);
    if (!categoria) return;
    categoria.formulario.campos = [...document.querySelectorAll('.config-campo-check:checked')].map(el => el.value);
  });
  vars?.addEventListener('change', () => {
    if (!vars.value || !cuerpo) return;
    cuerpo.value = `${cuerpo.value}${cuerpo.value ? ' ' : ''}${vars.value}`;
    const categoria = getCategoriaById(categoriaSelect.value);
    if (categoria) categoria.email.cuerpo = cuerpo.value;
    vars.value = '';
  });

  btnSave?.addEventListener('click', async () => {
    try {
      setConfigStatus('Guardando...');
      await guardarConfiguracionCompleta();
    } catch (error) {
      setConfigStatus(error.message, true);
    }
  });
}

// ========= INTEGRACIÓN (usar desde tu flujo actual de formularios/emails) =========
function getFormularioConfigByCategoria(categoriaId) {
  const categoria = getCategoriaById(categoriaId);
  if (!categoria) return { tipo: 'standard', campos: [] };
  return categoria.formulario || { tipo: 'standard', campos: [] };
}

function getEmailTemplateByCategoria(categoriaId, payload = {}) {
  const categoria = getCategoriaById(categoriaId);
  const asunto = categoria?.email?.asunto || 'Seguimiento de tu solicitud';
  const editable = categoria?.email?.cuerpo || '';
  const saludo = getEmailPrefix(payload.nombre || '');
  const fullBody = `${saludo}<br><br>${editable}`;
  const htmlBody = fullBody.replace(/\{\{([^}]+)\}\}/g, (_, key) => payload[key.trim()] ?? '');
  return { asunto, cuerpo: htmlBody };
}

// ====================== CARGA DE CONTACTOS ======================
async function cargarContactos(incluirEliminados = false) {
  try {
    const response = await fetch(urlApi);
    
    // Verificar respuesta HTTP antes de parsear JSON
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.status !== 'success') {
      throw new Error(result.message || 'Error al cargar contactos');
    }
    
    let datos = result.data;
    if (!incluirEliminados) {
      datos = datos.filter(contacto => !isEliminado(contacto));
    }
    
    return datos;
  } catch (error) {
    // Mensaje más específico según el tipo de error
    if (error.message.includes('Failed to fetch')) {
      handleError('No se pudo conectar al servidor. Verifica tu conexión o que estés usando un servidor local', error);
    } else {
      handleError('Error al cargar contactos', error);
    }
    throw error;
  }
}
async function cargarYMostrar() {
  try {
    const todosLosDatos = (await cargarContactos(true)).map(prepararContacto);
    originalContactosData = todosLosDatos;
    ordenOriginal = todosLosDatos.map(c => c.ID); // Asegura ordenOriginal
    contactosData = todosLosDatos.reverse(); // Invertir: más reciente primero
    aplicarFiltro();
  } catch (e) {
    console.error('Error en cargarYMostrar:', e);
  }
}
// ====================== FILTROS MEJORADOS ======================
function aplicarFiltro({ resetPage = true } = {}) {
	if (resetPage) paginaActual = 1; // Resetear a página 1
  const filtroSelect = document.getElementById('filtroVivienda');
  const toggleEliminados = document.getElementById('toggleEliminados');
  const toggleViabilidad = document.getElementById('toggleViabilidad');
  
  const filtro = normalizarValorFiltroCategoria(filtroSelect?.value);
  const incluirEliminados = toggleEliminados ? toggleEliminados.checked : false;
  
  // Usar originalContactosData que contiene TODOS los contactos
  let datosBase = incluirEliminados ? originalContactosData : originalContactosData.filter(c => !isEliminado(c));

  // Ocultar contactos de promociones ocultas en ajustes
  datosBase = datosBase.filter(isContactoDeCategoriaActiva);
  
  let contactosFiltrados;
  
  // Filtro por tipo de vivienda
  if (filtro === 'todos') {
    contactosFiltrados = datosBase;
  } else {
    contactosFiltrados = datosBase.filter(c => {
      const categoriaIdDirecta = normalizeString(c?.['categoria-id'] || '');
      if (categoriaIdDirecta && categoriaIdDirecta === normalizeString(filtro)) return true;
      return normalizeString(resolveCategoriaContacto(c)) === normalizeString(filtro);
    });
  }
  
  // Filtro por estudio de viabilidad
  if (toggleViabilidad && toggleViabilidad.checked) {
    contactosFiltrados = contactosFiltrados.filter(c => {
      const estudioValor = normalizeString(c['estudio-viabilidad'] || '');
      return estudioValor === 'si' || estudioValor === 'sí';
    });
  }

  const queryNormalizada = normalizeString(searchQuery).replace(/[^a-z0-9]+/g, '');
  if (queryNormalizada) {
    contactosFiltrados = contactosFiltrados.filter(c => coincideBusquedaContacto(c, queryNormalizada));
  }
  
  // --- INICIO DE LA MODIFICACIÓN ---

// RE-APLICAR ORDENAMIENTO ACTIVO
// Primero, comprobar si hay un ordenamiento cíclico activo
let activeSortKey = null;
let activeSortState = 0;
for (const key in estadosOrden) {
  if (estadosOrden[key] !== 0) {
    activeSortKey = key;
    activeSortState = estadosOrden[key];
    break;
  }
}

if (activeSortKey) {
  // Re-aplicar ordenamiento CÍCLICO
  console.log(`Aplicando filtro y re-ordenando por ${activeSortKey}, estado ${activeSortState}`);
  const obtenerValor = (contacto) => {
    if (activeSortKey === 'your-name') return normalizeString(contacto[activeSortKey] || '');
    const valor = normalizeString(contacto[activeSortKey] || '');
    if (activeSortKey === 'documentacion' || activeSortKey === 'Llamado' || activeSortKey === 'Respondido') {
      return valor === 'si' ? 1 : 0;
    }
    return 0;
  };

  if (activeSortState === 1) { // Estado 1 (Doc=SI, Nombre=A-Z, Otros=NO)
    if (activeSortKey === 'documentacion') {
      contactosFiltrados.sort((a, b) => obtenerValor(b) - obtenerValor(a)); // SI arriba
    } else if (activeSortKey === 'your-name') {
      contactosFiltrados.sort((a, b) => obtenerValor(a).localeCompare(obtenerValor(b))); // A-Z
    } else {
      contactosFiltrados.sort((a, b) => obtenerValor(a) - obtenerValor(b)); // NO arriba
    }
  } else if (activeSortState === 2) { // Estado 2 (Doc=NO, Nombre=Z-A, Otros=SI)
    if (activeSortKey === 'documentacion') {
      contactosFiltrados.sort((a, b) => obtenerValor(a) - obtenerValor(b)); // NO arriba
    } else if (activeSortKey === 'your-name') {
      contactosFiltrados.sort((a, b) => obtenerValor(b).localeCompare(obtenerValor(a))); // Z-A
    } else {
      contactosFiltrados.sort((a, b) => obtenerValor(b) - obtenerValor(a)); // SI arriba
    }
  }
  // Si el estado es 0, no se re-ordena (se mantiene el orden original filtrado)

} else if (sortColumn) {
  // Re-aplicar ordenamiento 'sortable' (flechas)
  console.log(`Aplicando filtro y re-ordenando por ${sortColumn} ${sortDirection === 1 ? 'ASC' : 'DESC'}`);
  contactosFiltrados.sort((a, b) => {
    let valA = a[sortColumn] || '';
    let valB = b[sortColumn] || '';
    if (sortColumn === 'FechaSeguimiento') {
      valA = valA ? new Date(valA).getTime() : 0;
      valB = valB ? new Date(valB).getTime() : 0;
    } else if (sortColumn === 'Prioridad') {
      const order = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
      const prioridadA = normalizarPrioridad(valA);
      const prioridadB = normalizarPrioridad(valB);
      valA = order[prioridadA] || 0;
      valB = order[prioridadB] || 0;
    } else if (sortColumn === 'Estado') {
      const orderEstado = { 'Sin Llamar': 1, 'Llamado': 2, 'Respondido': 3 };
      valA = orderEstado[valA] || 0;
      valB = orderEstado[valB] || 0;
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }
    return (valA < valB ? -1 : valA > valB ? 1 : 0) * sortDirection;
  });
}

// FIN DE LA MODIFICACIÓN

contactosData = contactosFiltrados;
mostrarContactos(contactosFiltrados);
actualizarBadgeRecordatorios(contactosFiltrados);

// RESTAURAR INDICADORES VISUALES
if (activeSortKey) {
  actualizarIndicadoresOrden(activeSortKey, activeSortState);
} else if (sortColumn) {
  document.querySelectorAll('.sortable').forEach(t => t.innerHTML = t.innerHTML.replace(' ↑','').replace(' ↓',''));
  const th = document.querySelector(`th[data-sort="${sortColumn}"]`);
  if (th) th.innerHTML += sortDirection === 1 ? ' ↑' : ' ↓';
}
}

// 🔹 NUEVO: Toggle filtro estudio de viabilidad
function toggleFiltroViabilidad() {
  const toggle = document.getElementById('toggleViabilidad');
  filtroViabilidadActivo = toggle && toggle.checked;
  aplicarFiltro();
}





// Función centralizada para manejo de errores
function handleError(message, error) {
  console.error(`${message}:`, error);
  // Puedes agregar alertas o logs a un servicio externo aquí
  alert(`${message}: ${error.message}`);
}
// ====================== DOMContentLoaded CORREGIDO ======================
document.addEventListener('DOMContentLoaded', async () => {
  inicializarBtnAjustes();
  try {
    await cargarConfiguracion();
  } catch (error) {
    console.warn('⚠️ No se pudo cargar la configuración remota. Se usa fallback local.', error?.message || error);
    appConfig = normalizeConfig(getDefaultAppConfig());
    rebuildFiltroCategorias();
  }
  cargarYMostrar();
  // Controles de eliminados
  const { toggleEliminados } = agregarControlEliminados();
if (toggleEliminados) {
  toggleEliminados.addEventListener('change', function() {
    aplicarFiltro(); // Esto ahora funcionará correctamente
  });
}

// 🔹 NUEVO: Listener para filtro de viabilidad
const toggleViabilidad = document.getElementById('toggleViabilidad');
if (toggleViabilidad) {
  toggleViabilidad.addEventListener('change', toggleFiltroViabilidad);
}

const thDocumentacion = document.querySelector('.filtrable-doc');
if (thDocumentacion) {
  thDocumentacion.addEventListener('click', (e) => {
    e.stopPropagation();
    ordenarCiclico('documentacion');
  });
}

// Ordenación cíclica para Llamado
const thLlamado = document.querySelector('th[data-sort="Llamado"]');
if (thLlamado) {
  thLlamado.addEventListener('click', (e) => {
    e.stopPropagation();
    ordenarCiclico('Llamado');
  });
}

// Ordenación cíclica para Respondido
const thRespondido = document.querySelector('th[data-sort="Respondido"]');
if (thRespondido) {
  thRespondido.addEventListener('click', (e) => {
    e.stopPropagation();
    ordenarCiclico('Respondido');
  });
}

// Ordenación cíclica para Nombre
const thNombre = document.querySelector('th[data-sort="your-name"]');
if (thNombre) {
  thNombre.addEventListener('click', (e) => {
    e.stopPropagation();
    ordenarCiclico('your-name');
  });
}

  // Botón Crear Ficha
  inicializarBtnCrearFicha();
   inicializarBtnDashboard();
  // Notificaciones
  const bell = document.querySelector('.notification-bell');
  if (bell) {
    bell.addEventListener('click', () => {
      // Reset índices y contadores al abrir panel
      notificacionesPendientesIndex = 0;
      notificacionesProximasIndex = 0;
      notificacionesPendientesTotalMostradas = 0;
      notificacionesProximasTotalMostradas = 0;
      
      if (tabUpcoming && tabDue) {
        tabUpcoming.classList.add('active', 'btn-outline-primary');
        tabUpcoming.classList.remove('btn-outline-secondary');
        tabDue.classList.remove('active', 'btn-outline-primary');
        tabDue.classList.add('btn-outline-secondary');
      }
      construirListaNotificaciones(contactosData, 'upcoming');
      togglePanelNotificaciones();
    });
  }
  const overlay = document.getElementById('overlayNotificaciones');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      const panel = document.getElementById('panelNotificaciones');
      if (!panel) return togglePanelNotificaciones(false);
      if (!panel.contains(e.target)) togglePanelNotificaciones(false);
    });
  }
  // Tabs de notificaciones
  const tabDue = document.getElementById('tabDue');
  const tabUpcoming = document.getElementById('tabUpcoming');
  if (tabDue && tabUpcoming) {
    tabDue.addEventListener('click', () => {
      // Reset índices y contadores al cambiar de pestaña
      notificacionesPendientesIndex = 0;
      notificacionesPendientesTotalMostradas = 0;
      
      tabDue.classList.add('active', 'btn-outline-primary');
      tabDue.classList.remove('btn-outline-secondary');
      tabUpcoming.classList.remove('active', 'btn-outline-primary');
      tabUpcoming.classList.add('btn-outline-secondary');
      construirListaNotificaciones(contactosData, 'due');
    });
    
    tabUpcoming.addEventListener('click', () => {
      // Reset índices y contadores al cambiar de pestaña
      notificacionesProximasIndex = 0;
      notificacionesProximasTotalMostradas = 0;
      
      tabUpcoming.classList.add('active', 'btn-outline-primary');
      tabUpcoming.classList.remove('btn-outline-secondary');
      tabDue.classList.remove('active', 'btn-outline-primary');
      tabDue.classList.add('btn-outline-secondary');
      construirListaNotificaciones(contactosData, 'upcoming');
    });
  }
 // 2. Reemplazar el listener del buscador en el bloque document.addEventListener('DOMContentLoaded', ...)
const buscador = document.getElementById("buscador");
if (buscador) {
  buscador.addEventListener("input", function () {
    searchQuery = this.value;
    if (searchDebounceId) {
      clearTimeout(searchDebounceId);
    }
    searchDebounceId = setTimeout(() => {
      aplicarFiltro({ resetPage: true });
      searchDebounceId = null;
    }, 200);
  });
}
  // Filtro select
  const filtroSelect = document.getElementById('filtroVivienda');
  if (filtroSelect) filtroSelect.addEventListener('change', aplicarFiltro);
  // Ordenamiento columnas
  document.querySelectorAll('.sortable').forEach(th => {
    th.addEventListener('click', () => {
		if (th.classList.contains('filtrable-doc')) return;
		paginaActual = 1; // Resetear a página 1 al ordenar
		// Resetear el sistema de orden cíclico
Object.keys(estadosOrden).forEach(key => estadosOrden[key] = 0);
actualizarIndicadoresOrden(null, 0); // Limpia indicadores cíclicos
      const column = th.dataset.sort;
      if (sortColumn === column) sortDirection *= -1;
      else { sortColumn = column; sortDirection = 1; }
      aplicarFiltro({ resetPage: true });
    });
  });
  // Spinner CSS
  const spinnerCSS = document.createElement('style');
  spinnerCSS.textContent = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `;
  document.head.appendChild(spinnerCSS);
  // Detalles expandibles con delegación de eventos
  const tbody = document.querySelector('#tabla-contactos tbody');
  if (tbody) {
    tbody.addEventListener('click', function(event) {
      const btn = event.target.closest('button[data-toggle="detalle"]');
      if (!btn) return;
      event.preventDefault();
      const filas = this.querySelectorAll('tr');
      const idx = parseInt(btn.dataset.idx, 10);
      const filaDetalle = filas[idx * 2 + 1];
      if (!filaDetalle) return;
      const estiloActual = window.getComputedStyle(filaDetalle).display;
      filas.forEach((tr, i) => {
        if (i % 2 === 1 && tr !== filaDetalle) {
          tr.style.display = 'none';
          const btnAnterior = filas[i - 1].querySelector('button[data-toggle="detalle"]');
          if (btnAnterior) {
            btnAnterior.classList.remove('abierto');
            btnAnterior.querySelector('span').textContent = '▼';
            btnAnterior.setAttribute('aria-expanded', 'false');
          }
        }
      });
      if (estiloActual === 'none') {
        filaDetalle.style.display = 'table-row';
        btn.classList.add('abierto');
        btn.querySelector('span').textContent = '▲';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        filaDetalle.style.display = 'none';
        btn.classList.remove('abierto');
        btn.querySelector('span').textContent = '▼';
        btn.setAttribute('aria-expanded', 'false');
      }
    });
	
	window.addEventListener('message', (event) => {
  console.log('Mensaje recibido en script.js:', event.data);
  if (event.data.action === 'recargarTabla') {
    cargarYMostrar();
  }
});
	
  }
});

// === BOTÓN SCROLL ARRIBA / ABAJO ===
const scrollBtn = document.createElement('button');
scrollBtn.className = 'scroll-top-btn';
scrollBtn.innerHTML = `
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
    <path d="M5 15l7-7 7 7"/>
  </svg>
`;
document.body.appendChild(scrollBtn);

function updateScrollBtn() {
  const scrollY = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  // Si no hay suficiente scroll, ocultar el botón
  if (maxScroll < 400) {
    scrollBtn.style.opacity = '0';
    scrollBtn.style.pointerEvents = 'none';
    return;
  }

  // Mostrar el botón si hay desplazamiento
  scrollBtn.style.opacity = '1';
  scrollBtn.style.pointerEvents = 'auto';

  const svg = scrollBtn.querySelector('svg');

  // 🔹 Cambia la dirección más tarde (70% del scroll)
  if (scrollY < maxScroll * 0.7) {
    scrollBtn.dataset.direction = 'down';
    svg.style.transform = 'rotate(180deg)'; // flecha hacia abajo
  } else {
    scrollBtn.dataset.direction = 'up';
    svg.style.transform = 'rotate(0deg)'; // flecha hacia arriba
  }
}

scrollBtn.addEventListener('click', () => {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

  if (scrollBtn.dataset.direction === 'down') {
    // 🔹 Baja al fondo de la página
    window.scrollTo({ top: maxScroll, behavior: 'smooth' });
  } else {
    // 🔹 Sube al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
});

// Escuchar scroll y resize con rendimiento óptimo
let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      updateScrollBtn();
      ticking = false;
    });
    ticking = true;
  }
});

window.addEventListener('resize', updateScrollBtn);
setTimeout(updateScrollBtn, 500);



// === SCROLL ARRIBA AL HACER CLIC EN "CONTACTOS RECIBIDOS" ===
const contactosTitle = document.querySelector('#navbar-center-title');

if (contactosTitle) {
  contactosTitle.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
/**
 * Reordena eficientemente el DOM del tbody basándose en el orden
 * del array global 'contactosData', sin recrear elementos.
 */
function reordenarDOM() {
  const tbody = document.querySelector('#tabla-contactos tbody');
  if (!tbody) return;

  const fragment = document.createDocumentFragment();
  
  // Crear un mapa de ID -> Fila Principal (tr)
  const rowMap = new Map();
  tbody.querySelectorAll('tr:not(.fila-detalle)').forEach(tr => {
    if (tr.dataset.id) {
      rowMap.set(tr.dataset.id, tr);
    }
  });

  // Iterar sobre el array 'contactosData' (que YA está ordenado)
  contactosData.forEach(contacto => {
    const tr = rowMap.get(contacto.ID);
    if (tr) {
      // Mover la fila principal
      fragment.appendChild(tr);
      
      // Mover su fila de detalle (si existe y es la siguiente)
      const trDetalle = tr.nextElementSibling;
      if (trDetalle && trDetalle.classList.contains('fila-detalle')) {
        fragment.appendChild(trDetalle);
      }
    }
  });
  
  // Limpiar y añadir el fragmento ordenado de una sola vez
  tbody.innerHTML = '';
  tbody.appendChild(fragment);
}