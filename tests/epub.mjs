// Run with Node 22+: node tests/epub.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
globalThis.JSZip=require('../vendor/jszip.min.js');
const { createEpub } = await import('../epub.js');
const { defaults,formatter,validateGroups,hexToHsv,hsvToHex,exportFilename,textHeading } = await import('../epub-formats.js');
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
// Metadata combinations share one heading; each message keeps its own spacing.
const {blob:layoutBlob}=await createEpub({messages:['','#1','发送人','#3 发送人'].map(prefix=>({prefix,text:'　　第一段\n  第二段'})),chapterSize:10,groups});
const layoutZip=await JSZip.loadAsync(await layoutBlob.arrayBuffer());
const layout=await layoutZip.file('OEBPS/chapter1.xhtml').async('string');
assert.equal((layout.match(/class="chat-message"/g)||[]).length,4);
assert.equal((layout.match(/class="sender-name"/g)||[]).length,3);
assert.equal((layout.match(/<p>第一段<\/p><p>第二段<\/p>/g)||[]).length,4);
assert.match(layout,/text-indent:2em/);
assert.match(layout,/border-bottom:1px solid #c9ced2/);
assert.match(layout,/\.sender-name \.heading-rule\{padding:0 2em 0.25em 0;/);
assert.match(layout,/h2 \.heading-rule\{padding:0 2em 0.3em;/);
assert.equal((layout.match(/<div class="chat-message" data-heading="true">/g)||[]).length,3);
assert.match(layout,/\.chat-message\+\.chat-message\{padding-top:0.7em;/);
// A long message crossing an internal byte boundary must remain a single paragraph.
const longText='长'.repeat(6000);
const {blob:longBlob}=await createEpub({messages:[{prefix:'#1',text:longText},{prefix:'#2',text:'下一楼'}],chapterSize:10,groups});
const longZip=await JSZip.loadAsync(await longBlob.arrayBuffer());
const longPage=await longZip.file('OEBPS/chapter1.xhtml').async('string');
assert.equal((longPage.match(/class="chat-message"/g)||[]).length,2);
assert.ok(longPage.includes('<p>'+longText+'</p>'));
const {blob:splitBlob}=await createEpub({messages:[{text:longText}],chapterSize:1,groups});
const splitZip=await JSZip.loadAsync(await splitBlob.arrayBuffer());
assert.match(await splitZip.file('OEBPS/chapter2.xhtml').async('string'),/<p class="continued-paragraph">/);
assert.equal(textHeading('林间').split('\n')[1].length,8);
assert.equal(textHeading('第一章',true).split('\n')[1].length,14);
console.log('EPUB regression tests passed');
