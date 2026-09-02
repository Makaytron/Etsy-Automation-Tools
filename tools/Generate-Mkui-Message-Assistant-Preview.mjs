import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'etsy-message-assistant', 'Makaytron-Etsy-Message-Assistant.user.js');
const logoPath = path.join(repoRoot, 'assets', 'makaytron-logo.png');
const requestedOutput = process.argv.find(argument => argument.startsWith('--output='))?.slice('--output='.length);
const outputDirectory = path.resolve(repoRoot, requestedOutput || 'artifacts/mkui-message-assistant-preview');
const outputPath = path.join(outputDirectory, 'message-assistant-mkui-preview.html');

function extractTemplateLiteral(source, name) {
  const marker = `const ${name} = \``;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} start marker is missing`);
  assert.equal(source.indexOf(marker, start + marker.length), -1, `${name} start marker is ambiguous`);
  const valueStart = start + marker.length;
  const end = source.indexOf('`;', valueStart);
  assert.ok(end > valueStart, `${name} end marker is missing`);
  return source.slice(valueStart, end);
}

const source = await readFile(scriptPath, 'utf8');
assert.match(source, /\/\/ @version\s+1\.2\.9/);
assert.ok(source.includes("const APP_VERSION = '1.2.9';"));
assert.ok(source.includes("const MKUI_VERSION = '1.0.0';"));
assert.ok(source.includes("attachShadow({ mode: 'closed' })"), 'production closed Shadow DOM contract is missing');

const css = [
  extractTemplateLiteral(source, 'CSS'),
  extractTemplateLiteral(source, 'LAUNCHER_CSS'),
  extractTemplateLiteral(source, 'UX_CSS'),
  extractTemplateLiteral(source, 'PREMIUM_CSS'),
].join('\n');
const logoData = `data:image/png;base64,${(await readFile(logoPath)).toString('base64')}`;

const icon = pathData => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${pathData}"/></svg>`;
const icons = {
  inbox: icon('M4 4h16v16H4z M4 14h4l2 3h4l2-3h4'),
  orders: icon('M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4'),
  automation: icon('M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0'),
  templates: icon('M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5'),
  history: icon('M4 12a8 8 0 1 0 2.3-5.7 M4 4v5h5 M12 8v5l3 2'),
  settings: icon('M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9 7 7 M17 17l2.1 2.1 M19.1 4.9 17 7 M7 17l-2.1 2.1'),
  spark: icon('M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z'),
  search: icon('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M16 16l4 4'),
  close: icon('M6 6l12 12 M18 6 6 18'),
};

const markup = `
  <section class="ma-app ma-app--wide preview-app" aria-label="Makaytron Etsy Message Assistant MKUI preview">
    <header class="ma-header preview-header">
      <div class="ma-brand preview-brand">
        <div class="ma-brand__mark"><img class="ma-logo-img" src="${logoData}" alt="Makaytron"></div>
        <div class="preview-brand-copy">
          <div class="ma-brand__title">Makaytron Etsy Message Assistant</div>
          <div class="ma-brand__version">v1.2.9 · MKUI 1.0.0</div>
        </div>
      </div>
      <div class="preview-header-actions">
        <span class="ma-pill preview-online"><i></i> Etsy bağlı</span>
        <button class="ma-icon-btn" type="button" aria-label="Ara">${icons.search}</button>
        <button class="ma-panel-close" type="button">${icons.close}<span>Kapat</span></button>
      </div>
    </header>

    <nav class="ma-nav preview-nav" aria-label="Asistan bölümleri">
      <div class="ma-nav__group">
        <div class="ma-nav__eyebrow">Çalışma Alanı</div>
        <button class="ma-nav__item is-active" type="button">${icons.inbox}<span>Mesajlar</span><b>8</b></button>
        <button class="ma-nav__item" type="button">${icons.orders}<span>Siparişler</span></button>
        <button class="ma-nav__item" type="button">${icons.automation}<span>Otomasyon</span><i class="preview-live-dot"></i></button>
        <button class="ma-nav__item" type="button">${icons.templates}<span>Şablonlar</span></button>
        <button class="ma-nav__item" type="button">${icons.history}<span>Geçmiş</span></button>
      </div>
      <div class="ma-nav__group ma-nav__group--utility">
        <div class="ma-nav__eyebrow">Sistem</div>
        <button class="ma-nav__item" type="button">${icons.settings}<span>Ayarlar</span></button>
      </div>
      <div class="preview-sidebar-status">
        <span>Asistan durumu</span>
        <strong><i></i> Hazır</strong>
      </div>
    </nav>

    <main class="ma-main preview-main">
      <div class="ma-view preview-view">
        <div class="ma-page-head preview-page-head">
          <div>
            <div class="preview-eyebrow">MESAJ MERKEZİ</div>
            <h2>Müşteri konuşmaları</h2>
            <p>Mesajları inceleyin, seçtiğiniz dilde görün ve göndermeden önce güvenli bir cevap taslağı hazırlayın.</p>
          </div>
          <div class="ma-page-head__actions preview-page-actions">
            <button class="ma-btn ma-btn--small" type="button">Yenile</button>
            <button class="ma-btn ma-btn--primary" type="button">${icons.spark}<span>Yeni taslak</span></button>
          </div>
        </div>

        <div class="preview-kpi-grid">
          <article class="ma-card preview-kpi"><span>Yanıt bekleyen</span><strong>8</strong><small>3 yüksek öncelik</small></article>
          <article class="ma-card preview-kpi"><span>Bugün hazırlanan</span><strong>21</strong><small class="success">+6 dünden</small></article>
          <article class="ma-card preview-kpi"><span>Ortalama güven</span><strong>%94</strong><small>İnsan onayı açık</small></article>
        </div>

        <section class="ma-card preview-workspace">
          <div class="preview-toolbar">
            <label class="preview-search">${icons.search}<input class="ma-input" value="" placeholder="Müşteri veya sipariş ara"></label>
            <select class="ma-select" aria-label="Durum"><option>Tüm durumlar</option></select>
            <select class="ma-select" aria-label="Sıralama"><option>En yeni</option></select>
          </div>

          <div class="preview-message-layout">
            <div class="preview-conversation-list">
              <button class="preview-conversation is-selected" type="button">
                <span class="preview-avatar">EM</span>
                <span class="preview-conversation-copy"><strong>Emily M.</strong><small>#31482950 · 4 dk önce</small><em>Hi! Could the name be changed to Olivia?</em></span>
                <span class="ma-pill ma-pill--warning">Yeni</span>
              </button>
              <button class="preview-conversation" type="button">
                <span class="preview-avatar">JL</span>
                <span class="preview-conversation-copy"><strong>Jessica L.</strong><small>#31482712 · 18 dk önce</small><em>Thank you, it looks perfect!</em></span>
                <span class="ma-pill ma-pill--success">Hazır</span>
              </button>
              <button class="preview-conversation" type="button">
                <span class="preview-avatar">AB</span>
                <span class="preview-conversation-copy"><strong>Amanda B.</strong><small>#31482109 · 42 dk önce</small><em>Do you think this can arrive before Friday?</em></span>
                <span class="ma-pill">İncele</span>
              </button>
              <button class="preview-conversation" type="button">
                <span class="preview-avatar">RS</span>
                <span class="preview-conversation-copy"><strong>Rachel S.</strong><small>#31481774 · 1 sa önce</small><em>I uploaded the new photo for the shirt.</em></span>
              </button>
            </div>

            <article class="preview-thread">
              <div class="preview-thread-head">
                <div><strong>Emily M.</strong><span>Sipariş #31482950 · Kişiselleştirilmiş tişört</span></div>
                <span class="ma-pill ma-pill--success"><i></i> Bağlam hazır</span>
              </div>
              <div class="preview-thread-body">
                <div class="preview-bubble customer"><small>Emily · 04:01</small><p>Hi! I just placed my order. Could the name be changed from Emma to Olivia?</p></div>
                <div class="preview-translation"><b>Türkçe çeviri</b><p>Merhaba! Siparişimi yeni verdim. İsmi Emma yerine Olivia olarak değiştirebilir misiniz?</p></div>
                <div class="preview-assistant-card">
                  <div class="preview-assistant-title">${icons.spark}<div><strong>Hazırlanan cevap</strong><span>Güven: %96 · Risk bulunmadı</span></div><span class="ma-pill ma-pill--success">Kontrole hazır</span></div>
                  <textarea class="ma-textarea">Hi Emily! Absolutely — I’ve noted the change and will use Olivia on your order. Thank you for letting me know so quickly!</textarea>
                  <div class="preview-assistant-actions">
                    <button class="ma-btn ma-btn--small" type="button">Yeniden hazırla</button>
                    <button class="ma-btn ma-btn--small" type="button">Panoya kopyala</button>
                    <button class="ma-btn ma-btn--primary" type="button">Cevaba ekle</button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  </section>`;

const previewCss = `
  :host{font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717}
  svg{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
  button{font:inherit}
  .preview-app{display:grid!important;grid-template-columns:184px minmax(0,1fr)!important;grid-template-rows:60px minmax(0,1fr)!important;overflow:hidden!important}
  .preview-header{grid-column:1/-1;grid-row:1;display:flex;align-items:center;justify-content:space-between;gap:16px;z-index:3}
  .preview-brand,.preview-header-actions,.preview-page-actions,.preview-assistant-actions,.preview-assistant-title{display:flex;align-items:center}
  .preview-brand{gap:10px;min-width:0}.preview-brand-copy{min-width:0}.ma-logo-img{display:block;width:42px;height:auto}
  .preview-header-actions{gap:8px}.preview-online{gap:6px}.preview-online i,.preview-sidebar-status i,.preview-thread-head .ma-pill i{width:7px;height:7px;border-radius:50%;background:var(--ma-success);display:inline-block}
  .preview-nav{grid-column:1;grid-row:2;display:flex;flex-direction:column;overflow:hidden}.ma-nav__group{display:grid;gap:5px}.ma-nav__item{width:100%;display:flex;align-items:center;gap:9px;cursor:pointer}.ma-nav__item span{min-width:0;flex:1;text-align:left}.ma-nav__item b{min-width:20px;height:20px;padding:0 6px;border-radius:999px;display:grid;place-items:center;background:#171717;color:#fff;font-size:10px}.preview-live-dot{width:7px;height:7px;border-radius:50%;background:var(--ma-success)}
  .preview-sidebar-status{margin-top:auto;padding:12px 10px;border:1px solid var(--ma-line);border-radius:var(--ma-r2);background:#fff}.preview-sidebar-status span{display:block;color:var(--ma-muted);font-size:10px}.preview-sidebar-status strong{margin-top:5px;display:flex;align-items:center;gap:6px;font-size:11.5px}
  .preview-main{grid-column:2;grid-row:2;min-width:0;overflow:auto}.preview-view{padding:22px}.preview-page-head{display:flex;justify-content:space-between;gap:20px}.preview-page-head h2{margin:4px 0 5px}.preview-page-head p{margin:0}.preview-eyebrow{color:var(--ma-muted);font-size:10px;font-weight:800;letter-spacing:.12em}.preview-page-actions{gap:8px}
  .preview-kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.preview-kpi{padding:14px}.preview-kpi span,.preview-kpi small{display:block;color:var(--ma-muted);font-size:10.5px}.preview-kpi strong{display:block;margin:5px 0 3px;font-size:22px}.preview-kpi small.success{color:var(--ma-success)}
  .preview-workspace{overflow:hidden}.preview-toolbar{padding:10px;display:grid;grid-template-columns:minmax(260px,1fr) 150px 130px;gap:8px;border-bottom:1px solid var(--ma-line);background:#fafafa}.preview-search{position:relative}.preview-search svg{position:absolute;left:11px;top:11px;color:var(--ma-muted)}.preview-search .ma-input{padding-left:36px}
  .preview-message-layout{display:grid;grid-template-columns:340px minmax(0,1fr);min-height:505px}.preview-conversation-list{padding:9px;border-right:1px solid var(--ma-line);background:#fafafa;display:grid;align-content:start;gap:6px}.preview-conversation{width:100%;padding:10px;border:1px solid transparent;border-radius:var(--ma-r2);display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:9px;color:var(--ma-ink);background:transparent;text-align:left;cursor:pointer}.preview-conversation:hover,.preview-conversation.is-selected{border-color:var(--ma-line);background:#fff}.preview-conversation.is-selected{box-shadow:0 1px 2px rgba(0,0,0,.04)}.preview-avatar{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:#ededed;font-size:11px;font-weight:800}.preview-conversation-copy{min-width:0}.preview-conversation-copy strong,.preview-conversation-copy small,.preview-conversation-copy em{display:block}.preview-conversation-copy strong{font-size:12.5px}.preview-conversation-copy small{margin-top:2px;color:var(--ma-muted);font-size:9.5px}.preview-conversation-copy em{margin-top:5px;overflow:hidden;color:#404040;font-size:10.5px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
  .preview-thread{min-width:0;background:#fff}.preview-thread-head{height:58px;padding:0 14px;border-bottom:1px solid var(--ma-line);display:flex;align-items:center;justify-content:space-between;gap:12px}.preview-thread-head strong,.preview-thread-head span{display:block}.preview-thread-head>div span{margin-top:2px;color:var(--ma-muted);font-size:10.5px}.preview-thread-body{padding:18px;display:grid;gap:10px}.preview-bubble{width:min(78%,540px);padding:11px 12px;border:1px solid var(--ma-line);border-radius:12px;background:#f7f7f7}.preview-bubble small{color:var(--ma-muted);font-size:9.5px}.preview-bubble p,.preview-translation p{margin:5px 0 0;font-size:12px;line-height:1.5}.preview-translation{width:min(78%,540px);padding:10px 12px;border-left:3px solid #737373;border-radius:0 9px 9px 0;background:#f2f2f2}.preview-translation b{font-size:10px}.preview-assistant-card{margin-top:8px;padding:14px;border:1px solid var(--ma-line);border-radius:var(--ma-r2);background:#fafafa}.preview-assistant-title{gap:9px}.preview-assistant-title>svg{width:22px;height:22px}.preview-assistant-title>div{min-width:0;flex:1}.preview-assistant-title strong,.preview-assistant-title span{display:block}.preview-assistant-title>div span{margin-top:2px;color:var(--ma-muted);font-size:10px}.preview-assistant-card .ma-textarea{width:100%;min-height:112px;margin-top:12px;padding:11px;resize:none;background:#fff;line-height:1.5}.preview-assistant-actions{justify-content:flex-end;gap:7px;margin-top:10px}
  @media(max-width:900px){.preview-app{grid-template-columns:56px minmax(0,1fr)!important}.preview-nav .ma-nav__item span,.preview-nav .ma-nav__eyebrow,.preview-sidebar-status{display:none}.preview-message-layout{grid-template-columns:280px minmax(0,1fr)}.preview-kpi-grid{grid-template-columns:1fr}.preview-toolbar{grid-template-columns:1fr}}
`;

const documentHtml = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Makaytron Etsy Message Assistant · MKUI 1.0.0</title>
<style>
  *{box-sizing:border-box}html,body{margin:0;min-height:100%;font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f3f3f3;color:#222}
  body{min-height:900px;background:linear-gradient(90deg,#fff 0 225px,#f5f5f5 225px)}
  .etsy-shell{min-height:900px}.etsy-top{height:72px;border-bottom:1px solid #e4e4e4;background:#fff;display:flex;align-items:center;padding:0 26px;gap:26px}.etsy-word{font-family:Georgia,serif;color:#f1641e;font-size:31px}.etsy-search{height:42px;max-width:620px;flex:1;border:2px solid #222;border-radius:999px;background:#fafafa}.etsy-nav{position:absolute;left:0;top:72px;bottom:0;width:225px;padding:24px 18px;border-right:1px solid #e5e5e5;background:#fff}.etsy-nav div{height:36px;margin-bottom:7px;border-radius:8px;background:#f3f3f3}.etsy-content{margin-left:225px;padding:34px;width:460px}.etsy-content h1{margin:0 0 18px;font-size:24px}.etsy-content .ghost{height:96px;margin-bottom:12px;border:1px solid #e4e4e4;border-radius:12px;background:#fff}
</style>
</head>
<body>
<div class="etsy-shell" aria-hidden="true"><div class="etsy-top"><div class="etsy-word">Etsy</div><div class="etsy-search"></div></div><aside class="etsy-nav"><div></div><div></div><div></div><div></div><div></div></aside><main class="etsy-content"><h1>Messages</h1><div class="ghost"></div><div class="ghost"></div><div class="ghost"></div></main></div>
<div id="preview-root"></div>
<script>
  const host = document.getElementById('preview-root');
  const shadow = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(`${css}\n${previewCss}`)};
  shadow.append(style);
  const wrapper = document.createElement('div');
  wrapper.innerHTML = ${JSON.stringify(markup)};
  shadow.append(...wrapper.childNodes);
</script>
</body>
</html>`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, documentHtml, 'utf8');
process.stdout.write(`${outputPath}\n`);
