export const defaults = (dialogue = '#356C84', thought = '#8D536C') => [
    { name: '对话文本', color: dialogue, keep: true, pairs: ['“”', '""', '«»', '‘’', "''", '『』', '「」', '｛｝'].map(pair => ({ start: pair[0], end: pair[1], style: '' })) },
    { name: '心理文本', color: thought, keep: false, pairs: [1, 2, 3].map(n => ({ start: '*'.repeat(n), end: '*'.repeat(n), style: ['', 'italic', 'bold', 'bold-italic'][n] })) },
];
export function escapeXml(text) {
    return String(text ?? '').replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '')
        .replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'})[c]);
}
export function validateGroups(groups) {
    if (!Array.isArray(groups) || groups.length > 32) throw new Error('格式分组最多 32 组');
    const seen = new Set();
    for (const group of groups) {
        if (!group.name?.trim() || !/^#[\da-f]{6}$/i.test(group.color)) throw new Error('请填写分组名称及六位色号');
        if (!Array.isArray(group.pairs) || !group.pairs.length || group.pairs.length > 32) throw new Error('每组需要 1–32 个格式');
        for (const pair of group.pairs) {
            if (typeof pair.start !== 'string' || typeof pair.end !== 'string' || !pair.start.trim() || !pair.end.trim() || pair.start.length > 16 || pair.end.length > 16 || /[\r\n]/.test(pair.start + pair.end)) throw new Error('开始符和结束符需为 1–16 个字符，不能换行');
            if (seen.has(pair.start)) throw new Error('开始符重复：' + pair.start + '；请合并或修改规则');
            seen.add(pair.start);
        }
    }
    return groups;
}
// Literal delimiters only: custom formats cannot inject regular expressions or HTML.
export function formatter(groups) {
    validateGroups(groups);
    const rules = groups.flatMap((g, index) => g.pairs.map(p => ({...p, keep:g.keep, index})))
        .sort((a,b) => b.start.length - a.start.length);
    function render(text, depth = 0, excluded = new Set()) {
        let result = '', plain = '';
        const flush = () => {result += escapeXml(plain); plain = '';};
        for (let i = 0; i < text.length;) {
            let match = null;
            for (const rule of rules) {
                if (excluded.has(rule) || !text.startsWith(rule.start, i)) continue;
                if (rule.start === "'" && /[\p{L}\p{N}]/u.test(text[i - 1] || '')) continue;
                let end = text.indexOf(rule.end, i + rule.start.length);
                if (end <= i + rule.start.length) continue;
                if (rule.start === "'" && /[\p{L}\p{N}]/u.test(text[end + 1] || '')) continue;
                match = { rule, end }; break;
            }
            if (!match) {plain += text[i++]; continue;}
            flush();
            const {rule, end} = match;
            const inner = text.slice(i + rule.start.length, end);
            const nested = new Set(excluded); nested.add(rule);
            const body = depth < 8 ? render(inner, depth + 1, nested) : escapeXml(inner);
            const style = ['italic','bold','bold-italic'].includes(rule.style) ? ' st-' + rule.style : '';
            let inlineStyle = 'color:' + groups[rule.index].color + ';display:inline;letter-spacing:0;word-spacing:0;';
            if (rule.style === 'italic' || rule.style === 'bold-italic') inlineStyle += 'font-style:italic;';
            if (rule.style === 'bold' || rule.style === 'bold-italic') inlineStyle += 'font-weight:bold;';
            result += '<span class="st-format-' + rule.index + style + '" style="' + inlineStyle + '">' + (rule.keep ? escapeXml(rule.start) : '') + body + (rule.keep ? escapeXml(rule.end) : '') + '</span>';
            i = end + rule.end.length;
        }
        flush(); return result;
    }
    return text => render(String(text ?? ''));
}
export function exportFilename() {
    // ASCII-only download name avoids URI fragments and provider-specific filename decoding.
    return 'chat-' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z') + '.epub';
}
export function hexToHsv(hex) {
    const [r,g,b] = hex.match(/[\da-f]{2}/gi).map(v => parseInt(v,16)/255);
    const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
    let h = !d ? 0 : max === r ? ((g-b)/d)%6 : max === g ? (b-r)/d+2 : (r-g)/d+4;
    return [(h*60+360)%360, max ? d/max*100 : 0, max*100];
}
export function hsvToHex([h,s,v]) {
    s /= 100; v /= 100;
    const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c;
    const rgb = h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
    return '#' + rgb.map(n => Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
}
