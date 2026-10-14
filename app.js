const $ = (id) => document.getElementById(id);
const picker = $('folder-picker');
const dropzone = $('dropzone');
const editor = $('editor');
const statusBox = $('status');
const fileMap = new Map();
let active = null;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const creditsMarker = new Uint8Array([7,0,0,0,...encoder.encode('Credits '),0,0,0,0,3,0,0,0]);

function bytesToText(bytes) { return decoder.decode(bytes); }
function formatNumber(value) { return new Intl.NumberFormat('en-US').format(Number(value) || 0); }
function setStatus(message, type='') {
  statusBox.textContent = message;
  statusBox.className = `status${type ? ` ${type}` : ''}`;
}
function hideStatus() { statusBox.className = 'status hidden'; }
function findBytes(haystack, needle) {
  let found = -1;
  outer: for (let i=0; i<=haystack.length-needle.length; i++) {
    for (let j=0; j<needle.length; j++) if (haystack[i+j] !== needle[j]) continue outer;
    if (found !== -1) throw new Error('The credits field appears more than once.');
    found = i;
  }
  return found;
}
function readInt32(bytes, offset) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true); }
function writeInt32(bytes, offset, value) { new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setInt32(offset, value, true); }
function getSpins(xml) {
  const matches = [...xml.matchAll(/<Property\s+Name="Spins"\s+Value="(\d+)"\s*\/>/g)];
  if (matches.length !== 1) throw new Error('Could not find exactly one TombolaState/Spins field in this save.');
  return Number(matches[0][1]);
}
function findRevision(entries) {
  const found = new Map();
  const pattern = /^(.*\/User_[^/]+\/revisions\/([0-9a-f]+)\/data)\/(SaveState|ProfileData)$/i;
  for (const path of entries.keys()) {
    const match = path.match(pattern);
    if (!match) continue;
    const base = match[1];
    const entry = found.get(base) || { base, revision: match[2], files: new Set() };
    entry.files.add(match[3]);
    found.set(base, entry);
  }
  const candidates = [...found.values()].filter(item => item.files.has('SaveState') && item.files.has('ProfileData') && entries.has(`${item.base.replace(/\/data$/i,'')}/../commit`) === false);
  // Commit path is the parent revision directory; normalize it explicitly.
  const valid = candidates.filter(item => entries.has(`${item.base.slice(0, item.base.lastIndexOf('/data'))}/commit`));
  valid.sort((a,b) => BigInt(`0x${a.revision}`) > BigInt(`0x${b.revision}`) ? -1 : 1);
  if (!valid.length) throw new Error('Unsupported folder. Select player-1 extracted from an Azimuth backup containing SaveState and ProfileData.');
  return valid[0];
}
function encodeCredits(bytes, value) {
  const offset = findBytes(bytes, creditsMarker);
  if (offset < 0) throw new Error('Could not find the expected credits field in ProfileData.');
  const dataOffset = offset + creditsMarker.length;
  const original = readInt32(bytes, dataOffset);
  if (original < 0) throw new Error('The profile credits value appears to be invalid.');
  writeInt32(bytes, dataOffset, value);
  return { bytes, original };
}
function encodeSpins(bytes, value) {
  let xml = bytesToText(bytes);
  const pattern = /(<Property\s+Name="Spins"\s+Value=")(\d+)("\s*\/>)/g;
  const matches = [...xml.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Could not find exactly one TombolaState/Spins field in SaveState.');
  const original = Number(matches[0][2]);
  xml = xml.replace(pattern, `$1${value}$3`);
  return { bytes: encoder.encode(xml), original };
}
function normalizePath(path) { return path.replaceAll('\\','/').replace(/^\/+/, ''); }
async function loadFolder(files) {
  hideStatus();
  fileMap.clear();
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.relativePath;
    if (!relativePath) continue;
    fileMap.set(normalizePath(relativePath), file);
  }
  const revision = findRevision(fileMap);
  const profilePath = `${revision.base}/ProfileData`;
  const savePath = `${revision.base}/SaveState`;
  const commitPath = `${revision.base.slice(0, revision.base.lastIndexOf('/data'))}/commit`;
  const profile = new Uint8Array(await fileMap.get(profilePath).arrayBuffer());
  const xml = new Uint8Array(await fileMap.get(savePath).arrayBuffer());
  const creditOffset = findBytes(profile, creditsMarker);
  if (creditOffset < 0) throw new Error('Could not find the expected credits field in ProfileData.');
  const credits = readInt32(profile, creditOffset + creditsMarker.length);
  const spins = getSpins(bytesToText(xml));
  if (!fileMap.has(commitPath)) throw new Error('Could not find this revision\'s commit manifest.');

  active = { revision, profilePath, savePath, commitPath, originalCredits: credits, originalSpins: spins };
  $('credits-input').value = credits;
  $('spins-input').value = spins;
  $('credits-range').value = Math.min(10000000, credits);
  $('loaded-name').textContent = (files[0]?.webkitRelativePath || files[0]?.relativePath || '').split(/[\\/]/)[0] || 'player-1';
  $('loaded-meta').textContent = `Revision ${revision.revision} · ${formatNumber(credits)} CR · ${formatNumber(spins)} spins`;
  $('loaded-file').classList.remove('hidden');
  dropzone.classList.add('hidden');
  editor.classList.remove('hidden');
}
function currentValue(input, label) {
  const value = Number(input.value);
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error(`${label}: enter a whole number from 0 to 2,147,483,647.`);
  return value;
}

// Minimal ZIP writer using stored (uncompressed) entries. No save contents leave this browser.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n=0; n<256; n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); table[n]=c>>>0; }
  return table;
})();
function crc32(bytes) { let c=0xffffffff; for(const byte of bytes) c=crcTable[(c^byte)&0xff]^(c>>>8); return (c^0xffffffff)>>>0; }
function dosDateTime(date=new Date()) {
  return { time:(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1), date:((date.getFullYear()-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate() };
}
function makeZip(entries) {
  const localParts=[], centralParts=[]; let offset=0; const stamp=dosDateTime();
  for (const {name, bytes} of entries) {
    const filename=encoder.encode(name), crc=crc32(bytes), size=bytes.length;
    const local=new Uint8Array(30+filename.length); const lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,stamp.time,true);lv.setUint16(12,stamp.date,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,filename.length,true);lv.setUint16(28,0,true);local.set(filename,30);localParts.push(local,bytes);
    const central=new Uint8Array(46+filename.length);const cv=new DataView(central.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,stamp.time,true);cv.setUint16(14,stamp.date,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,filename.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);central.set(filename,46);centralParts.push(central);offset+=local.length+size;
  }
  const centralSize=centralParts.reduce((n,p)=>n+p.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);ev.setUint16(20,0,true);
  return new Blob([...localParts,...centralParts,end],{type:'application/zip'});
}
async function sha256(bytes) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function exportSave() {
  if (!active) return;
  const button=$('export-button'); button.disabled=true; button.querySelector('span').textContent='Preparing ZIP…'; hideStatus();
  try {
    const credits=currentValue($('credits-input'),'Credits');
    const spins=currentValue($('spins-input'),'Wheelspins');
    const replacements=new Map();
    const profile=new Uint8Array(await fileMap.get(active.profilePath).arrayBuffer());
    const xml=new Uint8Array(await fileMap.get(active.savePath).arrayBuffer());
    replacements.set(active.profilePath,encodeCredits(profile,credits).bytes);
    replacements.set(active.savePath,encodeSpins(xml,spins).bytes);
    const commitFile=fileMap.get(active.commitPath); let commit=bytesToText(new Uint8Array(await commitFile.arrayBuffer()));
    const rows=commit.split(/\r?\n/);
    const dataDir=active.revision.base;
    const changedNames=new Set(['ProfileData','SaveState']);
    let seen=new Set();
    for(let i=0;i<rows.length;i++) {
      const match=rows[i].match(/^([0-9a-f]{64}) (\d+) ([A-Za-z0-9_]+)$/);
      if(!match) continue;
      const [, , , name]=match; const path=`${dataDir}/${name}`;
      if(!fileMap.has(path)) throw new Error(`The manifest references ${name}, but that file is missing from the selected folder.`);
      const bytes=replacements.get(path)||new Uint8Array(await fileMap.get(path).arrayBuffer());
      if(changedNames.has(name)) replacements.set(path,bytes);
      rows[i]=`${await sha256(bytes)} ${bytes.length} ${name}`; seen.add(name);
    }
    if(!seen.has('ProfileData')||!seen.has('SaveState')) throw new Error('Could not update the hashes in this revision\'s manifest.');
    replacements.set(active.commitPath,encoder.encode(rows.join('\n')));
    const zipEntries=[];
    for(const [path,file] of fileMap) zipEntries.push({name:path,bytes:replacements.get(path)||new Uint8Array(await file.arrayBuffer())});
    const blob=makeZip(zipEntries); const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='forza-horizon-2-save-editado.zip';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    setStatus(`ZIP ready: ${formatNumber(credits)} credits and ${formatNumber(spins)} wheelspins. The selected backup was not changed.`, 'success');
  } catch(error) { setStatus(error.message || 'Could not export this save.', 'error'); }
  finally { button.disabled=false;button.querySelector('span').textContent='Export edited save'; }
}

picker.addEventListener('change', async () => { if (!picker.files.length) return; try { await loadFolder([...picker.files]); } catch(error) { setStatus(error.message,'error');statusBox.classList.remove('hidden'); } });
$('change-file').addEventListener('click',()=>picker.click());
$('goal-button').addEventListener('click',()=>{$('credits-input').value=8000000;$('credits-range').value=8000000;$('spins-input').value=50;hideStatus();});
$('credits-range').addEventListener('input',()=>{$('credits-input').value=$('credits-range').value;});
$('credits-input').addEventListener('input',()=>{$('credits-range').value=Math.min(10000000,Math.max(0,Number($('credits-input').value)||0));});
$('export-button').addEventListener('click',exportSave);
dropzone.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();picker.click();}});
for(const eventName of ['dragenter','dragover']) dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.add('dragging');});
for(const eventName of ['dragleave','drop']) dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.remove('dragging');});
async function readDroppedEntry(entry, prefix='') {
  if (entry.isFile) {
    const file = await new Promise((resolve,reject)=>entry.file(resolve,reject));
    return [{ file, relativePath: `${prefix}${entry.name}` }];
  }
  if (!entry.isDirectory) return [];
  const reader=entry.createReader();let children=[];
  while(true){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;children=children.concat(batch);}
  const nested=await Promise.all(children.map(child=>readDroppedEntry(child,`${prefix}${entry.name}/`)));
  return nested.flat();
}
dropzone.addEventListener('drop',async event=>{
  const items=[...(event.dataTransfer?.items||[])];
  const entries=items.filter(item=>item.kind==='file').map(item=>item.webkitGetAsEntry?.()).filter(Boolean);
  try {
    const dropped=[];
    for(const entry of entries)dropped.push(...await readDroppedEntry(entry));
    const files=dropped.map(({file,relativePath})=>Object.assign(file,{relativePath}));
    if(files.length)await loadFolder(files);
  } catch(error) { setStatus(error.message||'Could not open the dropped folder.','error');statusBox.classList.remove('hidden'); }
});

