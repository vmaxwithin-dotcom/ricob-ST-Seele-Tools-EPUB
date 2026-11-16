import { defaults, validateGroups, escapeXml as esc, hexToHsv, hsvToHex } from './epub-formats.js?v=1.3.9';
const clone = value => JSON.parse(JSON.stringify(value));
export function openFormatEditor(settings, save) {
    const dialog = document.createElement('dialog');
    dialog.className = 'st-format-editor';
    dialog.id = 'seele-format-editor';
    dialog.dataset.theme = settings.menuTheme === 'dark' ? 'dark' : 'light';
    let groups = clone(settings.epubGroups ?? defaults(settings.epubDialogue, settings.epubEmphasis));
    let presets = clone(settings.epubPresets ?? []);
    const savedPalette = settings.epubPalette ?? ['#356C84', '#8D536C', '#57764D', '#925B43', '#625785', '#387970', '#796322', '#575E6B'];
    const palette = Array.from({ length: 8 }, (_, i) => /^#[\da-f]{6}$/i.test(savedPalette[i]) ? savedPalette[i].toUpperCase() : null);
    let activePreset = '';
    let paletteRenderers = [];
    dialog.addEventListener('palettechange', () => paletteRenderers.forEach(render => render()));
    dialog.innerHTML = `<form method="dialog"><header><div><strong>文字格式与颜色</strong><p class="st-hint">调整完成后，点击底部「保存并关闭」生效。</p></div><button value="cancel" aria-label="关闭">×</button></header>
        <section class="st-preset-panel"><h3>格式预设</h3>
        <div class="st-preset-bar"><select aria-label="格式预设"></select><button type="button" data-action="load">载入</button><button type="button" data-action="delete-preset">删除</button></div>
        <div class="st-preset-bar"><input class="st-preset-name" placeholder="预设名称" maxlength="40" aria-label="预设名称"><button type="button" data-action="save-preset">保存为预设</button></div>
        </section><h3>文字分组</h3><p class="st-hint">每组一种颜色。点击展开编辑；格式只匹配同一段内的文字，较长标记优先。</p>
        <div class="st-groups"></div><button type="button" data-action="add-group">＋ 添加分组</button>
        <p class="st-status" role="status"></p><footer><button value="cancel">取消</button><button type="button" data-action="apply">保存并关闭</button></footer></form>`;
    const list = dialog.querySelector('.st-groups');
    const select = dialog.querySelector('select');
    const status = dialog.querySelector('.st-status');
    const notify = message => { status.textContent = message; };
    function presetOptions() {
        select.innerHTML = '<option value="">内置默认</option>' + presets.map((p,i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
        select.value = activePreset;
    }
    function check() {
        if (dialog.querySelector('[aria-invalid="true"]')) throw new Error('请先修正标红的色号或快捷格式');
        validateGroups(groups);
    }
    function render(openIndex = -1) {
        list.innerHTML = '';
        paletteRenderers = [];
        groups.forEach((group,index) => {
            const section = document.createElement('details');
            section.open = index === openIndex;
            section.innerHTML = `<summary><i style="background:${/^#[\da-f]{6}$/i.test(group.color)?group.color:'#777777'}"></i><span>${esc(group.name)}</span><small>${group.pairs.length} 种格式</small></summary>
                <div class="st-group-body"><div class="st-preset-bar"><input class="st-group-name" aria-label="分组名称" maxlength="40" value="${esc(group.name)}"><button type="button" class="st-remove-group">删除分组</button></div>
                <div class="st-color-panel"><div class="st-color-line"><i class="st-color-preview"></i><input class="st-hex" aria-label="六位颜色色号" maxlength="7" value="${esc(group.color)}"></div>
                <div class="st-sliders"></div><div class="st-favorites" aria-label="八个颜色槽"></div>
                <div class="st-palette-actions"><button type="button" class="st-favorite" disabled>保存到所选色槽</button><button type="button" class="st-clear-color" disabled>清空色槽</button></div>
                <p class="st-hint">选中色槽可应用颜色，调整后保存即可覆盖。空槽也可选中。</p></div>
                <label><input class="st-keep" type="checkbox" ${group.keep?'checked':''}>保留标记符号</label>
                <div class="st-hint">每行：快捷输入 · 开始符 · 结束符；下方选择文字样式。</div><div class="st-pairs"></div><button type="button" class="st-add-pair">＋ 添加格式</button>
                <p class="st-hint">快捷输入 //、「」或 ****，会均分为开始符和结束符；也可分别填写。</p>
                <div class="st-example" aria-label="颜色与格式预览"></div></div>`;
            list.appendChild(section);
            const hex = section.querySelector('.st-hex');
            let hsv = hexToHsv(group.color);
            function preview() {
                section.querySelector('.st-color-preview').style.background = group.color;
                section.querySelector('summary i').style.background = group.color;
                const example = section.querySelector('.st-example');
                example.textContent = '';
                for (const pair of group.pairs) {
                    const row = document.createElement('div');
                    row.textContent = (group.keep ? pair.start : '') + '文字预览' + (group.keep ? pair.end : '');
                    row.style.color = group.color;
                    row.style.fontStyle = pair.style?.includes('italic') ? 'italic' : 'normal';
                    row.style.fontWeight = pair.style?.includes('bold') ? 'bold' : 'normal';
                    example.appendChild(row);
                }
            }
            const sliders = ['色相','饱和度','亮度'].map((label,i) => {
                const row = document.createElement('label'); row.className='st-slider';
                row.innerHTML = `<span>${label}</span><input type="range" min="0" max="${i===0?360:100}" step="1" aria-label="${label}"><output></output>`;
                section.querySelector('.st-sliders').appendChild(row);
                const input = row.querySelector('input');
                input.oninput = () => {hsv[i]=+input.value; group.color=hsvToHex(hsv); hex.value=group.color; hex.removeAttribute('aria-invalid'); sync(); preview();};
                return row;
            });
            function sync() {sliders.forEach((row,i) => {row.querySelector('input').value=hsv[i];row.querySelector('output').textContent=Math.round(hsv[i])+(i===0?'°':'%');});}
            hex.oninput = () => {
                const value = '#' + hex.value.trim().replace(/^#/,'');
                const valid = /^#[\da-f]{6}$/i.test(value);
                hex.setAttribute('aria-invalid',String(!valid));
                if(valid){group.color=value.toUpperCase();const next=hexToHsv(value);if(next[1]===0)next[0]=hsv[0];hsv=next;sync();preview();}
            };
            let selectedSlot = -1;
            function favorites() {
                const target=section.querySelector('.st-favorites');target.innerHTML='';
                palette.forEach((color, slot)=>{
                    const button=document.createElement('button');
                    button.type='button';
                    if (color) button.style.setProperty('--seele-swatch', color);
                    button.textContent=color ? '' : '+';
                    button.title=`色槽 ${slot+1} · ${color || '空'}`;
                    button.setAttribute('aria-label',button.title);
                    button.setAttribute('aria-pressed',String(slot===selectedSlot));
                    button.onclick=()=>{selectedSlot=slot;if(color){hex.value=color;hex.oninput();}favorites();};
                    target.appendChild(button);
                });
                section.querySelector('.st-favorite').disabled=selectedSlot<0;
                section.querySelector('.st-clear-color').disabled=selectedSlot<0 || !palette[selectedSlot];
            }
            section.querySelector('.st-favorite').onclick=()=>{
                if(hex.getAttribute('aria-invalid')==='true')return notify('请输入有效的六位色号');
                if(selectedSlot<0)return;
                palette[selectedSlot]=group.color.toUpperCase();
                dialog.dispatchEvent(new Event('palettechange'));notify(`色槽 ${selectedSlot+1} 已更新；保存并关闭后生效`);
            };
            section.querySelector('.st-clear-color').onclick=()=>{
                if(selectedSlot<0 || !window.confirm(`确定清空色槽 ${selectedSlot+1} 吗？已应用的文字颜色会保留。`))return;
                palette[selectedSlot]=null;
                dialog.dispatchEvent(new Event('palettechange'));notify('色槽已清空；保存并关闭后生效');
            };
            paletteRenderers.push(favorites);
            section.querySelector('.st-group-name').oninput=e=>{group.name=e.target.value;section.querySelector('summary span').textContent=group.name;};
            section.querySelector('.st-keep').onchange=e=>{group.keep=e.target.checked;preview();};
            section.querySelector('.st-remove-group').onclick=()=>{if(!window.confirm(`确定删除分组「${group.name}」及其中的所有格式吗？`))return;groups.splice(index,1);render();};
            function pairs() {
                const target=section.querySelector('.st-pairs');target.innerHTML='';
                section.querySelector('summary small').textContent=group.pairs.length+' 种格式';
                group.pairs.forEach((pair,pi)=>{
                    const row=document.createElement('div');row.className='st-pair';
                    row.innerHTML=`<input class="st-quick" placeholder="快捷格式 //" aria-label="快捷格式" value="${esc(pair.start+pair.end)}"><input class="st-start" placeholder="开始符" aria-label="开始符" value="${esc(pair.start)}"><input class="st-end" placeholder="结束符" aria-label="结束符" value="${esc(pair.end)}"><select aria-label="文字样式"><option value="">常规</option><option value="italic">斜体</option><option value="bold">粗体</option><option value="bold-italic">粗斜体</option></select><button type="button" aria-label="删除格式">×</button><small></small>`;
                    target.appendChild(row);
                    const quick=row.querySelector('.st-quick'),start=row.querySelector('.st-start'),end=row.querySelector('.st-end');
                    function sample(){row.querySelector('small').textContent=pair.start+'文字'+pair.end;preview();}
                    quick.oninput=()=>{const chars=Array.from(quick.value);const valid=chars.length>=2&&chars.length%2===0;quick.setAttribute('aria-invalid',String(!valid));if(valid){pair.start=start.value=chars.slice(0,chars.length/2).join('');pair.end=end.value=chars.slice(chars.length/2).join('');sample();}};
                    start.oninput=end.oninput=()=>{pair.start=start.value;pair.end=end.value;quick.value=pair.start+pair.end;quick.removeAttribute('aria-invalid');sample();};
                    row.querySelector('select').value=pair.style||'';
                    row.querySelector('select').onchange=e=>{pair.style=e.target.value;preview();};
                    row.querySelector('button').onclick=()=>{if(!window.confirm(`确定删除格式「${pair.start}文字${pair.end}」吗？`))return;group.pairs.splice(pi,1);pairs();preview();};sample();
                });
            }
            section.querySelector('.st-add-pair').onclick=()=>{group.pairs.push({start:'',end:'',style:''});pairs();};
            sync();favorites();pairs();preview();
        });
    }
    dialog.addEventListener('click',event=>{
        const action=event.target.dataset.action;if(!action)return;
        try {
            if(action==='add-group'){groups.push({name:'自定义文本',color:'#57764D',keep:true,pairs:[{start:'/',end:'/',style:''}]});render(groups.length-1);}
            if(action==='load'){activePreset=select.value;groups=clone(activePreset===''?defaults():presets[+activePreset].groups);render();notify('已载入；保存并关闭后生效');}
            if(action==='delete-preset'){if(select.value==='')return notify('内置默认不可删除');if(!window.confirm(`确定删除预设「${presets[+select.value].name}」吗？`))return;presets.splice(+select.value,1);activePreset='';presetOptions();notify('已移除预设，保存并关闭后生效');}
            if(action==='save-preset'){
                check();const name=dialog.querySelector('.st-preset-name').value.trim();if(!name)return notify('请先填写预设名称');
                const index=presets.findIndex(p=>p.name===name);const preset={name,groups:clone(groups)};
                if(index<0){presets.push(preset);activePreset=String(presets.length-1);}else{presets[index]=preset;activePreset=String(index);}
                presetOptions();notify('预设已暂存；保存并关闭后生效');
            }
            if(action==='apply'){check();save({epubGroups:clone(groups),epubPresets:presets,epubPalette:palette});dialog.close();}
        } catch(error){notify(error.message);}
    });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') event.preventDefault();
    });
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.appendChild(dialog);presetOptions();render();dialog.showModal();
}
