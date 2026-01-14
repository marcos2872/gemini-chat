import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';

export type IpcHandler = (event: IpcMainInvokeEvent | IpcMainEvent, ...args: any[]) => Promise<any> | any;

export class IpcRouter {
    registerHandler(channel: string, handler: IpcHandler) {
        // Remove existing listeners to avoid duplicates during hot reloads if any
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
        console.log(`[IPC] Registered handler: ${channel}`);
    }

    registerListener(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
        ipcMain.removeAllListeners(channel);
        ipcMain.on(channel, listener);
        console.log(`[IPC] Registered listener: ${channel}`);
    }
}
