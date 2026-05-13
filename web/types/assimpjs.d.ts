declare module 'assimpjs' {
  const factory: (options?: { wasmBinary?: Uint8Array }) => Promise<unknown>;
  export default factory;
}

declare module 'assimpjs/dist/assimpjs.wasm?url' {
  const url: string;
  export default url;
}
