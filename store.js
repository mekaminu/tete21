'use strict';
// Persistent rooms: saved as JSON on disk. DATA_DIR can point at a mounted disk.
const fs = require('fs'); const path = require('path');
const DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DIR, 'rooms.json');
function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
let saveT = null, pending = null;
function save(rooms) { pending = rooms; if (saveT) return; saveT = setTimeout(() => { saveT = null; try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(pending)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('save failed', e.message); } }, 300); }
module.exports = { load, save };
