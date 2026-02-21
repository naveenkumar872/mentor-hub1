import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': '/src'
        }
    },
    server: {
        proxy: {
            '/api': process.env.VITE_API_URL || 'http://localhost:3000'
        },
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        }
    },
    build: {
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/react') ||
                        id.includes('node_modules/react-dom') ||
                        id.includes('node_modules/react-router')) {
                        return 'vendor-react'
                    }
                    if (id.includes('node_modules/recharts') ||
                        id.includes('node_modules/d3-')) {
                        return 'vendor-charts'
                    }
                    if (id.includes('node_modules/@monaco-editor') ||
                        id.includes('node_modules/monaco-editor')) {
                        return 'vendor-monaco'
                    }
                    if (id.includes('node_modules/@tensorflow') ||
                        id.includes('node_modules/blazeface') ||
                        id.includes('node_modules/@teachable')) {
                        return 'vendor-ai'
                    }
                    if (id.includes('node_modules/sql.js')) {
                        return 'vendor-sql'
                    }
                    if (id.includes('node_modules/axios') ||
                        id.includes('node_modules/socket.io') ||
                        id.includes('node_modules/lucide-react')) {
                        return 'vendor-misc'
                    }
                }
            }
        }
    }
})
