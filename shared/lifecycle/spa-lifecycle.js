    // BEGIN SPA LIFECYCLE (shared/lifecycle/spa-lifecycle.js)
    function createRouteLifecycle(supported) {
        let callbacks = null;
        let observedHref = '';
        let active = false;
        let generation = 0;
        let timer = null;
        let entering = null;
        let requestedGeneration = -1;
        const allowed = () => supported(location.pathname);
        const report = error => console.error('[Makaytron route lifecycle]', error);
        const enter = () => {
            requestedGeneration = generation;
            if (entering) return entering;
            let completedGeneration = -1;
            const run = async () => {
                while (callbacks && active && allowed()) {
                    const requested = requestedGeneration;
                    await callbacks.enter?.();
                    completedGeneration = requested;
                    if (requested === requestedGeneration) break;
                }
            };
            entering = Promise.resolve().then(run).catch(error => {
                completedGeneration = requestedGeneration; report(error);
            }).finally(() => {
                entering = null;
                if (callbacks && active && allowed() && completedGeneration !== requestedGeneration) void enter();
            });
            return entering;
        };
        const sync = () => {
            const href = location.href;
            const next = allowed();
            if (observedHref === href && next === active) return entering;
            observedHref = href;
            generation += 1;
            const wasActive = active;
            active = next;
            if (wasActive && !next) {
                try { Promise.resolve(callbacks?.leave?.()).catch(report); } catch (error) { report(error); }
            }
            if (next && !wasActive) return enter();
            if (next && wasActive) {
                if (entering) return enter();
                try { Promise.resolve(callbacks?.change?.()).catch(report); } catch (error) { report(error); }
            }
            return entering;
        };
        return {
            allowed,
            capture() { sync(); return { generation, href: location.href }; },
            current(token) { return allowed() && token?.generation === generation && token?.href === location.href; },
            sync,
            start(handlers) {
                if (callbacks) return entering;
                callbacks = handlers;
                for (const event of ['popstate', 'hashchange', 'urlchange', 'pageshow']) window.addEventListener(event, sync);
                window.navigation?.addEventListener?.('currententrychange', sync);
                // URL polling also covers userscript sandboxes that cannot patch the page's history object.
                timer = window.setInterval(sync, 250);
                return Promise.resolve(sync());
            },
            dispose() {
                if (active) { active = false; generation += 1; callbacks?.leave?.(); }
                window.clearInterval(timer);
                for (const event of ['popstate', 'hashchange', 'urlchange', 'pageshow']) window.removeEventListener(event, sync);
                window.navigation?.removeEventListener?.('currententrychange', sync);
                callbacks = null;
            },
        };
    }
    // END SPA LIFECYCLE
