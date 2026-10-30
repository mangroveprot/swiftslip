(function () {
  try {
    var saved = localStorage.getItem("swiftslip-theme");
    var pref = saved === "light" || saved === "dark" ? saved : "system";
    var dark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      .setAttribute("content", dark ? "#11151a" : "#ffffff");
  } catch (e) {
    /* Storage blocked: fall through to the light default. */
  }
})();
