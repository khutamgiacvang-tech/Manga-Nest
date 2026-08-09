const modal = document.getElementById("applicationModal");
const content = document.getElementById("applicationContent");

const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");
const closeImage = document.getElementById("closeImage");

// ==========================
// Mở popup đơn
// ==========================

async function openApplication(id) {
  modal.style.display = "flex";

  content.innerHTML = `<div class="loading">⏳ Đang tải dữ liệu...</div>`;

  try {
    const res = await fetch(`/admin/application/${id}`);

    const data = await res.json();

    if (!data.success) {
      content.innerHTML = "<h2>Không tải được dữ liệu.</h2>";

      return;
    }

    const app = data.application;

    const appUser = app.user || {
      avatar: "",
      username: "[Tài khoản đã bị xóa]",
      email: "",
      role: "?",
    };

    let html = `

<div class="application-detail">

    <div class="detail-header">

        <img
            src="${appUser.avatar || "/images/icon/avatar.png"}"
            class="detail-avatar">

        <div>

            <h2>${app.groupName || appUser.username}</h2>

            <p>${appUser.email}</p>

            <small>
                Gửi ngày
                ${new Date(app.createdAt).toLocaleDateString("vi-VN")}
            </small>

        </div>

    </div>

    <div class="info-box">
        <strong>Role:</strong> ${appUser.role}
    </div>

    <div class="info-box">
        <strong>Giới thiệu</strong>
        <p>${app.introduction}</p>
    </div>

`;

    // =========================
    // Projects
    // =========================

    if (app.projects && app.projects.length > 0) {
      html += `<h3>📚 Dự án đã từng dịch</h3>`;

      app.projects.forEach((project) => {
        html += `

<div class="project-box">

<h4>${project.title}</h4>

<p>${project.website}</p>

<a href="${project.link}" target="_blank">

${project.link}

</a>

</div>

`;
      });
    }

    // =========================
    // Profiles
    // =========================

    if (app.profiles && app.profiles.length > 0) {
      html += `<h3>🌐 Profile</h3>`;

      app.profiles.forEach((profile) => {
        html += `

<div class="profile-box">

<strong>${profile.website}</strong>

<br>

<a href="${profile.link}" target="_blank">

${profile.link}

</a>

</div>

`;
      });
    }

    // =========================
    // Chap mẫu
    // =========================

    if (app.sampleImages && app.sampleImages.length > 0) {
      html += `

<h3>🖼 Chap mẫu</h3>

<div class="sample-images">

`;

      app.sampleImages.forEach((img) => {
        const imgUrl = typeof img === "string" ? img : (img && img.url) || "";

        if (!imgUrl) return;

        html += `

<img
class="sample-image"
src="${imgUrl}"
alt="Chap mẫu"
onclick="event.stopPropagation();showImage('${imgUrl.replace(/\\/g, "/")}')">

`;
      });

      html += `</div>`;
    }

    // =========================
    // Status
    // =========================

    html += `

<div class="status-box">

<strong>Trạng thái:</strong>

<span class="status ${app.status}">

${app.status.toUpperCase()}

</span>

</div>

`;

    if (app.status === "pending") {
      html += `

<div class="action-buttons">

<button
class="btn-success"
onclick="approve('${app._id}')">

✔ Duyệt

</button>

<button
class="btn-danger"
onclick="reject('${app._id}')">

✖ Từ chối

</button>

</div>

`;
    }

    html += `</div>`;

    content.innerHTML = html;
  } catch (err) {
    console.error(err);

    content.innerHTML = "<h2>Có lỗi xảy ra.</h2>";
  }
}

// ==========================
// Mở popup truyện
// ==========================

async function openManga(id) {
  modal.style.display = "flex";

  content.innerHTML = `
        <div class="loading">
            ⏳ Đang tải truyện...
        </div>
    `;

  try {
    const res = await fetch(`/admin/manga/${id}`);

    const data = await res.json();

    if (!data.success) {
      content.innerHTML = "<h2>Không tải được truyện.</h2>";

      return;
    }

    const manga = data.manga;

    let html = `

<div class="application-detail">

    <div class="detail-header">

        <img
            src="${manga.cover}"
            class="detail-avatar">

        <div>

            <h2>${manga.title}</h2>

            <p>
                Translator:
                ${manga.translator?.username || "Unknown"}
            </p>

            <small>
                Upload:
                ${new Date(manga.createdAt).toLocaleDateString("vi-VN")}
            </small>

        </div>

    </div>

    <div class="info-box">
        <strong>Tác giả</strong>
        <p>${manga.author || "Không có"}</p>
    </div>

    <div class="info-box">
        <strong>Artist</strong>
        <p>${manga.artist || "Không có"}</p>
    </div>

    <div class="info-box">
        <strong>Thể loại</strong>
        <p>
            ${manga.genres ? manga.genres.join(", ") : "Không có"}
        </p>
    </div>

    <div class="info-box">
        <strong>Mô tả</strong>
        <p>${manga.description || "Không có mô tả."}</p>
    </div>

    <div class="info-box">
        <strong>Age Rating</strong>
        <p>${manga.ageRating || "All"}</p>
    </div>

    <div class="info-box">
        <strong>Tổng Chapter</strong>
        <p>${manga.totalChapters}</p>
    </div>

`;

    if (manga.banner) {
      html += `

    <h3>Banner</h3>

    <img
        class="sample-image"
        src="${manga.banner}"
        onclick="showImage('${manga.banner}')">

    `;
    }

    html += `

<h3>Cover</h3>

<img
    class="sample-image"
    src="${manga.cover}"
    onclick="showImage('${manga.cover}')">

`;

    if (manga.status === "pending") {
      html += `

    <div class="action-buttons">

        <button
            class="btn-success"
            onclick="approveManga('${manga._id}')">

            ✔ Duyệt

        </button>

        <button
            class="btn-danger"
            onclick="rejectManga('${manga._id}')">

            ✖ Từ chối

        </button>

    </div>

    `;
    }

    html += `</div>`;

    content.innerHTML = html;
  } catch (err) {
    console.error(err);

    content.innerHTML = "<h2>Có lỗi xảy ra.</h2>";
  }
}

// ==========================
// Đóng popup đơn
// ==========================

function closeApplication() {
  modal.style.display = "none";
}

// ==========================
// Chuyển card sang cột Đã duyệt / Đã từ chối (không reload trang)
// ==========================

function moveApplicationCard(id, kind, newStatus) {
  const pendingCountEl = document.getElementById("pendingCount");
  if (pendingCountEl) {
    const n = Math.max(parseInt(pendingCountEl.textContent) - 1, 0);
    pendingCountEl.textContent = `${n} mục`;
  }

  const targetCountEl = document.getElementById(
    newStatus === "approved" ? "approvedCount" : "rejectedCount",
  );
  if (targetCountEl) {
    const n = parseInt(targetCountEl.textContent) + 1;
    targetCountEl.textContent = `${n} mục`;
  }

  const el = document.getElementById(`item-${kind}-${id}`);
  if (!el) return;

  const badge = el.querySelector(".status");
  if (badge) {
    badge.className = `status ${newStatus}`;
  }

  if (kind === "application") {
    const btn = el.querySelector(".view-btn");
    if (btn) {
      btn.innerHTML = newStatus === "approved" ? "👁 Xem" : "👁 Xem đơn";
    }
  }

  const targetBody = document.getElementById(
    newStatus === "approved" ? "approvedColumnBody" : "rejectedColumnBody",
  );

  if (targetBody) {
    const empty = targetBody.querySelector(".empty-card");
    if (empty) empty.remove();
  }

  el.style.transition = ".3s";
  el.style.opacity = "0";
  el.style.transform = "scale(.96)";

  setTimeout(() => {
    el.remove();

    if (targetBody) {
      el.style.opacity = "0";
      el.style.transform = "scale(.96)";
      targetBody.prepend(el);

      requestAnimationFrame(() => {
        el.style.transition = ".3s";
        el.style.opacity = "1";
        el.style.transform = "scale(1)";
      });
    }

    const pendingBody = document.getElementById("pendingColumnBody");
    if (pendingBody && pendingBody.children.length === 0) {
      pendingBody.innerHTML = `<div class="empty-card">Không có dữ liệu.</div>`;
    }
  }, 300);
}

// ==========================
// Duyệt
// ==========================

async function approve(id) {
  try {
    const res = await fetch(`/admin/application/${id}/approve`, {
      method: "POST",
    });

    const data = await res.json();

    if (data.success) {
      closeApplication();
      moveApplicationCard(id, "application", "approved");
    } else {
      Swal.fire({
        title: "Không thể duyệt",
        text: data.message || "Có lỗi xảy ra.",
        icon: "error",
        background: "#1f2432",
        color: "#fff",
        confirmButtonColor: "#5865F2",
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// ==========================
// Từ chối
// ==========================

async function reject(id) {
  try {
    const res = await fetch(`/admin/application/${id}/reject`, {
      method: "POST",
    });

    const data = await res.json();

    if (data.success) {
      closeApplication();
      moveApplicationCard(id, "application", "rejected");
    } else {
      Swal.fire({
        title: "Không thể từ chối",
        text: data.message || "Có lỗi xảy ra.",
        icon: "error",
        background: "#1f2432",
        color: "#fff",
        confirmButtonColor: "#5865F2",
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// ==========================
// Duyệt Manga
// ==========================

async function approveManga(id) {
  try {
    const res = await fetch(`/admin/manga/${id}/approve`, {
      method: "POST",
    });

    const data = await res.json();

    if (data.success) {
      closeApplication();
      moveApplicationCard(id, "manga", "approved");
    } else {
      alert(data.message || "Không thể duyệt.");
    }
  } catch (err) {
    console.error(err);

    alert("Có lỗi xảy ra.");
  }
}

// ==========================
// Từ chối Manga
// ==========================

async function rejectManga(id) {
  try {
    const res = await fetch(`/admin/manga/${id}/reject`, {
      method: "POST",
    });

    const data = await res.json();

    if (data.success) {
      closeApplication();
      moveApplicationCard(id, "manga", "rejected");
    } else {
      alert(data.message || "Không thể từ chối.");
    }
  } catch (err) {
    console.error(err);

    alert("Có lỗi xảy ra.");
  }
}

// ==========================
// Popup ảnh
// ==========================

function showImage(src) {
  modalImage.src = src.replace(/\\/g, "/");

  imageModal.style.display = "flex";
}

function closeImageModal() {
  imageModal.style.display = "none";
}

closeImage.addEventListener("click", closeImageModal);

// ==========================
// Click ra ngoài để đóng
// ==========================

window.addEventListener("click", function (e) {
  if (e.target === modal) {
    closeApplication();
  }

  if (e.target === imageModal) {
    closeImageModal();
  }
});

// ==========================
// Export cho onclick trong HTML
// ==========================

window.openApplication = openApplication;
window.openManga = openManga;
window.closeApplication = closeApplication;
window.approve = approve;
window.reject = reject;
window.approveManga = approveManga;
window.rejectManga = rejectManga;
window.showImage = showImage;
