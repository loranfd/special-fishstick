(function (global) {
  const BASE_CATEGORY_IDS = {
    NORMAL: 'vivienda_normal',
    VILLAS: 'villas_isla_cortegada'
  };

  const BASE_CATEGORIES = [
    {
      id: BASE_CATEGORY_IDS.NORMAL,
      nombre: 'Vivienda Normal',
      activa: true,
      matcher: { by: 'default' },
      formulario: { tipo: 'standard', campos: [] },
      detalle: { tipo: 'standard', campos: [] },
      email: {
        asunto: 'Seguimiento de tu consulta',
        cuerpo: 'Gracias por contactar con nosotros.',
        recordatorio: ''
      },
      exportacion: { tipo: 'normal', prefijoArchivo: 'Vivienda_Normal' },
      wordpress: { flujo: 'default' }
    },
    {
      id: BASE_CATEGORY_IDS.VILLAS,
      nombre: 'Villas Isla de Cortegada',
      activa: true,
      matcher: {
        by: 'vivienda-interesada',
        keywords: ['promocion general', 'vivienda 03', 'vivienda 04', 'vivienda 05', 'villas isla de cortegada'],
        aliases: ['villas isla de cortegada', 'villas', 'promo villa', 'promocion villa']
      },
      formulario: { tipo: 'standard', campos: [] },
      detalle: { tipo: 'standard', campos: [] },
      email: {
        asunto: 'Información de Villas Isla de Cortegada',
        cuerpo: 'Le compartimos la información solicitada.',
        recordatorio: ''
      },
      exportacion: { tipo: 'villas', prefijoArchivo: 'Villas_Isla_de_Cortegada' },
      wordpress: { flujo: 'default' }
    }
  ];

  const BASE_BY_ID = BASE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  }, {});

  function normalizeString(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function sanitizeMatcher(matcher) {
    const by = matcher?.by || 'manual';
    return {
      by,
      keywords: Array.isArray(matcher?.keywords) ? matcher.keywords.filter(Boolean) : [],
      aliases: Array.isArray(matcher?.aliases) ? matcher.aliases.filter(Boolean) : [],
      value: matcher?.value || ''
    };
  }

  function sanitizeCampos(campos) {
    if (Array.isArray(campos)) return campos.map(v => String(v || '').trim()).filter(Boolean);
    if (typeof campos === 'string') {
      return campos.split(',').map(v => String(v || '').trim()).filter(Boolean);
    }
    return [];
  }

  function sanitizeActiva(value) {
    if (typeof value === 'boolean') return value;
    const normalized = normalizeString(value);
    if (!normalized) return true;
    if (['false', '0', 'no', 'oculta', 'inactiva', 'off'].includes(normalized)) return false;
    return true;
  }

  function mergeWithBase(cat) {
    const base = BASE_BY_ID[cat.id] ? deepClone(BASE_BY_ID[cat.id]) : {};
    const detalleRaw = cat.detalle || cat.formulario?.detalle || base.detalle || base.formulario?.detalle || {};
    return {
      ...base,
      ...cat,
      activa: sanitizeActiva(cat.activa ?? base.activa),
      matcher: sanitizeMatcher({ ...(base.matcher || {}), ...(cat.matcher || {}) }),
      formulario: {
        tipo: ['custom', 'compact'].includes(cat.formulario?.tipo) ? cat.formulario.tipo : (base.formulario?.tipo || 'standard'),
        campos: sanitizeCampos(cat.formulario?.campos).length
          ? sanitizeCampos(cat.formulario?.campos)
          : sanitizeCampos(base.formulario?.campos || []),
        viviendaInteresadaOpciones: Array.isArray(cat.formulario?.viviendaInteresadaOpciones)
          ? cat.formulario.viviendaInteresadaOpciones.map(v => String(v || '').trim()).filter(Boolean)
          : (Array.isArray(base.formulario?.viviendaInteresadaOpciones)
            ? base.formulario.viviendaInteresadaOpciones.map(v => String(v || '').trim()).filter(Boolean)
            : [])
      },
      detalle: {
        tipo: detalleRaw?.tipo === 'custom' ? 'custom' : (base.detalle?.tipo || 'standard'),
        campos: sanitizeCampos(detalleRaw?.campos).length
          ? sanitizeCampos(detalleRaw?.campos)
          : sanitizeCampos(base.detalle?.campos || [])
      },
      email: {
        asunto: cat.email?.asunto ?? base.email?.asunto ?? '',
        cuerpo: cat.email?.cuerpo ?? base.email?.cuerpo ?? '',
        recordatorio: cat.email?.recordatorio ?? base.email?.recordatorio ?? ''
      },
      exportacion: {
        tipo: cat.exportacion?.tipo || base.exportacion?.tipo || 'normal',
        prefijoArchivo: cat.exportacion?.prefijoArchivo || base.exportacion?.prefijoArchivo || ''
      },
      wordpress: {
        flujo: cat.wordpress?.flujo || base.wordpress?.flujo || 'default'
      }
    };
  }

  function ensureBaseCategories(categorias) {
    const result = [...categorias];
    BASE_CATEGORIES.forEach(base => {
      if (!result.some(c => c.id === base.id)) {
        result.push(deepClone(base));
      }
    });
    return result;
  }

  function getDefaultAppConfig() {
    return { categorias: deepClone(BASE_CATEGORIES) };
  }

  function normalizeConfig(config) {
    const categoriasRaw = Array.isArray(config?.categorias) ? config.categorias : [];
    const categorias = categoriasRaw.map((cat, idx) => mergeWithBase({
      ...cat,
      id: cat.id || `categoria_${idx + 1}`,
      nombre: cat.nombre || `Categoría ${idx + 1}`,
      activa: sanitizeActiva(cat.activa)
    }));

    return {
      categorias: ensureBaseCategories(categorias).map(mergeWithBase)
    };
  }

  function getCategoriaById(config, id) {
    return config?.categorias?.find(c => c.id === id) || null;
  }

  function matchByInteres(categoria, contacto, interes) {
    if (categoria.matcher?.by !== 'interes') return false;
    const expected = normalizeString(categoria.matcher?.value || categoria.nombre);
    return expected && interes === expected;
  }

  function matchByNombre(categoria, interes, viviendaInteresada) {
    const nombreNormalizado = normalizeString(categoria.nombre);
    const alias = (categoria.matcher?.aliases || []).map(normalizeString).filter(Boolean);
    const keys = [nombreNormalizado, ...alias];
    const hayMatchInteres = keys.some(k => k && (interes === k || interes.includes(k)));
    if (hayMatchInteres) return true;
    return keys.some(k => k && viviendaInteresada.includes(k));
  }

  function matchByViviendaInteresada(categoria, contacto, viviendaInteresada) {
    if (categoria.matcher?.by !== 'vivienda-interesada') return false;
    const keywords = (categoria.matcher?.keywords || []).map(normalizeString).filter(Boolean);
    if (keywords.length === 0) return false;
    return keywords.some(k => viviendaInteresada.includes(k));
  }

  function resolveCategoria(config, contacto) {
    const safeConfig = normalizeConfig(config || getDefaultAppConfig());
    const categorias = safeConfig.categorias;
    const categoriaId = normalizeString(contacto?.['categoria-id'] || contacto?.categoriaId || contacto?.categoria_id);
    if (categoriaId) {
      const exact = categorias.find(c => normalizeString(c.id) === categoriaId);
      if (exact) return exact;
    }

    const interes = normalizeString(contacto?.interes || contacto?.['interes-select'] || contacto?.['interes-otros']);
    const viviendaInteresada = normalizeString(contacto?.['vivienda-interesada']);

    const byInteres = categorias.find(c => matchByInteres(c, contacto, interes));
    if (byInteres) return byInteres;

    const byNombre = categorias.find(c => matchByNombre(c, interes, viviendaInteresada));
    if (byNombre) return byNombre;

    const byVivienda = categorias.find(c => matchByViviendaInteresada(c, contacto, viviendaInteresada));
    if (byVivienda) return byVivienda;

    const byDefault = categorias.find(c => c.matcher?.by === 'default');
    if (byDefault) return byDefault;

    return getCategoriaById(safeConfig, BASE_CATEGORY_IDS.NORMAL) || categorias[0] || null;
  }

  function shouldUseCompactForm(categoria) {
    if (!categoria) return false;
    return normalizeString(categoria?.id) === normalizeString(BASE_CATEGORY_IDS.VILLAS) || categoria.formulario?.tipo === 'compact';
  }

  function isProtectedBaseCategoryId(categoryId) {
    const id = normalizeString(categoryId);
    return id === normalizeString(BASE_CATEGORY_IDS.NORMAL) || id === normalizeString(BASE_CATEGORY_IDS.VILLAS);
  }

  function isVillasCategory(categoria) {
    return normalizeString(categoria?.id) === normalizeString(BASE_CATEGORY_IDS.VILLAS);
  }

  function buildTipoViviendaLabel(config, contacto) {
    const categoria = resolveCategoria(config, contacto);
    if (!categoria) return 'Vivienda Normal';
    return categoria.nombre || 'Vivienda Normal';
  }

  function serializeCategoriaForPayload(config, data) {
    const categoria = resolveCategoria(config, data);
    if (!categoria) return data;
    return {
      ...data,
      'categoria-id': categoria.id,
      interes: data.interes || categoria.nombre
    };
  }

  global.CategoriaSystem = {
    BASE_CATEGORY_IDS,
    getDefaultAppConfig,
    normalizeConfig,
    normalizeString,
    getCategoriaById,
    resolveCategoria,
    shouldUseCompactForm,
    isProtectedBaseCategoryId,
    isVillasCategory,
    buildTipoViviendaLabel,
    serializeCategoriaForPayload
  };
})(window);