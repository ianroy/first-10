const root = document.documentElement;
const options = document.querySelectorAll("[data-choice]");
for (const option of options) {
  option.addEventListener("click", () => {
    root.dataset.direction = option.dataset.choice;
    for (const button of options) button.setAttribute("aria-pressed", String(button === option));
    document.querySelector("#direction-label").textContent =
      option.dataset.choice === "notebook"
        ? "A / Field notebook · selected direction"
        : "B / Learning ledger · alternative direction";
  });
}
document.querySelector("#theme").addEventListener("click", (event) => {
  const dark = root.dataset.mode !== "dark";
  root.dataset.mode = dark ? "dark" : "light";
  event.currentTarget.setAttribute("aria-pressed", String(dark));
  event.currentTarget.textContent = dark ? "Light preview" : "Dark preview";
});
for (const id of ["back", "next"])
  document.querySelector(`#${id}`).addEventListener("click", () => {
    document.querySelector("#preview-status").textContent =
      "This is a visual preview. Your notes stay only on this page until it reloads.";
  });
