const pingBtn = document.getElementById("ping-btn");
const responseArea = document.getElementById("ping-response");

pingBtn.addEventListener("click", async () => {
  try {
    const response = await window.electronAPI.ping();
    responseArea.innerText = `Main process says: ${response}`;
    console.log("[Renderer] Received:", response);
  } catch (error) {
    console.error("[Renderer] IPC Error:", error);
    responseArea.innerText = "Error connecting to main process";
  }
});

console.log("[Renderer] App loaded");
