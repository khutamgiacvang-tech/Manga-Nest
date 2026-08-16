// Giải mã các HTML entity phổ biến trong chuỗi text.
//
// Vấn đề: khi translator copy tên truyện/tên chương từ một trang web
// khác (ví dụ copy trực tiếp từ HTML source thay vì text hiển thị),
// dấu ngoặc kép " đôi khi bị dính nguyên dạng entity như &#34; hoặc
// &quot; thay vì được decode thành ký tự thật. Vì EJS tự escape output
// (<%= %>), chuỗi này lại bị escape thêm 1 lần nữa (& -> &amp;), khiến
// người dùng thấy y hệt chữ "&#34;" hiển thị trên giao diện thay vì
// dấu ngoặc kép.
//
// Hàm này decode các entity phổ biến (named + numeric) về lại ký tự
// gốc trước khi lưu vào DB, để tránh lỗi hiển thị này.
function decodeHtmlEntities(str) {
  if (!str || typeof str !== "string") return str;

  const namedEntities = {
    "&quot;": '"',
    "&amp;": "&",
    "&apos;": "'",
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
  };

  return str
    .replace(
      /&quot;|&amp;|&apos;|&lt;|&gt;|&nbsp;/g,
      (match) => namedEntities[match],
    )
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

module.exports = decodeHtmlEntities;
