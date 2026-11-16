import './vendor/jszip.min.js';
import { defaults, formatter, escapeXml } from './epub-formats.js?v=1.3.7';

export const DIALOGUE_COLOR = '#356C84';
export const EMPHASIS_COLOR = '#8D536C';

export function epubColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
function xhtml(title, css, body) {
    return xmlHeader + '<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">' +
        '<head><title>' + title + '</title><style type="text/css">' + css + '</style></head><body>' + body + '</body></html>';
}

export async function createEpub({ title, author, messages, chapterSize, dialogueColor, emphasisColor, groups }) {
    const zip = new globalThis.JSZip();
    const safeTitle = escapeXml(title ?? '').trim() || '聊天记录';
    const safeAuthor = escapeXml(author ?? '').trim() || 'SillyTavern User';
    const uuid = globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : (() => {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
        const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    })();
    const bookId = 'urn:uuid:' + uuid;
    const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const size = Number.isSafeInteger(chapterSize) && chapterSize > 0 ? chapterSize : 1;
    const dialogue = epubColor(dialogueColor, DIALOGUE_COLOR);
    const emphasis = epubColor(emphasisColor, EMPHASIS_COLOR);
    const formatGroups = groups ?? defaults(dialogue, emphasis);
    const formatInline = formatter(formatGroups);
    // Keep essential spacing on the elements themselves for readers that rewrite stylesheets.
    const paragraphStyle = 'margin:0;padding:0;text-indent:2em;line-height:1.6;text-align:left;letter-spacing:0;word-spacing:0;overflow-wrap:break-word;word-wrap:break-word;';
    const headingStyle = 'margin:0;padding:0;text-indent:0;line-height:1.4;text-align:left;font-size:0.95em;font-weight:bold;font-style:normal;letter-spacing:0;word-spacing:0;overflow-wrap:break-word;word-wrap:break-word;page-break-after:avoid;';
    const chapterStyle = 'margin:0;padding:0.6em 0 0.65em;text-indent:0;font-size:1.25em;line-height:1.4;text-align:center;font-style:normal;letter-spacing:0;word-spacing:0;page-break-after:avoid;';
    const css = formatGroups.map((g,i) => '.st-format-' + i + '{color:' + g.color + ';}').join('') +
        '.st-italic,.st-bold-italic{font-style:italic;}.st-bold,.st-bold-italic{font-weight:bold;}' +
        'body{line-height:1.6;max-width:36em;margin:0 auto;padding:0 1em;}' +
        'p{'+paragraphStyle+'}' +
        '.chat-message{margin:0;padding:0;}.chat-message p{orphans:2;widows:2;}' +
        'h2{'+chapterStyle+'}.sender-name{'+headingStyle+'}';
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', xmlHeader + '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const book = zip.folder('OEBPS');
    book.file('cover.xhtml', xhtml('封面', 'body{text-align:center;margin-top:30%;}h1{font-size:2.5em;}p{font-size:1.5em;color:#555;}', '<h1>'+safeTitle+'</h1><p>'+safeAuthor+'</p>'));
    const chunks = [];
    for (const [messageIndex, message] of messages.entries()) {
        let chunk = '', bytes = 0, first = true, continuedParagraph = false;
        for (const char of String(message.text ?? '')) {
            const point = char.codePointAt(0);
            const cost = point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
            if (bytes + cost > 16000) {
                chunks.push({prefix:first ? message.prefix : '',text:chunk,messageIndex,continuedParagraph});
                continuedParagraph = !/[\r\n]$/.test(chunk) && !/[\r\n]/.test(char);
                first=false;chunk='';bytes=0;
            }
            chunk+=char;bytes+=cost;
        }
        if(chunk)chunks.push({prefix:first ? message.prefix : '',text:chunk,messageIndex,continuedParagraph});
    }
    const chapters = [];
    let group=[], groupBytes=0;
    for(const message of chunks) {
        const bytes=new TextEncoder().encode(message.text).length;
        if(group.length && (group.length>=size || groupBytes+bytes>32000)) {
            chapters.push(group);group=[];groupBytes=0;
        }
        group.push(message);groupBytes+=bytes;
    }
    if(group.length)chapters.push(group);
    if(!chapters.length)throw new Error('没有可导出的聊天内容');
    const pages=[{id:'cover',title:'封面'}];
    for(const group of chapters) {
        const page={id:'chapter'+pages.length,title:'第'+pages.length+'章'};
        // Byte-size chunks from the same message are not separate floors or paragraphs.
        const pageMessages=[];
        for(const chunk of group) {
            const previous=pageMessages[pageMessages.length-1];
            if(previous?.messageIndex===chunk.messageIndex) previous.text+=chunk.text;
            else pageMessages.push({...chunk});
        }
        const body=pageMessages.map(({prefix,text,continuedParagraph}, messageIndex)=>{
            const paragraphs=text.split(/\r\n|\r|\n/).filter(line=>line.trim()).map((line,index)=>{
                const continuation=index===0 && continuedParagraph;
                const gap=index===0 && messageIndex===0 && !prefix ? '0' : '0.25em';
                const style=paragraphStyle+'padding-top:'+gap+';'+(continuation?'text-indent:0;':'');
                return '<p'+(continuation?' class="continued-paragraph"':'')+' style="'+style+'">'+formatInline(line.trimStart())+'</p>';
            }).join('');
            const heading=prefix?'<p class="sender-name" style="'+headingStyle+'padding-top:'+(messageIndex===0?'0':'0.65em')+';">'+escapeXml(prefix)+'</p>':'';
            return '<div class="chat-message" style="margin:0;padding:0;">'+heading+paragraphs+'</div>';
        }).join('');
        book.file(page.id+'.xhtml',xhtml(page.title,css,'<h2 style="'+chapterStyle+'">'+page.title+'</h2>'+body));pages.push(page);
    }
    const manifest=pages.map(({id})=>'<item id="'+id+'" href="'+id+'.xhtml" media-type="application/xhtml+xml"/>').join('');
    const spine=pages.map(({id})=>'<itemref idref="'+id+'"/>').join('');
    book.file('content.opf',xmlHeader+'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">'+
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>'+safeTitle+'</dc:title><dc:creator>'+safeAuthor+'</dc:creator><dc:language>zh-CN</dc:language><dc:identifier id="book-id">'+bookId+'</dc:identifier><meta property="dcterms:modified">'+modified+'</meta></metadata>'+
        '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'+manifest+'</manifest><spine toc="ncx">'+spine+'</spine></package>');
    book.file('nav.xhtml',xmlHeader+'<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN"><head><title>目录</title></head><body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>'+pages.map(page=>'<li><a href="'+page.id+'.xhtml">'+page.title+'</a></li>').join('')+'</ol></nav></body></html>');
    const navMap=pages.map(({id,title},i)=>'<navPoint id="nav-'+id+'" playOrder="'+(i+1)+'"><navLabel><text>'+title+'</text></navLabel><content src="'+id+'.xhtml"/></navPoint>').join('');
    book.file('toc.ncx',xmlHeader+'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-CN"><head><meta name="dtb:uid" content="'+bookId+'"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head><docTitle><text>'+safeTitle+'</text></docTitle><navMap>'+navMap+'</navMap></ncx>');
    return {blob:await zip.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'}),chapterCount:pages.length-1};
}
