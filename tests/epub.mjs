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
        assert.equal(chapterCount,1);
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
assert.equal((layout.match(/<p(?: class="opening")?>第一段<\/p><p>第二段<\/p>/g)||[]).length,4);
assert.match(layout,/text-indent:2em/);
assert.doesNotMatch(layout,/heading-rule|border-bottom|text-align:justify|inline-block/);
assert.match(layout,/<p class="sender-name" style="[^"]*padding-top:0.65em;">/);
assert.match(layout,/\.chat-message p\{[^}]*text-align:left;[^}]*padding-top:0.25em;/);
assert.match(format('*心理*'),/class="st-format-1 st-italic"/);
// A long floor remains whole, including its paragraph and formatting delimiters.
const longText='长'.repeat(6000);
const {blob:longBlob}=await createEpub({messages:[{prefix:'#1',text:longText},{prefix:'#2',text:'下一楼'}],chapterSize:10,groups});
const longZip=await JSZip.loadAsync(await longBlob.arrayBuffer());
const longPage=await longZip.file('OEBPS/chapter1.xhtml').async('string');
assert.equal((longPage.match(/class="chat-message"/g)||[]).length,2);
assert.ok(longPage.includes('>'+longText+'</p>'));
const {blob:splitBlob,chapterCount:singleCount}=await createEpub({messages:[{text:'“'+longText+'”'}],chapterSize:1,groups});
const splitZip=await JSZip.loadAsync(await splitBlob.arrayBuffer());
assert.equal(singleCount,1);
assert.equal(splitZip.file('OEBPS/chapter2.xhtml'),null);
assert.ok((await splitZip.file('OEBPS/chapter1.xhtml').async('string')).includes('>“'+longText+'”</span>'));
for(const chapterSize of [1,2,3,10]) {
    const messages=Array.from({length:5},(_,i)=>({prefix:'#'+i,text:'“'+longText+'”\nEND-'+i}));
    const {blob,chapterCount}=await createEpub({messages,chapterSize,groups});
    assert.equal(chapterCount,Math.ceil(messages.length/chapterSize));
    const zip=await JSZip.loadAsync(await blob.arrayBuffer(),{checkCRC32:true});
    const opf=await zip.file('OEBPS/content.opf').async('string');
    const items=new Map([...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map(m=>[m[1],m[2]]));
    for(const href of items.values()) assert.ok(zip.file('OEBPS/'+href),'Missing manifest file '+href);
    const spine=[...opf.matchAll(/<itemref idref="([^"]+)"/g)].map(m=>m[1]);
    assert.deepEqual(spine,['cover',...Array.from({length:chapterCount},(_,i)=>'chapter'+(i+1))]);
    const nav=await zip.file('OEBPS/nav.xhtml').async('string');
    const ncx=await zip.file('OEBPS/toc.ncx').async('string');
    assert.deepEqual([...nav.matchAll(/<a href="([^"]+)"/g)].map(m=>m[1]),spine.map(id=>items.get(id)));
    assert.deepEqual([...ncx.matchAll(/<content src="([^"]+)"/g)].map(m=>m[1]),spine.map(id=>items.get(id)));
    for(let chapter=0;chapter<chapterCount;chapter++) {
        const html=await zip.file('OEBPS/chapter'+(chapter+1)+'.xhtml').async('string');
        const expected=messages.slice(chapter*chapterSize,(chapter+1)*chapterSize);
        assert.equal((html.match(/class="chat-message"/g)||[]).length,expected.length);
        for(const message of expected) assert.ok(html.includes('>'+message.prefix+'</p>'));
        assert.equal((html.match(/END-\d/g)||[]).length,expected.length);
    }
}
await assert.rejects(createEpub({messages:[{text:' \n\t'}],groups}),/没有/);
console.log('EPUB regression tests passed');
