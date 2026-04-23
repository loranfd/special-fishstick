// dashboard.js - Full code with fixes: Align villas classification to only 'vivienda-interesada' with specific keywords, no procedencia in general count; embudo strict web + villas; normalizar with accents removal to match script.js

const urlApi = 'https://script.google.com/macros/s/AKfycbzhw3QMxMyVBuSzbabj8wPc5hm5X75AODXqz7Kn737rn46G670fl844EWLhy0G13bc/exec';

let datosGlobales = null;
let datosFiltrados = null;
let datosCompletos = null;
let campañasGuardadas = [];
let appConfig = CategoriaSystem.getDefaultAppConfig();

// Tooltip div global
const tooltip = document.createElement('div');
tooltip.style.position = 'absolute';
tooltip.style.background = 'rgba(0,0,0,0.8)';
tooltip.style.color = 'white';
tooltip.style.padding = '5px 10px';
tooltip.style.borderRadius = '4px';
tooltip.style.pointerEvents = 'none';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

// Normalizar aligned with script.js
const normalizar = (str) => String(str ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');


async function cargarConfiguracionCategorias() {
  try {
    const response = await fetch(`${urlApi}?action=getConfig`);
    const result = await response.json();
    appConfig = CategoriaSystem.normalizeConfig(result?.config || CategoriaSystem.getDefaultAppConfig());
  } catch (_) {
    appConfig = CategoriaSystem.getDefaultAppConfig();
  }
}
// Funciones
function configurarFiltros() {
  const tipoFiltro = document.getElementById('filtro-tipo');
  const mesFiltro = document.getElementById('filtro-mes');
  const inicioFiltro = document.getElementById('filtro-inicio');
  const finFiltro = document.getElementById('filtro-fin');
  const btnAplicar = document.getElementById('aplicar-filtro');

  tipoFiltro.addEventListener('change', (e) => {
    mesFiltro.style.display = 'none';
    inicioFiltro.style.display = 'none';
    finFiltro.style.display = 'none';
    if (e.target.value === 'mensual') {
      mesFiltro.style.display = 'block';
    } else if (e.target.value === 'rango') {
      inicioFiltro.style.display = 'block';
      finFiltro.style.display = 'block';
    }
  });

  btnAplicar.addEventListener('click', aplicarFiltro);
}

function aplicarFiltro() {
  if (!datosCompletos) return;

  const tipo = document.getElementById('filtro-tipo').value;
  let filtrados = datosCompletos;

  if (tipo === 'mensual') {
    const mes = document.getElementById('filtro-mes').value;
    if (mes) {
      filtrados = datosCompletos.filter(c => {
        const fecha = new Date(c['Fecha']);
        return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}` === mes;
      });
    }
  } else if (tipo === 'rango') {
    const inicioVal = document.getElementById('filtro-inicio').value;
    const finVal = document.getElementById('filtro-fin').value;
    if (inicioVal && finVal) {
      const inicio = new Date(inicioVal);
      const fin = new Date(finVal);
      filtrados = datosCompletos.filter(c => {
        const fecha = new Date(c['Fecha']);
        return fecha >= inicio && fecha <= fin;
      });
    }
  }

  datosGlobales = procesarDatos(filtrados);
  mostrarDashboard();
}

async function cargarDatos() {
  try {
    await cargarConfiguracionCategorias();
    const response = await fetch(urlApi, { method: 'GET', redirect: 'follow' });
    const result = await response.json();
    
    if (result.status === 'success' && Array.isArray(result.data)) {
      datosCompletos = result.data;
      datosGlobales = procesarDatos(datosCompletos);
      datosFiltrados = datosCompletos;
      configurarEmbudo();
      await cargarCampaniasGuardadas();
      poblarMeses(datosCompletos);
      mostrarDashboard();
    } else {
      throw new Error(result.message || 'Respuesta inválida');
    }
  } catch (error) {
    console.error('Error GAS:', error);
    alert('Error conexión GAS. Detalles consola.');
  } finally {
    ocultarLoading();
  }
}

function poblarMeses(data) {
  const meses = new Set();
  data.forEach(c => {
    if (c['Fecha']) {
      const fecha = new Date(c['Fecha']);
      if (!isNaN(fecha)) meses.add(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
    }
  });
  const mesFiltro = document.getElementById('filtro-mes');
  mesFiltro.innerHTML = '';
  Array.from(meses).sort().forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = new Date(m + '-01').toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    mesFiltro.appendChild(opt);
  });
}

function procesarDatos(data) {
  if (!Array.isArray(data)) return { total: 0, viviendaNormal: 0, villasIsla: 0, procedencias: {}, ubicacionesPorProv: {}, contactosTiempo: {}, dataCompleta: [] };

  const villasIsla = data.filter(c => {
    const categoria = CategoriaSystem.resolveCategoria(appConfig, c);
    return categoria?.id === CategoriaSystem.BASE_CATEGORY_IDS.VILLAS;
  });

  const viviendaNormal = data.filter(c => !villasIsla.includes(c));

  const procedencias = {};
  data.forEach(c => {
    const proc = c['procedencia-contacto'] ?? c['origen-contacto'] ?? 'Sin especificar';
    procedencias[proc] = (procedencias[proc] || 0) + 1;
  });

// Ubicaciones: Parse avanzado con normalización inteligente y diccionario de equivalencias
  const provinciasComunes = ['madrid', 'barcelona', 'valencia', 'sevilla', 'zaragoza', 'malaga', 'murcia', 'palma', 'las palmas', 'bilbao', 'alicante', 'cordoba', 'valladolid', 'vigo', 'gijon', 'hospitalet', 'vitoria', 'a coruna', 'coruña', 'granada', 'elche', 'pontevedra', 'galicia', 'cataluña', 'catalunya', 'euskadi', 'pais vasco'];
  
// Diccionario de equivalencias para unificar ubicaciones similares
  const equivalenciasUbicaciones = {
    // Variaciones de A Coruña
    'la coruna': 'a coruna',
    'coruña': 'a coruna',
    'la coruña': 'a coruna',
    'coruna': 'a coruna',
    // Otras ciudades
    'san sebastian': 'donostia',
    'donostia san sebastian': 'donostia',
    'las palmas de gran canaria': 'las palmas',
    'palma de mallorca': 'palma',
    'jerez de la frontera': 'jerez',
    'castello de la plana': 'castellon',
    'castellon de la plana': 'castellon',
  };
  
  // Función para normalizar ubicaciones y eliminar variaciones
 // Función para normalizar ubicaciones y eliminar variaciones
  const normalizarUbicacion = (texto) => {
    let normalizado = normalizar(texto)
      .replace(/\([^)]*\)/g, '')  // Eliminar paréntesis y contenido: Montijo (Badajoz) → Montijo
      .replace(/\[[^\]]*\]/g, '')  // Eliminar corchetes y contenido
      .replace(/\s+/g, ' ')  // Múltiples espacios a uno solo
      .replace(/[.,;]/g, '')  // Eliminar puntuación
      .replace(/\s*-\s*/g, ' ')  // Guiones con espacios
      .replace(/\b(de|del|la|las|los|el)\b/gi, ' ')  // Eliminar artículos
      .replace(/\s+/g, ' ')  // Limpiar espacios dobles de nuevo
      .trim();
    
    // Aplicar equivalencias del diccionario
    for (const [variacion, oficial] of Object.entries(equivalenciasUbicaciones)) {
      if (normalizado === variacion || normalizado.includes(' ' + variacion + ' ') || normalizado.startsWith(variacion + ' ') || normalizado.endsWith(' ' + variacion)) {
        normalizado = normalizado.replace(new RegExp(variacion, 'g'), oficial);
      }
    }
    
    return normalizado.replace(/\s+/g, ' ').trim();
  };
  
 const ubicacionesPorProv = {};
  const ubicacionesNormalizadas = new Map(); // Para detectar duplicados
  const ubicacionesOriginales = []; // Para debugging
  
  viviendaNormal.forEach(c => {
    let ubi = String(c['ubicacion-terreno'] ?? '').trim();
    if (!ubi || normalizar(ubi) === 'sin especificar' || normalizar(ubi) === 'sin terreno') return;

    // Guardar ubicación original para debugging
    ubicacionesOriginales.push(ubi);

    // Normalizar la ubicación completa
    const ubiNormalizada = normalizarUbicacion(ubi);
    
    // Limpiar paréntesis ANTES de separar
    const ubiLimpia = ubi.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').trim();
    
    // Separar por comas, punto y coma
    const parts = ubiLimpia.split(/[,;]/).map(p => p.trim()).filter(p => p);
    const partsNorm = parts.map(p => normalizar(p));
    
    // Detectar provincia (última parte que coincida con provincias conocidas)
    let provincia = 'Otros';
    let provinciaOriginal = '';
    for (let i = partsNorm.length - 1; i >= 0; i--) {
      if (provinciasComunes.includes(partsNorm[i])) {
        provinciaOriginal = parts[i];
        provincia = provinciaOriginal.charAt(0).toUpperCase() + provinciaOriginal.slice(1).toLowerCase();
        break;
      }
    }
    
    // Si no encontramos provincia conocida, usar la última parte como provincia
    if (provincia === 'Otros' && parts.length > 0) {
      const ultimaParte = parts[parts.length - 1];
      if (ultimaParte.length > 3 && !/[\d]/.test(ultimaParte)) {
        provinciaOriginal = ultimaParte;
        provincia = provinciaOriginal.charAt(0).toUpperCase() + provinciaOriginal.slice(1).toLowerCase();
      }
    }
    
    // Construir el sitio (todo menos la provincia)
    let sitio = parts.slice(0, -1).join(', ').trim() || parts[0] || ubi;
    const sitioNormalizado = normalizarUbicacion(sitio);
    
   // Verificar si ya existe esta ubicación normalizada
    let sitioFinal = sitio;
    if (ubicacionesNormalizadas.has(sitioNormalizado)) {
      sitioFinal = ubicacionesNormalizadas.get(sitioNormalizado);
    } else {
      // Limpiar espacios extras antes de capitalizar
      sitio = sitio.replace(/\s+/g, ' ').trim();
      
      // Capitalizar correctamente el sitio
      sitioFinal = sitio.split(' ').map(palabra => 
        palabra.length > 0 ? palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase() : ''
      ).join(' ');
      ubicacionesNormalizadas.set(sitioNormalizado, sitioFinal);
    }

    if (!ubicacionesPorProv[provincia]) {
      ubicacionesPorProv[provincia] = { count: 0, sitios: new Set() };
    }
    ubicacionesPorProv[provincia].count++;
    if (sitioFinal) {
      ubicacionesPorProv[provincia].sitios.add(sitioFinal);
    }
  });
  

  const contactosTiempo = { normal: {}, villas: {}, total: {} };
  data.forEach(c => {
    const fechaStr = c['Fecha'];
    if (fechaStr) {
      const fecha = new Date(fechaStr);
      if (!isNaN(fecha)) {
        const key = fecha.toISOString().split('T')[0];
        contactosTiempo.total[key] = (contactosTiempo.total[key] || 0) + 1;
        if (villasIsla.includes(c)) {
          contactosTiempo.villas[key] = (contactosTiempo.villas[key] || 0) + 1;
        } else {
          contactosTiempo.normal[key] = (contactosTiempo.normal[key] || 0) + 1;
        }
      }
    }
  });

  return {
    total: data.length,
    viviendaNormal: viviendaNormal.length,
    villasIsla: villasIsla.length,
    procedencias,
    ubicacionesPorProv,
    contactosTiempo,
    dataCompleta: data
  };
}

function mostrarDashboard() {
  if (!datosGlobales) return;

  document.getElementById('kpi-total').textContent = datosGlobales.total;
  document.getElementById('kpi-normal').textContent = datosGlobales.viviendaNormal;
  document.getElementById('kpi-villas').textContent = datosGlobales.villasIsla;
  document.getElementById('kpi-ubicaciones').textContent = Object.keys(datosGlobales.ubicacionesPorProv).length;

  mostrarGraficoTipos();
  mostrarGraficoProcedencia();
  mostrarGraficoTiempo();
  mostrarMapaUbicaciones();
}

// Pie with tooltip
function mostrarGraficoTipos() {
  const container = document.getElementById('chart-tipos');
  const total = datosGlobales.total || 1;
  const normal = datosGlobales.viviendaNormal;
  const villas = datosGlobales.villasIsla;
  const degNormal = (normal / total) * 360;

  const pathNormal = `M 100,100 L 100,0 A 100,100 0 ${degNormal > 180 ? 1 : 0},1 ${100 + Math.sin(degNormal * Math.PI / 180) * 100},${100 - Math.cos(degNormal * Math.PI / 180) * 100} Z`;
  const pathVillas = `M 100,100 L ${100 + Math.sin(degNormal * Math.PI / 180) * 100},${100 - Math.cos(degNormal * Math.PI / 180) * 100} A 100,100 0 ${degNormal < 180 ? 1 : 0},1 100,0 Z`;

  const porcentajeNormal = ((normal / total) * 100).toFixed(1);
  const porcentajeVillas = ((villas / total) * 100).toFixed(1);

  container.innerHTML = `
    <svg id="pie-svg" width="250" height="250" viewBox="0 0 200 200" style="margin: 0 auto; display: block;">
      <path class="pie-slice" data-tooltip="Vivienda Normal: ${porcentajeNormal}% (${normal})" d="${pathNormal}" fill="#48bb78" />
      <path class="pie-slice" data-tooltip="Villas Isla de Cortegada: ${porcentajeVillas}% (${villas})" d="${pathVillas}" fill="#9f7aea" />
      <circle cx="100" cy="100" r="60" fill="white"/>
      <text x="100" y="95" text-anchor="middle" font-size="14" fill="#1a202c">${total}</text>
      <text x="100" y="115" text-anchor="middle" font-size="12" fill="#718096">Total</text>
    </svg>
    <div style="text-align: center; margin-top: 1rem;">
      <span style="color: #48bb78;">Vivienda Normal: ${porcentajeNormal}%</span><br>
      <span style="color: #9f7aea;">Villas Isla de Cortegada: ${porcentajeVillas}%</span>
    </div>
  `;

 // JS tooltip
  const slices = container.querySelectorAll('.pie-slice');
  slices.forEach(slice => {
    slice.addEventListener('mouseenter', (e) => {
      tooltip.textContent = slice.dataset.tooltip;
      tooltip.style.display = 'block';
    });
    slice.addEventListener('mousemove', (e) => {
      tooltip.style.left = `${e.pageX + 10}px`;
      tooltip.style.top = `${e.pageY}px`;
    });
    slice.addEventListener('mouseleave', () => tooltip.style.display = 'none');
  });
}

function mostrarGraficoProcedencia() {
  const container = document.getElementById('chart-procedencia');
  const total = datosGlobales.total;
  
  const topProcedencias = Object.entries(datosGlobales.procedencias)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 6);

  const colores = ['blue', 'green', 'purple', 'orange', 'pink', 'indigo'];

  const html = topProcedencias.map(([proc, count], idx) => {
    const porcentaje = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
    const color = colores[idx % colores.length];

    return `
      <div class="progress-item">
        <div class="progress-header">
          <span style="color: #4a5568;">${proc}</span>
          <span style="font-weight: bold; color: #1a202c;">${count}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar ${color}" style="width: 0%;" data-width="${porcentaje}">
            ${porcentaje}%
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;

  setTimeout(() => {
    container.querySelectorAll('.progress-bar').forEach((bar, idx) => {
      if (bar.dataset.width) {
        setTimeout(() => bar.style.width = bar.dataset.width + '%', idx * 100);
      }
    });
  }, 200);
}

function mostrarGraficoTiempo() {
  const container = document.getElementById('chart-tiempo');
  const periodoInfo = document.getElementById('periodo-info');
  const { normal, villas, total } = datosGlobales.contactosTiempo;
  let entradasTotal = Object.entries(total).sort(([a], [b]) => a.localeCompare(b));
  
  if (entradasTotal.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #718096; padding: 2rem;">No hay datos de contactos en el tiempo</p>';
    return;
  }

  const tipoFiltro = document.getElementById('filtro-tipo').value;
  
  // Calcular rango de días
  const primeraFecha = new Date(entradasTotal[0][0] + 'T00:00:00');
  const ultimaFecha = new Date(entradasTotal[entradasTotal.length - 1][0] + 'T00:00:00');
  const diffDias = Math.ceil((ultimaFecha - primeraFecha) / (1000 * 60 * 60 * 24)) + 1;
  
  let labels = [];
  let valuesNormal = [];
  let valuesVillas = [];
  let valuesTotal = [];
  let periodoTexto = '';
  let modoVisualizacion = '';

  // LÓGICA AUTOMÁTICA según filtro y rango
  if (tipoFiltro === 'global') {
    // GLOBAL → Agrupar por MESES
    modoVisualizacion = 'Por meses';
    const agrupadoN = {}, agrupadoV = {}, agrupadoT = {};
    
    entradasTotal.forEach(([fecha, count]) => {
      const d = new Date(fecha + 'T00:00:00');
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      
      agrupadoT[key] = (agrupadoT[key] || 0) + count;
      agrupadoN[key] = (agrupadoN[key] || 0) + (normal[fecha] || 0);
      agrupadoV[key] = (agrupadoV[key] || 0) + (villas[fecha] || 0);
    });

    Object.keys(agrupadoT).sort().forEach(key => {
      const [year, month] = key.split('-');
      const fecha = new Date(parseInt(year), parseInt(month) - 1);
      labels.push(fecha.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }));
      valuesTotal.push(agrupadoT[key]);
      valuesNormal.push(agrupadoN[key]);
      valuesVillas.push(agrupadoV[key]);
    });

    periodoTexto = `${primeraFecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })} - ${ultimaFecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}`;

  } else if (tipoFiltro === 'mensual') {
    // MENSUAL → Agrupar por DÍAS
    modoVisualizacion = 'Por días';
    entradasTotal.forEach(([f, c]) => {
      const fecha = new Date(f + 'T00:00:00');
      labels.push(fecha.getDate());
      valuesTotal.push(c);
      valuesNormal.push(normal[f] || 0);
      valuesVillas.push(villas[f] || 0);
    });

    periodoTexto = primeraFecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  } else if (tipoFiltro === 'rango') {
    // RANGO → Lógica según días
    if (diffDias <= 31) {
      // ≤ 31 días → Por DÍAS
      modoVisualizacion = 'Por días';
      entradasTotal.forEach(([f, c]) => {
        const fecha = new Date(f + 'T00:00:00');
        labels.push(`${fecha.getDate()}/${fecha.getMonth() + 1}`);
        valuesTotal.push(c);
        valuesNormal.push(normal[f] || 0);
        valuesVillas.push(villas[f] || 0);
      });

    } else if (diffDias <= 90) {
      // 32-90 días → Agrupar de 5 en 5 DÍAS
      modoVisualizacion = 'Cada 5 días';
      const agrupadoN = {}, agrupadoV = {}, agrupadoT = {};
      
      entradasTotal.forEach(([fecha, count]) => {
        const d = new Date(fecha + 'T00:00:00');
        const daysSinceStart = Math.floor((d - primeraFecha) / (1000 * 60 * 60 * 24));
        const grupoIndex = Math.floor(daysSinceStart / 5);
        const key = `grupo-${grupoIndex}`;
        
        agrupadoT[key] = (agrupadoT[key] || 0) + count;
        agrupadoN[key] = (agrupadoN[key] || 0) + (normal[fecha] || 0);
        agrupadoV[key] = (agrupadoV[key] || 0) + (villas[fecha] || 0);
      });

      Object.keys(agrupadoT).sort().forEach((key, idx) => {
        const diaInicio = idx * 5 + 1;
        const diaFin = Math.min((idx + 1) * 5, diffDias);
        labels.push(`${diaInicio}-${diaFin}`);
        valuesTotal.push(agrupadoT[key]);
        valuesNormal.push(agrupadoN[key]);
        valuesVillas.push(agrupadoV[key]);
      });

    } else {
      // > 90 días → Por MESES
      modoVisualizacion = 'Por meses';
      const agrupadoN = {}, agrupadoV = {}, agrupadoT = {};
      
      entradasTotal.forEach(([fecha, count]) => {
        const d = new Date(fecha + 'T00:00:00');
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        agrupadoT[key] = (agrupadoT[key] || 0) + count;
        agrupadoN[key] = (agrupadoN[key] || 0) + (normal[fecha] || 0);
        agrupadoV[key] = (agrupadoV[key] || 0) + (villas[fecha] || 0);
      });

      Object.keys(agrupadoT).sort().forEach(key => {
        const [year, month] = key.split('-');
        const fecha = new Date(parseInt(year), parseInt(month) - 1);
        labels.push(fecha.toLocaleDateString('es-ES', { month: 'short' }));
        valuesTotal.push(agrupadoT[key]);
        valuesNormal.push(agrupadoN[key]);
        valuesVillas.push(agrupadoV[key]);
      });
    }

    periodoTexto = `${primeraFecha.toLocaleDateString('es-ES')} - ${ultimaFecha.toLocaleDateString('es-ES')}`;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 650;
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  
  const controlsHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 1rem;">
      <div style="display: flex; gap: 0.5rem;">
        <button class="toggle-line active" data-line="total" style="padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid #cbd5e0; background: white; cursor: pointer; font-weight: 600; transition: all 0.3s;">
          Total
        </button>
        <button class="toggle-line active" data-line="normal" style="padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid #48bb78; background: white; cursor: pointer; font-weight: 600; color: #48bb78; transition: all 0.3s;">
          Normal
        </button>
        <button class="toggle-line active" data-line="villas" style="padding: 0.5rem 1rem; border-radius: 8px; border: 2px solid #9f7aea; background: white; cursor: pointer; font-weight: 600; color: #9f7aea; transition: all 0.3s;">
          Villas
        </button>
      </div>
      <div style="color: #64748b; font-size: 0.9rem; font-weight: 500;">
        ${modoVisualizacion}
      </div>
    </div>
  `;
  
  container.innerHTML = controlsHTML;
  container.appendChild(canvas);
  periodoInfo.textContent = periodoTexto;

  const ctx = canvas.getContext('2d');
  const padding = 60;
  const width = canvas.width - 2 * padding;
  const height = canvas.height - 2 * padding - 50;
  const stepX = width / (labels.length - 1 || 1);
  const maxVal = Math.max(...valuesTotal, 1);
  const stepY = maxVal / 5;

  let highlightedI = -1;
  let activeLines = { total: true, normal: true, villas: true };

  const lines = [
    { key: 'total', data: valuesTotal, color: '#cbd5e0', label: 'Total', width: 2 },
    { key: 'normal', data: valuesNormal, color: '#48bb78', label: 'Normal', width: 3 },
    { key: 'villas', data: valuesVillas, color: '#9f7aea', label: 'Villas', width: 3 }
  ];

  function drawChart(progress = 1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#f7fafc';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#a0aec0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const y = padding + height - (i / 5) * height;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + width, y);
      ctx.stroke();
      ctx.fillText(Math.round(stepY * i), padding - 10, y + 4);
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + height);
    ctx.lineTo(padding + width, padding + height);
    ctx.stroke();

    ctx.fillStyle = '#718096';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label, i) => {
      const x = padding + i * stepX;
      ctx.fillText(label, x, padding + height + 20);
    });

    const maxX = padding + progress * width;
    lines.forEach(line => {
      if (!activeLines[line.key]) return;
      
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width;
      ctx.beginPath();
      let prevX = padding;
      let prevY = padding + height - (line.data[0] / maxVal) * height;
      ctx.moveTo(prevX, prevY);
      
      for (let i = 1; i < line.data.length; i++) {
        const x = padding + i * stepX;
        const y = padding + height - (line.data[i] / maxVal) * height;
        if (x > maxX) {
          const frac = (maxX - prevX) / (x - prevX);
          const interpY = prevY + frac * (y - prevY);
          ctx.lineTo(maxX, interpY);
          break;
        }
        ctx.lineTo(x, y);
        prevX = x;
        prevY = y;
      }
      ctx.stroke();
    });

    if (progress >= 1) {
      if (highlightedI >= 0) {
        ctx.strokeStyle = 'rgba(203, 213, 224, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const x = padding + highlightedI * stepX;
        ctx.moveTo(x, padding);
        ctx.lineTo(x, padding + height);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      lines.forEach(line => {
        if (!activeLines[line.key]) return;
        
        ctx.fillStyle = line.color;
        line.data.forEach((val, i) => {
          const x = padding + i * stepX;
          const y = padding + height - (val / maxVal) * height;
          const radius = (i === highlightedI ? 6 : 4);
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
          
          if (i === highlightedI) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      });
    }
  }

  let progress = 0;
  function anim() {
    progress += 0.03;
    drawChart(progress);
    if (progress < 1) requestAnimationFrame(anim);
  }
  anim();

  const toggleBtns = container.querySelectorAll('.toggle-line');
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const lineKey = btn.dataset.line;
      const isActive = btn.classList.contains('active');
      const activeCount = Object.values(activeLines).filter(v => v).length;
      
      if (isActive && activeCount === 1) {
        activeLines = { total: true, normal: true, villas: true };
        toggleBtns.forEach(b => {
          b.classList.add('active');
          b.style.opacity = '1';
          b.style.background = 'white';
        });
      } else if (isActive) {
        activeLines[lineKey] = false;
        btn.classList.remove('active');
        btn.style.opacity = '0.4';
        btn.style.background = '#f7fafc';
      } else {
        activeLines = { total: false, normal: false, villas: false };
        activeLines[lineKey] = true;
        toggleBtns.forEach(b => {
          b.classList.remove('active');
          b.style.opacity = '0.4';
          b.style.background = '#f7fafc';
        });
        btn.classList.add('active');
        btn.style.opacity = '1';
        btn.style.background = 'white';
      }
      
      drawChart();
    });
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let closestI = Math.round((mouseX - padding) / stepX);
    if (closestI < 0) closestI = 0;
    if (closestI >= labels.length) closestI = labels.length - 1;

    if (closestI !== highlightedI) {
      highlightedI = closestI;
      drawChart();
    }

    const n = valuesNormal[closestI] || 0;
    const v = valuesVillas[closestI] || 0;
    const t = valuesTotal[closestI] || 0;
    
    tooltip.innerHTML = `<strong>${labels[closestI]}</strong><br>Normal: ${n}<br>Villas: ${v}<br>Total: ${t}`;
    tooltip.style.left = `${e.pageX + 10}px`;
    tooltip.style.top = `${e.pageY}px`;
    tooltip.style.display = 'block';
  });
  
  canvas.addEventListener('mouseout', () => {
    if (highlightedI !== -1) {
      highlightedI = -1;
      drawChart();
    }
    tooltip.style.display = 'none';
  });
}

function mostrarMapaUbicaciones() {
  const container = document.getElementById('mapa-ubicaciones');
  const porProv = datosGlobales.ubicacionesPorProv;

  if (Object.keys(porProv).length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #718096; padding: 2rem;">No hay ubicaciones registradas</p>';
    return;
  }

  // Sort alphabetically, Otros last
  let entries = Object.entries(porProv)
    .filter(([prov]) => prov !== 'Otros')
    .sort(([a], [b]) => a.localeCompare(b));
  const otrosEntry = Object.entries(porProv).find(([prov]) => prov === 'Otros');
  if (otrosEntry) entries.push(otrosEntry);

  const html = entries.map(([prov, {count, sitios}]) => {
    const sitiosSorted = [...sitios].sort((a, b) => a.localeCompare(b));
    return `
      <details class="ubicacion-prov">
        <summary>
          <span class="ubicacion-icon">📍</span>
          ${prov} <span class="ubicacion-badge">${count}</span>
        </summary>
        <ul style="list-style: none; padding-left: 20px; margin-top: 0.5rem;">
          ${sitiosSorted.map(s => `<li>${s}</li>`).join('')}
        </ul>
      </details>
    `;
  }).join('');

  container.innerHTML = html;
}

function configurarEmbudo() {
  const selectCategoria = document.getElementById('embudo-categoria');
  const btnGuardarCampania = document.getElementById('btn-guardar-campania');

  if (selectCategoria) {
    selectCategoria.innerHTML = '<option value="all">Todo</option>';
    (appConfig?.categorias || []).forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.nombre;
      selectCategoria.appendChild(opt);
    });
  }

  if (btnGuardarCampania) {
    btnGuardarCampania.addEventListener('click', guardarCampaña);
  }

  const btnResetResumen = document.getElementById('btn-reset-resumen');
  if (btnResetResumen) {
    btnResetResumen.addEventListener('click', resetearResumenCampania);
  }

  configurarSincroniaAnuncioTrafico();

  const embudoInputs = [
    'embudo-categoria',
    'input-fecha-inicio',
    'input-fecha-fin',
    'input-clics',
    'input-coste',
    'input-impresiones'
  ];

  embudoInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', calcularEmbudo);
    el.addEventListener('change', calcularEmbudo);
  });

  calcularEmbudo();
}

function configurarSincroniaAnuncioTrafico() {
  const detalleAnuncio = document.getElementById('detalle-anuncio');
  const detalleTrafico = document.getElementById('detalle-trafico');
  if (!detalleAnuncio || !detalleTrafico) return;

  let syncing = false;
  const sync = (source, target) => {
    if (syncing) return;
    syncing = true;
    if (source.hasAttribute('open')) target.setAttribute('open', 'open');
    else target.removeAttribute('open');
    syncing = false;
  };

  detalleAnuncio.addEventListener('toggle', () => sync(detalleAnuncio, detalleTrafico));
  detalleTrafico.addEventListener('toggle', () => sync(detalleTrafico, detalleAnuncio));
}

function safeCalculate(fn, dependencies) {
  if (dependencies.some(v => v === null || v === undefined)) {
    return null;
  }
  if (dependencies.some(v => v === 0)) {
    return null;
  }
  return fn();
}

function setMetricValue(id, value, suffix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  const metricCard = el.closest('.embudo-metric');
  if (value === null || value === undefined || Number.isNaN(value) || !Number.isFinite(value)) {
    el.textContent = '';
    el.classList.add('unavailable');
    metricCard?.classList.add('metric-disabled');
    return;
  }
  el.classList.remove('unavailable');
  metricCard?.classList.remove('metric-disabled');
  el.textContent = `${value.toFixed(2)}${suffix}`;
}

function parseOptionalNumber(id) {
  const raw = document.getElementById(id)?.value;
  if (raw === '' || raw === null || raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function getContactosFiltradosPorRango(dataCompleta, fechaInicio, fechaFin, categoriaFiltro) {
  if (!fechaInicio || !fechaFin) return [];
  const inicio = new Date(fechaInicio + 'T00:00:00');
  const fin = new Date(fechaFin + 'T23:59:59');
  return (dataCompleta || []).filter(c => {
    if (!c['Fecha']) return false;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(c['Fecha']).trim())
      ? new Date(String(c['Fecha']).trim() + 'T00:00:00')
      : new Date(c['Fecha']);
    if (isNaN(fecha) || fecha < inicio || fecha > fin) return false;
    if (categoriaFiltro === 'all') return true;
    const categoria = CategoriaSystem.resolveCategoria(appConfig, c);
    return categoria?.id === categoriaFiltro;
  });
}

function getDailyLeads(fechaInicio, fechaFin, contactosEnRango) {
  if (!fechaInicio || !fechaFin) return [];
  const start = new Date(fechaInicio + 'T00:00:00');
  const end = new Date(fechaFin + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return [];

  const leadsByDay = new Map();
  (contactosEnRango || []).forEach(c => {
    const raw = String(c['Fecha'] || '').trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(raw + 'T00:00:00') : new Date(raw);
    if (isNaN(d)) return;
    const key = d.toISOString().split('T')[0];
    leadsByDay.set(key, (leadsByDay.get(key) || 0) + 1);
  });

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = cursor.toISOString().split('T')[0];
    days.push({ key, leads: leadsByDay.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function normalizarFechaISO(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (match) return match[1];
  const d = new Date(raw);
  if (isNaN(d)) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizarCampaniaRow(row) {
  const promoRaw = String(row.promocion || '').trim();
  return {
    id: String(row.id || ''),
    nombre: String(row.nombre || row.nombreCampania || ''),
    promocionId: String(row.promocionId || (promoRaw && promoRaw !== 'all' ? promoRaw : '')),
    promocionNombre: String(row.promocionNombre || row.promocion || ''),
    fechaInicio: normalizarFechaISO(row.fechaInicio),
    fechaFin: normalizarFechaISO(row.fechaFin),
    clics: Number(row.clics || 0),
    impresiones: Number(row.impresiones || 0),
    coste: Number(row.coste || 0),
    leads: Number(row.leads || 0),
    ctr: Number(row.ctr || 0),
    cpc: Number(row.cpc || 0),
    cpl: Number(row.cpl || 0),
    conversion: Number(row.conversion || 0),
    diasCampania: Number(row.diasCampania || 0),
    clicsDia: Number(row.clicsDia || 0),
    impresionesDia: Number(row.impresionesDia || 0),
    costeDia: Number(row.costeDia || 0),
    leadsDia: Number(row.leadsDia || 0),
    timestamp: String(row.timestamp || '')
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function calcularMetricasCampania(base) {
  const fechaInicio = String(base.fechaInicio || '').trim();
  const fechaFin = String(base.fechaFin || '').trim();
  const clics = Number(base.clics || 0);
  const impresiones = Number(base.impresiones || 0);
  const coste = Number(base.coste || 0);
  const leads = Number(base.leads || 0);
  const inicio = new Date(`${fechaInicio}T00:00:00`);
  const fin = new Date(`${fechaFin}T00:00:00`);
  const invalidRange = isNaN(inicio) || isNaN(fin) || inicio >= fin;
  const unDia = 1000 * 60 * 60 * 24;
  const diasCampania = invalidRange ? 0 : (Math.floor((fin - inicio) / unDia) + 1);

  return {
    ctr: impresiones > 0 ? (clics / impresiones) * 100 : 0,
    cpc: clics > 0 ? coste / clics : 0,
    cpl: leads > 0 ? coste / leads : 0,
    conversion: clics > 0 ? Math.min((leads / clics) * 100, 100) : 0,
    diasCampania,
    clicsDia: diasCampania > 0 ? clics / diasCampania : 0,
    impresionesDia: diasCampania > 0 ? impresiones / diasCampania : 0,
    costeDia: diasCampania > 0 ? coste / diasCampania : 0,
    leadsDia: diasCampania > 0 ? leads / diasCampania : 0
  };
}

function actualizarDiagnosticoEmbudo({ ctrCalc, conv, cpc, cpl, clicsPorFormulario }) {
  const kpiMessage = {
    ctr: ctrCalc === null ? '' : (ctrCalc < 1 ? '🔴 El anuncio no está captando atención diaria' : (ctrCalc < 2 ? '🟠 Atención mejorable, optimizar creatividades' : (ctrCalc <= 4 ? '🟢 CTR correcto y estable' : '🔥 Anuncio muy atractivo diariamente'))),
    conv: conv === null ? '' : (conv < 1 ? '🔴 La landing no convierte de forma consistente' : (conv < 2 ? '🟠 Conversión baja diaria, revisar formulario o mensaje' : (conv <= 5 ? '🟢 Conversión correcta y estable' : '🔥 Landing muy optimizada en el tiempo'))),
    cpc: cpc === null ? '' : (cpc < 0.10 ? '🔥 Tráfico extremadamente barato sostenido' : (cpc < 0.30 ? '🟢 Clic eficiente de forma estable' : (cpc <= 0.80 ? '🟠 CPC medio, optimización posible' : '🔴 Clic caro sostenido en el tiempo'))),
    cpl: cpl === null ? '' : (cpl < 15 ? '🔥 Captación muy eficiente y estable' : (cpl < 35 ? '🟢 Coste controlado diario' : (cpl < 60 ? '🟠 Lead caro de forma sostenida' : '🔴 Campaña no rentable en el tiempo'))),
    calidad: clicsPorFormulario === null ? '' : (clicsPorFormulario < 20 ? '🔥 Tráfico muy cualificado de forma constante' : (clicsPorFormulario <= 40 ? '🟢 Buen tráfico diario' : (clicsPorFormulario <= 100 ? '🟠 Calidad media estable' : '🔴 Tráfico poco cualificado sostenido')))
  };

  let combinado = '';
  if (ctrCalc !== null && conv !== null) {
    if (ctrCalc < 2 && conv < 2) combinado = '🔴 Problema estructural diario en embudo';
    else if (ctrCalc >= 2 && conv < 2) combinado = '🔴 Anuncio funciona, landing falla';
    else if (ctrCalc < 2 && conv >= 2) combinado = '🔴 Buen producto pero anuncio débil';
    else if (ctrCalc > 4 && conv > 5) combinado = '🔥 Campaña altamente optimizada diaria';
    else combinado = '🟢 Embudo equilibrado en el tiempo';
  }

  document.getElementById('diag-ctr').textContent = kpiMessage.ctr;
  document.getElementById('diag-conv').textContent = kpiMessage.conv;
  document.getElementById('diag-cpc').textContent = kpiMessage.cpc;
  document.getElementById('diag-cpl').textContent = kpiMessage.cpl;
  document.getElementById('diag-calidad').textContent = kpiMessage.calidad;
  document.getElementById('diag-combinado').textContent = combinado;
}

function cargarCampaniaEnResumen(campaignId) {
  const campaña = obtenerCampaniaPorId(campaignId);
  if (!campaña) return;

  const selectCat = document.getElementById('embudo-categoria');
  if (selectCat) {
    const options = Array.from(selectCat.options);
    const normalizeLabel = (v) => normalizar(String(v || '').replace(/[^a-z0-9áéíóúüñ\s-]/gi, ' ').replace(/\s+/g, ' '));

    let matched = false;
    if (campaña.promocionId) {
      const byId = options.find(o => String(o.value) === String(campaña.promocionId));
      if (byId) {
        selectCat.value = byId.value;
        matched = true;
      }
    }

    if (!matched && campaña.promocionNombre) {
      const nombreTarget = normalizeLabel(campaña.promocionNombre);
      const byName = options.find(o => {
        const n = normalizeLabel(o.textContent);
        return n === nombreTarget || n.includes(nombreTarget) || nombreTarget.includes(n);
      });
      if (byName) {
        selectCat.value = byName.value;
        matched = true;
      }
    }

    if (!matched && campaña.promocionId) {
      const idTarget = normalizeLabel(campaña.promocionId);
      const byLoose = options.find(o => {
        const nVal = normalizeLabel(o.value);
        const nTxt = normalizeLabel(o.textContent);
        return nVal === idTarget || nTxt === idTarget || nTxt.includes(idTarget) || idTarget.includes(nTxt);
      });
      if (byLoose) {
        selectCat.value = byLoose.value;
      }
    }
  }

  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  setVal('camp-nombre', campaña.nombre || '');
  setVal('input-fecha-inicio', campaña.fechaInicio || '');
  setVal('input-fecha-fin', campaña.fechaFin || '');
  setVal('input-clics', Number.isFinite(campaña.clics) ? campaña.clics : '');
  setVal('input-impresiones', Number.isFinite(campaña.impresiones) ? campaña.impresiones : '');
  setVal('input-coste', Number.isFinite(campaña.coste) ? campaña.coste : '');
  setVal('input-formularios', Number.isFinite(campaña.leads) ? campaña.leads : 0);

  setMetricValue('res-cpc', campaña.cpc);
  setMetricValue('res-conv', campaña.conversion, '%');
  setMetricValue('res-cpl', campaña.cpl, '€');
  setMetricValue('res-ctr', campaña.ctr, '%');
  setMetricValue('res-coste-lead-click', campaña.cpl, '€');
  setMetricValue('res-dia-clics', campaña.clicsDia);
  setMetricValue('res-dia-impresiones', campaña.impresionesDia);
  setMetricValue('res-dia-coste', campaña.costeDia, '€');
  setMetricValue('res-dia-leads', campaña.leadsDia);

  const resumenNombre = document.getElementById('resumen-campania-nombre');
  if (resumenNombre) {
    resumenNombre.textContent = campaña.nombre ? `· ${campaña.nombre}` : '';
  }

  const clicsPorFormulario = campaña.leads > 0 ? campaña.clics / campaña.leads : null;
  actualizarDiagnosticoEmbudo({
    ctrCalc: Number.isFinite(campaña.ctr) ? campaña.ctr : null,
    conv: Number.isFinite(campaña.conversion) ? campaña.conversion : null,
    cpc: Number.isFinite(campaña.cpc) ? campaña.cpc : null,
    cpl: Number.isFinite(campaña.cpl) ? campaña.cpl : null,
    clicsPorFormulario: Number.isFinite(clicsPorFormulario) ? clicsPorFormulario : null
  });

  abrirBloquesAnalisisCampania();
  document.getElementById('detalle-resumen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function abrirBloquesAnalisisCampania() {
  const abrirIds = ['detalle-resumen', 'detalle-anuncio', 'detalle-trafico', 'detalle-rendimiento', 'detalle-diagnostico'];
  abrirIds.forEach((id) => document.getElementById(id)?.setAttribute('open', 'open'));
  document.getElementById('detalle-guardar')?.removeAttribute('open');
}

function resetearResumenCampania() {
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };

  setVal('camp-nombre', '');
  setVal('input-fecha-inicio', '');
  setVal('input-fecha-fin', '');
  setVal('input-clics', 0);
  setVal('input-impresiones', 0);
  setVal('input-coste', 0);
  setVal('input-formularios', 0);
  const categoria = document.getElementById('embudo-categoria');
  if (categoria) categoria.value = 'all';
  const resumenNombre = document.getElementById('resumen-campania-nombre');
  if (resumenNombre) resumenNombre.textContent = '';
  calcularEmbudo();
}

function obtenerCampaniaPorId(id) {
  const key = String(id || '');
  return campañasGuardadas.find(c => String(c.id) === key) || null;
}

function validarBaseCampania(data) {
  const invalidBase = !data.nombre || !data.fechaInicio || !data.fechaFin ||
    !Number.isFinite(data.clics) || !Number.isFinite(data.impresiones) || !Number.isFinite(data.coste) || !Number.isFinite(data.leads);
  const invalidNums = [data.clics, data.impresiones, data.coste, data.leads].some(v => v < 0);
  const dInicio = new Date(`${data.fechaInicio}T00:00:00`);
  const dFin = new Date(`${data.fechaFin}T00:00:00`);
  const invalidDates = isNaN(dInicio) || isNaN(dFin) || dInicio >= dFin;
  return !(invalidBase || invalidNums || invalidDates);
}

function renderCampaniasEnComparacion() {
  const tbody = document.querySelector('#tabla-comparacion tbody');
  if (!tbody) return;
  const formatDateEs = (value) => {
    if (!value) return '';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
    if (isNaN(d)) return String(value);
    return d.toLocaleDateString('es-ES');
  };
  const rows = [...campañasGuardadas].sort((a, b) => {
    const av = Number.isFinite(a.cpl) ? a.cpl : Number.POSITIVE_INFINITY;
    const bv = Number.isFinite(b.cpl) ? b.cpl : Number.POSITIVE_INFINITY;
    return av - bv;
  });

  tbody.innerHTML = rows.map(c => `
    <tr data-campaign-id="${escapeHtml(c.id)}">
      <td>${escapeHtml(c.nombre || 'Campaña')}</td>
      <td>${formatDateEs(c.fechaInicio)}</td>
      <td>${formatDateEs(c.fechaFin)}</td>
      <td>${Number.isFinite(c.clics) ? c.clics.toFixed(0) : ''}</td>
      <td>${Number.isFinite(c.impresiones) ? c.impresiones.toFixed(0) : ''}</td>
      <td>${Number.isFinite(c.coste) ? `${c.coste.toFixed(2)} €` : ''}</td>
      <td>${Number.isFinite(c.leads) ? c.leads.toFixed(0) : ''}</td>
      <td>${Number.isFinite(c.cpl) ? `${c.cpl.toFixed(2)} €` : ''}</td>
      <td class="campaign-actions-cell">
        <button type="button" class="campaign-settings-btn" data-action="campaign-open-menu" data-id="${escapeHtml(c.id)}" title="Editar o eliminar">⋮</button>
        <div class="campaign-settings-menu" data-menu-for="${escapeHtml(c.id)}" hidden>
          <button type="button" data-action="campaign-edit" data-id="${escapeHtml(c.id)}">Editar</button>
          <button type="button" data-action="campaign-delete" data-id="${escapeHtml(c.id)}">Eliminar campaña</button>
        </div>
      </td>
    </tr>
  `).join('');

  const resumen = document.getElementById('comparacion-resumen');
  if (resumen) {
    if (rows.length >= 2) {
      resumen.textContent = `${rows[0].nombre} es la campaña con mejor CPL en histórico.`;
    } else if (rows.length === 1) {
      resumen.textContent = `Hay 1 campaña guardada: ${rows[0].nombre}.`;
    } else {
      resumen.textContent = 'Aún no hay campañas guardadas en Hoja 3.';
    }
  }
}

function renderCampaniaEnModoEdicion(id) {
  const row = document.querySelector(`#tabla-comparacion tbody tr[data-campaign-id="${CSS.escape(String(id))}"]`);
  const campaña = obtenerCampaniaPorId(id);
  if (!row || !campaña) return;
  const c = campaña;
  row.classList.add('editing');
  row.innerHTML = `
    <td><input type="text" data-edit="nombre" value="${escapeHtml(c.nombre)}"></td>
    <td><input type="date" data-edit="fechaInicio" value="${escapeHtml(c.fechaInicio)}"></td>
    <td><input type="date" data-edit="fechaFin" value="${escapeHtml(c.fechaFin)}"></td>
    <td><input type="number" min="0" step="1" data-edit="clics" value="${Number.isFinite(c.clics) ? c.clics : 0}"></td>
    <td><input type="number" min="0" step="1" data-edit="impresiones" value="${Number.isFinite(c.impresiones) ? c.impresiones : 0}"></td>
    <td><input type="number" min="0" step="0.01" data-edit="coste" value="${Number.isFinite(c.coste) ? c.coste : 0}"></td>
    <td><input type="number" min="0" step="1" data-edit="leads" value="${Number.isFinite(c.leads) ? c.leads : 0}"></td>
    <td>${Number.isFinite(c.cpl) ? `${c.cpl.toFixed(2)} €` : ''}</td>
    <td class="campaign-actions-cell editing-actions">
      <button type="button" class="campaign-inline-btn" data-action="campaign-save" data-id="${escapeHtml(c.id)}">Guardar</button>
      <button type="button" class="campaign-inline-btn secondary" data-action="campaign-cancel" data-id="${escapeHtml(c.id)}">Cancelar</button>
    </td>
  `;
}

function cerrarMenusCampanias(exceptId) {
  document.querySelectorAll('.campaign-settings-menu').forEach(menu => {
    if (exceptId && menu.dataset.menuFor === String(exceptId)) return;
    menu.hidden = true;
  });
}

function obtenerPayloadCampaniaDesdeFila(row, id) {
  const campaña = obtenerCampaniaPorId(id);
  const getInput = (field) => row.querySelector(`[data-edit="${field}"]`);
  const base = {
    id: String(id || ''),
    nombre: String(getInput('nombre')?.value || '').trim(),
    fechaInicio: String(getInput('fechaInicio')?.value || '').trim(),
    fechaFin: String(getInput('fechaFin')?.value || '').trim(),
    clics: Number(getInput('clics')?.value || ''),
    impresiones: Number(getInput('impresiones')?.value || ''),
    coste: Number(getInput('coste')?.value || ''),
    leads: Number(getInput('leads')?.value || ''),
    promocionId: String(campaña?.promocionId || ''),
    promocionNombre: String(campaña?.promocionNombre || ''),
    timestamp: new Date().toISOString()
  };
  return { ...base, ...calcularMetricasCampania(base) };
}

async function actualizarCampania(campaign) {
  const body = new URLSearchParams();
  body.set('action', 'updateCampaign');
  body.set('campaign', JSON.stringify(campaign));
  const response = await fetch(urlApi, { method: 'POST', body });
  return response.json();
}

async function eliminarCampania(id) {
  const body = new URLSearchParams();
  body.set('action', 'deleteCampaign');
  body.set('id', String(id || ''));
  const response = await fetch(urlApi, { method: 'POST', body });
  return response.json();
}

function configurarEventosComparacionCampanias() {
  const tabla = document.getElementById('tabla-comparacion');
  if (!tabla) return;

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.campaign-actions-cell')) {
      cerrarMenusCampanias();
    }
  });

  tabla.addEventListener('click', async (event) => {
    const rowCampania = event.target.closest('tr[data-campaign-id]');
    if (rowCampania && !event.target.closest('.campaign-actions-cell') && !event.target.closest('input') && !event.target.closest('button')) {
      cargarCampaniaEnResumen(rowCampania.dataset.campaignId);
      return;
    }

    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id;
    if (!id) return;

    if (action === 'campaign-open-menu') {
      const menu = tabla.querySelector(`.campaign-settings-menu[data-menu-for="${CSS.escape(String(id))}"]`);
      if (!menu) return;
      const willOpen = menu.hidden;
      cerrarMenusCampanias(id);
      menu.hidden = !willOpen;
      return;
    }

    if (action === 'campaign-edit') {
      cerrarMenusCampanias();
      renderCampaniaEnModoEdicion(id);
      return;
    }

    if (action === 'campaign-cancel') {
      renderCampaniasEnComparacion();
      return;
    }

    if (action === 'campaign-save') {
      const row = target.closest('tr');
      if (!row) return;
      const payload = obtenerPayloadCampaniaDesdeFila(row, id);
      const msg = document.getElementById('guardar-campania-msg');
      if (!validarBaseCampania(payload)) {
        if (msg) msg.textContent = 'Revisa los datos de edición: nombre, fechas válidas y valores numéricos ≥ 0.';
        return;
      }
      target.disabled = true;
      try {
        const result = await actualizarCampania(payload);
        if (result.status !== 'success') {
          throw new Error(result.message || 'No se pudo actualizar la campaña');
        }
        campañasGuardadas = campañasGuardadas.map(c => String(c.id) === String(id) ? normalizarCampaniaRow(payload) : c);
        if (msg) msg.textContent = 'Campaña actualizada correctamente.';
        renderCampaniasEnComparacion();
      } catch (error) {
        console.error('Error al actualizar campaña:', error);
        if (msg) msg.textContent = 'Error al actualizar campaña.';
      } finally {
        target.disabled = false;
      }
      return;
    }

    if (action === 'campaign-delete') {
      cerrarMenusCampanias();
      if (!window.confirm('¿Seguro que quieres eliminar esta campaña? Esta acción no se puede deshacer.')) return;
      const msg = document.getElementById('guardar-campania-msg');
      target.disabled = true;
      try {
        const result = await eliminarCampania(id);
        if (result.status !== 'success') {
          throw new Error(result.message || 'No se pudo eliminar la campaña');
        }
        campañasGuardadas = campañasGuardadas.filter(c => String(c.id) !== String(id));
        if (msg) msg.textContent = 'Campaña eliminada correctamente.';
        renderCampaniasEnComparacion();
      } catch (error) {
        console.error('Error al eliminar campaña:', error);
        if (msg) msg.textContent = 'Error al eliminar campaña.';
      } finally {
        target.disabled = false;
      }
    }
  });
}

async function cargarCampaniasGuardadas() {
  try {
    const response = await fetch(`${urlApi}?action=getCampaigns`);
    const result = await response.json();
    if (result.status === 'success' && Array.isArray(result.data)) {
      campañasGuardadas = result.data.map(normalizarCampaniaRow);
      renderCampaniasEnComparacion();
    }
  } catch (error) {
    console.error('Error al cargar campañas guardadas:', error);
  }
}

async function guardarCampaña() {
  const btnGuardar = document.getElementById('btn-guardar-campania');
  const nombre = String(document.getElementById('camp-nombre')?.value || '').trim();
  const fechaInicio = String(document.getElementById('input-fecha-inicio')?.value || '').trim();
  const fechaFin = String(document.getElementById('input-fecha-fin')?.value || '').trim();
  const clics = Number(document.getElementById('input-clics')?.value || '');
  const impresiones = Number(document.getElementById('input-impresiones')?.value || '');
  const coste = Number(document.getElementById('input-coste')?.value || '');
  const leads = Number(document.getElementById('input-formularios')?.value || '');
  const promocionId = String(document.getElementById('embudo-categoria')?.value || 'all').trim();
  const promocionNombre = String(document.getElementById('embudo-categoria')?.selectedOptions?.[0]?.textContent || 'Todo').trim();
  const msg = document.getElementById('guardar-campania-msg');

  const metricToNumber = (id) => {
    const raw = String(document.getElementById(id)?.textContent || '').replace(',', '.').replace(/[^0-9.-]/g, '');
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const invalidBase = !nombre || !fechaInicio || !fechaFin || !Number.isFinite(clics) || !Number.isFinite(impresiones) || !Number.isFinite(coste) || !Number.isFinite(leads);
  const invalidNums = [clics, impresiones, coste, leads].some(v => v < 0);
  const dInicio = new Date(fechaInicio + 'T00:00:00');
  const dFin = new Date(fechaFin + 'T00:00:00');
  if (invalidBase || invalidNums || isNaN(dInicio) || isNaN(dFin) || dInicio >= dFin) {
    if (msg) msg.textContent = 'Completa correctamente el RESUMEN DE CAMPAÑA y el nombre de campaña antes de guardar.';
    return;
  }

  const unDia = 1000 * 60 * 60 * 24;
  const diasCampania = Math.floor((dFin - dInicio) / unDia) + 1;
  // Usar exactamente métricas ya calculadas por el RESUMEN/RENDIMIENTO (sin recalcular fórmulas aquí)
  const ctr = metricToNumber('res-ctr');
  const cpc = metricToNumber('res-cpc');
  const cpl = metricToNumber('res-cpl');
  const conversion = metricToNumber('res-conv');
  const clicsDia = metricToNumber('res-dia-clics');
  const impresionesDia = metricToNumber('res-dia-impresiones');
  const costeDia = metricToNumber('res-dia-coste');
  const leadsDia = metricToNumber('res-dia-leads');

  const campaña = {
    action: 'saveCampaign',
    campaign: {
      id: `camp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      nombre,
      promocionId,
      promocionNombre,
      fechaInicio,
      fechaFin,
      clics,
      impresiones,
      coste,
      leads,
      ctr: ctr ?? 0,
      cpc: cpc ?? 0,
      cpl: cpl ?? 0,
      conversion: conversion ?? 0,
      diasCampania,
      clicsDia: clicsDia ?? 0,
      impresionesDia: impresionesDia ?? 0,
      costeDia: costeDia ?? 0,
      leadsDia: leadsDia ?? 0,
      timestamp: new Date().toISOString()
    }
  };

  try {
    if (btnGuardar) {
      btnGuardar.classList.add('loading');
      btnGuardar.disabled = true;
    }
    const body = new URLSearchParams();
    body.set('action', 'saveCampaign');
    body.set('campaign', JSON.stringify(campaña.campaign));
    const response = await fetch(urlApi, {
      method: 'POST',
      body
    });
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'No se pudo guardar campaña');
    }
    if (msg) msg.textContent = 'Campaña guardada correctamente.';
    await cargarCampaniasGuardadas();
  } catch (error) {
    console.error('Error al guardar campaña:', error);
    if (msg) msg.textContent = 'Error al guardar campaña.';
  } finally {
    if (btnGuardar) {
      btnGuardar.classList.remove('loading');
      btnGuardar.disabled = false;
    }
  }
}

function calcularEmbudo() {
  const clics = parseOptionalNumber('input-clics');
  const coste = parseOptionalNumber('input-coste');
  const categoriaFiltro = document.getElementById('embudo-categoria')?.value || 'all';
  const fechaInicio = document.getElementById('input-fecha-inicio').value;
  const finVal = document.getElementById('input-fecha-fin').value;

  if (!datosGlobales) {
    return;
  }
  const contactosEnRango = getContactosFiltradosPorRango(datosGlobales.dataCompleta, fechaInicio, finVal, categoriaFiltro);

  const formularios = contactosEnRango.length;
  document.getElementById('input-formularios').value = formularios;
  const impresionesResumen = parseOptionalNumber('input-impresiones');
  const clicsResumen = clics;

  const cpc = safeCalculate(() => coste / clics, [coste, clics]);
  const conv = safeCalculate(() => Math.min((formularios / clics) * 100, 100), [formularios, clics]);
  const cpl = safeCalculate(() => coste / formularios, [coste, formularios]);
  const ctrCalc = safeCalculate(() => (clicsResumen / impresionesResumen) * 100, [clicsResumen, impresionesResumen]);
  const clicsPorFormulario = safeCalculate(() => clicsResumen / formularios, [clicsResumen, formularios]);
  const costePorLeadDesdeClic = safeCalculate(() => coste / formularios, [coste, formularios]);

  setMetricValue('res-cpc', cpc);
  setMetricValue('res-conv', conv, '%');
  setMetricValue('res-cpl', cpl, '€');
  setMetricValue('res-ctr', ctrCalc, '%');
  setMetricValue('res-coste-lead-click', costePorLeadDesdeClic, '€');

  // Rendimiento diario
  const dailyLeads = getDailyLeads(fechaInicio, finVal, contactosEnRango);
  const diasCampania = dailyLeads.length || null;
  const clicsDia = safeCalculate(() => clicsResumen / diasCampania, [clicsResumen, diasCampania]);
  const impresionesDia = safeCalculate(() => impresionesResumen / diasCampania, [impresionesResumen, diasCampania]);
  const costeDia = safeCalculate(() => coste / diasCampania, [coste, diasCampania]);
  const leadsDia = safeCalculate(() => formularios / diasCampania, [formularios, diasCampania]);

  setMetricValue('res-dia-clics', clicsDia);
  setMetricValue('res-dia-impresiones', impresionesDia);
  setMetricValue('res-dia-coste', costeDia, '€');
  setMetricValue('res-dia-leads', leadsDia);

  renderCampaniasEnComparacion();
  actualizarDiagnosticoEmbudo({ ctrCalc, conv, cpc, cpl, clicsPorFormulario });
}



function exportarDatos() {
  if (!datosGlobales) {
    alert('No hay datos para exportar');
    return;
  }

  const nota = document.getElementById('nota-texto').value.trim();
  
  const tipoFiltro = document.getElementById('filtro-tipo').value;
  let rangoFechas = 'Todos los datos';
  
  if (tipoFiltro === 'mensual') {
    const mesSeleccionado = document.getElementById('filtro-mes').value;
    if (mesSeleccionado) {
      const fecha = new Date(mesSeleccionado + '-01');
      rangoFechas = fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    }
  } else if (tipoFiltro === 'rango') {
    const inicio = document.getElementById('filtro-inicio').value;
    const fin = document.getElementById('filtro-fin').value;
    if (inicio && fin) {
      rangoFechas = `${new Date(inicio).toLocaleDateString('es-ES')} - ${new Date(fin).toLocaleDateString('es-ES')}`;
    }
  }

  // Calcular porcentajes
  const porcNormal = datosGlobales.total > 0 ? ((datosGlobales.viviendaNormal / datosGlobales.total) * 100).toFixed(1) : 0;
  const porcVillas = datosGlobales.total > 0 ? ((datosGlobales.villasIsla / datosGlobales.total) * 100).toFixed(1) : 0;

  // Top 5 procedencias
  const topProcedencias = Object.entries(datosGlobales.procedencias)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);

  const maxProcedencia = topProcedencias.length > 0 ? topProcedencias[0][1] : 1;

  // Crear HTML con estilos embebidos
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen de Contactos - Proyectopía</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 2rem;
      color: #1a202c;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #667eea;
      padding-bottom: 2rem;
      margin-bottom: 2rem;
    }
    .header h1 {
      font-size: 2.5rem;
      color: #667eea;
      margin-bottom: 0.5rem;
    }
    .header .date {
      color: #718096;
      font-size: 1rem;
    }
    .info-box {
      background: #f7fafc;
      border-left: 4px solid #667eea;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
      border-radius: 8px;
    }
    .section {
      margin-bottom: 3rem;
    }
    .section-title {
      font-size: 1.5rem;
      color: #2d3748;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .kpi-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 16px;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
      text-align: center;
    }
    .kpi-label {
      font-size: 0.9rem;
      opacity: 0.9;
      margin-bottom: 0.5rem;
    }
    .kpi-value {
      font-size: 3rem;
      font-weight: bold;
      margin-bottom: 0.5rem;
    }
    .kpi-percentage {
      font-size: 0.9rem;
      opacity: 0.8;
    }
    .chart-container {
      background: #f7fafc;
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 1.5rem;
    }
    .bar-item {
      margin-bottom: 1.5rem;
    }
    .bar-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 0.5rem;
      font-weight: 600;
      color: #2d3748;
    }
    .bar-bg {
      width: 100%;
      height: 30px;
      background: #e2e8f0;
      border-radius: 15px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-right: 1rem;
      color: white;
      font-weight: bold;
      font-size: 0.9rem;
      border-radius: 15px;
    }
    .nota-section {
      background: #fff5e6;
      border-left: 4px solid #ed8936;
      padding: 1.5rem;
      border-radius: 8px;
      margin-top: 2rem;
    }
    .nota-title {
      font-weight: 600;
      color: #ed8936;
      margin-bottom: 0.5rem;
    }
    .pie-chart {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3rem;
      margin: 2rem 0;
    }
    .pie-svg {
      width: 200px;
      height: 200px;
    }
    .legend {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .legend-color {
      width: 30px;
      height: 20px;
      border-radius: 4px;
    }
    @media print {
      body { background: white; padding: 0; }
      .container { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Resumen de Contactos</h1>
      <p style="font-size: 1.2rem; color: #667eea; margin: 0.5rem 0;">PROYECTOPÍA</p>
      <p class="date">Fecha de exportación: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
    </div>

    <div class="info-box">
      <strong>Período analizado:</strong> ${rangoFechas}
    </div>

    <div class="section">
      <div class="section-title">📈 Métricas Principales</div>
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Total Contactos</div>
          <div class="kpi-value">${datosGlobales.total}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Vivienda Normal</div>
          <div class="kpi-value">${datosGlobales.viviendaNormal}</div>
          <div class="kpi-percentage">${porcNormal}% del total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Villas Cortegada</div>
          <div class="kpi-value">${datosGlobales.villasIsla}</div>
          <div class="kpi-percentage">${porcVillas}% del total</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ubicaciones</div>
          <div class="kpi-value">${Object.keys(datosGlobales.ubicacionesPorProv).length}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">🥧 Distribución por Tipo</div>
      <div class="pie-chart">
        <svg class="pie-svg" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" fill="#48bb78" 
            stroke-dasharray="${(datosGlobales.viviendaNormal / datosGlobales.total * 502.4).toFixed(1)} 502.4"
            stroke-dashoffset="0"
            stroke-width="80"
            fill="none"
            transform="rotate(-90 100 100)"/>
          <circle cx="100" cy="100" r="80" fill="#9f7aea" 
            stroke-dasharray="${(datosGlobales.villasIsla / datosGlobales.total * 502.4).toFixed(1)} 502.4"
            stroke-dashoffset="${-(datosGlobales.viviendaNormal / datosGlobales.total * 502.4).toFixed(1)}"
            stroke-width="80"
            fill="none"
            transform="rotate(-90 100 100)"/>
          <circle cx="100" cy="100" r="40" fill="white"/>
          <text x="100" y="95" text-anchor="middle" font-size="18" fill="#1a202c" font-weight="bold">${datosGlobales.total}</text>
          <text x="100" y="115" text-anchor="middle" font-size="12" fill="#718096">Total</text>
        </svg>
        <div class="legend">
          <div class="legend-item">
            <div class="legend-color" style="background: #48bb78;"></div>
            <div>
              <div style="font-weight: 600;">Vivienda Normal</div>
              <div style="color: #718096; font-size: 0.9rem;">${datosGlobales.viviendaNormal} contactos (${porcNormal}%)</div>
            </div>
          </div>
          <div class="legend-item">
            <div class="legend-color" style="background: #9f7aea;"></div>
            <div>
              <div style="font-weight: 600;">Villas Cortegada</div>
              <div style="color: #718096; font-size: 0.9rem;">${datosGlobales.villasIsla} contactos (${porcVillas}%)</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">📍 Top 5 Procedencias</div>
      <div class="chart-container">
        ${topProcedencias.map(([proc, count]) => {
          const percentage = ((count / datosGlobales.total) * 100).toFixed(1);
          const width = ((count / maxProcedencia) * 100).toFixed(1);
          return `
            <div class="bar-item">
              <div class="bar-header">
                <span>${proc}</span>
                <span>${count} (${percentage}%)</span>
              </div>
              <div class="bar-bg">
                <div class="bar-fill" style="width: ${width}%">${percentage}%</div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    ${nota ? `
    <div class="nota-section">
      <div class="nota-title">📝 Nota del Usuario</div>
      <p>${nota.replace(/\n/g, '<br>')}</p>
    </div>
    ` : ''}

  </div>
</body>
</html>
  `;

  // Crear blob y descargar
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const link = document.createElement('a');
  const fechaExport = new Date().toISOString().split('T')[0];
  link.href = URL.createObjectURL(blob);
  link.download = `resumen-contactos-${fechaExport}.html`;
  link.click();
  
  alert('✅ Resumen exportado correctamente.\n\n💡 Tip: Puedes abrir el archivo .html con Excel o cualquier navegador.');
}

function ocultarLoading() {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('dashboard-content').style.display = 'block';
  if (datosGlobales) mostrarDashboard();
}
function configurarNotasExport() {
  const btnToggleNota = document.getElementById('btn-toggle-nota');
  const notaContainer = document.getElementById('nota-container');
  const btnExportar = document.getElementById('btn-exportar');

  if (btnToggleNota) {
    btnToggleNota.addEventListener('click', () => {
      if (notaContainer.style.display === 'none') {
        notaContainer.style.display = 'block';
      } else {
        notaContainer.style.display = 'none';
      }
    });
  }

  if (btnExportar) {
    btnExportar.addEventListener('click', exportarDatos);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  configurarFiltros();
  configurarEmbudo();
  configurarEventosComparacionCampanias();
  configurarNotasExport();
  cargarDatos();
});
