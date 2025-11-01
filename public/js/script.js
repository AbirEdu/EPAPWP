// Handle feedback submission (dummy)
document.querySelector("form").addEventListener("submit", (e) => {
  e.preventDefault();
  alert("Thank you for your feedback!");
  e.target.reset();
});
