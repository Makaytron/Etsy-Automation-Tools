    // BEGIN MIGRATION NOTICE (shared/migration/notice.js)
    // The notice the standalone scripts show while they are kept running next to
    // Etsy Automation Tools (six months after its release). It explains the
    // move, links to the unified script and offers "Aktar" (Transfer), which
    // arms the responder of shared/migration/handoff.js for two minutes. The
    // data stays in this script; nothing is sent anywhere but to the unified
    // script on the same tab, encrypted. "Later" hides the notice for a week.
    //
    // Plain script, inlined into every standalone script by
    // tools/Sync-Migration-Blocks.mjs. The unified script strips it when it
    // adopts a standalone engine.

    const EAT_INSTALL_URL = 'https://raw.githubusercontent.com/Makaytron/Etsy-Automation-Tools/main/scripts/etsy-automation-tools/Makaytron-Etsy-Automation-Tools.user.js';
    const EAT_NOTICE_HIDDEN_KEY = 'eat-migration-notice-hidden-until';
    const EAT_NOTICE_DONE_KEY = 'eat-migration-done';
    const EAT_NOTICE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const EAT_NOTICE_TEXT = Object.freeze({
        tr: Object.freeze({
            title: 'Etsy Automation Tools’a taşınıyoruz',
            text: '{tool} artık tek script olan Etsy Automation Tools’un içinde. Bu script altı ay daha çalışır, sonra güncelleme almaz. Yeni scripti kurun, sonra verilerinizi aktarmak için burada Aktar’a basın.',
            install: 'Yeni scripti kur', transfer: 'Aktar', later: 'Daha sonra',
            armed: 'Aktarıma hazır (2 dakika). Aynı sekmede yeni scriptte Ayarlar › Gizlilik ve veri › Aktarımı başlat’a basın.',
            offered: 'Kontrol kodu: {sas}. Yeni script de aynı kodu göstermeli.',
            done: 'Aktarıldı. Her şey yolundaysa bu scripti Tampermonkey’de kapatabilirsiniz. Verileri bu scriptte de durur.',
            busy: 'Şu an bir iş çalışıyor. Bittiğinde Aktar’a yeniden basın.',
            error: 'Aktarım tamamlanamadı. Aktar’a yeniden basın.',
        }),
        en: Object.freeze({
            title: 'We are moving to Etsy Automation Tools',
            text: '{tool} is now part of Etsy Automation Tools, a single script. This script keeps working for six more months, then gets no more updates. Install the new script, then press Transfer here to bring your data over.',
            install: 'Install the new script', transfer: 'Transfer', later: 'Later',
            armed: 'Ready to transfer (2 minutes). On this tab, press Settings › Privacy and data › Start the transfer in the new script.',
            offered: 'Check code: {sas}. The new script should show the same code.',
            done: 'Transferred. If everything looks right, you can turn this script off in Tampermonkey. Its data also stays here.',
            busy: 'A job is running. Press Transfer again when it ends.',
            error: 'The transfer did not complete. Press Transfer again.',
        }),
    });

    /**
     * @param {object} o
     * @param {string} o.tool        migration tool id (see MIGRATION_SPECS)
     * @param {string} o.toolName    name shown in the notice
     * @param {string} o.appVersion
     * @param {object} o.gm          this script's GM object
     * @param {Function} o.allowed   whether this script runs on the current page
     * @param {Function} o.isBusy    whether one of its jobs is running
     */
    function startEatMigrationNotice({ tool, toolName, appVersion, gm, allowed, isBusy }) {
        if (typeof document === 'undefined' || typeof window === 'undefined' || !window.crypto?.subtle) return null;
        const language = String(navigator.language || '').toLowerCase().startsWith('tr') ? 'tr' : 'en';
        const text = (key, vars = {}) => String(EAT_NOTICE_TEXT[language][key]).replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
        const store = {
            get: (key) => gm.getValue(key, null),
            keys: async () => (typeof gm.listValues === 'function' ? gm.listValues() : []),
        };
        let host = null;
        let status = '';
        let hidden = false;
        let lastSas = '';
        const responder = createMigrationResponder({
            tool, appVersion, store, transport: createDomMigrationTransport(document), cryptoApi: window.crypto,
            isBusy,
            onStatus: (event) => {
                if (event.state === 'offered') lastSas = event.sas;
                // The check code stays visible after the transfer, so it can be compared with the new script.
                const done = lastSas ? `${text('offered', { sas: lastSas })} ${text('done')}` : text('done');
                status = { armed: text('armed'), offered: text('offered', { sas: event.sas }), busy: text('busy'), done, error: text('error'), 'too-large': text('error') }[event.state] ?? '';
                render();
            },
            onDone: (record) => { void gm.setValue(EAT_NOTICE_DONE_KEY, record); },
        });

        // Light DOM with inline styles, like the scripts' other notices: no shadow root, no class names.
        const FONT = 'Inter,system-ui,-apple-system,"Segoe UI",sans-serif';
        function button(label, primary, onClick) {
            const element = document.createElement('button');
            element.type = 'button';
            element.textContent = label;
            element.style.cssText = `all:initial;box-sizing:border-box;min-height:32px;padding:0 12px;border:1px solid ${primary ? '#1f1f1f' : '#cfcfcf'};border-radius:7px;background:${primary ? '#1f1f1f' : '#fff'};color:${primary ? '#fafafa' : '#171717'};font:600 12.5px/30px ${FONT};cursor:pointer`;
            element.addEventListener('click', onClick);
            return element;
        }

        function paragraph(content, strong = false) {
            const element = document.createElement(strong ? 'strong' : 'p');
            element.textContent = content;
            element.style.cssText = strong
                ? `all:initial;display:block;margin:0 0 4px;color:#171717;font:700 14px/1.4 ${FONT}`
                : `all:initial;display:block;margin:0 0 10px;color:#404040;font:13px/1.45 ${FONT}`;
            return element;
        }

        function render() {
            if (!allowed() || hidden) { host?.remove(); host = null; return; }
            if (!host || !host.isConnected) {
                host = document.createElement('section');
                host.id = `makaytron-eat-migration-notice-${tool}`;
                host.setAttribute('role', 'region');
                host.style.cssText = `all:initial;position:fixed;left:16px;bottom:16px;z-index:2147483646;box-sizing:border-box;width:min(380px,calc(100vw - 32px));padding:14px;border:1px solid #d6d6d6;border-radius:10px;background:#fff;color:#202020;box-shadow:0 16px 42px rgba(0,0,0,.2);font:13px/1.45 ${FONT}`;
                document.documentElement.appendChild(host);
            }
            host.setAttribute('aria-label', text('title'));
            host.replaceChildren(paragraph(text('title'), true), paragraph(text('text', { tool: toolName })));
            if (status) {
                const line = paragraph(status);
                line.setAttribute('role', 'status');
                line.style.color = '#1f1f1f';
                line.style.fontWeight = '600';
                host.append(line);
            }
            const row = document.createElement('div');
            row.style.cssText = 'all:initial;display:flex;flex-wrap:wrap;gap:8px';
            row.append(
                button(text('install'), false, () => { window.open(EAT_INSTALL_URL, '_blank', 'noopener,noreferrer'); }),
                button(text('transfer'), true, () => { responder.arm(120000); }),
                button(text('later'), false, () => {
                    hidden = true;
                    responder.disarm();
                    void gm.setValue(EAT_NOTICE_HIDDEN_KEY, Date.now() + EAT_NOTICE_WEEK_MS);
                    render();
                }),
            );
            host.append(row);
        }

        Promise.resolve(gm.getValue(EAT_NOTICE_HIDDEN_KEY, 0)).then((until) => {
            hidden = Number(until) > Date.now();
            render();
            window.setInterval(() => { if (Boolean(host) !== (allowed() && !hidden)) render(); }, 1000);
        }).catch(() => { /* the notice is optional */ });
        return responder;
    }
    // END MIGRATION NOTICE
