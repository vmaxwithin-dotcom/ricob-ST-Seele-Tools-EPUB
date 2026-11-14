import './vendor/jszip.min.js';

export const DIALOGUE_COLOR = '#356C84';
export const EMPHASIS_COLOR = '#8D536C';

export function epubColor(value, fallback) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
const dialoguePattern = /“[^”\r\n]*”|"[^"\r\n]*"|«[^»\r\n]*»|‘[^’\r\n]*’|『[^』\r\n]*』|「[^」\r\n]*」|｛[^｝\r\n]*｝|(?<![\p{L}\p{N}])'[^'\r\n]+'(?![\p{L}\p{N}])/u;
const emphasisPattern = /(?<!\*)\*(\*{0,2})([^*\r\n]+)\*\1(?!\*)/;
const emphasisClasses = ['st-emphasis-light', 'st-emphasis-bold', 'st-emphasis-bold-italic'];

function escapeXml(text) {
    return String(text).replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
        .replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

function formatInline(text, allowDialogue = true, allowEmphasis = true) {
    let html = '';
    while (text) {
        const dialogue = allowDialogue ? dialoguePattern.exec(text) : null;
        const emphasis = allowEmphasis ? emphasisPattern.exec(text) : null;
        if (!dialogue && !emphasis) return html + escapeXml(text);
        if (dialogue && (!emphasis || dialogue.index < emphasis.index)) {
            html += escapeXml(text.slice(0, dialogue.index));
            html += '<span class="st-dialogue">' + formatInline(dialogue[0], false, allowEmphasis) + '</span>';
            text = text.slice(dialogue.index + dialogue[0].length);
        } else {
            html += escapeXml(text.slice(0, emphasis.index));
            html += '<span class="' + emphasisClasses[emphasis[1].length] + '">' +
                formatInline(emphasis[2], allowDialogue, false) + '</span>';
            text = text.slice(emphasis.index + emphasis[0].length);
        }
    }
    return html;
}

function xhtml(title, css, body) {
    return xmlHeader + '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">' +
        '<head><title>' + title + '</title><style type="text/css">' + css + '</style></head><body>' + body + '</body></html>';
}

export async function createEpub({ title, author, messages, chapterSize, dialogueColor, emphasisColor }) {
    const zip = new globalThis.JSZip();
    const safeTitle = escapeXml(title || '聊天记录');
    const safeAuthor = escapeXml(author || 'SillyTavern User');
    const bookId = 'urn:seele-tools:' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const size = Number.isSafeInteger(chapterSize) && chapterSize > 0 ? chapterSize : 1;
    const dialogue = epubColor(dialogueColor, DIALOGUE_COLOR);
    const emphasis = epubColor(emphasisColor, EMPHASIS_COLOR);
    const css = 'body{line-height:1.6;margin:0;padding:0;}' +
        'p{text-indent:2em;margin:0.5em 0;}' +
        'h2{text-align:center;color:#333;border-bottom:1px solid #ccc;padding-bottom:10px;margin-bottom:20px;}' +
        '.sender-name{font-weight:bold;color:#555;text-indent:0;margin-top:1em;}' +
        '.st-dialogue{color:' + dialogue + ';}' +
        '.st-emphasis-light,.st-emphasis-bold,.st-emphasis-bold-italic{color:' + emphasis + ';}' +
        '.st-emphasis-light,.st-emphasis-bold-italic{font-style:italic;}' +
        '.st-emphasis-bold,.st-emphasis-bold-italic{font-weight:bold;}';

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    zip.file('META-INF/container.xml', xmlHeader +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>' +
        '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
    const book = zip.folder('OEBPS');
    book.file('cover.xhtml', xhtml('封面', 'body{text-align:center;margin-top:30%;}h1{font-size:2.5em;}p{font-size:1.5em;color:#555;}',
        '<h1>' + safeTitle + '</h1><p>' + safeAuthor + '</p>'));

    const pages = [{ id: 'cover', title: '封面' }];
    for (let start = 0; start < messages.length; start += size) {
        const page = { id: 'chapter' + pages.length, title: '第' + pages.length + '章' };
        const body = messages.slice(start, start + size).map(({ prefix, text }) => {
            const paragraphs = text.split(/\r\n|\r|\n/).filter(line => line.trim())
                .map(line => '<p>' + formatInline(line) + '</p>').join('');
            return (prefix ? '<div class="sender-name">' + escapeXml(prefix) + '</div>' : '') + paragraphs;
        }).join('');
        book.file(page.id + '.xhtml', xhtml(page.title, css, '<h2>' + page.title + '</h2>' + body));
        pages.push(page);
    }

    const manifest = pages.map(({ id }) => '<item id="' + id + '" href="' + id + '.xhtml" media-type="application/xhtml+xml"/>').join('');
    const spine = pages.map(({ id }) => '<itemref idref="' + id + '"/>').join('');
    const navMap = pages.map(({ id, title }, index) => '<navPoint id="nav-' + id + '" playOrder="' + (index + 1) +
        '"><navLabel><text>' + title + '</text></navLabel><content src="' + id + '.xhtml"/></navPoint>').join('');
    book.file('content.opf', xmlHeader + '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id">' +
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + safeTitle + '</dc:title><dc:creator>' + safeAuthor +
        '</dc:creator><dc:language>zh-CN</dc:language><dc:identifier id="book-id">' + bookId + '</dc:identifier></metadata>' +
        '<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>' + manifest + '</manifest>' +
        '<spine toc="ncx">' + spine + '</spine><guide><reference type="title-page" title="封面" href="cover.xhtml"/></guide></package>');
    book.file('toc.ncx', xmlHeader + '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="zh-CN">' +
        '<head><meta name="dtb:uid" content="' + bookId + '"/><meta name="dtb:depth" content="1"/>' +
        '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>' +
        '<docTitle><text>' + safeTitle + '</text></docTitle><navMap>' + navMap + '</navMap></ncx>');
    return { blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' }),
        chapterCount: pages.length - 1 };
}
