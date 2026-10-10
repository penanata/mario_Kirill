document.addEventListener("change", (event) => {
  const input = event.target;
  if (input.matches(".drop input[type=file]") && input.files[0]) {
    const label = input.closest(".drop").querySelector("span");
    if (label) label.textContent = input.files[0].name;
  }
});
