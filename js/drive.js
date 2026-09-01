/* ==========================================================================
   BPA-Plus — drive.js
   Integración con Google Drive 100% desde el navegador (sin backend propio).
   Usa Google Identity Services para el login y llama directamente a la API
   de Drive con el token obtenido. El token vive solo en memoria (se pierde
   al cerrar la pestaña) — no se guarda en ningún servidor.

   Requiere que el usuario configure su propio Client ID de OAuth (gratis,
   se crea en Google Cloud Console). Ver instrucciones en README.md.
   ========================================================================== */
(function (global) {
  'use strict';
  var D = global.BPAPLUS.domain, UI = global.BPAPLUS.ui;

  var GIS_SRC = 'https://accounts.google.com/gsi/client';
  var MAMMOTH_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.7.2/mammoth.browser.min.js';
  var XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var PDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
  /* `drive.readonly` para escanear las carpetas que la droguería ya tiene; `drive.file`
     para guardar las nuestras. `drive.file` es el scope angosto: solo ve los archivos que
     esta app creó, nunca el resto del Drive. */
  var SCOPE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';

  var state = { token: null, tokenClient: null, expiresAt: 0 };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement('script'); s.src = src; s.async = true;
      s.onload = function () { resolve(); }; s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }

  function validClientId(id) { return /\.apps\.googleusercontent\.com$/i.test(String(id || '').trim()); }
  function getClientId() {
    try {
      var id = localStorage.getItem('bpa-plus-drive-client-id') || '';
      return validClientId(id) ? id : '';
    } catch (e) { return ''; }
  }
  function setClientId(id) { try { localStorage.setItem('bpa-plus-drive-client-id', id); } catch (e) {} }

  function isConnected() { return !!state.token && Date.now() < state.expiresAt; }

  function ensureAuth() {
    var clientId = getClientId();
    if (!clientId) return Promise.reject(new Error('NO_CLIENT_ID'));
    if (isConnected()) return Promise.resolve(state.token);
    return loadScript(GIS_SRC).then(function () {
      return new Promise(function (resolve, reject) {
        try {
          var client = google.accounts.oauth2.initTokenClient({
            client_id: clientId, scope: SCOPE,
            callback: function (resp) {
              if (resp.error) { reject(new Error(resp.error)); return; }
              state.token = resp.access_token;
              state.expiresAt = Date.now() + (Number(resp.expires_in) || 3300) * 1000;
              resolve(state.token);
            },
            error_callback: function (error) {
              reject(new Error(error && error.type === 'popup_failed_to_open'
                ? 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes y volvé a intentar.'
                : 'No se completó la autorización de Google.'));
            }
          });
          client.requestAccessToken({ prompt: isConnected() ? '' : 'consent' });
        } catch (e) { reject(e); }
      });
    });
  }

  function api(path, params) {
    var url = 'https://www.googleapis.com/drive/v3/' + path + (params ? '?' + params : '');
    return ensureAuth().then(function (token) {
      return fetch(url, { headers: { Authorization: 'Bearer ' + token } }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('Drive API ' + r.status + ': ' + t.slice(0, 200)); });
        return r;
      });
    });
  }

  function searchFiles(query, pageSize) {
    var q = "trashed = false and (mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' " +
      "or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/pdf')" +
      (query ? " and name contains '" + query.replace(/'/g, "\\'") + "'" : '');
    var params = 'q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,mimeType,webViewLink,modifiedTime)') +
      '&pageSize=' + (pageSize || 50) + '&orderBy=name';
    return api('files', params).then(function (r) { return r.json(); }).then(function (d) { return d.files || []; });
  }

  var LEAF_TYPES = /wordprocessingml|spreadsheetml|application\/pdf/;
  var FOLDER_TYPE = 'application/vnd.google-apps.folder';

  function listChildren(folderId) {
    var q = "'" + folderId.replace(/'/g, "\\'") + "' in parents and trashed = false";
    var params = 'q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id,name,mimeType,webViewLink,modifiedTime)') +
      '&pageSize=200&orderBy=name';
    return api('files', params).then(function (r) { return r.json(); }).then(function (d) { return d.files || []; });
  }

  /* Recorre la carpeta y sus subcarpetas (hasta 5 niveles) y devuelve solo
     archivos hoja (docx/xlsx/pdf) — las carpetas nunca se listan como si
     fueran documentos importables. */
  function filesInFolder(folderId, pageSize, _depth, _folderName) {
    _depth = _depth || 0;
    return listChildren(folderId).then(function (children) {
      var leaves = children.filter(function (c) { return c.mimeType !== FOLDER_TYPE && LEAF_TYPES.test(c.mimeType); })
        .map(function (c) { return Object.assign({}, c, { folderName: _folderName || '' }); });
      var subfolders = children.filter(function (c) { return c.mimeType === FOLDER_TYPE; });
      if (!subfolders.length || _depth >= 5) return leaves;
      return Promise.all(subfolders.map(function (f) { return filesInFolder(f.id, pageSize, _depth + 1, f.name); }))
        .then(function (nested) { return leaves.concat.apply(leaves, nested); });
    }).then(function (all) { return pageSize ? all.slice(0, pageSize) : all.slice(0, 300); });
  }

  function fileMeta(fileId) {
    return api('files/' + fileId, 'fields=' + encodeURIComponent('id,name,mimeType,webViewLink')).then(function (r) { return r.json(); });
  }

  function downloadBinary(fileId) {
    return ensureAuth().then(function (token) {
      return fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (r) { if (!r.ok) throw new Error('No se pudo descargar el archivo'); return r.arrayBuffer(); });
    });
  }

  function extractIdFromUrl(s) {
    s = (s || '').trim();
    var m = s.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/) || s.match(/^([a-zA-Z0-9_-]{20,})$/);
    return m ? m[1] : null;
  }

  /* ------------------------------ Lectura de contenido y extracción de datos ------------------------------ */
  function textFromDocx(buf) {
    return loadScript(MAMMOTH_SRC).then(function () {
      return mammoth.extractRawText({ arrayBuffer: buf }).then(function (r) { return r.value || ''; });
    });
  }
  function rowsFromXlsx(buf) {
    return loadScript(XLSX_SRC).then(function () {
      var wb = XLSX.read(buf, { type: 'array' });
      var out = [];
      wb.SheetNames.forEach(function (name) {
        var sheet = wb.Sheets[name];
        var json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' });
        (sheet['!merges'] || []).forEach(function (merge) {
          var value = sheet[XLSX.utils.encode_cell(merge.s)];
          value = value ? value.v : '';
          for (var r = merge.s.r; r <= merge.e.r; r++) {
            json[r] = json[r] || [];
            for (var c = merge.s.c; c <= merge.e.c; c++) if (json[r][c] === '' || json[r][c] == null) json[r][c] = value;
          }
        });
        out = out.concat(json);
      });
      return out;
    });
  }
  function textFromPdf(buf) {
    return import(PDF_SRC).then(function (pdfjs) {
      return pdfjs.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise;
    }).then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (page) {
        return page.getTextContent().then(function (content) { return content.items.map(function (item) { return item.str; }).join(' '); });
      }));
      var fields = typeof pdf.getFieldObjects === 'function' ? pdf.getFieldObjects() : Promise.resolve(null);
      return Promise.all([Promise.all(pages), fields]).then(function (result) {
        var filled = Object.keys(result[1] || {}).some(function (key) {
          return (result[1][key] || []).some(function (field) { return String(field.value || '').trim(); });
        });
        return result[0].join('\n') + (filled ? '\n__BPA_FILLED__' : '');
      });
    });
  }

  /* Lee un formato en blanco para configurarlo: filas de tabla cuando el archivo
     las tiene (XLSX y DOCX) y texto plano siempre. El PDF sólo da texto, así que
     de él salen los campos pero no las columnas: se revisan a mano. */
  function leerFormato(file) {
    var firma = (file.type || mimeFromFile(file)) + ' ' + file.name;
    return file.arrayBuffer().then(function (buf) {
      if (/spreadsheetml|excel|\.xlsx$/i.test(firma)) {
        return rowsFromXlsx(buf).then(function (rows) {
          return { rows: rows, text: rows.map(function (r) { return (r || []).join(' '); }).join('\n') };
        });
      }
      if (/wordprocessingml|\.docx$/i.test(firma)) {
        return loadScript(MAMMOTH_SRC)
          .then(function () { return mammoth.convertToHtml({ arrayBuffer: buf }); })
          .then(function (r) {
            var doc = new DOMParser().parseFromString(r.value || '', 'text/html');
            var rows = Array.prototype.map.call(doc.querySelectorAll('tr'), function (tr) {
              return Array.prototype.map.call(tr.cells, function (td) { return (td.textContent || '').trim(); });
            });
            return { rows: rows, text: (doc.body.textContent || '').trim() };
          });
      }
      return textFromPdf(buf).then(function (t) { return { rows: [], text: t.replace('__BPA_FILLED__', '') }; });
    });
  }

  function mimeFromFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    return file.type || (ext === 'pdf' ? 'application/pdf' : ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '');
  }
  function localFiles(fileList) {
    return Array.prototype.map.call(fileList || [], function (file) {
      var path = file.webkitRelativePath || file.name, parts = path.split('/'); parts.pop();
      return { id: 'local:' + path, name: file.name, mimeType: mimeFromFile(file), folderName: parts.join(' / '), localFile: file, modifiedTime: new Date(file.lastModified || Date.now()).toISOString() };
    }).filter(function (file) { return LEAF_TYPES.test(file.mimeType); }).slice(0, 300);
  }
  function binary(file) { return file.localFile ? file.localFile.arrayBuffer() : downloadBinary(file.id); }

  var MESES_IDX = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12 };
  function parseFechaTexto(s) {
    if (!s) return null;
    s = String(s).trim();
    var m = s.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
    m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (m) {
      var d = +m[1], mo = +m[2], y = +m[3]; if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    }
    m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/);
    if (m && MESES_IDX[m[2].slice(0, 3)]) return m[3] + '-' + String(MESES_IDX[m[2].slice(0, 3)]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    m = D.normTxt(s).match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)[a-z]*\s+(20\d{2})/);
    if (m) return m[3] + '-' + String(MESES_IDX[m[2]]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    return null;
  }

  /* kindHint: qué es el cronograma cuando ni el nombre ni el contenido lo dicen.
     Lo manda la vista desde la que se importa (Autoinspecciones → 'inspecciones'). */
  function analizarFilasCronograma(rows, file, kindHint) {
    var allText = rows.slice(0, 20).map(function (row) { return (row || []).join(' '); }).join(' ');
    var year = +(String(file.name || '').match(/\b(20\d{2})\b/) || allText.match(/\b(20\d{2})\b/) || [])[1] || new Date().getFullYear();
    var headers = [], months = {}, kind = /auto\s*inspe/i.test(file.name || '') ? 'inspecciones' : (kindHint || 'capacitaciones');
    var result = { capacitaciones: [], inspecciones: [] };
    var source = { driveFileId: file.id, driveUrl: file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view') };

    function cell(row, re) {
      for (var i = 0; i < headers.length; i++) if (re.test(D.normTxt(headers[i] || ''))) return row[i];
      return '';
    }
    function dateFor(row) {
      var explicit = cell(row, /\bfecha\b/), parsed = parseFechaTexto(explicit);
      if (parsed) return parsed;
      for (var i = 0; i < row.length; i++) {
        parsed = parseFechaTexto(row[i]); if (parsed) return parsed;
        if (!months[i] || row[i] == null || String(row[i]).trim() === '') continue;
        var day = /^\d{1,2}$/.test(String(row[i]).trim()) ? +row[i] : 1;
        if (day < 1 || day > 31) day = 1;
        return year + '-' + String(months[i]).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      }
      return '';
    }
    rows.forEach(function (row) {
      row = row || [];
      var line = D.normTxt(row.join(' '));
      if (/auto\s*inspeccion/.test(line)) kind = 'inspecciones';
      else if (/cronograma.*capacit|capacitacion/.test(line) && !/auto\s*inspeccion/.test(line)) kind = 'capacitaciones';
      row.forEach(function (value, i) {
        var n = D.normTxt(value || '').slice(0, 3);
        if (MESES_IDX[n]) months[i] = MESES_IDX[n];
      });
      var isHeader = /\b(tema|curso|area|frecuencia|periodicidad|fecha|actividad|capacitacion|responsable|dirigido|personal|sector|proceso)\b/.test(line);
      if (isHeader) {
        row.forEach(function (value, i) { if (String(value || '').trim()) headers[i] = value; });
        return;
      }
      if (!headers.length || !row.some(function (value) { return String(value || '').trim(); })) return;
      var fecha = dateFor(row); if (!fecha) return;
      if (kind === 'inspecciones') {
        var area = String(cell(row, /\b(area|sector|proceso|unidad|zona)\b/) || '').trim();
        if (!area) area = String(row.filter(function (v) { return String(v || '').trim().length > 2; })[0] || '').trim();
        if (area) result.inspecciones.push(Object.assign({ area: area, prog: fecha }, source));
      } else {
        var tema = String(cell(row, /\b(tema|curso|actividad|capacitacion|nombre)\b/) || '').trim();
        var capArea = String(cell(row, /\b(area|dirigido|personal|publico|unidad)\b/) || 'Almacén').trim();
        var frec = String(cell(row, /\b(frecuencia|periodicidad)\b/) || 'Anual').trim();
        if (tema) result.capacitaciones.push(Object.assign({ tema: tema, area: capArea || 'Almacén', frec: frec || 'Anual', fecha: fecha }, source));
      }
    });
    return result;
  }

  function analizarCronograma(file, kindHint) {
    if (!/spreadsheetml/.test(file.mimeType || '')) return Promise.reject(new Error('El cronograma debe ser un archivo XLSX'));
    return binary(file).then(rowsFromXlsx).then(function (rows) { return analizarFilasCronograma(rows, file, kindHint); });
  }

  function tipoFromName(name) {
    var n = D.normTxt(name);
    if (/\bpoe\b/.test(n)) return 'POE';
    if (/\bregistro\b/.test(n)) return 'Registro';
    if (/\b(formato|for)\b/.test(n)) return 'Formato';
    if (/\b(instructivo|ins)\b/.test(n)) return 'Instructivo';
    if (/\bmanual\b/.test(n)) return 'Manual';
    return 'Otro';
  }
  function codigoFromName(name) {
    var m = String(name || '').match(/\b(POE|REGISTRO|FORMATO|FOR|MANUAL|INSTRUCTIVO|INS)(?:[\s._-]+([A-Z]{2,8}))?[\s._-]+0*(\d{1,4})\b/i);
    if (!m) return '';
    return m[1].toUpperCase() + (m[2] ? '-' + m[2].toUpperCase() : '') + '-' + m[3].padStart(3, '0');
  }
  function normalizeCode(value) {
    var parts = String(value || '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').split('-');
    if (parts.length && /^\d+$/.test(parts[parts.length - 1])) parts[parts.length - 1] = parts[parts.length - 1].padStart(3, '0');
    return parts.join('-');
  }
  function isStandardCode(value) {
    return /^(POE|FOR|FORMATO|REG|REGISTRO|INS|INSTRUCTIVO|MAN|MANUAL|PRO|PROGRAMA|ACT|ACTA|POL)(-[A-Z]{2,8})?-\d{3,4}$/.test(normalizeCode(value));
  }
  function safePart(value) { return D.normTxt(value || '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'documento'; }
  function standardName(doc, file, role, version) {
    var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    var code = normalizeCode(doc.codigo), date = (doc.fecha || D.isoHoy()).replace(/-/g, '');
    if (role === 'registro') return code + '_' + date + '_' + Date.now() + '.' + ext;
    return code + '_' + safePart(doc.nombre) + '_V' + String(version || doc.version || 1).padStart(2, '0') + '.' + ext;
  }
  function nombreFromFile(name, codigo) {
    var base = name.replace(/\.[^.]+$/, '');
    if (codigo) {
      var head = codigo.split('-').map(function (part) { return /^\d+$/.test(part) ? part.replace(/^0+/, '') : part; }).join('\\W*0*');
      base = base.replace(new RegExp('^' + head, 'i'), '').trim();
    }
    base = base.replace(/^[\s._-]+/, '');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  /* ---------------- Reconocimiento asistido por el modelo local del navegador ----------------
     Prompt API (Gemini Nano, Chrome 138+): corre en el dispositivo, sin clave, sin
     servidor y sin que el texto del documento salga de la máquina. Solo se usa cuando
     el modelo ya está descargado y cuando el regex se quedó corto; si no está, el
     reconocimiento se queda con lo que sacó el regex y nadie se entera. */
  var AI_SCHEMA = {
    type: 'object',
    properties: {
      codigo: { type: 'string' }, nombre: { type: 'string' },
      tipo: { type: 'string', enum: ['POE', 'Formato', 'Registro', 'Instructivo', 'Manual', 'Otro'] },
      area: { type: 'string' }, version: { type: 'integer' }
    },
    required: ['codigo', 'nombre', 'tipo', 'area', 'version']
  };
  var AI_SYSTEM = 'Sos un asistente documental de Buenas Prácticas de Almacenamiento (Perú). ' +
    'Del texto de un documento devolvés su código (formato TIPO-AREA-NNN, ej. POE-ALM-001; ' +
    'cadena vacía si no aparece), su título, su tipo, el área responsable y el número de versión. ' +
    'Nunca inventes un código que no esté en el texto.';

  var aiSession = null, aiQueue = Promise.resolve();
  function aiEngine() { return global.LanguageModel || (global.ai && global.ai.languageModel) || null; }
  function aiReady() {
    var LM = aiEngine();
    if (!LM || typeof LM.availability !== 'function') return Promise.resolve(null);
    return Promise.resolve(LM.availability()).then(function (state) {
      /* 'downloadable' se ignora a propósito: bajar el modelo son cientos de MB y eso
         no se dispara por escanear una carpeta. */
      if (state !== 'available') return null;
      if (!aiSession) aiSession = LM.create({ initialPrompts: [{ role: 'system', content: AI_SYSTEM }] });
      return aiSession;
    }).catch(function () { return null; });
  }
  /* ponytail: cola serial — una sesión no acepta dos prompts a la vez, y un lote son
     decenas de archivos. Si algún día son miles, varias sesiones en paralelo. */
  function aiAsk(prompt) {
    var run = aiQueue.then(function () {
      return aiReady().then(function (session) {
        if (!session) return null;
        return session.prompt(prompt, { responseConstraint: AI_SCHEMA, omitResponseConstraintInput: true })
          .then(function (out) { return JSON.parse(out); });
      });
    }).catch(function () { return null; });
    aiQueue = run.catch(function () {});
    return run;
  }
  function aiComplete(base, text) {
    if (!text) return Promise.resolve(base);
    var prompt = 'Archivo: ' + (base._fileName || '') + '\nCarpeta: ' + (base._folderName || '') +
      '\n\n' + String(text).slice(0, 3000);
    return aiAsk(prompt).then(function (out) {
      if (!out) return base;
      if (!base.codigo && out.codigo && isStandardCode(out.codigo)) { base.codigo = normalizeCode(out.codigo); base._origen = 'ia'; }
      if (out.nombre && (!base.nombre || base._origen === 'ia')) base.nombre = String(out.nombre).slice(0, 120);
      if (base.tipo === 'Otro' && out.tipo) {
        base.tipo = out.tipo;
        base.role = base.tipo === 'Formato' ? (/__BPA_FILLED__/.test(text) ? 'registro' : 'plantilla') : 'controlado';
      }
      if (out.area && base.area === 'Almacén') base.area = String(out.area).trim().slice(0, 60);
      if (out.version > 0 && base.version === 1) base.version = out.version;
      base._ia = true;
      return base;
    });
  }

  /* Analiza un archivo de Drive y devuelve los campos sugeridos para un documento */
  function analizarArchivo(file) {
    var isDocx = /wordprocessingml/.test(file.mimeType);
    var isXlsx = /spreadsheetml/.test(file.mimeType);
    var isPdf = /application\/pdf/.test(file.mimeType);
    var codigo = codigoFromName(file.name);
    var base = {
      driveFileId: file.localFile ? undefined : file.id, driveUrl: file.localFile ? undefined : (file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view')),
      codigo: codigo, nombre: nombreFromFile(file.name, codigo), tipo: tipoFromName(file.name),
      version: 1, rev: '', area: 'Almacén', modifiedTime: file.modifiedTime || '', _file: file.localFile || null,
      _fileName: file.name, _folderName: file.folderName || '', _origen: codigo ? 'nombre' : ''
    };
    if (!isDocx && !isXlsx && !isPdf) return Promise.resolve(base);
    var reader = binary(file).then(function (buf) {
      if (!base._file) base._file = new File([buf], file.name, { type: file.mimeType });
      if (isDocx) return textFromDocx(buf);
      if (isPdf) return textFromPdf(buf);
      return rowsFromXlsx(buf).then(function (rows) { return rows.map(function (r) { return r.join(' | '); }).join('\n'); });
    });
    return reader.then(function (text) {
      var vig = text.match(/Fecha de vigencia\s*:?\s*([^\n|]+)/i);
      var revF = text.match(/Fecha de revisi[oó]n\s*:?\s*([^\n|]+)/i);
      var verM = text.match(/(?<!de\s)(?<!de)\bRevisi[oó]n\s*N?\.?°?\s*:?\s*0*([0-9]{1,3})\b(?!\s*[./]\s*\d)/i) ||
        text.match(/(?<!de\s)(?<!de)\bVersi[oó]n\s*:?\s*0*([0-9]{1,3})\b(?!\s*[./]\s*\d)/i);
      var revDate = parseFechaTexto(revF && revF[1]) || parseFechaTexto(vig && vig[1]);
      if (!base.codigo) {
        base.codigo = codigoFromName(text);
        if (base.codigo) { base.nombre = nombreFromFile(file.name, base.codigo); base._origen = 'texto'; }
      }
      var fileType = tipoFromName(file.name);
      base.tipo = fileType === 'Otro' ? tipoFromName(text.slice(0, 1500)) : fileType;
      base.role = base.tipo === 'Formato' ? (/__BPA_FILLED__/.test(text) ? 'registro' : 'plantilla') : 'controlado';
      var area = text.match(/(?:Área|Proceso|Unidad)\s*:?[ \t]*([^\n|]{3,60})/i);
      if (revDate) base.rev = revDate;
      if (area) base.area = area[1].trim();
      if (verM) { var vNum = parseInt(verM[1], 10); base.version = isNaN(vNum) ? 1 : vNum; }
      /* El regex resuelve la mayoría; el modelo local solo entra donde falló. */
      if (isStandardCode(base.codigo) && base.tipo !== 'Otro') return base;
      return aiComplete(base, text);
    }).catch(function () { return base; });
  }

  /* ---------------- Guardado de archivos en el Drive del usuario ----------------
     Firebase Storage quedó fuera de alcance: desde el 01/10/2025 un proyecto en el plan
     Spark no accede a ningún bucket, ni siquiera a los que ya existían. Los archivos van
     al Drive de la droguería, que es de donde salieron y donde el usuario ya los sabe
     buscar. El scope de escritura es `drive.file`: solo vemos lo que esta app creó. */

  /* Sin caché en localStorage a propósito: un id guardado sobrevive a que el usuario borre
     la carpeta y ahí toda subida falla con 404. Se resuelve una vez por pestaña. */
  var folderId = null;
  var APP_FOLDER = 'BPA-Plus';
  function appFolder() {
    if (folderId) return Promise.resolve(folderId);
    var q = "name = '" + APP_FOLDER + "' and mimeType = '" + FOLDER_TYPE + "' and trashed = false";
    return api('files', 'q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent('files(id)'))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var hit = (data.files || [])[0];
        if (hit) return hit.id;
        return ensureAuth().then(function (token) {
          return fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
            body: JSON.stringify({ name: APP_FOLDER, mimeType: FOLDER_TYPE })
          }).then(function (res) {
            if (!res.ok) throw new Error('No se pudo crear la carpeta ' + APP_FOLDER + ' en Drive');
            return res.json();
          }).then(function (f) { return f.id; });
        });
      }).then(function (id) { folderId = id; return id; });
  }

  /* Resumable en un solo PUT. `uploadType=multipart` corta en 5 MB y acá se admiten 25. */
  function driveUpload(file, name, relative) {
    var contentType = mimeFromFile(file) || 'application/octet-stream';
    return appFolder().then(function (parent) {
      return ensureAuth().then(function (token) {
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({
            name: name, parents: [parent],
            appProperties: { bpaPath: String(relative || '').slice(0, 120) }
          })
        });
      });
    }).then(function (res) {
      if (!res.ok) throw new Error('No se pudo iniciar la subida a Drive');
      var session = res.headers.get('Location');
      if (!session) throw new Error('Drive no devolvió la sesión de subida');
      return fetch(session, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
    }).then(function (res) {
      if (!res.ok) throw new Error('No se pudo subir el archivo a Drive');
      return res.json();
    }).then(function (f) {
      return {
        driveId: f.id, name: name || file.name, originalName: file.name,
        size: file.size, contentType: contentType, uploadedAt: Date.now(),
        driveUrl: 'https://drive.google.com/file/d/' + f.id + '/view'
      };
    });
  }

  /* Único punto de subida. `relative` ya no es una ruta —Drive guarda plano dentro de la
     carpeta de la app— pero viaja como `appProperties` para saber de dónde salió cada
     archivo. Se convierte siempre en un rechazo: sin Client ID no hay a dónde subir. */
  function subirArchivo(relative, file, name) {
    return Promise.resolve().then(function () {
      if (!getClientId()) throw new Error('Conectá Google Drive para guardar archivos.');
      return driveUpload(file, name || file.name, relative);
    });
  }
  /* Todo el mundo sube por el export, incluidos storeFile y storeMaterial acá abajo:
     así hay un solo punto que sustituir —lo hace formatos.js y lo hace el harness— en
     vez de una copia interna que se escapa. */
  function subir(relative, file, name) { return global.BPAPLUS.drive.subirArchivo(relative, file, name); }

  function storeFile(dgId, doc, file, role, version) {
    role = role || (doc.tipo === 'Formato' ? 'plantilla' : 'controlado');
    version = +version || +doc.version || 1;
    var name = standardName(doc, file, role, version);
    var folder = role === 'registro' ? 'registros' : 'versiones';
    var relative = 'droguerias/' + dgId + '/documentos/' + doc.id + '/' + folder + '/' + Date.now() + '_' + name;
    return subir(relative, file, name).then(function (meta) {
      if (role === 'registro') {
        return Object.assign({}, doc, {
          role: doc.file ? (doc.role || 'plantilla') : 'plantilla',
          templateMissing: !doc.file,
          records: (doc.records || []).concat(meta)
        });
      }
      return Object.assign({}, doc, {
        role: role, version: version, file: meta, templateMissing: false,
        history: doc.file ? (doc.history || []).concat(doc.file) : (doc.history || [])
      });
    });
  }
  /* Material de una capacitación (presentación, manual, lo que se usó para dictarla).
     Misma convención de rutas privadas que los documentos. */
  function storeMaterial(dgId, capId, file) {
    var relative = 'droguerias/' + dgId + '/capacitaciones/' + capId + '/' + Date.now() + '_' + safePart(file.name) + '.' +
      ((file.name.split('.').pop() || 'pdf').toLowerCase());
    return subir(relative, file, file.name);
  }
  /* Texto de un archivo ya guardado en la nube. Reusa los lectores del escaneo
     de documentos. El .pptx no tiene lector: devuelve '' y la evaluación se
     genera solo con el tema. */
  function textoDeArchivo(meta) {
    if (!meta || !meta.driveId) return Promise.resolve('');
    var n = (meta.name || meta.originalName || '').toLowerCase();
    return downloadBinary(meta.driveId).then(function (buf) {
      if (/\.docx$/.test(n)) return textFromDocx(buf);
      if (/\.pdf$/.test(n)) return textFromPdf(buf);
      if (/\.xlsx$/.test(n)) return rowsFromXlsx(buf).then(function (rows) {
        return rows.map(function (r) { return r.join(' | '); }).join('\n');
      });
      return '';
    }).catch(function () { return ''; });
  }
  function downloadStored(meta) {
    if (!meta || !meta.driveId) return Promise.reject(new Error('El archivo no está disponible.'));
    return downloadBinary(meta.driveId).then(function (buf) {
      var blob = new Blob([buf], { type: meta.contentType || 'application/octet-stream' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = meta.name || 'documento'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }
  function filePanel(doc, dgId, onSave) {
    var defaultRole = doc.tipo === 'Formato' ? 'plantilla' : 'controlado';
    var m = UI.dialog({
      title: doc.file ? 'Reemplazar archivo' : 'Cargar archivo',
      body: '<p class="dialog-note">El reemplazo conserva la versión anterior. Los formatos llenados se archivan como registros y no sustituyen la plantilla vacía.</p>' +
        '<div class="field"><label>PDF, Word o Excel (máximo 25 MB)</label><input class="inp" id="df_file" type="file" accept=".pdf,.docx,.xlsx" required></div>' +
        '<div class="grid-2"><div class="field"><label>Uso del archivo</label><select class="inp" id="df_role">' +
          '<option value="controlado"' + (defaultRole === 'controlado' ? ' selected' : '') + '>Documento controlado</option>' +
          '<option value="plantilla"' + (defaultRole === 'plantilla' ? ' selected' : '') + '>Plantilla vacía</option>' +
          '<option value="registro">Formato llenado</option></select></div>' +
        '<div class="field"><label>Versión</label><input class="inp mono" id="df_version" type="number" min="1" value="' + (+(doc.version || 1) + (doc.file ? 1 : 0)) + '"></div></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="df_save">Subir archivo</button>',
      onMount: function (root) {
        root.querySelector('#df_save').onclick = function () {
          var file = root.querySelector('#df_file').files[0], role = root.querySelector('#df_role').value;
          if (!file) { UI.note('Selecciona un archivo.'); return; }
          if (!LEAF_TYPES.test(mimeFromFile(file)) || file.size >= 25 * 1024 * 1024) { UI.note('Usa PDF, DOCX o XLSX de menos de 25 MB.'); return; }
          var btn = root.querySelector('#df_save'); btn.disabled = true; btn.textContent = 'Subiendo…';
          storeFile(dgId, doc, file, role, +root.querySelector('#df_version').value || doc.version).then(function (saved) {
            return onSave(saved);
          }).then(function () { m.close(); UI.note(role === 'registro' ? 'Registro archivado' : 'Archivo vigente actualizado'); })
            .catch(function (error) { btn.disabled = false; btn.textContent = 'Subir archivo'; UI.note('No se pudo subir: ' + (error.message || error)); });
        };
      }
    });
  }

  /* ------------------------------ Panel de conexión ------------------------------ */
  function connectPanel(onConnected) {
    var clientId = getClientId();
    var m = UI.dialog({
      title: 'Conectar Google Drive',
      body:
        '<p class="dialog-note">La app se conecta directo a tu cuenta de Google desde el navegador — no hay servidor propio de por medio. Necesitás un Client ID de OAuth propio (gratis, se crea una vez en Google Cloud Console). Instrucciones en el README.</p>' +
        '<div class="field"><label>Client ID de OAuth</label><input class="inp mono" id="dr_cid" value="' + UI.esc(clientId) + '" placeholder="xxxxx.apps.googleusercontent.com"></div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="dr_connect">Conectar</button>',
      onMount: function (root) {
        root.querySelector('#dr_connect').onclick = function () {
          var v = root.querySelector('#dr_cid').value.trim();
          if (!v) return;
          if (!validClientId(v)) { UI.note('El Client ID debe terminar en .apps.googleusercontent.com'); return; }
          setClientId(v);
          var btn = root.querySelector('#dr_connect'); btn.disabled = true; btn.textContent = 'Conectando…';
          ensureAuth().then(function () { m.close(); UI.note('Google Drive conectado'); if (onConnected) onConnected(); })
            .catch(function (e) { btn.disabled = false; btn.textContent = 'Conectar'; UI.note('No se pudo conectar: ' + (e && e.message || e)); });
        };
      }
    });
  }

  function withAuth(run) {
    if (!getClientId()) { connectPanel(run); return; }
    ensureAuth().then(run).catch(function (e) {
      if (String(e && e.message) === 'NO_CLIENT_ID') return connectPanel(run);
      UI.note('Google Drive: ' + (e && e.message || 'no se pudo conectar'));
    });
  }

  /* ------------------------------ Importar carpeta / búsqueda ------------------------------ */
  function importPanel(onImport, existingDocs) {
      var m = UI.dialog({
        title: 'Escanear documentos BPA', wide: true,
        body:
          '<div class="field"><label>Carpeta o archivos del dispositivo</label><input class="inp" id="im_local" type="file" accept=".pdf,.docx,.xlsx" webkitdirectory multiple><div class="hint">Lee PDF con texto, Word y Excel. El archivo original no se sube.</div></div>' +
          '<div class="section-title">O seleccionar desde Google Drive</div>' +
          '<div class="grid-2"><div class="field"><label>Carpeta de Drive (URL o ID)</label><input class="inp" id="im_folder" placeholder="https://drive.google.com/drive/folders/…"></div>' +
          '<div class="field"><label>… o buscar por nombre</label><input class="inp" id="im_q" placeholder="POE, Registro…"></div></div>' +
          '<button class="btn btn-ghost btn-sm" id="im_go" type="button">' + UI.icon('search', 14) + ' Buscar</button>' +
          '<div id="im_results" style="margin-top:14px"></div>',
        footer: '<button class="btn btn-ghost" data-close>Cerrar</button><button class="btn btn-primary" id="im_add" disabled>Agregar seleccionados (0)</button>',
        onMount: function (root) {
          var found = [];
          function renderResults() {
            var box = root.querySelector('#im_results');
            if (!found.length) { box.innerHTML = '<div class="row-empty">Sin resultados todavía.</div>'; return; }
            box.innerHTML = '<div class="list">' + found.map(function (f, i) {
              return '<label class="drive-pick"><input type="checkbox" class="im-chk" data-i="' + i + '" checked>' +
                '<span class="drive-pick-name">' + UI.esc(f.name) + (f.folderName ? ' <span class="drive-pick-folder">· ' + UI.esc(f.folderName) + '</span>' : '') + '</span>' +
                '<span class="drive-pick-date">' + (f.modifiedTime ? UI.esc(f.modifiedTime.slice(0, 10)) : '') + '</span></label>';
            }).join('') + '</div>';
            updateCount();
          }
          function updateCount() {
            var n = root.querySelectorAll('.im-chk:checked').length;
            var btn = root.querySelector('#im_add'); btn.disabled = !n; btn.textContent = 'Agregar seleccionados (' + n + ')';
          }
          root.querySelector('#im_results').addEventListener('change', updateCount);
          root.querySelector('#im_local').onchange = function (event) {
            found = localFiles(event.target.files); renderResults();
          };
          root.querySelector('#im_go').onclick = function () {
            withAuth(function () {
              var box = root.querySelector('#im_results'); box.innerHTML = '<div class="row-empty">Buscando…</div>';
              var folderRaw = root.querySelector('#im_folder').value.trim();
              var q = root.querySelector('#im_q').value.trim();
              var folderId = folderRaw ? extractIdFromUrl(folderRaw) : null;
              var task = folderId ? filesInFolder(folderId) : searchFiles(q);
              task.then(function (files) { found = files; renderResults(); })
                .catch(function (e) { box.innerHTML = '<div class="row-empty">Error: ' + UI.esc(e.message || e) + '</div>'; });
            });
          };
          root.querySelector('#im_add').onclick = function () {
            var picked = Array.prototype.map.call(root.querySelectorAll('.im-chk:checked'), function (c) { return found[+c.dataset.i]; });
            var btn = root.querySelector('#im_add'); btn.disabled = true;
            var hechos = 0;
            btn.textContent = 'Analizando 0/' + picked.length + '…';
            Promise.all(picked.map(function (f) {
              return analizarArchivo(f).then(function (d) { btn.textContent = 'Analizando ' + (++hechos) + '/' + picked.length + '…'; return d; });
            })).then(function (drafts) {
              m.close(); reviewPanel(drafts, onImport, existingDocs);
            });
          };
        }
      });
  }

  /* ------------------------------ Revisión antes de guardar ------------------------------ */
  /* Normaliza un código para comparar (mismo documento aunque venga de
     carpetas distintas, ej. "POE 026" vs "poe-026") */
  function normCodigo(c) { return D.normTxt(c || '').replace(/[^a-z0-9]/g, ''); }

  /* Junta duplicados dentro del mismo lote elegido (ej. el mismo código
     aparece en la carpeta "POE" y en "POEs"): se queda con el que tenga
     fecha de revisión, o si ninguno la tiene, con el más reciente. */
  function mergeBatch(drafts) {
    var byCode = {}, order = [];
    function source(d) { return d.driveFileId || ((d.nombre || '') + '|' + (d.modifiedTime || '')); }
    drafts.forEach(function (d) {
      var key = normCodigo(d.codigo) || ('__' + source(d));
      if (!byCode[key]) { byCode[key] = d; order.push(key); return; }
      var prev = byCode[key];
      var better = (d.rev && !prev.rev) ? d : (!d.rev && prev.rev) ? prev : ((d.modifiedTime || '') > (prev.modifiedTime || '') ? d : prev);
      byCode[key] = Object.assign({}, better, { _mergedFrom: (prev._mergedFrom || [source(prev)]).concat(source(d)) });
    });
    return order.map(function (k) { return byCode[k]; });
  }

  /* Por qué una ficha necesita ojo humano. Cadena vacía = lista para guardar. */
  function revisionPendiente(d) {
    if (!isStandardCode(d.codigo)) return 'Sin código estándar — escribilo (ej. POE-ALM-001).';
    if (!String(d.nombre || '').trim()) return 'Sin nombre — escribilo.';
    if (d._ia) return 'Completado por el modelo local del navegador — confirmá los datos.';
    return '';
  }
  /* De dónde salió cada dato: quien revisa 46 fichas necesita saber en cuál confiar. */
  function procedencia(d) {
    var bits = [d._origen === 'nombre' ? 'código del nombre del archivo'
      : d._origen === 'texto' ? 'código leído dentro del documento'
      : d._origen === 'ia' ? 'código sugerido por el modelo local'
      : 'sin código detectado'];
    if (d.rev) bits.push('fecha de revisión leída');
    if (d.version > 1) bits.push('versión ' + d.version + ' leída');
    if (d._mergedFrom && d._mergedFrom.length > 1) bits.push('fusionado de ' + d._mergedFrom.length + ' duplicados');
    return bits.join(' · ');
  }

  function reviewPanel(drafts, onImport, existingDocs) {
    drafts = mergeBatch(drafts);
    existingDocs = existingDocs || [];
    var existingByCode = {};
    existingDocs.forEach(function (d) { var key = normCodigo(d.codigo); if (key) existingByCode[key] = d; });

    var TYPES = ['POE', 'Formato', 'Registro', 'Instructivo', 'Manual', 'Otro'];
    var ROLES = [{ v: 'controlado', l: 'Documento controlado' }, { v: 'plantilla', l: 'Plantilla vacía' }, { v: 'registro', l: 'Formato llenado' }];

    /* Una ficha por documento: el resumen se lee de un vistazo y los campos solo
       se despliegan si hacen falta (<details> nativo, sin JS de acordeón). */
    function cardHtml(d, i) {
      var codeKey = normCodigo(d.codigo), match = codeKey ? existingByCode[codeKey] : null;
      var aviso = revisionPendiente(d);
      var estado = aviso ? 'revisar' : match ? 'actualiza' : 'nuevo';
      var etiqueta = aviso ? 'Revisar' : match ? 'Actualiza el existente' : 'Nuevo';
      var role = d.role || (d.tipo === 'Formato' ? 'plantilla' : 'controlado');
      return '<details class="rv-card ' + estado + '"' + (aviso ? ' open' : '') +
          ' data-i="' + i + '" data-existing="' + (match ? match.id : '') + '">' +
        '<summary class="rv-sum">' +
          '<span class="rv-dot ' + estado + '"></span>' +
          '<span class="rv-sum-txt">' +
            '<span class="rv-sum-top"><b class="mono">' + UI.esc(d.codigo || 'sin código') + '</b>' +
              '<span class="rv-sum-name">' + UI.esc(d.nombre || d._fileName || '') + '</span></span>' +
            '<small class="rv-sum-meta">' + UI.esc(d.tipo + ' · ' + (d.area || 'Almacén') + ' · v' + d.version) +
              (d._folderName ? UI.esc(' · ' + d._folderName) : '') + '</small>' +
          '</span>' +
          '<span class="rv-badge ' + estado + '">' + etiqueta + '</span>' +
          '<span class="rv-chev">' + UI.icon('chevron', 15) + '</span>' +
        '</summary>' +
        '<div class="rv-fields">' +
          (aviso ? '<div class="rv-aviso">' + UI.esc(aviso) + '</div>' : '') +
          '<div class="rv-origen">' + UI.esc(d._fileName || '') + ' — ' + UI.esc(procedencia(d)) + '</div>' +
          '<div class="grid-2">' +
            '<div class="field"><label>Código</label><input class="inp mono rv-codigo" value="' + UI.esc(d.codigo) + '" placeholder="POE-ALM-001"></div>' +
            '<div class="field"><label>Tipo</label><select class="inp rv-tipo">' +
              TYPES.map(function (t) { return '<option' + (t === d.tipo ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
          '</div>' +
          '<div class="field"><label>Nombre</label><input class="inp rv-nombre" value="' + UI.esc(d.nombre) + '" placeholder="Nombre del documento"></div>' +
          '<div class="grid-2">' +
            '<div class="field"><label>Uso del archivo</label><select class="inp rv-role">' +
              ROLES.map(function (r) { return '<option value="' + r.v + '"' + (r.v === role ? ' selected' : '') + '>' + r.l + '</option>'; }).join('') + '</select></div>' +
            '<div class="field"><label>Área</label><input class="inp rv-area" value="' + UI.esc(d.area || 'Almacén') + '" placeholder="Área"></div>' +
          '</div>' +
          '<div class="grid-2">' +
            '<div class="field"><label>Versión</label><input class="inp mono rv-version" type="number" min="1" value="' + UI.esc(d.version) + '"></div>' +
            '<div class="field"><label>Fecha de revisión</label><input class="inp rv-rev" type="date" value="' + UI.esc(d.rev) + '"></div>' +
          '</div>' +
          '<button class="link-btn rv-rm" type="button" data-rm>' + UI.icon('trash', 14) + ' Quitar del lote</button>' +
        '</div>' +
      '</details>';
    }

    var pendientes = [], listos = [];
    drafts.forEach(function (d, i) { (revisionPendiente(d) ? pendientes : listos).push(cardHtml(d, i)); });

    var m = UI.dialog({
      title: 'Revisar ' + drafts.length + ' documento(s)', wide: true,
      body:
        '<div class="rv-resumen">' +
          '<span class="rv-resumen-n">' + listos.length + '</span> listos para guardar' +
          (pendientes.length ? ' · <span class="rv-resumen-n warn">' + pendientes.length + '</span> necesitan un dato' : '') +
        '</div>' +
        '<p class="dialog-note">Los archivos de Drive conservan su enlace y los locales solo se catalogan. Los códigos duplicados ya se fusionaron.</p>' +
        (pendientes.length
          ? '<div class="section-title">Necesitan tu revisión <span class="section-count">' + pendientes.length + '</span></div>' +
            '<div class="rv-list">' + pendientes.join('') + '</div>'
          : '') +
        (listos.length
          ? '<details class="rv-group"' + (pendientes.length ? '' : ' open') + '>' +
              '<summary class="rv-group-sum">Listos para guardar <span class="section-count">' + listos.length + '</span> — abrir solo si querés corregir algo</summary>' +
              '<div class="rv-list">' + listos.join('') + '</div>' +
            '</details>'
          : ''),
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="rv_save">Guardar ' + drafts.length + ' en Documentos</button>',
      onMount: function (root) {
        var save = root.querySelector('#rv_save');
        function recount() {
          var n = root.querySelectorAll('.rv-card').length;
          save.disabled = !n; save.textContent = 'Guardar ' + n + ' en Documentos';
        }
        root.querySelector('.dialog-body').addEventListener('click', function (e) {
          var b = e.target.closest('[data-rm]');
          if (b) { e.preventDefault(); b.closest('.rv-card').remove(); recount(); }
        });
        save.onclick = function () {
          var invalid = null;
          var results = Array.prototype.map.call(root.querySelectorAll('.rv-card'), function (r) {
            var d = drafts[+r.dataset.i];
            var vNum = parseInt(r.querySelector('.rv-version').value.trim(), 10);
            var code = normalizeCode(r.querySelector('.rv-codigo').value);
            if (!isStandardCode(code)) { invalid = invalid || r; return null; }
            return Object.assign({}, d, {
              codigo: code,
              nombre: r.querySelector('.rv-nombre').value.trim() || d.nombre,
              tipo: r.querySelector('.rv-tipo').value,
              role: r.querySelector('.rv-role').value,
              area: r.querySelector('.rv-area').value.trim() || 'Almacén',
              version: isNaN(vNum) ? 1 : vNum,
              rev: r.querySelector('.rv-rev').value || D.isoDesdeHoy(365),
              existingId: r.dataset.existing || null
            });
          });
          if (invalid) {
            var group = invalid.closest('.rv-group'); if (group) group.open = true;
            invalid.open = true;
            if (invalid.scrollIntoView) invalid.scrollIntoView({ block: 'center' });
            invalid.querySelector('.rv-codigo').focus();
            UI.note('Corrige el código: usa por ejemplo POE-ALM-001 o FOR-ALM-011.');
            return;
          }
          m.close();
          if (onImport) onImport(results.filter(Boolean));
        };
      }
    });
  }

  /* ------------------------------ Importar cronograma ------------------------------ */
  function cronogramaPanel(onImport, existingCaps, existingInspecciones, kindHint) {
      var esInsp = kindHint === 'inspecciones';
      var m = UI.dialog({
        title: esInsp ? 'Importar cronograma de autoinspecciones' : 'Importar cronograma Excel', wide: true,
        body:
          '<p class="dialog-note">' + (esInsp
            ? 'Se leen las áreas y sus fechas programadas. Si la hoja mezcla capacitaciones y autoinspecciones, se importan ambas.'
            : 'Se leen temas, áreas y fechas. Si la hoja mezcla capacitaciones y autoinspecciones, se importan ambas.') + '</p>' +
          '<div class="field"><label>Archivo XLSX del dispositivo</label><input class="inp" id="cr_file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>' +
          '<div class="section-title">O seleccionar desde Google Drive</div>' +
          '<div class="field"><label>Archivo XLSX (URL, ID o nombre)</label><input class="inp" id="cr_q" value="CRONOGRAMA" placeholder="REGISTRO 005 CRONOGRAMA..."></div>' +
          '<button class="btn btn-ghost btn-sm" id="cr_go" type="button">' + UI.icon('search', 14) + ' Buscar</button>' +
          '<div id="cr_results" style="margin-top:14px"></div>',
        footer: '<button class="btn btn-ghost" data-close>Cerrar</button>',
        onMount: function (root) {
          function render(files) {
            var box = root.querySelector('#cr_results');
            files = files.filter(function (file) { return /spreadsheetml/.test(file.mimeType || ''); });
            box.innerHTML = files.length ? '<div class="list">' + files.map(function (file, i) {
              return '<button class="drive-pick" data-cr-pick="' + i + '"><span class="drive-pick-name">' + UI.esc(file.name) + '</span>' +
                '<span class="drive-pick-date">Analizar</span></button>';
            }).join('') + '</div>' : '<div class="row-empty">No se encontraron archivos XLSX.</div>';
            box.querySelectorAll('[data-cr-pick]').forEach(function (button) {
              button.onclick = function () {
                var file = files[+button.dataset.crPick];
                box.innerHTML = '<div class="row-empty">Analizando ' + UI.esc(file.name) + '…</div>';
                analizarCronograma(file, kindHint).then(function (drafts) {
                  m.close(); reviewCronograma(drafts, onImport, existingCaps, existingInspecciones);
                }).catch(function (error) { box.innerHTML = '<div class="row-empty">Error: ' + UI.esc(error.message || error) + '</div>'; });
              };
            });
          }
          root.querySelector('#cr_file').onchange = function (event) {
            var file = localFiles(event.target.files)[0], box = root.querySelector('#cr_results');
            if (!file) { box.innerHTML = '<div class="row-empty">Seleccioná un archivo XLSX.</div>'; return; }
            box.innerHTML = '<div class="row-empty">Analizando ' + UI.esc(file.name) + '…</div>';
            analizarCronograma(file, kindHint).then(function (drafts) {
              m.close(); reviewCronograma(drafts, onImport, existingCaps, existingInspecciones);
            }).catch(function (error) { box.innerHTML = '<div class="row-empty">Error: ' + UI.esc(error.message || error) + '</div>'; });
          };
          root.querySelector('#cr_go').onclick = function () {
            withAuth(function () {
              var box = root.querySelector('#cr_results'); box.innerHTML = '<div class="row-empty">Buscando…</div>';
              var query = root.querySelector('#cr_q').value.trim(), id = extractIdFromUrl(query);
              (id ? fileMeta(id).then(function (file) { return [file]; }) : searchFiles(query, 30))
                .then(render).catch(function (error) { box.innerHTML = '<div class="row-empty">Error: ' + UI.esc(error.message || error) + '</div>'; });
            });
          };
        }
      });
  }

  function uniqueBy(items, keyOf) {
    var seen = {};
    return items.filter(function (item) { var key = keyOf(item); if (!key || seen[key]) return false; seen[key] = true; return true; });
  }

  function reviewCronograma(drafts, onImport, existingCaps, existingInspecciones) {
    function capKey(c) { return D.normTxt((c.tema || '') + '|' + (c.area || '') + '|' + (c.fecha || '')); }
    function inspKey(i) { return D.normTxt((i.area || '') + '|' + (i.prog || '')); }
    var caps = uniqueBy(drafts.capacitaciones || [], capKey), inspecciones = uniqueBy(drafts.inspecciones || [], inspKey);
    var capsExisting = {}, inspExisting = {};
    (existingCaps || []).forEach(function (c) { capsExisting[capKey(c)] = c; });
    (existingInspecciones || []).forEach(function (i) { inspExisting[inspKey(i)] = i; });

    function capRow(c, i) {
      var existing = capsExisting[capKey(c)];
      return '<div class="mini-row drive-row cron-cap" data-i="' + i + '" data-existing="' + (existing ? existing.id : '') + '">' +
        '<input class="inp cr-tema" value="' + UI.esc(c.tema) + '" placeholder="Tema">' +
        '<input class="inp cr-area" value="' + UI.esc(c.area) + '" placeholder="Área">' +
        '<input class="inp cr-frec" value="' + UI.esc(c.frec) + '" placeholder="Frecuencia" style="max-width:120px">' +
        '<input class="inp cr-fecha" type="date" value="' + UI.esc(c.fecha) + '" style="max-width:150px">' +
        '<button class="icon-btn del" type="button" data-rm aria-label="Quitar">' + UI.icon('x', 16) + '</button></div>';
    }
    function inspRow(i, index) {
      var existing = inspExisting[inspKey(i)];
      return '<div class="mini-row drive-row cron-insp" data-i="' + index + '" data-existing="' + (existing ? existing.id : '') + '">' +
        '<input class="inp cr-area" value="' + UI.esc(i.area) + '" placeholder="Área">' +
        '<input class="inp cr-fecha" type="date" value="' + UI.esc(i.prog) + '" style="max-width:150px">' +
        '<button class="icon-btn del" type="button" data-rm aria-label="Quitar">' + UI.icon('x', 16) + '</button></div>';
    }
    var m = UI.dialog({
      title: 'Revisar cronograma', wide: true,
      body: '<p class="dialog-note">Revisá las fechas detectadas en columnas mensuales antes de guardar.</p>' +
        '<div class="section-title">Capacitaciones (' + caps.length + ')</div><div id="cr_caps">' + (caps.map(capRow).join('') || '<div class="row-empty">No detectadas.</div>') + '</div>' +
        '<div class="section-title">Autoinspecciones (' + inspecciones.length + ')</div><div id="cr_insp">' + (inspecciones.map(inspRow).join('') || '<div class="row-empty">No detectadas.</div>') + '</div>',
      footer: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" id="cr_save">Guardar cronograma</button>',
      onMount: function (root) {
        root.onclick = function (event) { var button = event.target.closest('[data-rm]'); if (button) button.closest('.drive-row').remove(); };
        root.querySelector('#cr_save').onclick = function () {
          var out = { capacitaciones: [], inspecciones: [] };
          root.querySelectorAll('.cron-cap').forEach(function (row) {
            var source = caps[+row.dataset.i];
            out.capacitaciones.push(Object.assign({}, source, {
              tema: row.querySelector('.cr-tema').value.trim(), area: row.querySelector('.cr-area').value.trim() || 'Almacén',
              frec: row.querySelector('.cr-frec').value.trim() || 'Anual', fecha: row.querySelector('.cr-fecha').value || D.isoHoy(),
              existingId: row.dataset.existing || null
            }));
          });
          root.querySelectorAll('.cron-insp').forEach(function (row) {
            var source = inspecciones[+row.dataset.i];
            out.inspecciones.push(Object.assign({}, source, {
              area: row.querySelector('.cr-area').value.trim() || 'Almacén general', prog: row.querySelector('.cr-fecha').value || D.isoHoy(),
              existingId: row.dataset.existing || null
            }));
          });
          m.close(); if (onImport) onImport(out);
        };
      }
    });
  }

  /* ------------------------------ Vincular un documento existente ------------------------------ */
  function linkPanel(doc, onLinked) {
    withAuth(function () {
      var m = UI.dialog({
        title: 'Vincular a Google Drive',
        body:
          '<div class="field"><label>Buscar archivo por nombre</label><input class="inp" id="lk_q" value="' + UI.esc(doc.codigo || '') + '"></div>' +
          '<button class="btn btn-ghost btn-sm" id="lk_go" type="button">' + UI.icon('search', 14) + ' Buscar</button>' +
          '<div id="lk_results" style="margin-top:12px"></div>',
        footer: '<button class="btn btn-ghost" data-close>Cerrar</button>',
        onMount: function (root) {
          function search() {
            var box = root.querySelector('#lk_results'); box.innerHTML = '<div class="row-empty">Buscando…</div>';
            searchFiles(root.querySelector('#lk_q').value.trim(), 15).then(function (files) {
              box.innerHTML = files.length ? '<div class="list">' + files.map(function (f, i) {
                return '<div class="row-foot" style="padding:8px 0;border-bottom:1px solid var(--border)"><span class="row-plain" style="flex:1">' + UI.esc(f.name) + '</span>' +
                  '<button class="link-btn" data-pick="' + i + '">Vincular</button></div>';
              }).join('') + '</div>' : '<div class="row-empty">Sin resultados.</div>';
              box.querySelectorAll('[data-pick]').forEach(function (btn) {
                btn.onclick = function () {
                  var f = files[+btn.dataset.pick];
                  onLinked({ driveFileId: f.id, driveUrl: f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view') });
                  m.close(); UI.note('Documento vinculado a Drive');
                };
              });
            });
          }
          root.querySelector('#lk_go').onclick = search;
          search();
        }
      });
    });
  }

  global.BPAPLUS = global.BPAPLUS || {};
  global.BPAPLUS.drive = {
    isConnected: isConnected, getClientId: getClientId, setClientId: setClientId,
    connectPanel: connectPanel, importPanel: importPanel, reviewPanel: reviewPanel, cronogramaPanel: cronogramaPanel,
    analizarCronograma: analizarCronograma, analizarFilasCronograma: analizarFilasCronograma, analizarArchivo: analizarArchivo,
    codigoFromName: codigoFromName, normalizeCode: normalizeCode, isStandardCode: isStandardCode,
    standardName: standardName, tipoFromName: tipoFromName, localFiles: localFiles, leerFormato: leerFormato,
    subirArchivo: subirArchivo, storeFile: storeFile, storeMaterial: storeMaterial,
    textoDeArchivo: textoDeArchivo, downloadStored: downloadStored, filePanel: filePanel,
    linkPanel: linkPanel, extractIdFromUrl: extractIdFromUrl
  };
})(window);
