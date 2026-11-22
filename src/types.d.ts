/** build tag (commit and date), set by vite.config.ts */
declare const __BUILD__: string;

declare module 'n8ao' {
  export class N8AOPostPass {
    constructor(scene: any, camera: any, width?: number, height?: number);
    configuration: any;
    setSize(w: number, h: number): void;
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    enabled: boolean;
  }
  export class N8AOPass {
    constructor(scene: any, camera: any, width?: number, height?: number);
    configuration: any;
  }
}
