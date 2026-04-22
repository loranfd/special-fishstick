document.addEventListener('DOMContentLoaded', () => {

  function mapearCampos(data) {
    const mapeo = {
      'origen-contacto': 'procedencia-contacto',
      'origen-otros-text': 'como-conocido-otros',
      'ubicacion': 'ubicacion-terreno',
    };
  
    const resultado = {};
    for (const key in data) {
      if (mapeo[key]) {
        resultado[mapeo[key]] = data[key];
      } else {
        resultado[key] = data[key];
      }
    }
    return resultado;
  }
  
  const apiUrl = 'https://script.google.com/macros/s/AKfycbzhw3QMxMyVBuSzbabj8wPc5hm5X75AODXqz7Kn737rn46G670fl844EWLhy0G13bc/exec';
  let datosGuardados = null;
  let appConfig = CategoriaSystem.getDefaultAppConfig();

  const cargarConfigCategorias = async () => {
    try {
      const resp = await fetch(`${apiUrl}?action=getConfig`);
      const json = await resp.json();
      appConfig = CategoriaSystem.normalizeConfig(json?.config || CategoriaSystem.getDefaultAppConfig());
    } catch (_) {
      appConfig = CategoriaSystem.getDefaultAppConfig();
    }
  };

  const poblarInteresesDesdeConfig = () => {
    if (!interesSelect) return;
    const categoriasActivas = (appConfig?.categorias || []).filter(c => c.activa !== false);
    const previous = interesSelect.value;
    interesSelect.innerHTML = '<option value="">Seleccione...</option>';
    categoriasActivas.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.nombre;
      option.textContent = cat.nombre;
      option.dataset.categoriaId = cat.id;
      interesSelect.appendChild(option);
    });
    const otros = document.createElement('option');
    otros.value = 'Otros';
    otros.textContent = 'Otros';
    interesSelect.appendChild(otros);
    interesSelect.value = [...interesSelect.options].some(o => o.value === previous) ? previous : '';
  };

  const aplicarVisibilidadCategoria = (categoria) => {
    if (!interesSelect?.value) {
      aplicarVistaSinInteres_();
      return;
    }
    const esCompacto = CategoriaSystem.shouldUseCompactForm(categoria);
    const mostrarViviendaInteresada = esCompacto || categoriaTieneCampo_(categoria, 'vivienda-interesada');
    aplicarOpcionesViviendaInteresada_(categoria);
    formCompletoContainer.style.display = esCompacto ? 'none' : 'block';
    viviendaInteresadaContainer.style.display = mostrarViviendaInteresada ? 'block' : 'none';
    aplicarCamposFormularioPersonalizado(categoria);
  };

  const aplicarVistaSinInteres_ = () => {
    formCompletoContainer.style.display = 'block';
    viviendaInteresadaContainer.style.display = 'none';
    const controles = formCompletoContainer.querySelectorAll('input[name], select[name], textarea[name]');
    controles.forEach(control => {
      const name = control.getAttribute('name');
      const bloque = control.closest('.mb-3, .col-md-4, .col-md-6, .col-md-8, .col-12, .mt-2') || control;
      if (!('displayOriginal' in bloque.dataset)) bloque.dataset.displayOriginal = bloque.style.display || '';
      bloque.style.display = name === 'Notas' ? bloque.dataset.displayOriginal : 'none';
    });
    formCompletoContainer.querySelectorAll('.subsection').forEach(sec => {
      if (!('displayOriginal' in sec.dataset)) sec.dataset.displayOriginal = sec.style.display || '';
      const visibles = [...sec.querySelectorAll('input[name], select[name], textarea[name]')].some(ctrl => {
        const bloqueCtrl = ctrl.closest('.mb-3, .col-md-4, .col-md-6, .col-md-8, .col-12, .mt-2') || ctrl;
        return bloqueCtrl.style.display !== 'none';
      });
      sec.style.display = visibles ? sec.dataset.displayOriginal : 'none';
    });
    formCompletoContainer.querySelectorAll('.section-header').forEach(header => {
      if (!('displayOriginal' in header.dataset)) header.dataset.displayOriginal = header.style.display || '';
      let hayVisible = false;
      let ptr = header.nextElementSibling;
      while (ptr && !ptr.classList.contains('section-header')) {
        if (ptr.style.display !== 'none') { hayVisible = true; break; }
        ptr = ptr.nextElementSibling;
      }
      header.style.display = hayVisible ? header.dataset.displayOriginal : 'none';
    });
  };

  const categoriaTieneCampo_ = (categoria, campoObjetivo) => {
    const campos = new Set((categoria?.formulario?.campos || []).map(v => String(v || '').trim()));
    return campos.has(campoObjetivo);
  };

  const aplicarCamposFormularioPersonalizado = (categoria) => {
    if (!formCompletoContainer) return;
    const aliases = {
      'radio-188': ['terreno'],
      'terreno': ['radio-188'],
      'ubicacion': ['ubicacion-terreno'],
      'ubicacion-terreno': ['ubicacion']
    };
    const siempreVisibles = new Set(['Notas']);
    const dependencias = {
      'como-conocido': ['como-conocido-otros']
    };
    const camposCustom = new Set((categoria?.formulario?.campos || []).map(v => String(v || '').trim()).filter(Boolean));
    const camposExpandidos = new Set();
    camposCustom.forEach(campo => {
      camposExpandidos.add(campo);
      (aliases[campo] || []).forEach(a => camposExpandidos.add(a));
      (dependencias[campo] || []).forEach(d => camposExpandidos.add(d));
    });
    const esCustom = ['custom', 'compact'].includes(categoria?.formulario?.tipo) && camposCustom.size > 0;
    const controles = formCompletoContainer.querySelectorAll('input[name], select[name], textarea[name]');
    controles.forEach(control => {
      const name = control.getAttribute('name');
      const bloque = control.closest('.mb-3, .col-md-4, .col-md-6, .col-md-8, .col-12, .mt-2') || control;
      if (!('displayOriginal' in bloque.dataset)) {
        bloque.dataset.displayOriginal = bloque.style.display || '';
      }
      if (!esCustom) {
        bloque.style.display = bloque.dataset.displayOriginal;
        return;
      }
      if (siempreVisibles.has(name)) {
        bloque.style.display = bloque.dataset.displayOriginal;
        return;
      }
      bloque.style.display = camposExpandidos.has(name) ? bloque.dataset.displayOriginal : 'none';
    });
    const secciones = formCompletoContainer.querySelectorAll('.subsection');
    secciones.forEach(sec => {
      if (!('displayOriginal' in sec.dataset)) sec.dataset.displayOriginal = sec.style.display || '';
      if (!esCustom) {
        sec.style.display = sec.dataset.displayOriginal;
        return;
      }
      const visibles = [...sec.querySelectorAll('input[name], select[name], textarea[name]')].some(ctrl => {
        const bloqueCtrl = ctrl.closest('.mb-3, .col-md-4, .col-md-6, .col-md-8, .col-12, .mt-2') || ctrl;
        return bloqueCtrl.style.display !== 'none';
      });
      sec.style.display = visibles ? sec.dataset.displayOriginal : 'none';
    });
    const cabeceras = formCompletoContainer.querySelectorAll('.section-header');
    cabeceras.forEach(header => {
      if (!('displayOriginal' in header.dataset)) header.dataset.displayOriginal = header.style.display || '';
      if (!esCustom) {
        header.style.display = header.dataset.displayOriginal;
        return;
      }
      let hayContenidoVisible = false;
      let ptr = header.nextElementSibling;
      while (ptr && !ptr.classList.contains('section-header')) {
        if (ptr.style.display !== 'none') {
          hayContenidoVisible = true;
          break;
        }
        ptr = ptr.nextElementSibling;
      }
      header.style.display = hayContenidoVisible ? header.dataset.displayOriginal : 'none';
    });
  };
  
  // Elementos que quieres controlar
  const origenSelect = document.getElementById('origen-contacto');
  const origenOtrosContainer = document.getElementById('origen-otros-container');
  const formCompletoContainer = document.getElementById('form-completo');
  const viviendaInteresadaContainer = document.getElementById('vivienda-interesada-container');
  const viviendaInteresadaSelect = document.getElementById('vivienda-interesada');
  const interesSelect = document.getElementById('interes');
  const interesOtrosContainer = document.getElementById('interes-otros-container');
  const terrenoSelect = document.getElementById('terreno');
  const ubicacionContainer = document.getElementById('ubicacion-container');
  const opcionesViviendaDefault_ = viviendaInteresadaSelect
    ? [...viviendaInteresadaSelect.options].map(o => ({ value: o.value, label: o.textContent }))
    : [];

  const aplicarOpcionesViviendaInteresada_ = (categoria) => {
    if (!viviendaInteresadaSelect) return;
    const opcionesConfig = Array.isArray(categoria?.formulario?.viviendaInteresadaOpciones)
      ? categoria.formulario.viviendaInteresadaOpciones.map(v => String(v || '').trim()).filter(Boolean)
      : [];
    const valorActual = viviendaInteresadaSelect.value;
    const fuente = opcionesConfig.length
      ? [{ value: '', label: 'Seleccionar' }, ...opcionesConfig.map(v => ({ value: v, label: v }))]
      : opcionesViviendaDefault_;
    viviendaInteresadaSelect.innerHTML = '';
    fuente.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      viviendaInteresadaSelect.appendChild(option);
    });
    viviendaInteresadaSelect.value = [...viviendaInteresadaSelect.options].some(o => o.value === valorActual) ? valorActual : '';
  };

  interesSelect.disabled = true;
  const configReady = cargarConfigCategorias()
    .then(poblarInteresesDesdeConfig)
    .finally(() => {
      interesSelect.disabled = false;
      if (interesSelect.value) {
        const categoria = CategoriaSystem.resolveCategoria(appConfig, { interes: interesSelect.value });
        aplicarVisibilidadCategoria(categoria);
      } else {
        aplicarVistaSinInteres_();
      }
    });
  aplicarVistaSinInteres_();
  
  // Mostrar / ocultar "Otros" origen contacto
  origenSelect.addEventListener('change', () => {
    origenOtrosContainer.style.display = origenSelect.value === 'Otros' ? 'block' : 'none';
    if (origenSelect.value !== 'Otros') {
      document.getElementById('origen-otros-text').value = '';
    }
    // Aquí no ocultamos formulario, origen siempre visible
  });
  
  // Mostrar / ocultar "Otros" interes
  interesSelect.addEventListener('change', () => {
    if (interesSelect.value === 'Otros') {
      interesOtrosContainer.style.display = 'block';
    } else {
      interesOtrosContainer.style.display = 'none';
      document.getElementById('interes-otros').value = '';
    }
    if (!interesSelect.value) {
      aplicarVistaSinInteres_();
      return;
    }
    const categoria = CategoriaSystem.resolveCategoria(appConfig, { interes: interesSelect.value });
    aplicarVisibilidadCategoria(categoria);
  });
  
  // Mostrar / ocultar ubicación terreno
  terrenoSelect.addEventListener('change', () => {
    ubicacionContainer.style.display = terrenoSelect.value === 'No' ? 'none' : 'block';
    if (terrenoSelect.value === 'No') document.getElementById('ubicacion').value = '';
  });
  
  // Actualizar barra superior con nombre y fecha
  const updateNavBar = () => {
    document.getElementById('nav-nombre').textContent = `Nombre: ${document.getElementById('nombre').value || '-'}`;
    document.getElementById('nav-fecha').textContent = `Fecha: ${document.getElementById('fecha').value || '-'}`;
  };
  document.getElementById('nombre').addEventListener('input', updateNavBar);
  document.getElementById('fecha').addEventListener('input', updateNavBar);
  
  // Variable para controlar si se está guardando
let isSaving = false;
let interesGuardado = null; // Para rastrear el interés de la ficha guardada

// Guardar datos evento
document.getElementById('guardarDatos').addEventListener('click', async () => {
  // Prevenir guardados múltiples simultáneos
  if (isSaving) {
    console.log('Ya se está guardando, evitando duplicado');
    return;
  }
  
  isSaving = true;
  
  try {
    await configReady;
    const formData = new FormData(document.getElementById('form-ficha'));
    const dataToSend = {};

    for (let [key, value] of formData.entries()) {
      if (key === 'origen-contacto') {
        dataToSend['origen-contacto'] = value;
        if (value === 'Otros') dataToSend['origen-otros-text'] = document.getElementById('origen-otros-text').value.trim();
      } else {
        dataToSend[key] = value;
      }
    }

    dataToSend['interes'] = document.getElementById('interes').value;
    if (dataToSend['interes'] === 'Otros') {
      dataToSend['interes-otros'] = document.getElementById('interes-otros').value.trim();
    }
    
    dataToSend['origen-contacto'] = dataToSend['origen-contacto'] || '—';
    // 🔧 Ajuste: mantener la lógica original pero forzar Villas cuando corresponda
const categoriaActual = CategoriaSystem.resolveCategoria(appConfig, dataToSend);
if (CategoriaSystem.shouldUseCompactForm(categoriaActual) || categoriaTieneCampo_(categoriaActual, 'vivienda-interesada')) {
  dataToSend['vivienda-interesada'] = dataToSend['vivienda-interesada'] || categoriaActual.nombre;
} else {
  dataToSend['vivienda-interesada'] = dataToSend['vivienda-interesada'] || '—';
}
dataToSend['categoria-id'] = categoriaActual.id;

    dataToSend['source'] = 'crearficha';
    dataToSend['estudio-viabilidad'] = document.getElementById('estudio-viabilidad')?.value || '';
	// NUEVO: Si el interés es "Villas isla de Cortegada", reflejarlo también como tipo de vivienda

// Asegurar que Fecha y date-33 se envíen correctamente como campos separados
const inputFechaCreacion = document.getElementById('fecha');
const inputPlazoDeseado = document.getElementById('plazo');

if (inputFechaCreacion && inputFechaCreacion.value) {
  dataToSend['Fecha'] = inputFechaCreacion.value;
}

if (inputPlazoDeseado && inputPlazoDeseado.value) {
  dataToSend['date-33'] = inputPlazoDeseado.value;
}


    // Verificar si el interés ha cambiado
    const interesActual = dataToSend['interes'];
    const hayCambioInteres = datosGuardados && interesGuardado && (interesActual !== interesGuardado);
    
    // Determinar si crear nueva ficha o actualizar existente
    if (!datosGuardados || hayCambioInteres) {
      // Primera vez o cambió el interés: crear nueva ficha
      dataToSend['ID'] = '';
      console.log(hayCambioInteres ? 'Interés cambió, creando nueva ficha' : 'Primera ficha');
    } else {
      // Ya existe ficha y no cambió el interés: actualizar la misma
      dataToSend['ID'] = document.getElementById('ficha-id').value || '';
      console.log('Actualizando ficha existente con ID:', dataToSend['ID']);
    }

    const dataMapeada = mapearCampos(dataToSend);
    console.log('Datos enviados al servidor:', dataMapeada);

    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(dataMapeada)
    });
    const result = await resp.json();
    console.log('Respuesta del servidor:', result);
    
    if (result.status === 'success') {
      alert(dataToSend['ID'] ? 'Ficha actualizada correctamente' : 'Ficha creada correctamente');
      datosGuardados = dataToSend;
      interesGuardado = interesActual; // Guardar el interés actual
      
      // Si se creó una nueva ficha, guardar el ID
      if (result.id) {
        document.getElementById('ficha-id').value = result.id;
      }
      
      document.getElementById('exportarWord').disabled = false;
	 
	 if (window.opener) {
  console.log('Enviando mensaje de refresco desde crearficha.js', dataToSend['ID'] ? 'Actualización' : 'Creación');
  window.opener.postMessage({ action: 'recargarTabla' }, '*');
}
	  
      updateNavBar();
    } else {
      alert('Error al guardar: ' + (result.message || result));
    }
  } catch (err) {
    console.error('Error al enviar datos:', err);
    alert('Error al guardar ficha: ' + err.message);
  } finally {
    // Restablecer el flag de guardado
    isSaving = false;
  }
});
  
 const generarDocumentoWord = async (datosGuardados) => {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = window.docx;

  const formatearFecha = fecha => {
    if (!fecha) return '-';
    const d = new Date(fecha);
    return isNaN(d) ? '-' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const textoALista = texto => {
    if (!texto) return ['-'];
    return texto.split(',').map(i => i.trim()).filter(Boolean);
  };

  const camposFecha = ['Fecha', 'date-33', 'fecha-llamada', 'fecha-mail', 'fecha-reunion'];
  const camposLista = [];
  const camposMultilinea = [
    'coherencia-dormitorios', 'coherencia-presupuesto', 'descripcion-vivienda', 'estancia-adicional',
    'presupuesto-deseado', 'viabilidad', 'informacion-adicional', 'info-enviada', 'imprescindible', 'Notas'
  ];

  const crearFilasTabla = (label, key, otrosKey = null, valorFijo = null) => {
    const valorOriginal = valorFijo || datosGuardados[key] || '-';
    const valorOtros = otrosKey ? datosGuardados[otrosKey] || '' : '';
    
    const labelCell = new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({ 
              text: `${label}:`, 
              bold: true, 
              size: 20, 
              font: 'Calibri',
              color: '2F4F4F'
            })
          ],
          spacing: { before: 100, after: 100 }
        })
      ],
      width: { size: 35, type: WidthType.PERCENTAGE },
      margins: { top: 200, bottom: 200, left: 300, right: 200 },
      shading: { fill: 'F8F9FA' }
    });

    if (camposFecha.includes(key)) {
      return [
        new TableRow({
          children: [
            labelCell,
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ 
                      text: formatearFecha(valorOriginal), 
                      size: 20, 
                      font: 'Calibri',
                      color: '000000'
                    })
                  ],
                  spacing: { before: 100, after: 100 }
                })
              ],
              width: { size: 65, type: WidthType.PERCENTAGE },
              margins: { top: 200, bottom: 200, left: 200, right: 300 }
            })
          ]
        })
      ];
    }

    if (camposLista.includes(key)) {
      const items = textoALista(valorOriginal);
      const filas = [
        new TableRow({
          children: [
            labelCell,
            new TableCell({
              children: items.map(item => new Paragraph({
                children: [
                  new TextRun({ 
                    text: `• ${item}`, 
                    size: 20, 
                    font: 'Calibri',
                    color: '000000'
                  })
                ],
                spacing: { before: 50, after: 50 }
              })),
              width: { size: 65, type: WidthType.PERCENTAGE },
              margins: { top: 200, bottom: 200, left: 200, right: 300 }
            })
          ]
        })
      ];
      if (otrosKey && valorOtros && items.includes('Otros')) {
        filas.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph('')],
                width: { size: 35, type: WidthType.PERCENTAGE },
                margins: { top: 100, bottom: 100, left: 300, right: 200 },
                shading: { fill: 'F8F9FA' }
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ 
                        text: `• ${valorOtros}`, 
                        size: 20, 
                        font: 'Calibri',
                        color: '000000'
                      })
                    ],
                    spacing: { before: 50, after: 50 }
                  })
                ],
                width: { size: 65, type: WidthType.PERCENTAGE },
                margins: { top: 100, bottom: 100, left: 200, right: 300 }
              })
            ]
          })
        );
      }
      return filas;
    }

    if (camposMultilinea.includes(key)) {
      const lineas = valorOriginal.split('\n').filter(l => l.trim() !== '');
      if (lineas.length === 0) {
        return [
          new TableRow({
            children: [
              labelCell,
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({ 
                        text: '-', 
                        size: 20, 
                        font: 'Calibri',
                        color: '000000'
                      })
                    ],
                    spacing: { before: 100, after: 100 }
                  })
                ],
                width: { size: 65, type: WidthType.PERCENTAGE },
                margins: { top: 200, bottom: 200, left: 200, right: 300 }
              })
            ]
          })
        ];
      }
      return [
        new TableRow({
          children: [
            labelCell,
            new TableCell({
              children: lineas.map((linea, index) => new Paragraph({
                children: [
                  new TextRun({ 
                    text: linea, 
                    size: 20, 
                    font: 'Calibri',
                    color: '000000'
                  })
                ],
                spacing: { before: index === 0 ? 100 : 50, after: index === lineas.length - 1 ? 100 : 50 }
              })),
              width: { size: 65, type: WidthType.PERCENTAGE },
              margins: { top: 200, bottom: 200, left: 200, right: 300 }
            })
          ]
        })
      ];
    }

    return [
      new TableRow({
        children: [
          labelCell,
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ 
                    text: valorOriginal, 
                    size: 20, 
                    font: 'Calibri',
                    color: '000000'
                  })
                ],
                spacing: { before: 100, after: 100 }
              })
            ],
            width: { size: 65, type: WidthType.PERCENTAGE },
            margins: { top: 200, bottom: 200, left: 200, right: 300 }
          })
        ]
      })
    ];
  };

  let secciones = [];

  const categoriaExport = CategoriaSystem.resolveCategoria(appConfig, datosGuardados);
  if (CategoriaSystem.shouldUseCompactForm(categoriaExport)) {
    secciones = [
      {
        titulo: 'VILLAS ISLA DE CORTEGADA',
        campos: [
          ['Nombre/s', 'your-name'],
          ['Correo electrónico', 'your-email'],
          ['Teléfono', 'tel-686'],
          ['Procedencia del contacto', 'origen-contacto', 'origen-otros-text'],
          ['Vivienda interesada', 'vivienda-interesada'],
          ['Notas adicionales', 'Notas']
        ]
      }
    ];
  } else {
  secciones = [
    {
      titulo: 'DATOS VÍA WEB O VÍA MAIL',
      subtitulo: 'A medida de tus posibilidades',
      campos: [
        ['Nombre/s', 'your-name'],
        ['Correo electrónico', 'your-email'],
        ['Teléfono', 'tel-686'],
        ['Dispones de terreno', 'terreno'],
        ['Ubicación del terreno', 'ubicacion'],
        ['Inversión estimada', 'number-419'],
        ['Plazo o fecha deseada', 'date-33'],
      ]
    },
    {
      subtitulo: 'A medida de tus necesidades',
      campos: [
        ['Número de plantas', 'number-420'],
        ['Superficie de la vivienda', 'number-421'],
        ['Número de dormitorios', 'number-422'],
        ['Número de baños', 'number-423'],
      ]
    },
    {
      titulo: 'LLAMADA 01',
      campos: [
        ['¿Cómo nos has conocido?', 'como-conocido', 'como-conocido-otros'],
        ['Distribución zona de día', 'distribucion-dia'],
        ['Garaje', 'garaje'],
        ['Piscina', 'piscina'],
        ['Estancia adicional', 'estancia-adicional'],
        ['Superficie de la parcela', 'superficie-parcela'],
        ['Edificabilidad', 'edificabilidad'],
        ['Ocupación', 'ocupacion'],
        ['Referencia catastral', 'referencia-catastral'],
        ['Estudio de viabilidad', 'estudio-viabilidad'],
      ]
    },
    {
      titulo: 'MAIL 01',
      campos: [
        ['Detallar información enviada', 'info-enviada'],
      ]
    },
     {
  titulo: 'ESTUDIO DE VIABILIDAD',
  campos: [
    ['Estudio de viabilidad', 'estudio-viabilidad'],
    ['Fecha de reunión', 'fecha-reunion'],
    ['Imprescindible', 'imprescindible'],
  ]
},
    {
      titulo: 'NOTAS',
      campos: [
        ['Notas adicionales', 'Notas']
      ]
    }
  ];
}

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: 20, font: 'Calibri' },
          paragraph: { spacing: { line: 360 } }
        }
      }
    },
    sections: [
      {
        properties: { 
          page: { 
            margin: { 
              top: 1440, 
              bottom: 1440, 
              left: 1440, 
              right: 1440 
            } 
          }
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: 'CUESTIONARIO 2025',
                bold: true,
                size: 32,
                font: 'Calibri',
                color: '849901'
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 600 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Cliente: ${datosGuardados['your-name'] || '-'}`,
                size: 22,
                font: 'Calibri',
                color: '2F4F4F'
              }),
              new TextRun({
                text: `     •     Fecha: ${formatearFecha(datosGuardados['Fecha'] || document.querySelector('[name=Fecha]').value || '-')}`,
                size: 22,
                font: 'Calibri',
                color: '2F4F4F'
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 400 }
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: '─'.repeat(100),
                size: 16,
                color: '849901'
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 400 }
          }),
          ...secciones.flatMap(seccion => {
            const elementos = [];
            if (seccion.titulo) {
              elementos.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: seccion.titulo,
                      bold: true,
                      size: 26,
                      font: 'Calibri',
                      color: '849901'
                    })
                  ],
                  spacing: { before: 600, after: 300 }
                })
              );
            }
            if (seccion.subtitulo) {
              elementos.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: seccion.subtitulo,
                      bold: true,
                      size: 22,
                      font: 'Calibri',
                      color: '6B7C01',
                      italics: true
                    })
                  ],
                  spacing: { before: 400, after: 200 }
                })
              );
            }
            const tableRows = seccion.campos.flatMap(([label, key, otrosKey, valorFijo]) => {
              if (key === 'ubicacion' && datosGuardados['terreno'] === 'No') return [];
              if (key === 'cualidades-otros' && !datosGuardados['cualidades']?.includes('Otros')) return [];
              if (key === 'origen-otros-text' && datosGuardados['origen-contacto'] !== 'Otros') return [];
              if (key === 'como-conocido-otros' && datosGuardados['como-conocido'] !== 'Otros') return [];
              return crearFilasTabla(label, key, otrosKey, valorFijo);
            });
            if (tableRows.length > 0) {
              elementos.push(
                new Table({
                  rows: tableRows,
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                    left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                    right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'EEEEEE' },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' }
                  }
                }),
                new Paragraph({
                  text: '',
                  spacing: { before: 0, after: 300 }
                })
              );
            }
            return elementos;
          })
        ]
      }
    ]
  });

  return await Packer.toBlob(doc);
};

// Exportar a Word
document.getElementById('exportarWord').addEventListener('click', async () => {
  if (!datosGuardados) return alert('Primero guarda los datos.');
  if (!window.docx) return alert('Librería docx no cargada.');

  const blob = await generarDocumentoWord(datosGuardados);
  const fecha = new Date();
  saveAs(blob, `cuestionario_${(datosGuardados['your-name'] || 'sin_nombre').replace(/\s+/g,'_')}_${fecha.getDate()}_${fecha.getMonth() + 1}_${fecha.getFullYear()}.docx`);
});

// Exportar con Carpeta (ZIP)
document.getElementById('exportarZip').addEventListener('click', async () => {
  if (!datosGuardados) return alert('Primero guarda los datos.');
  if (!window.docx) return alert('Librería docx no cargada.');
  if (!window.JSZip) return alert('Librería JSZip no cargada.');

  const blob = await generarDocumentoWord(datosGuardados);
  let nombrePersona = (datosGuardados['your-name'] || 'SIN_NOMBRE').toUpperCase();
  let zipFileName;
  const categoriaExport = CategoriaSystem.resolveCategoria(appConfig, datosGuardados);
  if (CategoriaSystem.shouldUseCompactForm(categoriaExport)) {
    zipFileName = `${nombrePersona} (PROMO VILLA).zip`;
  } else {
    let ubicacion = datosGuardados['ubicacion'] || 'SIN_UBICACION';
    zipFileName = `${nombrePersona} (${ubicacion.toUpperCase()}).zip`;
  }
  zipFileName = zipFileName.replace(/[/\\?%*:|"<>]/g, '_');
  const fecha = new Date();
  const docxFileName = `cuestionario_${nombrePersona.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')}_${fecha.getDate()}_${fecha.getMonth() + 1}_${fecha.getFullYear()}.docx`;
  const zip = new JSZip();
  zip.file(docxFileName, blob);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  saveAs(zipBlob, zipFileName);
});














 // Inicializar fecha de creación con fecha actual solo si está vacía
const inputFecha = document.getElementById('fecha');
if (!inputFecha.value) {
  const fechaHoy = new Date().toISOString().split('T')[0];
  inputFecha.value = fechaHoy;
}
  
  
  // Iconos SVG para botón copiar y tick
const copiarSVG = `
  <svg width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="7" width="9" height="9" rx="2" fill="#ECF0F1" stroke="#BDC3C7" stroke-width="1.5"/>
    <rect x="4" y="4" width="9" height="9" rx="2" fill="#ECF0F1" stroke="#95A5A6" stroke-width="1.2"/>
  </svg>
`;
const tickSVG = `
  <svg width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 11.3L9.15 14.5L14.2 8.5" stroke="#2ECC71" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
`;

// Elementos
const btnCopiarRef = document.getElementById('btnCopiarRef');
const inputRefCat = document.getElementById('referencia-catastral');
const btnAbrirMapa = document.getElementById('btnAbrirMapa');

// Inicializar icono copiar
if (btnCopiarRef) btnCopiarRef.innerHTML = copiarSVG;

// Evento para copiar referencia
if (btnCopiarRef) {
  btnCopiarRef.addEventListener('click', () => {
    const ref = inputRefCat.value.trim();
    if (!ref) return;
    if (navigator.clipboard && navigator.clipboard.write) {
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([ref], { type: 'text/plain' }),
      });
      navigator.clipboard.write([clipboardItem]).then(() => {
        btnCopiarRef.innerHTML = tickSVG;
        setTimeout(() => {
          btnCopiarRef.innerHTML = copiarSVG;
        }, 1500);
      }).catch(() => {
        fallbackCopy(ref);
      });
    } else {
      fallbackCopy(ref);
    }
  });
}

// Evento para abrir mapa
if (btnAbrirMapa) {
  btnAbrirMapa.addEventListener('click', (e) => {
    e.preventDefault();
    window.open("https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?buscar=S", '_blank');
  });
}

// Método fallback de copiar texto clásico
function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    btnCopiarRef.innerHTML = tickSVG;
    setTimeout(() => {
      btnCopiarRef.innerHTML = copiarSVG;
    }, 1500);
  } catch (e) {
    console.error('No se pudo copiar la referencia', e);
  }
  document.body.removeChild(textarea);
}
  
  // Evento para abrir Google Maps con la ubicación del terreno
  const btnAbrirMapaUbicacion = document.getElementById('btnAbrirMapaUbicacion');
  if (btnAbrirMapaUbicacion) {
    btnAbrirMapaUbicacion.addEventListener('click', () => {
      const ubicacion = document.getElementById('ubicacion').value.trim();
      if (!ubicacion) {
        alert('Por favor, introduce una ubicación primero');
        return;
      }
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ubicacion)}`;
      window.open(url, '_blank');
    });
  }
  
  updateNavBar();
  
});

// ============================================
// CONFIGURACIÓN CAMPO INVERSIÓN ESTIMADA
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  const inversionInput = document.getElementById('inversion');
  
  if (inversionInput) {
    // Detectar cuando se pulsa la flecha arriba estando el campo vacío
    inversionInput.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowUp' && (this.value === '' || this.value === null)) {
        e.preventDefault();
        this.value = 100000;
      }
    });
    
    // Detectar clic en las flechas del input (spinner)
    inversionInput.addEventListener('input', function(e) {
      // Si el campo tenía valor vacío y ahora tiene 5000 (primer incremento)
      if (this.value !== '' && parseFloat(this.value) === 5000) {
        this.value = 100000;
      }
    });
  }
});