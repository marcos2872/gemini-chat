import { AuthConfig } from "../types";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export class CopilotAuth {
  private clientId: string;

  constructor() {
    this.clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || "";
    if (!this.clientId) {
      console.warn("[CopilotAuth] VITE_GITHUB_CLIENT_ID is missing");
    }
  }

  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    // Use IPC to bypass CORS
    return await window.electronAPI.requestDeviceCode(this.clientId);
  }

  async pollForToken(
    deviceCode: string,
    interval: number
  ): Promise<AuthConfig | null> {
    // Use IPC to bypass CORS
    return await window.electronAPI.pollForToken(
      this.clientId,
      deviceCode,
      interval
    );
  }
}
