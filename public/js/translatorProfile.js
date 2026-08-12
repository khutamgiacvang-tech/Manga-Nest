(function () {
    const app = document.getElementById("tp-app");
    if (!app) return;

    const state = {
        username: app.dataset.username,
        activeTab: app.dataset.tab || "home",
        period: app.dataset.period || "",
        page: parseInt(app.dataset.page) || 1,
    };

    let requestToken = 0;

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

    // instant = true: đặt vị trí ngay lập tức, không animate.
    // Cần dùng khi indicator vừa bị tạo lại (sau khi content.innerHTML bị
    // thay), vì lúc đó nó là phần tử DOM mới (width mặc định = 0), nếu để
    // transition chạy thì sẽ bị "giật" do animate từ 0 -> vị trí đúng,
    // dù trước đó optimistic UI đã animate mượt tới đúng vị trí rồi.
    function slidePeriodIndicator(instant) {
        const activeBtn = document.querySelector(".js-period.active");
        const indicator = document.querySelector(".tp-period-indicator");

        if (!activeBtn || !indicator) return;

        if (instant) indicator.style.transition = "none";

        indicator.style.width = activeBtn.offsetWidth + "px";
        indicator.style.transform = "translateX(" + activeBtn.offsetLeft + "px)";

        if (instant) {
            // Ép trình duyệt reflow ngay để áp dụng vị trí mới trước khi
            // bật lại transition, tránh việc bật transition sớm bị "ăn" vào
            // lần thay đổi tiếp theo.
            void indicator.offsetWidth;
            indicator.style.transition = "";
        }
    }

    // Cập nhật trạng thái active ngay khi bấm (optimistic UI), không chờ fetch.
    // Lưu ý: KHÔNG áp dụng optimistic cho tab chính (Trang chính/Truyện mới/
    // Truyện nổi bật) - thanh gạch dưới của nó phải đổi CÙNG LÚC với nội
    // dung (được xử lý ở khối sau khi fetch xong), nếu không sẽ bị lệch:
    // thanh gạch dưới nhảy qua tab mới trước, một lúc sau nội dung mới đổi.
    function applyOptimisticUI(patch) {
        if (patch.period) {
            document.querySelectorAll(".js-period").forEach(function (el) {
                el.classList.toggle("active", el.dataset.period === patch.period);
            });
            requestAnimationFrame(slidePeriodIndicator);
        }
    }

    async function loadContent(patch, pushHistory) {
        if (pushHistory === undefined) pushHistory = true;

        const myToken = ++requestToken;

        applyOptimisticUI(patch);
        Object.assign(state, patch);

        const url = buildUrl(state);
        const content = document.getElementById("tp-content");

        // Chỉ mờ nội dung nếu tải lâu hơn 150ms - tránh bị "chớp/giật" một
        // cái khi request quá nhanh (add rồi remove class gần như cùng lúc)
        const loadingTimer = setTimeout(function () {
            if (myToken === requestToken) content.classList.add("tp-loading");
        }, 150);

        try {
            const res = await fetch(url, {
                headers: { "X-Requested-With": "fetch" },
            });

            const data = await res.json();

            // Có request mới hơn bắn ra sau -> bỏ qua kết quả cũ để tránh giật/lộn nội dung
            if (myToken !== requestToken) return;

            clearTimeout(loadingTimer);

            state.page = data.currentPage || 1;
            state.activeTab = data.activeTab;
            state.period = data.period || "";

            document.title = data.title;

            document.querySelectorAll(".js-tab").forEach(function (el) {
                el.classList.toggle("active", el.dataset.tab === state.activeTab);
            });

            content.innerHTML = data.html;
            content.classList.remove("tp-loading");

            requestAnimationFrame(function () {
                slidePeriodIndicator(true);
            });

            if (pushHistory) {
                window.history.pushState({}, "", url);
            }
        } catch (err) {
            clearTimeout(loadingTimer);
            if (myToken === requestToken) content.classList.remove("tp-loading");
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