const urlApi = 'https://script.google.com/macros/s/AKfycbzhw3QMxMyVBuSzbabj8wPc5hm5X75AODXqz7Kn737rn46G670fl844EWLhy0G13bc/exec';
const EMAIL_PREFIX_LOCKED = 'Buenos días/tardes {{nombre}},';
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

const FORM_TIPO_DESC = {
  standard: 'Formulario completo con todos los campos disponibles: ubicación del terreno, referencia catastral, número de plantas, superficies, presupuesto y más. Recomendado para promociones de vivienda estándar.',
  compact: 'Formulario corto que recoge solo la información básica del contacto. Incluye además el campo "Vivienda interesada", que debes personalizar con las opciones disponibles en el apartado de abajo.',
  custom: 'Permite elegir exactamente qué campos adicionales se mostrarán en el formulario.'
};
const DETAIL_TIPO_DESC = {
  standard: 'Muestra el detalle estándar por defecto.',
  custom: 'Permite elegir exactamente qué campos se verán en “Detalles del contacto”.'
};

const ACTIONS = {
  GET: 'getConfig',
  SAVE: 'saveConfig',
  ADD: 'addCategoria',
  UPDATE: 'updateCategoria',
  DELETE: 'deleteCategoria',
  TOGGLE: 'toggleCategoria'
};

let appConfig = CategoriaSystem.getDefaultAppConfig();
let currentEditId = null;
let isCreating = false;
let viviendaOpcionesDraft = [];

const normalizeConfig = (config) => CategoriaSystem.normalizeConfig(config);
const isCategoriaActiva = (value) => {
  if (typeof value === 'boolean') return value;
  const normalized = CategoriaSystem.normalizeString(value || '');
  return !['false', '0', 'no', 'oculta', 'inactiva', 'off'].includes(normalized);
};

function parseConfigPayload(configPayload) {
  if (!configPayload) return null;
  if (typeof configPayload === 'string') {
    try {
      return JSON.parse(configPayload);
    } catch (_) {
      return null;
    }
  }
  if (typeof configPayload === 'object') return configPayload;
  return null;
}

function getCategoriaCamposSet(categoria) {
  return new Set((categoria?.formulario?.campos || []).map(v => String(v || '').trim()).filter(Boolean));
}

function getCategoriaDetalleConfig(categoria) {
  const fromTop = categoria?.detalle || null;
  const fromFormulario = categoria?.formulario?.detalle || null;
  const detalle = fromTop || fromFormulario || {};
  return {
    tipo: detalle?.tipo === 'custom' ? 'custom' : 'standard',
    campos: Array.isArray(detalle?.campos) ? detalle.campos.map(v => String(v || '').trim()).filter(Boolean) : []
  };
}

function isFieldFilledValue(value) {
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim();
  return normalized !== '' && normalized !== '—';
}

function contactoPerteneceACategoria(config, contacto, categoriaId) {
  const categoriaDirecta = CategoriaSystem.normalizeString(contacto?.['categoria-id'] || contacto?.categoriaId || contacto?.categoria_id);
  if (categoriaDirecta && categoriaDirecta === CategoriaSystem.normalizeString(categoriaId)) return true;
  const categoriaResuelta = CategoriaSystem.resolveCategoria(config, contacto);
  return categoriaResuelta?.id === categoriaId;
}

async function cargarTodasLasFichas() {
  const response = await fetch(urlApi);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(result.message || 'No se pudieron cargar las fichas');
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function guardarCamposVaciosEnFicha(id, fields = []) {
  if (!id || !Array.isArray(fields) || fields.length === 0) return;
  const payload = new URLSearchParams({
    action: 'saveFormData',
    ID: id
  });
  fields.forEach(field => payload.append(field, ''));
  const response = await fetch(urlApi, {
    method: 'POST',
    body: payload
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();
  if (result.status !== 'success') {
    throw new Error(result.message || 'No se pudo actualizar una ficha existente');
  }
}

async function validarYSincronizarCambioCamposCategoria(configActual, categoriaId, camposAnteriores, camposNuevos) {
  const addedFields = [...camposNuevos].filter(field => !camposAnteriores.has(field));
  const removedFields = [...camposAnteriores].filter(field => !camposNuevos.has(field));
  if (!addedFields.length && !removedFields.length) return;

  const todasLasFichas = await cargarTodasLasFichas();
  const fichasCategoria = todasLasFichas.filter(contacto => contactoPerteneceACategoria(configActual, contacto, categoriaId));

  if (removedFields.length > 0) {
    for (const field of removedFields) {
      const fichaConValor = fichasCategoria.find(contacto => isFieldFilledValue(contacto?.[field]));
      if (fichaConValor) {
        throw new Error(`No se puede quitar el campo "${getFieldLabel(field)}" porque está relleno en alguna ficha.`);
      }
    }
  }

  if (addedFields.length > 0) {
    for (const ficha of fichasCategoria) {
      const id = ficha?.ID || ficha?.id;
      if (!id) continue;
      const camposFaltantes = addedFields.filter(field => ficha?.[field] === undefined || ficha?.[field] === null);
      if (camposFaltantes.length === 0) continue;
      await guardarCamposVaciosEnFicha(id, camposFaltantes);
    }
  }
}

async function apiRequest(action, payload = {}, method = 'POST') {
  if (method === 'GET') {
    const response = await fetch(`${urlApi}?action=${encodeURIComponent(action)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  const response = await fetch(urlApi, {
    method: 'POST',
    body: new URLSearchParams({ action, ...payload })
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setStatus(message, isError = false) {
  const status = document.getElementById('status-msg');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#dc2626' : '#64748b';
}

function getEmailEditorElement() {
  return document.getElementById('edit-email-cuerpo');
}

function setEmailEditorHtml(value = '') {
  const editor = getEmailEditorElement();
  if (!editor) return;
  editor.innerHTML = String(value || '').trim() ? String(value) : '';
}

function getEmailEditorHtml() {
  const editor = getEmailEditorElement();
  if (!editor) return '';
  return editor.innerHTML.trim();
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function insertHtmlInEmailEditor(html) {
  const editor = getEmailEditorElement();
  if (!editor) return;
  editor.focus();

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    editor.innerHTML += html;
    return;
  }

  const range = selection.getRangeAt(0);
  const isInsideEditor = editor.contains(range.commonAncestorContainer);
  if (!isInsideEditor) {
    editor.innerHTML += html;
    return;
  }

  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastNode = fragment.lastChild;
  range.insertNode(fragment);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.setEndAfter(lastNode);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function execEmailEditorCommand(command) {
  const editor = getEmailEditorElement();
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, null);
  updateEmailToolbarState();
}

function insertEmailEditorLink() {
  const editor = getEmailEditorElement();
  if (!editor) return;
  const selectedText = window.getSelection()?.toString()?.trim() || '';
  const url = prompt('Introduce la URL del enlace (ejemplo: https://...):', 'https://');
  if (!url) return;
  const href = url.trim();
  if (!href) return;
  const text = selectedText || href;
  insertHtmlInEmailEditor(`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`);
  updateEmailToolbarState();
}

function updateEmailToolbarState() {
  const editor = getEmailEditorElement();
  const toolbar = document.querySelector('.email-editor-toolbar');
  if (!editor || !toolbar) return;
  const selection = window.getSelection();
  const hasSelectionInEditor = selection && selection.rangeCount > 0 && editor.contains(selection.anchorNode);
  const cmdButtons = [...toolbar.querySelectorAll('button[data-email-cmd]')];
  cmdButtons.forEach((button) => {
    const cmd = button.dataset.emailCmd;
    const isActive = hasSelectionInEditor ? document.queryCommandState(cmd) : false;
    button.classList.toggle('active', Boolean(isActive));
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function renderCategorias() {
  const list = document.getElementById('categorias-list');
  if (!list) return;

  list.innerHTML = '';
  appConfig.categorias.forEach(cat => {
    const tipoFormulario = cat.formulario?.tipo || 'standard';
    const camposCount = Array.isArray(cat.formulario?.campos) ? cat.formulario.campos.length : 0;
    const row = document.createElement('div');
    const categoriaActiva = isCategoriaActiva(cat.activa);
    row.className = `categoria-item ${categoriaActiva ? '' : 'oculta'}`;
    row.innerHTML = `
      <div>
        <div class="fw-semibold">${cat.nombre}</div>
        <div class="small text-muted">
          <span class="categoria-badge ${categoriaActiva ? '' : 'off'}">${categoriaActiva ? 'Activa' : 'Oculta'}</span>
          · Formulario: ${tipoFormulario}
          · Campos: ${camposCount}
        </div>
      </div>
      <div class="categoria-actions">
        <button class="btn btn-outline-secondary btn-sm" data-action="edit" data-id="${cat.id}">✏️</button>
        <button class="btn btn-outline-warning btn-sm" data-action="toggle" data-id="${cat.id}" title="${categoriaActiva ? 'Ocultar promoción' : 'Mostrar promoción'}">${categoriaActiva ? '👁️' : '🙈'}</button>
        <button class="btn btn-outline-danger btn-sm" data-action="delete" data-id="${cat.id}">🗑️</button>
      </div>
    `;
    list.appendChild(row);
  });
}

function fillVariableSelector() {
  const sel = document.getElementById('edit-email-variable');
  if (!sel) return;
  sel.innerHTML = '<option value="">Insertar variable…</option>';
  AVAILABLE_FORM_FIELDS.forEach(field => {
    const opt = document.createElement('option');
    opt.value = `{{${field}}}`;
    opt.textContent = `${getFieldLabel(field)} ({{${field}}})`;
    sel.appendChild(opt);
  });
}

function renderCustomFields(selected = []) {
  const box = document.getElementById('campos-disponibles');
  if (!box) return;
  box.innerHTML = `<div class="small text-muted mb-2">Siempre incluidos (no configurables): ${ALWAYS_INCLUDED_FIELDS.map(getFieldLabel).join(', ')}</div>`;
  AVAILABLE_FORM_FIELDS.forEach(field => {
    const checked = selected.includes(field) ? 'checked' : '';
    const line = document.createElement('label');
    line.className = 'form-check d-flex align-items-center gap-2';
    line.innerHTML = `<input class="form-check-input edit-campo" type="checkbox" value="${field}" ${checked}><span class="small">${getFieldLabel(field)}</span>`;
    box.appendChild(line);
  });
  toggleViviendaOpcionesEditor(selected.includes('vivienda-interesada'));
}

function renderDetalleFields(selected = []) {
  const formTipo = document.getElementById('edit-form-tipo')?.value || 'standard';
  const checkedCamposFormulario = [...document.querySelectorAll('.edit-campo:checked')].map(el => el.value);
  const detalleDisponibles = getDetalleCamposDisponiblesPorFormulario(formTipo, checkedCamposFormulario);
  const box = document.getElementById('detalle-campos-disponibles');
  if (!box) return;
  box.innerHTML = '';
  const selectedSet = new Set(selected.filter(field => detalleDisponibles.includes(field)));
  detalleDisponibles.forEach(field => {
    const checked = selectedSet.has(field) ? 'checked' : '';
    const line = document.createElement('label');
    line.className = 'form-check d-flex align-items-center gap-2';
    line.innerHTML = `<input class="form-check-input edit-detalle-campo" type="checkbox" value="${field}" ${checked}><span class="small">${getFieldLabel(field)}</span>`;
    box.appendChild(line);
  });
}

function getDetalleCamposDisponiblesPorFormulario(formTipo, checkedCamposFormulario = []) {
  if (formTipo === 'standard') {
    return [...new Set([...ALWAYS_INCLUDED_FIELDS, ...AVAILABLE_FORM_FIELDS])];
  }
  return [...new Set([...ALWAYS_INCLUDED_FIELDS, ...checkedCamposFormulario])];
}

function rerenderDetalleFieldsManteniendoSeleccion() {
  const selectedActuales = [...document.querySelectorAll('.edit-detalle-campo:checked')].map(el => el.value);
  renderDetalleFields(selectedActuales);
}

function renderViviendaOpcionesList() {
  const box = document.getElementById('vivienda-opciones-list');
  if (!box) return;
  box.innerHTML = '';
  viviendaOpcionesDraft.forEach((opcion, idx) => {
    const pill = document.createElement('span');
    pill.className = 'badge bg-light text-dark border d-inline-flex align-items-center gap-1';
    pill.innerHTML = `${opcion} <button type="button" class="btn btn-sm p-0 border-0 text-danger" data-remove-vivienda="${idx}" aria-label="Quitar opción">×</button>`;
    box.appendChild(pill);
  });
}

function toggleViviendaOpcionesEditor(show) {
  const wrap = document.getElementById('vivienda-opciones-wrap');
  if (!wrap) return;
  wrap.style.display = show ? 'block' : 'none';
}

function updateFormTipoUI(tipo) {
  const customWrap = document.getElementById('edit-custom-fields');
  const camposDisponibles = document.getElementById('campos-disponibles');
  const viviendaWrap = document.getElementById('vivienda-opciones-wrap');
  const desc = document.getElementById('edit-form-tipo-desc');

  if (desc) desc.textContent = FORM_TIPO_DESC[tipo] || '';

  if (!customWrap) return;

  if (tipo === 'standard') {
    customWrap.style.display = 'none';
    if (viviendaWrap) viviendaWrap.style.display = 'none';
  } else if (tipo === 'compact') {
    customWrap.style.display = 'block';
    if (camposDisponibles) camposDisponibles.style.display = 'none';
    if (viviendaWrap) viviendaWrap.style.display = 'block';
  } else {
    // custom
    customWrap.style.display = 'block';
    if (camposDisponibles) camposDisponibles.style.display = 'block';
    // viviendaWrap visibility controlled by checkbox state
    const checked = [...document.querySelectorAll('.edit-campo:checked')].map(el => el.value);
    toggleViviendaOpcionesEditor(checked.includes('vivienda-interesada'));
  }
}

function updateDetalleTipoUI(tipo) {
  const desc = document.getElementById('edit-detalle-tipo-desc');
  const wrap = document.getElementById('edit-detalle-fields-wrap');
  if (desc) desc.textContent = DETAIL_TIPO_DESC[tipo] || '';
  if (!wrap) return;
  wrap.style.display = tipo === 'custom' ? 'block' : 'none';
}

function openEditor(categoria = null) {
  const card = document.getElementById('editor-card');
  const title = document.getElementById('editor-title');
  const nombre = document.getElementById('edit-nombre');
  const activa = document.getElementById('edit-activa');
  const formTipo = document.getElementById('edit-form-tipo');
  const asunto = document.getElementById('edit-email-asunto');
  const emailRecordatorio = document.getElementById('edit-email-recordatorio');
  const cuerpo = document.getElementById('edit-email-cuerpo');
  const detalleTipo = document.getElementById('edit-detalle-tipo');
  const customWrap = document.getElementById('edit-custom-fields');

  if (!card || !title || !nombre || !activa || !formTipo || !asunto || !emailRecordatorio || !cuerpo || !detalleTipo || !customWrap) return;

  card.style.display = 'block';
  fillVariableSelector();

  if (!categoria) {
    isCreating = true;
    currentEditId = null;
    title.textContent = 'Crear nueva promoción/categoría';
    nombre.value = '';
    activa.value = 'true';
    formTipo.value = 'standard';
    asunto.value = '';
    emailRecordatorio.value = '';
    setEmailEditorHtml('');
    detalleTipo.value = 'standard';
    viviendaOpcionesDraft = [];
    renderCustomFields([]);
    renderDetalleFields([]);
    renderViviendaOpcionesList();
    updateFormTipoUI('standard');
    updateDetalleTipoUI('standard');
    updateEmailToolbarState();
    setStatus('');
    return;
  }

  isCreating = false;
  currentEditId = categoria.id;
  title.textContent = `Editar: ${categoria.nombre}`;
  nombre.value = categoria.nombre;
  activa.value = isCategoriaActiva(categoria.activa) ? 'true' : 'false';
  formTipo.value = categoria.formulario?.tipo || 'standard';
  asunto.value = categoria.email?.asunto || '';
  emailRecordatorio.value = categoria.email?.recordatorio || '';
  setEmailEditorHtml(categoria.email?.cuerpo || '');
  const detalleConfig = getCategoriaDetalleConfig(categoria);
  detalleTipo.value = detalleConfig.tipo;
  viviendaOpcionesDraft = Array.isArray(categoria.formulario?.viviendaInteresadaOpciones)
    ? categoria.formulario.viviendaInteresadaOpciones.map(v => String(v || '').trim()).filter(Boolean)
    : [];
  renderCustomFields(categoria.formulario?.campos || []);
  renderDetalleFields(detalleConfig.campos || []);
  renderViviendaOpcionesList();
  updateFormTipoUI(formTipo.value);
  updateDetalleTipoUI(detalleTipo.value);
  updateEmailToolbarState();
  setStatus('');
}

function isProtectedCategory(categoriaId) {
  return CategoriaSystem.isProtectedBaseCategoryId(categoriaId);
}

function closeEditor() {
  const card = document.getElementById('editor-card');
  if (card) card.style.display = 'none';
  currentEditId = null;
  isCreating = false;
}

function collectEditorValues() {
  const nombre = document.getElementById('edit-nombre')?.value.trim() || '';
  const activa = document.getElementById('edit-activa')?.value === 'true';
  const rawTipo = document.getElementById('edit-form-tipo')?.value || 'standard';
  const checkedCampos = [...document.querySelectorAll('.edit-campo:checked')].map(el => el.value);
  const tipoBase = rawTipo === 'custom' || rawTipo === 'compact' ? rawTipo : 'standard';
  const tipo = tipoBase === 'standard' && checkedCampos.length > 0 ? 'custom' : tipoBase;
  const asunto = document.getElementById('edit-email-asunto')?.value || '';
  const recordatorio = document.getElementById('edit-email-recordatorio')?.value.trim() || '';
  const cuerpo = getEmailEditorHtml();
  const detalleTipoRaw = document.getElementById('edit-detalle-tipo')?.value || 'standard';
  const checkedDetalleCampos = [...document.querySelectorAll('.edit-detalle-campo:checked')].map(el => el.value);
  const campos = tipo === 'custom' ? checkedCampos : [];
  const detalle = {
    tipo: detalleTipoRaw === 'custom' ? 'custom' : 'standard',
    campos: detalleTipoRaw === 'custom' ? checkedDetalleCampos : []
  };
  const viviendaInteresadaOpciones = checkedCampos.includes('vivienda-interesada')
    ? [...new Set(viviendaOpcionesDraft.map(v => String(v || '').trim()).filter(Boolean))]
    : [];

  return {
    nombre,
    activa,
    formulario: { tipo, campos, viviendaInteresadaOpciones, detalle },
    detalle,
    email: { asunto, cuerpo, recordatorio }
  };
}

async function cargarConfiguracion() {
  const res = await apiRequest(ACTIONS.GET, {}, 'GET');
  if (res.status !== 'success') throw new Error(res.message || 'No se pudo cargar configuración');
  appConfig = normalizeConfig(res.config || CategoriaSystem.getDefaultAppConfig());
  renderCategorias();
}

async function guardarConfigCompleta() {
  const res = await apiRequest(ACTIONS.SAVE, { config: JSON.stringify(appConfig) });
  if (res.status !== 'success') throw new Error(res.message || 'No se pudo guardar');
}

function applyConfigFromResponse(res) {
  const configFromResponse = parseConfigPayload(res?.config);
  if (!configFromResponse) return false;
  appConfig = normalizeConfig(configFromResponse);
  renderCategorias();
  return true;
}

async function asegurarEstadoActivoCategoria(categoriaId, activaEsperada) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const categoria = appConfig.categorias.find(c => c.id === categoriaId);
    const activaActual = isCategoriaActiva(categoria?.activa);
    if (activaActual === activaEsperada) return;

    const res = await apiRequest(ACTIONS.TOGGLE, { id: categoriaId });
    if (res.status !== 'success') {
      throw new Error(res.message || 'No se pudo actualizar visibilidad');
    }

    if (!applyConfigFromResponse(res)) {
      await cargarConfiguracion();
    }
  }

  const categoriaFinal = appConfig.categorias.find(c => c.id === categoriaId);
  if (isCategoriaActiva(categoriaFinal?.activa) !== activaEsperada) {
    throw new Error('No se pudo guardar el estado de visibilidad.');
  }
}

async function guardarEdicionActual() {
  const data = collectEditorValues();
  if (!data.nombre) throw new Error('El nombre es obligatorio');

  if (isCreating) {
    const previousIds = new Set((appConfig.categorias || []).map(c => c.id));
    const created = await apiRequest(ACTIONS.ADD, { nombre: data.nombre });
    if (created.status !== 'success') throw new Error(created.message || 'No se pudo crear');

    const createdConfig = parseConfigPayload(created.config);
    if (createdConfig) {
      appConfig = normalizeConfig(createdConfig);
    } else {
      await cargarConfiguracion();
    }

    const normalizeText = (value) => CategoriaSystem.normalizeString(value || '');
    const explicitId = created.categoria?.id || created.categoriaId || created.id || '';

    let target = explicitId
      ? appConfig.categorias.find(c => c.id === explicitId)
      : null;

    if (!target) {
      target = appConfig.categorias.find(c => !previousIds.has(c.id));
    }

    if (!target) {
      target = appConfig.categorias.find(c => normalizeText(c.nombre) === normalizeText(data.nombre));
    }

    if (!target) throw new Error('No se encontró la categoría creada');

    target.nombre = data.nombre;
    target.activa = data.activa;
    target.formulario = data.formulario;
    target.detalle = data.detalle;
    target.email = data.email;

    await guardarConfigCompleta();
    await cargarConfiguracion();
    await asegurarEstadoActivoCategoria(target.id, data.activa);
    closeEditor();
    setStatus('Categoría creada y configurada correctamente.');
    return;
  }

  const target = appConfig.categorias.find(c => c.id === currentEditId);
  if (!target) throw new Error('Categoría no encontrada');

  if (isProtectedCategory(target.id) && data.nombre !== target.nombre) {
    throw new Error('Las categorías base protegidas no pueden renombrarse.');
  }

  const camposAnteriores = getCategoriaCamposSet(target);
  const camposNuevos = getCategoriaCamposSet(data);
  await validarYSincronizarCambioCamposCategoria(appConfig, target.id, camposAnteriores, camposNuevos);

  target.nombre = data.nombre;
  target.activa = data.activa;
  target.formulario = data.formulario;
  target.detalle = data.detalle;
  target.email = data.email;

  const updatePayload = {
    id: target.id,
    categoria: JSON.stringify({
      nombre: target.nombre,
      activa: target.activa,
      formulario: target.formulario,
      detalle: target.detalle,
      email: target.email
    })
  };
  await apiRequest(ACTIONS.UPDATE, updatePayload).catch(() => null);
  // Guardamos siempre la configuración completa para no perder propiedades
  // nuevas (por ejemplo `detalle`) en backends que aún no las persisten en updateCategoria.
  await guardarConfigCompleta();
  await cargarConfiguracion();
  await asegurarEstadoActivoCategoria(target.id, data.activa);
  closeEditor();
  setStatus('Categoría actualizada correctamente.');
}

function bindEvents() {
  document.getElementById('btnVolver')?.addEventListener('click', () => {
    window.location.href = 'index.html';
  });

  document.getElementById('btnNuevaCategoria')?.addEventListener('click', () => openEditor(null));
  document.getElementById('btnCancelarEdicion')?.addEventListener('click', closeEditor);

  document.getElementById('edit-form-tipo')?.addEventListener('change', (e) => {
    updateFormTipoUI(e.target.value);
    rerenderDetalleFieldsManteniendoSeleccion();
  });

  document.getElementById('edit-detalle-tipo')?.addEventListener('change', (e) => {
    updateDetalleTipoUI(e.target.value);
  });

  document.getElementById('edit-email-variable')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    insertHtmlInEmailEditor(escapeHtml(val));
    e.target.value = '';
  });

  document.querySelector('.email-editor-toolbar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const cmd = btn.dataset.emailCmd;
    const action = btn.dataset.emailAction;
    if (cmd) {
      execEmailEditorCommand(cmd);
      return;
    }
    if (action === 'link') {
      insertEmailEditorLink();
      return;
    }
    if (action === 'clear-format') {
      execEmailEditorCommand('removeFormat');
    }
  });

  const emailEditor = getEmailEditorElement();
  emailEditor?.addEventListener('keyup', updateEmailToolbarState);
  emailEditor?.addEventListener('mouseup', updateEmailToolbarState);
  emailEditor?.addEventListener('focus', updateEmailToolbarState);
  emailEditor?.addEventListener('blur', updateEmailToolbarState);
  document.addEventListener('selectionchange', () => {
    if (!document.activeElement || document.activeElement.id !== 'edit-email-cuerpo') {
      return;
    }
    updateEmailToolbarState();
  });

  document.getElementById('campos-disponibles')?.addEventListener('change', (e) => {
    if (!e.target.classList.contains('edit-campo')) return;
    const selectTipo = document.getElementById('edit-form-tipo');
    if (!selectTipo) return;
    const hayCampos = document.querySelectorAll('.edit-campo:checked').length > 0;
    if (hayCampos && selectTipo.value === 'standard') {
      selectTipo.value = 'custom';
      updateFormTipoUI('custom');
    }
    const checked = [...document.querySelectorAll('.edit-campo:checked')].map(el => el.value);
    if (selectTipo.value === 'custom') {
      toggleViviendaOpcionesEditor(checked.includes('vivienda-interesada'));
    }
    rerenderDetalleFieldsManteniendoSeleccion();
  });

  document.getElementById('btn-add-vivienda-opcion')?.addEventListener('click', () => {
    const input = document.getElementById('vivienda-opcion-input');
    if (!input) return;
    const value = (input.value || '').trim();
    if (!value) return;
    if (!viviendaOpcionesDraft.includes(value)) {
      viviendaOpcionesDraft.push(value);
      renderViviendaOpcionesList();
    }
    input.value = '';
    input.focus();
  });

  document.getElementById('vivienda-opcion-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-add-vivienda-opcion')?.click();
    }
  });

  document.getElementById('vivienda-opciones-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-remove-vivienda]');
    if (!btn) return;
    const idx = Number(btn.dataset.removeVivienda);
    if (Number.isNaN(idx)) return;
    viviendaOpcionesDraft.splice(idx, 1);
    renderViviendaOpcionesList();
  });

  document.getElementById('btnGuardarCategoria')?.addEventListener('click', async () => {
    try {
      setStatus('Guardando...');
      await guardarEdicionActual();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  document.getElementById('categorias-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const categoria = appConfig.categorias.find(c => c.id === id);
    if (!categoria) return;

    try {
      if (action === 'edit') {
        openEditor(categoria);
      } else if (action === 'toggle') {
        const previousLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        setStatus('Actualizando visibilidad...');
        try {
          const activoActual = isCategoriaActiva(categoria.activa);
          const nuevoEstado = !activoActual;
          await asegurarEstadoActivoCategoria(id, nuevoEstado);
          setStatus(`Promoción ${nuevoEstado ? 'activada' : 'ocultada'} correctamente.`);
        } finally {
          btn.disabled = false;
          btn.innerHTML = previousLabel;
        }
      } else if (action === 'delete') {
        if (isProtectedCategory(id)) {
          throw new Error('No puedes eliminar categorías base protegidas.');
        }
        if (!confirm(`¿Eliminar ${categoria.nombre}?`)) return;
        const res = await apiRequest(ACTIONS.DELETE, { id });
        if (res.status !== 'success') throw new Error(res.message || 'No se pudo eliminar');
        appConfig = normalizeConfig(res.config);
        renderCategorias();
        if (currentEditId === id) closeEditor();
      }
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  fillVariableSelector();
  try {
    await cargarConfiguracion();
  } catch (error) {
    setStatus(`No se pudo cargar configuración: ${error.message}`, true);
  }
});