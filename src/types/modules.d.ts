declare module 'screenshot-desktop' {
  function screenshot(options?: { filename?: string; format?: string; screen?: any }): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<any[]>;
  }
  export = screenshot;
}

declare module 'node-global-key-listener' {
  export class GlobalKeyboardListener {
    constructor();
    addListener(callback: (event: any, down: Record<string, boolean>) => void): void;
    kill(): void;
  }
}
