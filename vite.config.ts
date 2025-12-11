import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // Load environment variables from .env files
    const env = loadEnv(mode, '.', '');

    // Get the Render external hostname from the environment, if available
    // This is often needed for services that dynamically assign hostnames
    const renderHost = env.RENDER_EXTERNAL_HOSTNAME;

    return {
      define: {
        // Define environment variables accessible in your client-side code
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // Use '@' alias for the current directory
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        // Listen on all network interfaces (important for deployment environments like Render)
        host: '0.0.0.0',
        // Use the PORT environment variable provided by Render, fallback to 5173
        port: Number(process.env.PORT) || 5173,
        // Hostname for Hot Module Replacement (HMR).
        // It should match the external hostname for HMR to work correctly in deployment.
        hmr: renderHost ? { host: renderHost } : undefined,
        // Allow connections from the dynamically assigned Render hostname in the development server
        // The allowedHosts property is what the error message pointed out.
        allowedHosts: renderHost ? [renderHost] : []
      },
      preview: {
        // Listen on all network interfaces (important for deployment environments)
        host: '0.0.0.0',
        port: Number(process.env.PORT) || 4173,
        // allowedHosts: true is generally too permissive, but setting it to '0.0.0.0'
        // or a list of specific hosts is safer. For Render, host: '0.0.0.0' is enough.
        // We can safely remove `allowedHosts: true` if host is '0.0.0.0'
      }
    };
});
