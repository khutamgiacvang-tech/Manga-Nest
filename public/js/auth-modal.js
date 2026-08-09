// =====================================
// MangaNest - Auth Modal
// =====================================

const authModal = document.getElementById("authModal");

const loginContent = document.getElementById("loginContent");
const registerContent = document.getElementById("registerContent");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

// ======================
// Mở Popup
// ======================

function openAuth() {

    authModal.classList.add("show");

    document.body.style.overflow = "hidden";

}

// ======================
// Đóng Popup
// ======================

function closeAuth() {

    authModal.classList.remove("show");

    document.body.style.overflow = "auto";

}

// ======================
// Hiện Login
// ======================

function showLogin() {

    loginContent.style.display = "block";

    registerContent.style.display = "none";

    loginContent.style.animation = "popup .3s ease";

    loginTab.classList.add("active");

    registerTab.classList.remove("active");

}

// ======================
// Hiện Register
// ======================

function showRegister() {

    registerContent.style.display = "block";

    loginContent.style.display = "none";

    registerContent.style.animation = "popup .3s ease";

    registerTab.classList.add("active");

    loginTab.classList.remove("active");

}

// ======================
// Hiện / Ẩn mật khẩu
// ======================

function togglePassword(id, icon) {

    const input = document.getElementById(id);

    if (!input) return;

    if (input.type === "password") {

        input.type = "text";

        icon.innerHTML = "🙈";

    } else {

        input.type = "password";

        icon.innerHTML = "👁";

    }

}

// ======================
// Nhấn ESC để đóng
// ======================

document.addEventListener("keydown", function (e) {

    if (e.key === "Escape") {

        closeAuth();

    }

});

// ======================
// Click nền để đóng
// ======================

const backdrop = document.querySelector(".auth-backdrop");

if (backdrop) {

    backdrop.addEventListener("click", function () {

        closeAuth();

    });

}

// ======================
// Export ra global
// ======================

window.openAuth = openAuth;

window.closeAuth = closeAuth;

window.showLogin = showLogin;

window.showRegister = showRegister;

window.togglePassword = togglePassword;