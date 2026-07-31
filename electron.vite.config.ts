import { defineConfig } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
    main: {},
    preload: {
        build: {
            rollupOptions: {
                input: {
                    index: resolve('src/preload/index.ts'),
                    webview: resolve('src/preload/webview.ts'),
                },
                output: {
                    entryFileNames: '[name].js',
                },
            },
        },
    },
    renderer: {
        plugins: [react()],
        resolve: {
            alias: {
                '@renderer': resolve('src/renderer/src'),
            },
        },
    },
})
