import initKiwi from './build/kiwi-wasm.js';
async function createKiwiApi(wasmPath) {
    const kiwi = await initKiwi({
        locateFile: (path) => {
            if (path.endsWith('.wasm')) {
                return wasmPath;
            }
            return path;
        },
    });
    return {
        cmd: (args) => {
            return JSON.parse(kiwi.api(JSON.stringify(args)));
        },
        loadModelFiles: async (files) => {
            const modelPath = Math.random().toString(36).substring(2) + Date.now();
            kiwi.FS.mkdir(modelPath);
            const fileEntries = Object.entries(files);
            await Promise.all(fileEntries.map(async ([name, data]) => {
                const path = modelPath + '/' + name;
                if (typeof data === 'string') {
                    const response = await fetch(data);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch file: ${data}`);
                    }
                    const fetchData = await response.arrayBuffer();
                    kiwi.FS.writeFile(path, new Uint8Array(fetchData));
                }
                else {
                    kiwi.FS.writeFile(path, data);
                }
            }));
            return {
                unload: async () => {
                    kiwi.FS.rmdir(modelPath);
                },
                modelPath,
            };
        },
    };
}
/**
 * Used to create Kiwi instances. Main entry point for the API.
 * It is recommended to create a KiwiBuilder and the Kiwi instances in a worker to prevent blocking the main thread.
 */
export class KiwiBuilder {
    constructor(api) {
        this.api = api;
    }
    /**
     * Creates a new KiwiBuilder instance. This internally loads the wasm file.
     * @param wasmPath Path to the kiwi-wasm.wasm file. This is located at `/dist/kiwi-wasm.wasm` in the npm package.
     *                 It is up to the user to serve this file. See the `package-demo` project for an example of how to include this file as a static asset with vite.
     */
    static async create(wasmPath) {
        const api = await createKiwiApi(wasmPath);
        return new KiwiBuilder(api);
    }
    /**
     * Creates a new Kiwi instance.
     * Note: Even though this method is async, the construction of the Kiwi instance happens in the same
     * JavaScript context. This means that this method can hang your application if not called in a worker.
     * @param buildArgs Arguments for building the Kiwi instance. See {@link BuildArgs} for more information.
     * @returns a {@link Kiwi} instance that is ready for morphological analysis.
     */
    async build(buildArgs) {
        const modelFiles = buildArgs.modelFiles;
        const loadResult = await this.api.loadModelFiles(modelFiles);
        const apiBuildArgs = Object.assign(Object.assign({}, buildArgs), { modelPath: loadResult.modelPath });
        apiBuildArgs.modelFiles = undefined;
        if (apiBuildArgs.userDicts) {
            apiBuildArgs.userDicts = apiBuildArgs.userDicts.map((path) => loadResult.modelPath + '/' + path);
        }
        const id = this.api.cmd({
            method: 'build',
            args: [apiBuildArgs],
        });
        return new Proxy({}, {
            get: (_target, prop) => {
                // prevent recursive promise resolution
                if (prop === 'then') {
                    return undefined;
                }
                return (...methodArgs) => {
                    return this.api.cmd({
                        method: prop.toString(),
                        id,
                        args: methodArgs,
                    });
                };
            },
        });
    }
    /**
     * Get the version of the Kiwi wasm module.
     * @returns The version of the Kiwi wasm module.
     */
    version() {
        return this.api.cmd({ method: 'version', args: [] });
    }
}
