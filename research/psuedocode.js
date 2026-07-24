import { requestDevicePermissions, Shimmery } from "./src/shimmery.js";

// <button id="permissionButton">Request permission</button>

// Simple usage

requestDevicePermissions("#permissionButton");

// Extended usage

const permissionButton = document.querySelector("#permissionButton");
requestDevicePermissions(permissionButton)
	.then(() => (permissionButton.style.display = "none"))
	.catch(() => (permissionButton.textContent = "Permission denied"));

const shimmery = new Shimmery();

function frame(ts) {
	const data = shimmery.getOrientation(ts);
	// data.alpha, data.beta, data.gamma
	renderFrame(data);
	requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
