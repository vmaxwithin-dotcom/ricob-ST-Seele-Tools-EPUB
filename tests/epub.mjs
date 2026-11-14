// Run with Node 22+: node tests/epub.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
globalThis.JSZip=require('../vendor/jszip.min.js');
const { createEpub } = await import('../epub.js');
const { defaults,formatter,validateGroups,hexToHsv,hsvToHex,exportFilename } = await import('../epub-formats.js');
const groups=defaults();
groups.push({name:'自定义',color:'#123456',keep:false,pairs:[{start:'/',end:'/',style:''}]});
const format=formatter(groups);
assert.match(format('/文字/'),/>文字<\/span>/);
assert.match(format('***心理***'),/st-bold-italic/);
assert.match(format('“对话 *心理*”'),/st-format-0.*st-format-1/);
assert.equal(format("don't"),'don&apos;t');
assert.equal(format('<script>'),'&lt;script&gt;');
assert.throws(()=>validateGroups([...groups,groups[0]]),/重复/);
for(const color of ['#000000','#FFFFFF','#9274B4','#00FFFF','#123456'])assert.equal(hsvToHex(hexToHsv(color)),color);
assert.match(exportFilename(),/^[a-zA-Z0-9.-]+\.epub$/);
for(const text of ['“对话” ***心理*** /自定义/ < > & 😀\u0000\ud800','中文😀'.repeat(30000)]) {
    const {blob,chapterCount}=await createEpub({title:'标题 # 中文',messages:[{text}],chapterSize:1000,groups});
    const bytes=Buffer.from(await blob.arrayBuffer());
    const zip=await JSZip.loadAsync(bytes,{checkCRC32:true});
    assert.equal(bytes.readUInt16LE(8),0);
    assert.equal(bytes.subarray(30,38).toString(),'mimetype');
    assert.ok(zip.file('OEBPS/nav.xhtml'));
    if(text.length>100000) {
        assert.ok(chapterCount>1);
        let output='';
        for(const [name,file] of Object.entries(zip.files))if(/chapter\d+\.xhtml$/.test(name))output+=await file.async('string');
        assert.equal((output.match(/😀/gu)||[]).length,30000);
    }
}
await assert.rejects(createEpub({messages:[],groups}),/没有/);
console.log('EPUB regression tests passed');
