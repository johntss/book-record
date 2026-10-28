async function getCsrfToken() {
  const response = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new Error("Could not start a secure form. Refresh the page.");
  const data = await response.json();
  return data.csrfToken;
}

async function postJson(url, body, token) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("[data-auth-form]");
  if (form) {
    const message = form.querySelector(".message");
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.textContent = "";
      message.classList.remove("success");
      button.disabled = true;
      try {
        const token = await getCsrfToken();
        const formData = new FormData(form);
        const mode = form.dataset.authForm;
        const result = await postJson(mode === "login" ? "/api/login" : "/api/register", {
          email: formData.get("email"),
          password: formData.get("password")
        }, token);
        if (mode === "login") {
          window.location.assign(result.redirect || "/");
          return;
        }
        message.textContent = result.message || "Account created. Please sign in.";
        message.classList.add("success");
        form.reset();
      } catch (error) {
        message.textContent = error.message || "Something went wrong.";
      } finally {
        button.disabled = false;
      }
    });
  }

  const userLabel = document.querySelector("[data-current-user]");
  if (userLabel) {
    fetch("/api/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Sign-in required");
        return response.json();
      })
      .then((data) => { userLabel.textContent = data.user.email; })
      .catch(() => { window.location.replace("/login"); });
  }

  const logoutButton = document.querySelector("[data-logout]");
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      logoutButton.disabled = true;
      try {
        const token = await getCsrfToken();
        const result = await postJson("/api/logout", {}, token);
        window.location.assign(result.redirect || "/login");
      } catch (error) {
        window.alert(error.message || "Could not sign out. Please refresh and try again.");
        logoutButton.disabled = false;
      }
    });
  }
});
