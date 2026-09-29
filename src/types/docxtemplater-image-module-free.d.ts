declare module "docxtemplater-image-module-free" {
  interface ImageModuleOptions {
    centered?: boolean;
    getImage: (tag: string, tagName?: string) => Uint8Array | ArrayBuffer;
    getSize: (img: Uint8Array | ArrayBuffer, tag: string, tagName?: string) => [number, number];
  }
  export default class ImageModule {
    constructor(options: ImageModuleOptions);
  }
}
