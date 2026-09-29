const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = { BPAPLUS: { domain: {}, ui: {} } };
vm.runInNewContext(fs.readFileSync('js/drive.js', 'utf8'), { window });

const files = Array.from({ length: 46 }, (_, i) => ({
  name: `DOCUMENTO ${i + 1}.docx`,
  type: '',
  webkitRelativePath: `BPA Documentos/DOCUMENTO ${i + 1}.docx`
})).concat([
  { name: 'REGISTRO 016.doc', type: '', webkitRelativePath: 'BPA Documentos/REGISTRO 016.doc' },
  { name: 'REGISTRO 021.doc', type: '', webkitRelativePath: 'BPA Documentos/REGISTRO 021.doc' }
]);

const selected = window.BPAPLUS.drive.localFiles(files);
assert.equal(selected.length, 48);
assert.equal(selected.filter(file => file.mimeType === 'application/msword').length, 2);
