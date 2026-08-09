(function () {
    const app = document.getElementById("tp-app");
    if (!app) return;

    const state = {
        username: app.dataset.username,
        activeTab: app.dataset.tab || "home",
        period: app.dataset.period || "",
        page: parseInt(app.dataset.page) || 1,
    };

    function buildUrl(s) {
        let base = "/translator/" + encodeURIComponent(s.username);

        if (s.activeTab === "new") base += "/new-mangas";
        if (s.activeTab === "top") base += "/top-mangas";

        const params = new URLSearchParams();

        if (s.page > 1) params.set("page", s.page);
        if (s.activeTab === "top" && s.period) params.set("period", s.period);

        const qs = params.toString();

        return qs ? base + "?" + qs : base;
    }

    function slidePeriodIndicator() {
        const activeBtn = document.querySelector(".js-period.active");
        const indicator = document.querySelector(".tp-period-indicator");

        if (!activeBtn || !indicator) return;

        indicator.style.width = activeBtn.offsetWidth + "px";
        indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px)";
    }

    async function loadContent(patch, pushHistory) {
        if (pushHistory === undefined) pushHistory = true;

        Object.assign(state, patch);

        const url = buildUrl(state);
        const content = document.getElementById("tp-content");

        try {
            const res = await fetch(url, {
                headers: { "X-Requested-With": "fetch" },
            });

            const data = await res.json();

            state.page = data.currentPage || 1;
            state.activeTab = data.activeTab;
            state.period = data.period || "";

            document.title = data.title;

            document.querySelectorAll(".js-tab").forEach(function (el) {
                el.classList.toggle("active", el.dataset.tab === state.activeTab);
            });

            content.innerHTML = data.html;

            requestAnimationFrame(slidePeriodIndicator);

            if (pushHistory) {
                window.history.pushState({}, "", url);
            }
        } catch (err) {
            console.error(err);
        }
    }

    // Event delegation: không cần rebind sau khi innerHTML đổi
    document.addEventListener("click", function (e) {
        const tabEl = e.target.closest(".js-tab");
        if (tabEl) {
            e.preventDefault();
            const tab = tabEl.dataset.tab;
            if (tab !== state.activeTab) {
                loadContent({ activeTab: tab, page: 1, period: "week" });
            }
            return;
        }

        const periodEl = e.target.closest(".js-period");
        if (periodEl) {
            e.preventDefault();
            const period = periodEl.dataset.period;
            if (period !== state.period) {
                loadContent({ period: period, page: 1 });
            }
            return;
        }

        const pageEl = e.target.closest(".js-page");
        if (pageEl) {
            e.preventDefault();
            if (pageEl.classList.contains("disabled")) return;

            const dir = pageEl.dataset.dir;
            const newPage = dir === "prev" ? state.page - 1 : state.page + 1;
            loadContent({ page: newPage });
            return;
        }
    });

    window.addEventListener("popstate", function () {
        location.reload();
    });

    slidePeriodIndicator();
})();