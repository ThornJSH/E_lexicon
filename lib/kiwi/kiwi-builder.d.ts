import { Kiwi } from './kiwi.js';
import { BuildArgs } from './build-args.js';
/**
 * Used to create Kiwi instances. Main entry point for the API.
 * It is recommended to create a KiwiBuilder and the Kiwi instances in a worker to prevent blocking the main thread.
 */
export declare class KiwiBuilder {
    private api;
    private constructor();
    /**
     * Creates a new KiwiBuilder instance. This internally loads the wasm file.
     * @param wasmPath Path to the kiwi-wasm.wasm file. This is located at `/dist/kiwi-wasm.wasm` in the npm package.
     *                 It is up to the user to serve this file. See the `package-demo` project for an example of how to include this file as a static asset with vite.
     */
    static create(wasmPath: string): Promise<KiwiBuilder>;
    /**
     * Creates a new Kiwi instance.
     * Note: Even though this method is async, the construction of the Kiwi instance happens in the same
     * JavaScript context. This means that this method can hang your application if not called in a worker.
     * @param buildArgs Arguments for building the Kiwi instance. See {@link BuildArgs} for more information.
     * @returns a {@link Kiwi} instance that is ready for morphological analysis.
     */
    build(buildArgs: BuildArgs): Promise<Kiwi>;
    /**
     * Get the version of the Kiwi wasm module.
     * @returns The version of the Kiwi wasm module.
     */
    version(): string;
}
